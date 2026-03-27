import json
import threading
from dotenv import load_dotenv
import os
import paho.mqtt.client as mqtt
import gpsd

load_dotenv()

MQTT_HOST   = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
DEVICE_ID   = os.getenv("DEVICE_ID")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN")
USER_ID     = os.getenv("USER_ID")
TOPIC       = f"{USER_ID}/telemetry"
TELEMETRY_PATH = os.getenv("TELEMETRY_PATH")

RC_MESSAGES = {
    1: "incorrect protocol version",
    2: "invalid client identifier",
    3: "server unavailable",
    4: "bad username or password",
    5: "not authorised",
}

def get_gps_position():
    """Return [lat, lng] from gpsd, or None if unavailable / no fix."""
    try:
        gpsd.connect()
        packet = gpsd.get_current()
        # mode 2 = 2D fix, mode 3 = 3D fix
        if packet.mode < 2:
            print("Warning: No GPS fix yet — base_station_position not updated")
            return None
        return [round(packet.lat, 7), round(packet.lon, 7)]
    except Exception as e:
        print(f"Warning: Could not read GPS position — {e}")
        return None

def main():
    if not DEVICE_ID or not DEVICE_TOKEN or not USER_ID:
        print("Error: DEVICE_ID, DEVICE_TOKEN, and USER_ID must be set in .env")
        return

    try:
        with open(TELEMETRY_PATH, "r") as f:
            telemetry = json.load(f)
    except Exception as e:
        print(f"Error Opening Telemetry File at {TELEMETRY_PATH}: ", e)
        return

    pos = get_gps_position()
    if pos:
        telemetry["base_station_position"] = pos
        print(f"GPS fix: {pos[0]}, {pos[1]}")

    connected = threading.Event()
    connect_rc = [None]

    def on_connect(client, userdata, flags, rc):
        connect_rc[0] = rc
        connected.set()

    client = mqtt.Client(client_id=DEVICE_ID)
    client.username_pw_set(username=f"device-{DEVICE_ID}", password=DEVICE_TOKEN)
    client.on_connect = on_connect

    try:
        client.connect(MQTT_HOST, MQTT_PORT, keepalive=10)
        client.loop_start()

        if not connected.wait(timeout=10):
            client.loop_stop()
            print("Error: MQTT connection timed out")
            return

        if connect_rc[0] != 0:
            client.loop_stop()
            reason = RC_MESSAGES.get(connect_rc[0], f"code {connect_rc[0]}")
            print(f"Error: MQTT connection refused — {reason}")
            return

        result = client.publish(TOPIC, json.dumps(telemetry))
        result.wait_for_publish()
        client.disconnect()
        client.loop_stop()
        print(f"Telemetry published to {MQTT_HOST}:{MQTT_PORT} on topic '{TOPIC}'")

    except Exception as e:
        print("Error Publishing Telemetry to MQTT: ", e)

if __name__ == '__main__':
    main()
