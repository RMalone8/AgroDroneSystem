"""
Full integration tests — real backend (wrangler dev) + real Mosquitto broker.

Tests the complete flow from account creation through MQTT telemetry delivery:

  1. Admin registers using a pre-seeded access token
  2. Admin issues a single-use client access token
  3. Client registers — backend must provision MQTT credentials immediately
  4. Client's mqttToken must work to connect to Mosquitto right away
  5. Admin registers an edge node → gets deviceId + deviceToken
  6. Edge node connects with those credentials → must be authorised
  7. Edge node publishes telemetry → client receives it within a few seconds
  8. Second tenant follows the same path, and their telemetry stays isolated

Run via:
  docker compose -f compose.integration.yaml up --build --abort-on-container-exit
"""

import json
import os
import threading
import time
import uuid

import pytest
import requests
import paho.mqtt.client as mqtt

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8787")
MQTT_HOST   = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))

# Must match VALID_ADMIN_ACCESS_TOKENS in AgroDroneBackend/.dev.vars
ADMIN_ACCESS_TOKEN = "AGRO-ADMIN-TOKEN-1"
ADMIN_EMAIL        = "integration-admin@agrodrone.test"
ADMIN_PASSWORD     = "IntegrationAdmin1!"

TELEMETRY = {"battery_remaining": "85", "alt_msl": "10.5", "lat": "42.35", "lon": "-71.11"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def wait_for_backend(url: str, retries: int = 40, interval: float = 2.0) -> bool:
    """Poll the backend until it responds to any HTTP request."""
    for i in range(retries):
        try:
            r = requests.options(f"{url}/auth/register", timeout=3)
            if r.status_code < 500:
                return True
        except requests.exceptions.ConnectionError:
            pass
        print(f"[{i+1}/{retries}] Waiting for backend at {url}…")
        time.sleep(interval)
    return False


def mqtt_connect_client(username: str, password: str, client_id: str = None) -> tuple[mqtt.Client, bool]:
    """Connect an MQTT client. Returns (client, connected_bool)."""
    client_id = client_id or f"test-{username[:16]}-{uuid.uuid4().hex[:6]}"
    client = mqtt.Client(client_id=client_id)
    client.username_pw_set(username=username, password=password)

    connected = threading.Event()
    result_rc = []

    def on_connect(_c, _ud, _flags, rc):
        result_rc.append(rc)
        if rc == 0:
            connected.set()

    client.on_connect = on_connect
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=10)
    client.loop_start()
    ok = connected.wait(timeout=10)
    return client, ok


def collect_on_topic(client: mqtt.Client, topic: str, duration: float = 4.0) -> list[dict]:
    """Subscribe and collect messages for `duration` seconds."""
    messages = []

    def on_message(_c, _ud, msg):
        try:
            messages.append(json.loads(msg.payload.decode()))
        except Exception:
            pass

    client.on_message = on_message
    client.subscribe(topic)
    time.sleep(duration)
    return messages


def publish_once(username: str, password: str, topic: str, payload: dict):
    """Connect, publish one message, disconnect."""
    client, ok = mqtt_connect_client(username, password)
    assert ok, f"Publish client '{username}' could not connect"
    result = client.publish(topic, json.dumps(payload))
    result.wait_for_publish()
    time.sleep(0.2)
    client.loop_stop()
    client.disconnect()


# ── Session-scoped fixtures ───────────────────────────────────────────────────

@pytest.fixture(scope="session", autouse=True)
def backend_ready():
    """Block until the backend is up. Fail fast if it never starts."""
    assert wait_for_backend(BACKEND_URL), (
        f"Backend at {BACKEND_URL} did not become ready — "
        "is the backend service running in the compose stack?"
    )


@pytest.fixture(scope="session")
def admin_jwt(backend_ready):
    """Register (or re-use) the integration admin account and return its JWT."""
    r = requests.post(f"{BACKEND_URL}/auth/register", json={
        "email":       ADMIN_EMAIL,
        "password":    ADMIN_PASSWORD,
        "accessToken": ADMIN_ACCESS_TOKEN,
    })
    assert r.status_code in (200, 409), (
        f"Admin registration unexpected response: {r.status_code} — {r.text}\n"
        "Check that VALID_ADMIN_ACCESS_TOKENS in .dev.vars contains 'AGRO-ADMIN-TOKEN-1'"
    )

    login = requests.post(f"{BACKEND_URL}/auth/login", json={
        "email":    ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    assert login.status_code == 200, f"Admin login failed: {login.text}"
    token = login.json()["token"]

    yield token

    # ── Teardown: delete every account created during this test session ──────
    # The JWT is validated by signature, not KV presence, so it stays valid
    # even after the admin's own record is deleted — allowing us to clean up last.
    print("\n[teardown] Deleting test accounts...")
    r = requests.get(f"{BACKEND_URL}/admin/users", headers=admin_headers(token))
    if r.status_code != 200:
        print(f"[teardown] Could not fetch users: {r.status_code}")
        return

    deleted = 0
    admin_user_id = None
    for user in r.json():
        if not user["email"].endswith("@agrodrone.test"):
            continue
        if user["email"] == ADMIN_EMAIL:
            admin_user_id = user["userId"]  # delete admin last
            continue
        resp = requests.delete(
            f"{BACKEND_URL}/admin/users/{user['userId']}",
            headers=admin_headers(token),
        )
        if resp.status_code == 204:
            deleted += 1
        else:
            print(f"[teardown] Failed to delete {user['email']}: {resp.status_code}")

    if admin_user_id:
        resp = requests.delete(
            f"{BACKEND_URL}/admin/users/{admin_user_id}",
            headers=admin_headers(token),
        )
        if resp.status_code == 204:
            deleted += 1

    print(f"[teardown] Deleted {deleted} test account(s).")


def admin_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ── Test helpers that need the admin JWT ──────────────────────────────────────

def issue_client_token(admin_token: str) -> str:
    r = requests.post(
        f"{BACKEND_URL}/admin/access-token",
        headers=admin_headers(admin_token),
    )
    assert r.status_code == 200, f"Failed to issue access token: {r.text}"
    return r.json()["accessToken"]


def register_client(access_token: str) -> dict:
    """Register a fresh client account. Returns the full response body."""
    email = f"client-{uuid.uuid4().hex[:8]}@agrodrone.test"
    r = requests.post(f"{BACKEND_URL}/auth/register", json={
        "email":       email,
        "password":    "ClientPass1!",
        "accessToken": access_token,
    })
    assert r.status_code == 200, f"Client registration failed: {r.text}"
    data = r.json()
    assert "mqttToken" in data, (
        "Backend did not return mqttToken on registration — "
        "check that POST /auth/register provisions MQTT credentials"
    )
    data["email"]    = email
    data["password"] = "ClientPass1!"
    return data


def register_device(admin_token: str, user_id: str) -> dict:
    r = requests.post(
        f"{BACKEND_URL}/admin/device/register",
        headers=admin_headers(admin_token),
        json={"targetUserId": user_id},
    )
    assert r.status_code == 200, f"Device registration failed: {r.text}"
    data = r.json()
    assert "deviceId"    in data, "Response missing deviceId"
    assert "deviceToken" in data, "Response missing deviceToken"
    return data


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestMQTTProvisioning:
    """Verify that MQTT credentials are provisioned correctly by the backend."""

    def test_client_registration_returns_mqtt_token(self, admin_jwt):
        """POST /auth/register must return a non-empty mqttToken."""
        token   = issue_client_token(admin_jwt)
        client  = register_client(token)
        assert client["mqttToken"], "mqttToken is empty"
        assert len(client["mqttToken"]) == 48, (
            f"Expected 48-char hex mqttToken, got {len(client['mqttToken'])} chars"
        )

    def test_client_mqtt_connects_immediately_after_registration(self, admin_jwt):
        """The mqttToken returned by /auth/register must work on the broker right away."""
        token  = issue_client_token(admin_jwt)
        client = register_client(token)

        mqtt_client, ok = mqtt_connect_client(
            username=client["userId"],
            password=client["mqttToken"],
        )
        mqtt_client.loop_stop()
        mqtt_client.disconnect()

        assert ok, (
            f"Frontend MQTT connection failed for userId={client['userId']} "
            f"immediately after registration — broker rejected the credentials.\n"
            "Most likely cause: dynsec createClient command was not awaited before "
            "the HTTP response was returned."
        )

    def test_login_refreshes_mqtt_token(self, admin_jwt):
        """A second login must issue a new mqttToken that also works on the broker."""
        token  = issue_client_token(admin_jwt)
        client = register_client(token)

        login = requests.post(f"{BACKEND_URL}/auth/login", json={
            "email":    client["email"],
            "password": client["password"],
        })
        assert login.status_code == 200
        new_token = login.json()["mqttToken"]
        assert new_token != client["mqttToken"], "Login should issue a fresh token"

        mqtt_client, ok = mqtt_connect_client(
            username=client["userId"],
            password=new_token,
        )
        mqtt_client.loop_stop()
        mqtt_client.disconnect()

        assert ok, "Refreshed mqttToken from /auth/login did not work on broker"

    def test_wrong_mqtt_token_is_rejected(self, admin_jwt):
        """A made-up mqttToken must be rejected by the broker."""
        token  = issue_client_token(admin_jwt)
        client = register_client(token)

        _, ok = mqtt_connect_client(
            username=client["userId"],
            password="not-the-real-token",
        )
        assert not ok, "Broker should have rejected an invalid mqttToken"

    def test_device_credentials_work_on_broker(self, admin_jwt):
        """deviceToken returned by /admin/device/register must authenticate on the broker."""
        token  = issue_client_token(admin_jwt)
        client = register_client(token)
        device = register_device(admin_jwt, client["userId"])

        mqtt_client, ok = mqtt_connect_client(
            username=f"device-{device['deviceId']}",
            password=device["deviceToken"],
            client_id=device["deviceId"],
        )
        mqtt_client.loop_stop()
        mqtt_client.disconnect()

        assert ok, (
            f"Edge node MQTT connection failed for device-{device['deviceId']} — "
            "broker rejected the credentials returned by /admin/device/register"
        )

    def test_wrong_device_token_is_rejected(self, admin_jwt):
        """A wrong device token must be rejected by the broker."""
        token  = issue_client_token(admin_jwt)
        client = register_client(token)
        device = register_device(admin_jwt, client["userId"])

        _, ok = mqtt_connect_client(
            username=f"device-{device['deviceId']}",
            password="totally-wrong-token",
        )
        assert not ok, "Broker should have rejected an invalid device token"


class TestTelemetryRouting:
    """Verify end-to-end telemetry delivery and tenant isolation."""

    def _setup_tenant(self, admin_jwt):
        """Helper: register client + device for one tenant. Returns combined dict."""
        token  = issue_client_token(admin_jwt)
        client = register_client(token)
        device = register_device(admin_jwt, client["userId"])
        return {**client, **device}

    def test_device_telemetry_reaches_its_frontend(self, admin_jwt):
        """Telemetry published by the edge node must arrive at its owner's frontend."""
        tenant = self._setup_tenant(admin_jwt)
        uid    = tenant["userId"]
        did    = tenant["deviceId"]
        dtok   = tenant["deviceToken"]
        mtok   = tenant["mqttToken"]

        # Subscribe as frontend
        frontend, ok = mqtt_connect_client(username=uid, password=mtok)
        assert ok, f"Frontend for {uid} could not connect"

        received = []
        frontend.on_message = lambda _c, _ud, msg: received.append(json.loads(msg.payload))
        frontend.subscribe(f"{uid}/telemetry")
        time.sleep(0.5)  # let subscription propagate

        # Publish as device
        publish_once(f"device-{did}", dtok, f"{uid}/telemetry", TELEMETRY)
        time.sleep(2)

        frontend.loop_stop()
        frontend.disconnect()

        assert len(received) >= 1, f"Frontend for {uid} received no telemetry"
        assert received[0]["battery_remaining"] == "85"

    def test_device_cannot_publish_to_wrong_tenant_topic(self, admin_jwt):
        """A device must be blocked by the broker from publishing to another tenant's topic."""
        tenant_a = self._setup_tenant(admin_jwt)
        tenant_b = self._setup_tenant(admin_jwt)

        uid_a = tenant_a["userId"]
        uid_b = tenant_b["userId"]
        did_a = tenant_a["deviceId"]
        dtok_a = tenant_a["deviceToken"]
        mtok_b = tenant_b["mqttToken"]

        # Frontend B subscribes to its own topic
        frontend_b, ok = mqtt_connect_client(username=uid_b, password=mtok_b)
        assert ok

        received = []
        frontend_b.on_message = lambda _c, _ud, msg: received.append(json.loads(msg.payload))
        frontend_b.subscribe(f"{uid_b}/telemetry")
        time.sleep(0.5)

        # Device A attempts to publish to tenant B's topic — broker must drop it
        device_a, ok = mqtt_connect_client(
            username=f"device-{did_a}", password=dtok_a, client_id=did_a
        )
        assert ok, "Device A could not connect"
        device_a.publish(f"{uid_b}/telemetry", json.dumps(TELEMETRY))
        time.sleep(2)
        device_a.loop_stop()
        device_a.disconnect()

        frontend_b.loop_stop()
        frontend_b.disconnect()

        assert len(received) == 0, (
            f"Broker allowed device-{did_a} to publish to {uid_b}/telemetry — "
            f"ACL enforcement is broken. Messages received: {received}"
        )

    def test_frontend_cannot_subscribe_to_other_tenant_topic(self, admin_jwt):
        """A frontend's subscription to another tenant's telemetry topic must be blocked."""
        tenant_a = self._setup_tenant(admin_jwt)
        tenant_b = self._setup_tenant(admin_jwt)

        uid_a  = tenant_a["userId"]
        uid_b  = tenant_b["userId"]
        did_b  = tenant_b["deviceId"]
        dtok_b = tenant_b["deviceToken"]
        mtok_a = tenant_a["mqttToken"]

        # Frontend A tries to subscribe to tenant B's topic
        frontend_a, ok = mqtt_connect_client(username=uid_a, password=mtok_a)
        assert ok

        received = []
        frontend_a.on_message = lambda _c, _ud, msg: received.append(json.loads(msg.payload))
        frontend_a.subscribe(f"{uid_b}/telemetry")  # broker should deny this
        time.sleep(0.5)

        # Device B actively publishes — if ACL were absent, frontend A would see it
        publish_once(f"device-{did_b}", dtok_b, f"{uid_b}/telemetry", TELEMETRY)
        time.sleep(2)

        frontend_a.loop_stop()
        frontend_a.disconnect()

        assert len(received) == 0, (
            f"Frontend A ({uid_a}) received telemetry from tenant B ({uid_b}) — "
            f"ACL subscription enforcement is broken. Messages: {received}"
        )

    def test_two_tenants_receive_only_their_own_telemetry(self, admin_jwt):
        """Both tenants receive their own telemetry simultaneously, with no cross-leak."""
        tenant_a = self._setup_tenant(admin_jwt)
        tenant_b = self._setup_tenant(admin_jwt)

        uid_a  = tenant_a["userId"]
        uid_b  = tenant_b["userId"]
        did_a  = tenant_a["deviceId"]
        did_b  = tenant_b["deviceId"]
        dtok_a = tenant_a["deviceToken"]
        dtok_b = tenant_b["deviceToken"]
        mtok_a = tenant_a["mqttToken"]
        mtok_b = tenant_b["mqttToken"]

        received_a, received_b = [], []

        fa, ok_a = mqtt_connect_client(username=uid_a, password=mtok_a)
        fb, ok_b = mqtt_connect_client(username=uid_b, password=mtok_b)
        assert ok_a, f"Frontend A ({uid_a}) could not connect"
        assert ok_b, f"Frontend B ({uid_b}) could not connect"

        fa.on_message = lambda _c, _ud, msg: received_a.append(json.loads(msg.payload))
        fb.on_message = lambda _c, _ud, msg: received_b.append(json.loads(msg.payload))
        fa.subscribe(f"{uid_a}/telemetry")
        fb.subscribe(f"{uid_b}/telemetry")
        time.sleep(0.5)

        # Both devices publish simultaneously
        publish_once(f"device-{did_a}", dtok_a, f"{uid_a}/telemetry", TELEMETRY)
        publish_once(f"device-{did_b}", dtok_b, f"{uid_b}/telemetry", TELEMETRY)
        time.sleep(2)

        fa.loop_stop(); fa.disconnect()
        fb.loop_stop(); fb.disconnect()

        assert len(received_a) >= 1, f"Frontend A received nothing"
        assert len(received_b) >= 1, f"Frontend B received nothing"
        # Each frontend should have received exactly one message (its own)
        assert len(received_a) == 1, (
            f"Frontend A received {len(received_a)} messages — expected 1 (only its own)"
        )
        assert len(received_b) == 1, (
            f"Frontend B received {len(received_b)} messages — expected 1 (only its own)"
        )
