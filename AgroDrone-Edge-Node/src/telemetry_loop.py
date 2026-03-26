"""
Continuous MQTT telemetry publisher for E2E tests.

Reads credentials from /shared/credentials.json, connects to the broker,
and publishes telemetry once per second until stopped.

Required env vars:
  MQTT_HOST    - broker hostname (default: localhost)
  MQTT_PORT    - broker port (default: 1883)
  NODE_INDEX   - 0-based index into the credentials array (default: 0)
"""

import json
import os
import time
import paho.mqtt.client as mqtt

MQTT_HOST   = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
NODE_INDEX  = int(os.getenv("NODE_INDEX", "0"))
SHARED_PATH = "/shared/credentials.json"

TELEMETRY = {
    "battery_remaining": "85",
    "alt_msl": "10.5",
    "lat": "42.35",
    "lon": "-71.11",
}


def wait_for_credentials(path, retries=30):
    for i in range(retries):
        if os.path.exists(path):
            return True
        print(f"[{i+1}/{retries}] Waiting for {path}...")
        time.sleep(1)
    return False


def main():
    if not wait_for_credentials(SHARED_PATH):
        print(f"ERROR: {SHARED_PATH} not found after 30 s — setup service may have failed")
        raise SystemExit(1)

    with open(SHARED_PATH) as f:
        creds = json.load(f)

    node      = creds[NODE_INDEX]
    user_id   = node["userId"]
    device_id = node["deviceId"]
    dev_token = node["deviceToken"]
    topic     = f"{user_id}/telemetry"

    client = mqtt.Client(client_id=device_id)
    client.username_pw_set(username=f"device-{device_id}", password=dev_token)

    for attempt in range(20):
        try:
            client.connect(MQTT_HOST, MQTT_PORT, keepalive=10)
            break
        except Exception as exc:
            print(f"Connect attempt {attempt + 1} failed: {exc}")
            time.sleep(1)
    else:
        print("ERROR: Could not connect to MQTT broker")
        raise SystemExit(1)

    client.loop_start()
    print(f"Publishing telemetry for userId={user_id} on topic={topic}")

    try:
        while True:
            result = client.publish(topic, json.dumps(TELEMETRY))
            print(f"  → published rc={result.rc}")
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
