"""
Multi-tenant MQTT isolation tests.

Verifies that Mosquitto Dynamic Security ACLs correctly:
  1. Route telemetry from each edge node only to its owner's frontend
  2. Route flight plans from the backend only to the correct edge node
  3. Reject connection attempts with wrong credentials
  4. Block cross-tenant publish attempts
"""

import json
import time
import threading
import pytest
import paho.mqtt.client as mqtt

from conftest import make_client, subscribe_and_collect, MQTT_HOST, MQTT_PORT

TELEMETRY_PAYLOAD = json.dumps({"battery_remaining": "85", "alt_msl": "10.5", "lat": "42.35", "lon": "-71.11"})
FLIGHT_PLAN_PAYLOAD = json.dumps({"missionId": "test-mission-001", "vertices": []})


# ── Helper: collect messages on a topic for a given duration ──────────────────

def collect_for(client: mqtt.Client, topic: str, duration: float = 2.0) -> list[str]:
    messages: list[str] = []
    def on_msg(_c, _ud, msg):
        messages.append(msg.payload.decode())
    client.on_message = on_msg
    client.subscribe(topic)
    time.sleep(duration)
    return messages


# ── Connectivity tests ────────────────────────────────────────────────────────

class TestAuthentication:
    def test_device_a_connects_with_correct_token(self, device_a):
        """Edge node A should connect successfully with its registered token."""
        assert device_a.is_connected()

    def test_device_b_connects_with_correct_token(self, device_b):
        """Edge node B should connect successfully with its registered token."""
        assert device_b.is_connected()

    def test_frontend_a_connects_with_mqtt_token(self, frontend_a):
        """Frontend A should connect with its short-lived MQTT token."""
        assert frontend_a.is_connected()

    def test_frontend_b_connects_with_mqtt_token(self, frontend_b):
        """Frontend B should connect with its short-lived MQTT token."""
        assert frontend_b.is_connected()

    def test_wrong_password_rejected(self):
        """A connection attempt with a wrong password must be refused (rc != 0)."""
        result_code = []

        def on_connect(_c, _ud, _flags, rc):
            result_code.append(rc)

        client = mqtt.Client(client_id="bad-actor")
        client.username_pw_set(username="device-test-device-a", password="WRONG-PASSWORD")
        client.on_connect = on_connect
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=5)
            client.loop_start()
            time.sleep(3)
            client.loop_stop()
        except Exception:
            pass  # Connection may be refused at TCP level

        # rc=4 means "bad username or password" in MQTT 3.1.1
        assert result_code and result_code[0] != 0, (
            f"Expected non-zero CONNACK but got rc={result_code}"
        )


# ── Telemetry isolation tests ─────────────────────────────────────────────────

class TestTelemetryIsolation:
    def test_device_a_telemetry_reaches_frontend_a(self, device_a, frontend_a):
        """Telemetry published by device A must arrive at frontend A."""
        received = []

        def on_msg(_c, _ud, msg):
            received.append(msg.payload.decode())

        frontend_a.on_message = on_msg
        frontend_a.subscribe("user-a-id/telemetry")
        time.sleep(0.5)  # allow subscription to propagate

        device_a.publish("user-a-id/telemetry", TELEMETRY_PAYLOAD)
        time.sleep(2)

        assert len(received) >= 1, "Frontend A did not receive telemetry from device A"
        assert json.loads(received[0])["battery_remaining"] == "85"

    def test_device_a_telemetry_does_not_reach_frontend_b(self, device_a, frontend_b):
        """Telemetry published by device A must NOT arrive at frontend B."""
        received = []

        def on_msg(_c, _ud, msg):
            received.append(msg.payload.decode())

        frontend_b.on_message = on_msg
        # frontend_b only has ACL to subscribe user-b-id/telemetry; subscribing to
        # user-a-id/telemetry should be denied by the broker.
        frontend_b.subscribe("user-a-id/telemetry")
        time.sleep(0.5)

        device_a.publish("user-a-id/telemetry", TELEMETRY_PAYLOAD)
        time.sleep(2)

        assert len(received) == 0, (
            f"Frontend B should not receive user A's telemetry, but got: {received}"
        )

    def test_device_b_telemetry_reaches_frontend_b(self, device_b, frontend_b):
        """Telemetry published by device B must arrive at frontend B."""
        received = []

        def on_msg(_c, _ud, msg):
            received.append(msg.payload.decode())

        frontend_b.on_message = on_msg
        frontend_b.subscribe("user-b-id/telemetry")
        time.sleep(0.5)

        device_b.publish("user-b-id/telemetry", TELEMETRY_PAYLOAD)
        time.sleep(2)

        assert len(received) >= 1, "Frontend B did not receive telemetry from device B"

    def test_device_b_telemetry_does_not_reach_frontend_a(self, device_b, frontend_a):
        """Telemetry published by device B must NOT arrive at frontend A."""
        received = []

        def on_msg(_c, _ud, msg):
            received.append(msg.payload.decode())

        frontend_a.on_message = on_msg
        frontend_a.subscribe("user-b-id/telemetry")  # ACL denied
        time.sleep(0.5)

        device_b.publish("user-b-id/telemetry", TELEMETRY_PAYLOAD)
        time.sleep(2)

        assert len(received) == 0, (
            f"Frontend A should not receive user B's telemetry, but got: {received}"
        )


# ── Flight plan routing tests ─────────────────────────────────────────────────

class TestFlightPlanRouting:
    def test_flightplan_for_user_a_received_by_device_a(self, backend_client, device_a):
        """Backend publishing to user-a-id/flightplan must be received by device A."""
        received = []

        def on_msg(_c, _ud, msg):
            received.append(msg.payload.decode())

        device_a.on_message = on_msg
        device_a.subscribe("user-a-id/flightplan")
        time.sleep(0.5)

        backend_client.publish("user-a-id/flightplan", FLIGHT_PLAN_PAYLOAD)
        time.sleep(2)

        assert len(received) >= 1, "Device A did not receive its flight plan"
        assert json.loads(received[0])["missionId"] == "test-mission-001"

    def test_flightplan_for_user_a_not_received_by_device_b(self, backend_client, device_b):
        """A flight plan published for user A must NOT be received by device B."""
        received = []

        def on_msg(_c, _ud, msg):
            received.append(msg.payload.decode())

        device_b.on_message = on_msg
        device_b.subscribe("user-a-id/flightplan")  # ACL denied
        time.sleep(0.5)

        backend_client.publish("user-a-id/flightplan", FLIGHT_PLAN_PAYLOAD)
        time.sleep(2)

        assert len(received) == 0, (
            f"Device B should not receive user A's flight plan, but got: {received}"
        )


# ── ACL enforcement tests ─────────────────────────────────────────────────────

class TestACLEnforcement:
    def test_device_a_cannot_publish_to_user_b_topic(self, device_a, frontend_b):
        """Device A must be denied from publishing to user B's telemetry topic.
        Even if it attempts the publish, the broker should silently drop it."""
        received = []

        def on_msg(_c, _ud, msg):
            received.append(msg.payload.decode())

        frontend_b.on_message = on_msg
        frontend_b.subscribe("user-b-id/telemetry")
        time.sleep(0.5)

        # Device A attempts to publish to user B's topic — broker should deny/drop
        device_a.publish("user-b-id/telemetry", '{"spoofed": true}')
        time.sleep(2)

        assert len(received) == 0, (
            f"Broker should have blocked device A from publishing to user B's topic. Got: {received}"
        )
