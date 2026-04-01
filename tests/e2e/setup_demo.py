"""
Demo mode setup — provisions demo accounts via the real backend API.

Flow:
  1. Wait for backend to be ready
  2. Register demo admin + demo client accounts
  3. Register a device for the client
  4. Write credentials to /shared/demo_credentials.json
  5. Exit 0

Idempotent: if /shared/demo_credentials.json already exists, exits immediately.
(wrangler KV is ephemeral between compose up/down cycles, so credentials are
always fresh when the volume is recreated with `down -v`.)
"""

import json
import os
import sys
import time

import requests

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8787")
SHARED_PATH = "/shared/demo_credentials.json"

ADMIN_ACCESS_TOKEN = "AGRO-ADMIN-TOKEN-1"
ADMIN_EMAIL        = "demo-admin@agrodrone.com"
ADMIN_PASSWORD     = "DemoAdmin1!"
CLIENT_EMAIL       = "demo-client@agrodrone.com"
CLIENT_PASSWORD    = "DemoClient1!"


def wait_for_backend(url, retries=40, interval=2.0):
    for i in range(retries):
        try:
            r = requests.options(f"{url}/auth/register", timeout=3)
            if r.status_code < 500:
                print(f"Backend ready after {i + 1} attempt(s)")
                return True
        except requests.exceptions.ConnectionError:
            pass
        print(f"[{i + 1}/{retries}] Waiting for backend...")
        time.sleep(interval)
    return False


def main():
    if os.path.exists(SHARED_PATH):
        print(f"{SHARED_PATH} already exists — skipping provisioning")
        sys.exit(0)

    if not wait_for_backend(BACKEND_URL):
        print("ERROR: backend never became ready")
        sys.exit(1)

    # 1. Register admin (409 = already exists from a prior run within same wrangler session)
    r = requests.post(f"{BACKEND_URL}/auth/register", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
        "accessToken": ADMIN_ACCESS_TOKEN,
    })
    if r.status_code not in (200, 409):
        print(f"Admin register failed: {r.status_code} {r.text}")
        sys.exit(1)

    # 2. Log in as admin to get JWT
    r = requests.post(f"{BACKEND_URL}/auth/login", json={
        "email": ADMIN_EMAIL, "password": ADMIN_PASSWORD,
    })
    if r.status_code != 200:
        print(f"Admin login failed: {r.status_code} {r.text}")
        sys.exit(1)
    admin_token = r.json()["token"]
    admin_headers = {
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    }

    # 3. Issue a single-use client access token
    r = requests.post(f"{BACKEND_URL}/admin/access-token", headers=admin_headers)
    if r.status_code != 200:
        print(f"Access token issuance failed: {r.status_code} {r.text}")
        sys.exit(1)
    client_access_token = r.json()["accessToken"]

    # 4. Register client account (409 = login instead)
    r = requests.post(f"{BACKEND_URL}/auth/register", json={
        "email": CLIENT_EMAIL,
        "password": CLIENT_PASSWORD,
        "accessToken": client_access_token,
    })
    if r.status_code == 409:
        r = requests.post(f"{BACKEND_URL}/auth/login", json={
            "email": CLIENT_EMAIL, "password": CLIENT_PASSWORD,
        })
    if r.status_code != 200:
        print(f"Client register/login failed: {r.status_code} {r.text}")
        sys.exit(1)
    client_data = r.json()
    user_id    = client_data["userId"]
    mqtt_token = client_data["mqttToken"]

    # 5. Register a device for the client
    r = requests.post(f"{BACKEND_URL}/admin/device/register",
                      headers=admin_headers,
                      json={"targetUserId": user_id})
    if r.status_code != 200:
        print(f"Device register failed: {r.status_code} {r.text}")
        sys.exit(1)
    device_id    = r.json()["deviceId"]
    device_token = r.json()["deviceToken"]

    # 6. Write credentials for the edge node
    os.makedirs(os.path.dirname(SHARED_PATH), exist_ok=True)
    with open(SHARED_PATH, "w") as f:
        json.dump({
            "userId":      user_id,
            "mqttToken":   mqtt_token,
            "deviceId":    device_id,
            "deviceToken": device_token,
        }, f, indent=2)

    print(f"Demo credentials written to {SHARED_PATH}")
    print(f"  clientEmail: {CLIENT_EMAIL}")
    print(f"  userId:      {user_id}")
    print(f"  deviceId:    {device_id}")
    print(f"\nLog in at http://localhost:5173 with:")
    print(f"  Email:    {CLIENT_EMAIL}")
    print(f"  Password: {CLIENT_PASSWORD}")


if __name__ == "__main__":
    main()
