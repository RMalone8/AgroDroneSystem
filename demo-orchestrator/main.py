"""
Demo Orchestrator — provisions isolated demo sessions for agrodrone.app.

Each call to POST /demo/start:
  1. Creates a fresh demo user account in the backend (KV/R2)
  2. Registers a device for that user
  3. Spins up a dedicated edge-node Docker container
  4. Returns credentials for the frontend to auto-login

The edge node calls POST /demo/ready/{session_id} when it has connected to MQTT.
DELETE /demo/end/{session_id} tears down the container and deletes the user.
A background task auto-expires sessions older than SESSION_TIMEOUT seconds.
"""

import asyncio
import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from typing import Optional

import docker
import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

# ── Configuration ─────────────────────────────────────────────────────────────

DEMO_TOKEN           = os.environ["DEMO_TOKEN"]
DEMO_ADMIN_EMAIL     = os.environ.get("DEMO_ADMIN_EMAIL", "demo-admin@agrodrone.app")
DEMO_ADMIN_PASSWORD  = os.environ["DEMO_ADMIN_PASSWORD"]
DEMO_ADMIN_ACCESS_TOKEN = os.environ["DEMO_ADMIN_ACCESS_TOKEN"]
BACKEND_URL          = os.environ.get("BACKEND_URL", "http://backend:8787")
DOCKER_NETWORK       = os.environ.get("DOCKER_NETWORK", "agrodrone_default")
EDGE_NODE_IMAGE      = os.environ.get("EDGE_NODE_IMAGE", "agrodrone-edge-node:latest")
MAX_ACTIVE_SESSIONS  = int(os.environ.get("MAX_ACTIVE_DEMO_SESSIONS", "10"))
MAX_PER_IP_PER_HOUR  = int(os.environ.get("MAX_SESSIONS_PER_IP_PER_HOUR", "3"))
SESSION_TIMEOUT      = int(os.environ.get("DEMO_SESSION_TIMEOUT_SECONDS", str(30 * 60)))
ORCHESTRATOR_URL     = os.environ.get("ORCHESTRATOR_URL", "http://demo-orchestrator:8090")

JWT_TTL = 23 * 3600  # refresh before 24h backend expiry

# ── In-memory state ───────────────────────────────────────────────────────────

# session_id → { status, started_at, ip, container_id, user_id }
sessions: dict[str, dict] = {}

# ip → list of Unix timestamps (for rate limiting)
ip_timestamps: dict[str, list[float]] = defaultdict(list)

admin_jwt: Optional[str] = None
admin_jwt_acquired_at: float = 0.0


# ── Admin JWT helpers ─────────────────────────────────────────────────────────

async def get_admin_jwt() -> str:
    global admin_jwt, admin_jwt_acquired_at
    now = time.time()
    if admin_jwt and (now - admin_jwt_acquired_at) < JWT_TTL:
        return admin_jwt

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": DEMO_ADMIN_EMAIL, "password": DEMO_ADMIN_PASSWORD},
            timeout=10,
        )
        if resp.status_code == 200:
            admin_jwt = resp.json()["token"]
            admin_jwt_acquired_at = now
            return admin_jwt

        # First run — register the demo admin account
        resp = await client.post(
            f"{BACKEND_URL}/auth/register",
            json={
                "email": DEMO_ADMIN_EMAIL,
                "password": DEMO_ADMIN_PASSWORD,
                "accessToken": DEMO_ADMIN_ACCESS_TOKEN,
            },
            timeout=10,
        )
        if resp.status_code not in (200, 201):
            raise RuntimeError(f"Demo admin registration failed: {resp.text}")

        login_resp = await client.post(
            f"{BACKEND_URL}/auth/login",
            json={"email": DEMO_ADMIN_EMAIL, "password": DEMO_ADMIN_PASSWORD},
            timeout=10,
        )
        login_resp.raise_for_status()
        admin_jwt = login_resp.json()["token"]
        admin_jwt_acquired_at = now
        return admin_jwt


# ── Session cleanup ───────────────────────────────────────────────────────────

async def _cleanup(session_id: str) -> None:
    session = sessions.pop(session_id, None)
    if not session:
        return

    container_id = session.get("container_id")
    user_id = session.get("user_id")

    if container_id:
        try:
            dc = docker.from_env()
            container = dc.containers.get(container_id)
            container.stop(timeout=5)
            container.remove()
            print(f"[cleanup] removed container {container_id[:12]} for session {session_id}")
        except Exception as exc:
            print(f"[cleanup] could not remove container {container_id[:12]}: {exc}")

    if user_id:
        try:
            token = await get_admin_jwt()
            async with httpx.AsyncClient() as client:
                resp = await client.delete(
                    f"{BACKEND_URL}/admin/users/{user_id}",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10,
                )
                print(f"[cleanup] deleted user {user_id}: HTTP {resp.status_code}")
        except Exception as exc:
            print(f"[cleanup] could not delete user {user_id}: {exc}")


async def _cleanup_loop() -> None:
    while True:
        await asyncio.sleep(300)
        now = time.time()
        expired = [
            sid for sid, s in list(sessions.items())
            if now - s.get("started_at", now) > SESSION_TIMEOUT
        ]
        for sid in expired:
            print(f"[cleanup] auto-expiring timed-out session {sid}")
            await _cleanup(sid)


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await get_admin_jwt()
        print("[startup] demo admin JWT acquired")
    except Exception as exc:
        print(f"[startup] WARNING: could not acquire admin JWT: {exc}")

    task = asyncio.create_task(_cleanup_loop())
    yield
    task.cancel()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Guards ────────────────────────────────────────────────────────────────────

def _require_demo_token(request: Request) -> None:
    if request.headers.get("X-Demo-Token", "") != DEMO_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid demo token")


def _check_rate_limits(ip: str) -> None:
    now = time.time()
    hour_ago = now - 3600
    ip_timestamps[ip] = [t for t in ip_timestamps[ip] if t > hour_ago]

    if len(sessions) >= MAX_ACTIVE_SESSIONS:
        raise HTTPException(
            status_code=429,
            detail="Maximum concurrent demo sessions reached. Please try again shortly.",
        )
    if len(ip_timestamps[ip]) >= MAX_PER_IP_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="Too many demo sessions from your IP. Please try again later.",
        )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.post("/demo/start")
async def start_demo(request: Request):
    _require_demo_token(request)
    ip = request.headers.get("X-Real-IP") or (request.client.host if request.client else "unknown")
    _check_rate_limits(ip)

    session_id = str(uuid.uuid4())[:12]
    demo_email = f"demo-{session_id}@agrodrone.app"
    demo_password = str(uuid.uuid4())

    sessions[session_id] = {
        "status": "creating",
        "started_at": time.time(),
        "ip": ip,
        "container_id": None,
        "user_id": None,
    }
    ip_timestamps[ip].append(time.time())

    try:
        token = await get_admin_jwt()

        async with httpx.AsyncClient() as client:
            # 1. Issue single-use access token for the new demo user
            r = await client.post(
                f"{BACKEND_URL}/admin/access-token",
                headers={"Authorization": f"Bearer {token}"},
                timeout=10,
            )
            if not r.is_success:
                raise RuntimeError(f"access-token issue failed: {r.text}")
            access_token = r.json()["accessToken"]

            # 2. Register demo user
            r = await client.post(
                f"{BACKEND_URL}/auth/register",
                json={"email": demo_email, "password": demo_password, "accessToken": access_token},
                timeout=10,
            )
            if not r.is_success:
                raise RuntimeError(f"demo user registration failed: {r.text}")
            user_id = r.json()["userId"]
            sessions[session_id]["user_id"] = user_id
            sessions[session_id]["status"] = "account_ready"

            # 3. Register a device for this user
            r = await client.post(
                f"{BACKEND_URL}/admin/device/register",
                headers={"Authorization": f"Bearer {token}"},
                json={"targetUserId": user_id},
                timeout=10,
            )
            if not r.is_success:
                raise RuntimeError(f"device registration failed: {r.text}")
            device = r.json()
            device_id = device["deviceId"]
            device_token = device["deviceToken"]

        sessions[session_id]["status"] = "edge_starting"

        # 4. Spin up a dedicated edge-node container
        dc = docker.from_env()
        container = dc.containers.run(
            image=EDGE_NODE_IMAGE,
            command=["python", "src/demo/demo_node.py"],
            name=f"demo-edge-{session_id}",
            network=DOCKER_NETWORK,
            detach=True,
            remove=False,
            environment={
                "MQTT_HOST": "mqtt",
                "MQTT_PORT": "1883",
                "BACKEND_URL": BACKEND_URL,
                "DEMO_USER_ID": user_id,
                "DEMO_DEVICE_ID": device_id,
                "DEMO_DEVICE_TOKEN": device_token,
                "DEMO_SESSION_ID": session_id,
                "DEMO_ORCHESTRATOR_URL": ORCHESTRATOR_URL,
            },
        )
        sessions[session_id]["container_id"] = container.id

    except Exception as exc:
        print(f"[start] session {session_id} failed: {exc}")
        await _cleanup(session_id)
        raise HTTPException(status_code=500, detail=f"Failed to start demo: {exc}")

    print(f"[start] session {session_id} started for {demo_email} (ip={ip})")
    return {"sessionId": session_id, "email": demo_email, "password": demo_password}


@app.get("/demo/status/{session_id}")
async def get_status(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": session["status"]}


@app.post("/demo/ready/{session_id}")
async def mark_ready(session_id: str):
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session["status"] = "ready"
    print(f"[ready] session {session_id} is ready")
    return {"ok": True}


@app.delete("/demo/end/{session_id}")
async def end_demo(session_id: str):
    # No token check here — the session ID (random UUID) is sufficient to
    # prove the caller started this session.
    if session_id not in sessions:
        return {"ok": True}
    await _cleanup(session_id)
    print(f"[end] session {session_id} ended by client")
    return {"ok": True}


@app.get("/demo/health")
async def health():
    return {"ok": True, "active_sessions": len(sessions)}
