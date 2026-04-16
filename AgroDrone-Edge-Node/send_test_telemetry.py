#!/usr/bin/env python3
"""
send_test_telemetry.py — sends a single fake telemetry payload to the MQTT broker.

Usage:
    python3 send_test_telemetry.py

Required env vars (same as telemetry.py):
    DEVICE_ID, DEVICE_TOKEN, USER_ID, MQTT_HOST

Optional env vars (with defaults):
    MQTT_PORT        (default: 443)
    MQTT_TRANSPORT   (default: websockets)
    MQTT_WS_PATH     (default: /mqtt)
    MQTT_TLS         (default: true)
"""

import json
import os
import sys
import threading
import time
from dotenv import load_dotenv
import paho.mqtt.client as mqtt

load_dotenv()

MQTT_HOST      = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT      = int(os.getenv("MQTT_PORT", 443))
MQTT_TRANSPORT = os.getenv("MQTT_TRANSPORT", "websockets")
MQTT_WS_PATH   = os.getenv("MQTT_WS_PATH", "/mqtt")
MQTT_TLS       = os.getenv("MQTT_TLS", "true").lower() == "true"
DEVICE_ID      = os.getenv("DEVICE_ID")
DEVICE_TOKEN   = os.getenv("DEVICE_TOKEN")
USER_ID        = os.getenv("USER_ID")

RC_MESSAGES = {
    1: "incorrect protocol version",
    2: "invalid client identifier",
    3: "server unavailable",
    4: "bad username or password",
    5: "not authorised",
}

FAKE_PAYLOAD = {
    "voltage_battery":    12.6,
    "current_battery":    4.2,
    "battery_remaining":  78,
    "satellites_visible": 10,
    "gps_hdop":           1.2,
    "lat":                42.3490,
    "lon":                -71.1059,
    "alt_msl":            45.3,
    "alt_rel":            12.0,
    "heading":            270.0,
    "vx":                 1.5,
    "vy":                 0.3,
    "vz":                 -0.1,
    "base_station_position": [42.34899, -71.10590],
    "timestamp":          None,  # filled at send time
}


def main():
    if not DEVICE_ID or not DEVICE_TOKEN or not USER_ID:
        print("Error: DEVICE_ID, DEVICE_TOKEN, and USER_ID must be set.")
        sys.exit(1)

    topic = f"{USER_ID}/telemetry"

    connected = threading.Event()
    published = threading.Event()
    connect_rc = [None]

    def on_connect(client, userdata, flags, rc):
        connect_rc[0] = rc
        connected.set()

    def on_publish(client, userdata, mid):
        published.set()

    client = mqtt.Client(client_id=f"{DEVICE_ID}-test", transport=MQTT_TRANSPORT)
    if MQTT_TRANSPORT == "websockets":
        client.ws_set_options(path=MQTT_WS_PATH)
    if MQTT_TLS:
        client.tls_set()
    client.username_pw_set(username=f"device-{DEVICE_ID}", password=DEVICE_TOKEN)
    client.on_connect = on_connect
    client.on_publish = on_publish

    print(f"Connecting to {MQTT_HOST}:{MQTT_PORT} (transport={MQTT_TRANSPORT}, tls={MQTT_TLS})...")
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_start()

    if not connected.wait(timeout=10):
        print("Error: connection timed out.")
        sys.exit(1)

    if connect_rc[0] != 0:
        reason = RC_MESSAGES.get(connect_rc[0], f"code {connect_rc[0]}")
        print(f"Error: connection refused — {reason}")
        sys.exit(1)

    print("Connected.")

    payload = dict(FAKE_PAYLOAD)
    payload["timestamp"] = time.time()

    print(f"Publishing to topic '{topic}':")
    print(json.dumps(payload, indent=2))

    client.publish(topic, json.dumps(payload), qos=1)

    if not published.wait(timeout=10):
        print("Warning: publish acknowledgement not received within 10s.")
    else:
        print("Published successfully.")

    client.loop_stop()
    client.disconnect()


if __name__ == "__main__":
    main()
