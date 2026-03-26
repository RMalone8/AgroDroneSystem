"""
Dynamic MQTT credential setup for E2E tests.

Connects to Mosquitto as the backend admin and issues Dynamic Security
commands to register two device clients and two frontend clients with
isolated per-user ACLs.  Writes all credentials to /shared/credentials.json
so the edge-node and test-runner containers can read them.

This script is intended to run as a Docker Compose service that exits
successfully (code 0) when provisioning is complete, allowing downstream
services to use `condition: service_completed_successfully`.
"""

import json
import os
import threading
import time
import uuid

import paho.mqtt.client as mqtt

MQTT_HOST   = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
ADMIN_USER  = "agrodrone-backend"
ADMIN_PASS  = "test-admin-pass"
SHARED_PATH = "/shared/credentials.json"

# Fixed user/device IDs make test assertions predictable.
NODES = [
    {
        "userId":      "dyn-user-a",
        "deviceId":    "dyn-device-a",
        "deviceToken": uuid.uuid4().hex,
        "mqttToken":   uuid.uuid4().hex,
    },
    {
        "userId":      "dyn-user-b",
        "deviceId":    "dyn-device-b",
        "deviceToken": uuid.uuid4().hex,
        "mqttToken":   uuid.uuid4().hex,
    },
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def wait_for_broker(host, port, username, password, retries=30):
    """Block until the broker accepts a connection, or return False."""
    for i in range(retries):
        try:
            c = mqtt.Client(client_id="setup-probe")
            c.username_pw_set(username=username, password=password)
            connected = threading.Event()

            def on_connect(_c, _ud, _flags, rc):
                if rc == 0:
                    connected.set()

            c.on_connect = on_connect
            c.connect(host, port, keepalive=5)
            c.loop_start()
            ok = connected.wait(timeout=5)
            c.loop_stop()
            c.disconnect()
            if ok:
                print(f"Broker ready after {i + 1} attempt(s)")
                return True
        except Exception as exc:
            print(f"[{i+1}/{retries}] Broker not ready: {exc}")
        time.sleep(1)
    return False


def publish_dynsec(commands):
    """Publish a batch of Dynamic Security commands and wait for delivery."""
    payload = json.dumps({"commands": commands})
    c = mqtt.Client(client_id=f"setup-dynsec-{uuid.uuid4().hex[:6]}")
    c.username_pw_set(username=ADMIN_USER, password=ADMIN_PASS)
    c.connect(MQTT_HOST, MQTT_PORT, keepalive=5)
    c.loop_start()
    time.sleep(0.3)  # wait for CONNACK to be processed
    result = c.publish("$CONTROL/dynamic-security/v1", payload, qos=1)
    result.wait_for_publish()
    time.sleep(0.3)  # allow broker to apply before next command
    c.loop_stop()
    c.disconnect()


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("Waiting for MQTT broker...")
    if not wait_for_broker(MQTT_HOST, MQTT_PORT, ADMIN_USER, ADMIN_PASS):
        print("ERROR: Could not connect to broker after 30 s")
        raise SystemExit(1)

    for node in NODES:
        uid       = node["userId"]
        did       = node["deviceId"]
        dev_token = node["deviceToken"]
        mqtt_tok  = node["mqttToken"]

        print(f"Registering device {did} for user {uid}...")

        # Create the per-device role + client
        publish_dynsec([
            {
                "command":  "createRole",
                "rolename": f"device-{did}",
                "acls": [
                    {"acltype": "publishClientSend", "topic": f"{uid}/telemetry",  "allow": True},
                    {"acltype": "subscribePattern",  "topic": f"{uid}/flightplan", "allow": True},
                    {"acltype": "subscribePattern",  "topic": f"{uid}/emergency",  "allow": True},
                ],
            },
            {
                "command":  "createClient",
                "username": f"device-{did}",
                "password": dev_token,
                "roles":    [{"rolename": f"device-{did}"}],
            },
        ])

        print(f"Registering frontend for user {uid}...")

        # Create the per-user frontend role + client
        publish_dynsec([
            {
                "command":  "createRole",
                "rolename": f"frontend-{uid}",
                "acls": [
                    {"acltype": "subscribePattern",  "topic": f"{uid}/telemetry", "allow": True},
                    {"acltype": "publishClientSend", "topic": f"{uid}/emergency",  "allow": True},
                ],
            },
            {
                "command":  "createClient",
                "username": uid,
                "password": mqtt_tok,
                "roles":    [{"rolename": f"frontend-{uid}"}],
            },
        ])

    # Write credentials for downstream containers
    os.makedirs(os.path.dirname(SHARED_PATH), exist_ok=True)
    with open(SHARED_PATH, "w") as f:
        json.dump(NODES, f, indent=2)

    print(f"\nCredentials written to {SHARED_PATH}")
    for n in NODES:
        print(f"  userId={n['userId']}  deviceId={n['deviceId']}")


if __name__ == "__main__":
    main()
