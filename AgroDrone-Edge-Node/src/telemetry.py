import json
from dotenv import load_dotenv
import os
import paho.mqtt.client as mqtt

load_dotenv()

MQTT_HOST   = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT   = int(os.getenv("MQTT_PORT", 1883))
DEVICE_ID   = os.getenv("DEVICE_ID")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN")
USER_ID     = os.getenv("USER_ID")
TOPIC       = f"{USER_ID}/telemetry"
TELEMETRY_PATH = os.getenv("TELEMETRY_PATH")

def main():
    if not DEVICE_ID or not DEVICE_TOKEN or not USER_ID:
        print("Error: DEVICE_ID, DEVICE_TOKEN, and USER_ID must be set in .env")
        return

    # read the telemetry file
    try:
        with open(TELEMETRY_PATH, "r") as f:
            telemetry = json.load(f)
    except Exception as e:
        print(f"Error Opening Telemetry File at {TELEMETRY_PATH}: ", e)
        return

    # publish telemetry to MQTT broker
    try:
        client = mqtt.Client(client_id=DEVICE_ID)
        client.username_pw_set(username=f"device-{DEVICE_ID}", password=DEVICE_TOKEN)
        client.connect(MQTT_HOST, MQTT_PORT)
        result = client.publish(TOPIC, json.dumps(telemetry))
        result.wait_for_publish()
        client.disconnect()
        print(f"Telemetry published to {MQTT_HOST}:{MQTT_PORT} on topic '{TOPIC}'")
    except Exception as e:
        print("Error Publishing Telemetry to MQTT: ", e)

if __name__ == '__main__':
    main()
