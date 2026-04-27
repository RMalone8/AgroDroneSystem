import json
from dotenv import load_dotenv
import os
import paho.mqtt.client as mqtt
import waypoints

load_dotenv()

MQTT_HOST      = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT      = int(os.getenv("MQTT_PORT", 443))
MQTT_TRANSPORT = os.getenv("MQTT_TRANSPORT", "websockets")
MQTT_WS_PATH   = os.getenv("MQTT_WS_PATH", "/mqtt")
MQTT_TLS       = os.getenv("MQTT_TLS", "true").lower() == "true"
DEVICE_ID      = os.getenv("DEVICE_ID")
DEVICE_TOKEN   = os.getenv("DEVICE_TOKEN")
USER_ID        = os.getenv("USER_ID")
WAYPOINT_PATH  = os.getenv("WAYPOINT_PATH")

def on_connect(client, _userdata, _flags, rc):
    if rc == 0:
        topic = f"{USER_ID}/flightplan"
        print(f"Connected to MQTT broker, subscribing to '{topic}'...")
        client.subscribe(topic)
    else:
        print(f"Failed to connect to MQTT broker, return code: {rc}")

def on_disconnect(_client, _userdata, rc):
    if rc != 0:
        print(f"Unexpected disconnect from MQTT broker, rc={rc}")

def on_message(_client, _userdata, msg):
    try:
        data = json.loads(msg.payload.decode())
        print("Received flight plan, checking if it's new...")

        if os.path.exists(WAYPOINT_PATH):
            with open(WAYPOINT_PATH, "r") as f:
                past_waypoints = json.load(f)
            if past_waypoints["fpid"] == data["fpid"]:
                print("Flight plan already processed, skipping.")
                return

        print("Processing new flight plan of fpid:", data["fpid"])
        result = waypoints.create_waypoints(data)
        with open(WAYPOINT_PATH, "w") as f:
            json.dump({
                "fpid": data["fpid"],
                "createdAt": data["createdAt"],
                "altitude": result["altitude"],
                "totalWaypoints": result["totalWaypoints"],
                "waypoints": result["waypoints"]
            }, f, indent=4)

    except Exception as e:
        print("Error processing flight plan message:", e)

def main():
    if not DEVICE_ID or not DEVICE_TOKEN or not USER_ID:
        print("Error: DEVICE_ID, DEVICE_TOKEN, and USER_ID must be set in .env")
        return

    client = mqtt.Client(client_id=f"{DEVICE_ID}-flightplan", transport=MQTT_TRANSPORT)
    if MQTT_TRANSPORT == "websockets":
        client.ws_set_options(path=MQTT_WS_PATH)
    if MQTT_TLS:
        client.tls_set()
    client.username_pw_set(username=f"device-{DEVICE_ID}", password=DEVICE_TOKEN)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    client.connect(MQTT_HOST, MQTT_PORT)
    print(f"Listening for flight plans on {MQTT_HOST}:{MQTT_PORT} (transport={MQTT_TRANSPORT}, tls={MQTT_TLS})...")
    client.loop_forever()

if __name__ == "__main__":
    main()
