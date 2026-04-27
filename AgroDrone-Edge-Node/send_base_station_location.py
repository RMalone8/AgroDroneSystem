#!/usr/bin/env python3
"""
send_base_station_location.py — reads the current GPS fix from gpsd and
publishes a base_station_position payload to <USER_ID>/telemetry once.

Usage:
    python3 send_base_station_location.py [USER_ID]

    USER_ID may also be supplied via the USER_ID env var.  A command-line
    argument takes precedence over the env var.

Required env vars:
    DEVICE_ID, DEVICE_TOKEN, MQTT_HOST

Optional env vars (with defaults):
    MQTT_PORT        (default: 443)
    MQTT_TRANSPORT   (default: websockets)
    MQTT_WS_PATH     (default: /mqtt)
    MQTT_TLS         (default: true)
    GPSD_HOST        (default: localhost)
    GPSD_PORT        (default: 2947)
"""

import json
import os
import sys
import threading
import time

import gpsd
import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()

MQTT_HOST      = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT      = int(os.getenv("MQTT_PORT", 443))
MQTT_TRANSPORT = os.getenv("MQTT_TRANSPORT", "websockets")
MQTT_WS_PATH   = os.getenv("MQTT_WS_PATH", "/mqtt")
MQTT_TLS       = os.getenv("MQTT_TLS", "true").lower() == "true"
DEVICE_ID      = os.getenv("DEVICE_ID")
DEVICE_TOKEN   = os.getenv("DEVICE_TOKEN")
GPSD_HOST      = os.getenv("GPSD_HOST", "localhost")
GPSD_PORT      = int(os.getenv("GPSD_PORT", 2947))

RC_MESSAGES = {
    1: "incorrect protocol version",
    2: "invalid client identifier",
    3: "server unavailable",
    4: "bad username or password",
    5: "not authorised",
}


GPS_TIMEOUT = int(os.getenv("GPS_TIMEOUT", 15))


def get_gps_position():
    """Return (lat, lon, alt_msl) from gpsd, or None if no fix within GPS_TIMEOUT seconds.

    gpsd stops streaming when no client is connected. After sending WATCH,
    we poll until the daemon has a valid fix rather than reading one packet
    and giving up immediately.
    """
    try:
        gpsd.connect(host=GPSD_HOST, port=GPSD_PORT)
        deadline = time.time() + GPS_TIMEOUT
        while time.time() < deadline:
            packet = gpsd.get_current()
            if packet.mode >= 2:
                alt = getattr(packet, "alt", None)
                return (round(packet.lat, 7), round(packet.lon, 7), round(alt, 2) if alt is not None else None)
            remaining = deadline - time.time()
            print(f"gpsd: waiting for fix (mode={packet.mode}, {remaining:.0f}s left)...", file=sys.stderr)
            time.sleep(0.5)
        print(f"gpsd: timed out after {GPS_TIMEOUT}s waiting for fix.", file=sys.stderr)
        return None
    except Exception as e:
        print(f"gpsd error: {e}", file=sys.stderr)
        return None


def connect_mqtt(user_id):
    connected = threading.Event()
    connect_rc = [None]

    def on_connect(client, userdata, flags, rc):
        connect_rc[0] = rc
        connected.set()

    client = mqtt.Client(client_id=f"{DEVICE_ID}-base-loc", transport=MQTT_TRANSPORT)
    if MQTT_TRANSPORT == "websockets":
        client.ws_set_options(path=MQTT_WS_PATH)
    if MQTT_TLS:
        client.tls_set()
    client.username_pw_set(username=f"device-{DEVICE_ID}", password=DEVICE_TOKEN)
    client.on_connect = on_connect

    print(f"Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT} "
          f"(transport={MQTT_TRANSPORT}, tls={MQTT_TLS})...")
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_start()

    if not connected.wait(timeout=10):
        client.loop_stop()
        print("Error: MQTT connection timed out.", file=sys.stderr)
        sys.exit(1)

    if connect_rc[0] != 0:
        client.loop_stop()
        reason = RC_MESSAGES.get(connect_rc[0], f"code {connect_rc[0]}")
        print(f"Error: MQTT connection refused — {reason}", file=sys.stderr)
        sys.exit(1)

    print("MQTT connected.")
    return client


def main():
    # Resolve USER_ID: CLI arg beats env var
    if len(sys.argv) > 1:
        user_id = sys.argv[1]
    else:
        user_id = os.getenv("USER_ID")

    if not user_id:
        print("Error: USER_ID required (pass as argument or set USER_ID env var).",
              file=sys.stderr)
        sys.exit(1)

    if not DEVICE_ID or not DEVICE_TOKEN:
        print("Error: DEVICE_ID and DEVICE_TOKEN must be set.", file=sys.stderr)
        sys.exit(1)

    pos = get_gps_position()
    if pos is None:
        print("Error: could not obtain a GPS fix from gpsd.", file=sys.stderr)
        sys.exit(1)

    lat, lon, alt = pos
    print(f"GPS fix: lat={lat}, lon={lon}, alt={alt}m")

    payload = {
        "base_station_position": [lat, lon],
        "timestamp": time.time(),
    }
    if alt is not None:
        payload["base_station_alt_msl"] = alt

    topic = f"{user_id}/telemetry"
    client = connect_mqtt(user_id)

    published = threading.Event()
    client.on_publish = lambda c, u, mid: published.set()

    print(f"Publishing to '{topic}':")
    print(json.dumps(payload, indent=2))

    client.publish(topic, json.dumps(payload), qos=1)

    if not published.wait(timeout=10):
        print("Warning: publish acknowledgement not received within 10 s.", file=sys.stderr)
    else:
        print("Published successfully.")

    client.loop_stop()
    client.disconnect()


if __name__ == "__main__":
    main()
