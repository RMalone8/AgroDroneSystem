"""
Shared pytest fixtures for multi-tenant MQTT E2E tests.

Test credentials (pre-seeded in MQTT/dynamic-security.test.json):
  User A:  userId=user-a-id,      mqttPassword=mqtt-token-a
  User B:  userId=user-b-id,      mqttPassword=mqtt-token-b
  Device A: username=device-test-device-a, password=test-token-a
  Device B: username=device-test-device-b, password=test-token-b
  Backend:  username=agrodrone-backend,   password=test-admin-pass
"""

import os
import time
import threading
import pytest
import paho.mqtt.client as mqtt

MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_client(username: str, password: str, client_id: str | None = None) -> mqtt.Client:
    """Create, configure, and connect an MQTT client. Blocks until connected."""
    client = mqtt.Client(client_id=client_id or username)
    client.username_pw_set(username=username, password=password)

    connected = threading.Event()
    def on_connect(_c, _ud, _flags, rc):
        if rc == 0:
            connected.set()
    client.on_connect = on_connect
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=10)
    client.loop_start()

    if not connected.wait(timeout=10):
        client.loop_stop()
        raise RuntimeError(f"Client '{username}' could not connect within 10 s (rc may indicate auth failure)")
    return client


def subscribe_and_collect(client: mqtt.Client, topic: str, timeout: float = 2.0) -> list[str]:
    """Subscribe to a topic and return all messages received within `timeout` seconds."""
    messages: list[str] = []

    def on_message(_c, _ud, msg):
        messages.append(msg.payload.decode())

    client.on_message = on_message
    client.subscribe(topic)
    time.sleep(timeout)
    return messages


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def mqtt_host():
    return MQTT_HOST

@pytest.fixture(scope="session")
def mqtt_port():
    return MQTT_PORT


@pytest.fixture(scope="function")
def frontend_a():
    """Frontend client authenticated as user A."""
    client = make_client(username="user-a-id", password="mqtt-token-a", client_id="test-frontend-a")
    yield client
    client.loop_stop()
    client.disconnect()


@pytest.fixture(scope="function")
def frontend_b():
    """Frontend client authenticated as user B."""
    client = make_client(username="user-b-id", password="mqtt-token-b", client_id="test-frontend-b")
    yield client
    client.loop_stop()
    client.disconnect()


@pytest.fixture(scope="function")
def device_a():
    """Edge node client for user A."""
    client = make_client(username="device-test-device-a", password="test-token-a", client_id="test-device-a")
    yield client
    client.loop_stop()
    client.disconnect()


@pytest.fixture(scope="function")
def device_b():
    """Edge node client for user B."""
    client = make_client(username="device-test-device-b", password="test-token-b", client_id="test-device-b")
    yield client
    client.loop_stop()
    client.disconnect()


@pytest.fixture(scope="function")
def backend_client():
    """Backend admin client — can publish to any topic."""
    client = make_client(username="agrodrone-backend", password="test-admin-pass", client_id="test-backend")
    yield client
    client.loop_stop()
    client.disconnect()
