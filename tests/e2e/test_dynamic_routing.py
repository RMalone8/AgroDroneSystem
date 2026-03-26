"""
Dynamic-registration routing E2E tests.

Verifies that credentials provisioned at runtime by setup_dynamic.py
correctly isolate telemetry between two tenants:

  - Frontend A receives only edge-node-A's telemetry.
  - Frontend B receives only edge-node-B's telemetry.
  - Each frontend's ACL blocks subscriptions to the other tenant's topic.

The edge-node-a and edge-node-b containers publish continuously at 1 Hz,
so each test only needs to wait a few seconds for messages to arrive.
"""

import json
import os
import threading
import time

import pytest
import paho.mqtt.client as mqtt

MQTT_HOST   = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
SHARED_PATH = "/shared/credentials.json"


# ── Shared credentials fixture ────────────────────────────────────────────────

@pytest.fixture(scope="session")
def credentials():
    """Wait for setup_dynamic.py to write credentials, then return them."""
    for i in range(30):
        if os.path.exists(SHARED_PATH):
            break
        print(f"[{i+1}/30] Waiting for {SHARED_PATH}...")
        time.sleep(1)
    else:
        pytest.fail(f"{SHARED_PATH} was not created — did the setup service run?")

    with open(SHARED_PATH) as f:
        return json.load(f)


# ── Helpers ───────────────────────────────────────────────────────────────────

def connect_frontend(uid: str, mqtt_token: str) -> mqtt.Client:
    """Create and connect a frontend MQTT client.  Raises if connection fails."""
    client = mqtt.Client(client_id=f"test-frontend-{uid}")
    client.username_pw_set(username=uid, password=mqtt_token)

    connected = threading.Event()

    def on_connect(_c, _ud, _flags, rc):
        if rc == 0:
            connected.set()

    client.on_connect = on_connect
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=10)
    client.loop_start()

    if not connected.wait(timeout=10):
        client.loop_stop()
        raise RuntimeError(f"Frontend client '{uid}' could not connect (bad credentials or broker down)")

    return client


def collect_messages(client: mqtt.Client, topic: str, duration: float = 4.0) -> list[dict]:
    """Subscribe to topic and return all messages received within duration seconds."""
    messages: list[dict] = []

    def on_message(_c, _ud, msg):
        messages.append(json.loads(msg.payload.decode()))

    client.on_message = on_message
    client.subscribe(topic)
    time.sleep(duration)
    return messages


# ── Test class ────────────────────────────────────────────────────────────────

class TestDynamicRouting:
    """Routing assertions using dynamically registered credentials."""

    def test_frontend_a_receives_own_telemetry(self, credentials):
        """Edge node A is publishing — frontend A must see those messages."""
        node    = credentials[0]
        uid     = node["userId"]
        tok     = node["mqttToken"]

        client = connect_frontend(uid, tok)
        try:
            received = collect_messages(client, f"{uid}/telemetry")
        finally:
            client.loop_stop()
            client.disconnect()

        assert len(received) >= 1, (
            f"Frontend A ({uid}) received no telemetry — edge node may not be publishing"
        )
        assert received[0].get("battery_remaining") == "85"

    def test_frontend_b_receives_own_telemetry(self, credentials):
        """Edge node B is publishing — frontend B must see those messages."""
        node    = credentials[1]
        uid     = node["userId"]
        tok     = node["mqttToken"]

        client = connect_frontend(uid, tok)
        try:
            received = collect_messages(client, f"{uid}/telemetry")
        finally:
            client.loop_stop()
            client.disconnect()

        assert len(received) >= 1, (
            f"Frontend B ({uid}) received no telemetry — edge node may not be publishing"
        )
        assert received[0].get("battery_remaining") == "85"

    def test_frontend_a_blocked_from_user_b_telemetry(self, credentials):
        """Broker ACL must block frontend A from subscribing to user B's telemetry."""
        node_a  = credentials[0]
        node_b  = credentials[1]
        uid_a   = node_a["userId"]
        uid_b   = node_b["userId"]
        tok_a   = node_a["mqttToken"]

        client = connect_frontend(uid_a, tok_a)
        try:
            # edge-node-b is actively publishing to uid_b/telemetry, so if the
            # ACL were absent we would see messages within a few seconds.
            received = collect_messages(client, f"{uid_b}/telemetry")
        finally:
            client.loop_stop()
            client.disconnect()

        assert len(received) == 0, (
            f"Frontend A ({uid_a}) should NOT receive user B ({uid_b}) telemetry, "
            f"but got {len(received)} message(s): {received}"
        )

    def test_frontend_b_blocked_from_user_a_telemetry(self, credentials):
        """Broker ACL must block frontend B from subscribing to user A's telemetry."""
        node_a  = credentials[0]
        node_b  = credentials[1]
        uid_a   = node_a["userId"]
        uid_b   = node_b["userId"]
        tok_b   = node_b["mqttToken"]

        client = connect_frontend(uid_b, tok_b)
        try:
            received = collect_messages(client, f"{uid_a}/telemetry")
        finally:
            client.loop_stop()
            client.disconnect()

        assert len(received) == 0, (
            f"Frontend B ({uid_b}) should NOT receive user A ({uid_a}) telemetry, "
            f"but got {len(received)} message(s): {received}"
        )

    def test_wrong_device_token_rejected(self, credentials):
        """A device connecting with the wrong token must be refused."""
        node = credentials[0]
        did  = node["deviceId"]

        result_code = []

        def on_connect(_c, _ud, _flags, rc):
            result_code.append(rc)

        client = mqtt.Client(client_id=f"bad-device-{did}")
        client.username_pw_set(username=f"device-{did}", password="WRONG-TOKEN")
        client.on_connect = on_connect
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=5)
            client.loop_start()
            time.sleep(3)
            client.loop_stop()
        except Exception:
            pass  # TCP-level refusal is also acceptable

        assert result_code and result_code[0] != 0, (
            f"Expected auth failure (rc != 0) for wrong device token, got rc={result_code}"
        )
