"""
Sends hardcoded telemetry to the frontend via MQTT at 1 Hz.
Reads device credentials from .env — same file used by telemetry.py.

Usage (from AgroDrone-Edge-Node/src/):
    python3 send_telemetry.py

Press Ctrl-C to stop.
"""

import json
import time
from dotenv import load_dotenv
import os
import paho.mqtt.client as mqtt

load_dotenv()

MQTT_HOST      = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT      = int(os.getenv("MQTT_PORT", 1883))
MQTT_TRANSPORT = os.getenv("MQTT_TRANSPORT", "websockets")
MQTT_WS_PATH   = os.getenv("MQTT_WS_PATH", "/mqtt")
MQTT_TLS       = os.getenv("MQTT_TLS", "true").lower() == "true"
DEVICE_ID      = os.getenv("DEVICE_ID")
DEVICE_TOKEN   = os.getenv("DEVICE_TOKEN")
USER_ID        = os.getenv("USER_ID")

# ── Hardcoded telemetry values ────────────────────────────────────────────────

LAT               = 42.8783
LON               = -70.9280
ALT_MSL           = 35.0   # metres above sea level
ALT_REL           = 30.0   # metres above takeoff point
HEADING           = 270.0  # degrees (0=N, 90=E, 180=S, 270=W)
BATTERY_REMAINING = 85     # percent
VOLTAGE_BATTERY   = 24.0   # volts
CURRENT_BATTERY   = 1.2    # amps

BASE_STATION_LAT  = 42.8780
BASE_STATION_LON  = -70.9275

# ── MQTT setup ────────────────────────────────────────────────────────────────

def main():
    if not all([DEVICE_ID, DEVICE_TOKEN, USER_ID]):
        print("ERROR: DEVICE_ID, DEVICE_TOKEN, and USER_ID must be set in .env")
        return

    topic = f"{USER_ID}/telemetry"

    client = mqtt.Client(
        mqtt.CallbackAPIVersion.VERSION1,
        client_id=DEVICE_ID,
        transport=MQTT_TRANSPORT,
    )
    if MQTT_TRANSPORT == "websockets":
        client.ws_set_options(path=MQTT_WS_PATH)
    if MQTT_TLS:
        client.tls_set()
    client.username_pw_set(username=f"device-{DEVICE_ID}", password=DEVICE_TOKEN)

    client.connect(MQTT_HOST, MQTT_PORT)
    client.loop_start()

    print(f"Publishing to {topic} at 1 Hz — Ctrl-C to stop")
    print(f"  lat={LAT}  lon={LON}  alt_msl={ALT_MSL}  heading={HEADING}")

    try:
        while True:
            payload = {
                "lat":               LAT,
                "lon":               LON,
                "alt_msl":           ALT_MSL,
                "alt_rel":           ALT_REL,
                "heading":           HEADING,
                "battery_remaining": BATTERY_REMAINING,
                "voltage_battery":   VOLTAGE_BATTERY,
                "current_battery":   CURRENT_BATTERY,
                "base_station_position": [BASE_STATION_LAT, BASE_STATION_LON],
                "timestamp":         time.time(),
            }
            client.publish(topic, json.dumps(payload))
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()
