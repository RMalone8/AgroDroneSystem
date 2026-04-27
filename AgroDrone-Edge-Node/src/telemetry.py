import json
import time
import threading
import os
from dotenv import load_dotenv
from pymavlink import mavutil
import paho.mqtt.client as mqtt
import gpsd

load_dotenv()

DEVICE_NAME    = os.getenv("RADIO_DEVICE", "/dev/ttyUSB0")
BAUD_RATE      = int(os.getenv("RADIO_BAUD", 57600))
MQTT_HOST      = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT      = int(os.getenv("MQTT_PORT", 443))
MQTT_TRANSPORT = os.getenv("MQTT_TRANSPORT", "websockets")
MQTT_WS_PATH   = os.getenv("MQTT_WS_PATH", "/mqtt")
MQTT_TLS       = os.getenv("MQTT_TLS", "true").lower() == "true"
DEVICE_ID      = os.getenv("DEVICE_ID")
DEVICE_TOKEN   = os.getenv("DEVICE_TOKEN")
USER_ID        = os.getenv("USER_ID")
TOPIC          = f"{USER_ID}/telemetry"

RC_MESSAGES = {
    1: "incorrect protocol version",
    2: "invalid client identifier",
    3: "server unavailable",
    4: "bad username or password",
    5: "not authorised",
}

GPS_TIMEOUT = int(os.getenv("GPS_TIMEOUT", 15))


def get_gps_position():
    """Return [lat, lng] from gpsd, or None if no fix within GPS_TIMEOUT seconds.

    gpsd stops streaming when no client is connected. After sending WATCH,
    we poll until the daemon has a valid fix rather than reading one packet
    and giving up immediately.
    """
    try:
        gpsd.connect()
        deadline = time.time() + GPS_TIMEOUT
        while time.time() < deadline:
            packet = gpsd.get_current()
            if packet.mode >= 2:
                return [round(packet.lat, 7), round(packet.lon, 7)]
            time.sleep(0.5)
        return None
    except Exception:
        return None

def connect_mqtt():
    """Connect to the broker and return the client. Exits on auth failure."""
    connected = threading.Event()
    connect_rc = [None]

    def on_connect(client, userdata, flags, rc):
        connect_rc[0] = rc
        connected.set()

    def on_disconnect(client, userdata, rc):
        if rc != 0:
            print(f"MQTT disconnected unexpectedly (rc={rc}), will reconnect...")

    client = mqtt.Client(client_id=f"{DEVICE_ID}-telemetry", transport=MQTT_TRANSPORT)
    if MQTT_TRANSPORT == "websockets":
        client.ws_set_options(path=MQTT_WS_PATH)
    if MQTT_TLS:
        client.tls_set()
    client.username_pw_set(username=f"device-{DEVICE_ID}", password=DEVICE_TOKEN)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    print(f"Connecting to MQTT broker at {MQTT_HOST}:{MQTT_PORT} (transport={MQTT_TRANSPORT}, tls={MQTT_TLS})...")
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_start()

    if not connected.wait(timeout=10):
        client.loop_stop()
        raise RuntimeError("MQTT connection timed out")

    if connect_rc[0] != 0:
        client.loop_stop()
        reason = RC_MESSAGES.get(connect_rc[0], f"code {connect_rc[0]}")
        raise RuntimeError(f"MQTT connection refused — {reason}")

    print("MQTT connected.")
    return client

def main():
    if not DEVICE_ID or not DEVICE_TOKEN or not USER_ID:
        print("Error: DEVICE_ID, DEVICE_TOKEN, and USER_ID must be set in .env")
        return

    mqtt_client = connect_mqtt()

    print(f"Connecting to radio on {DEVICE_NAME} at {BAUD_RATE} baud...")
    try:
        connection = mavutil.mavlink_connection(DEVICE_NAME, baud=BAUD_RATE)
        connection.wait_heartbeat()
        print("Heartbeat detected — streaming telemetry...")
    except Exception as e:
        print(f"Error connecting to radio: {e}")
        mqtt_client.loop_stop()
        return

    data = {
        "voltage_battery":   0.0,
        "current_battery":   0.0,
        "battery_remaining": 0,
        "satellites_visible": 0,
        "gps_hdop":          99.9,
        "lat":               0.0,
        "lon":               0.0,
        "alt_msl":           0.0,
        "alt_rel":           0.0,
        "heading":           0.0,
        "vx":                0.0,
        "vy":                0.0,
        "vz":                0.0,
        "timestamp":         0,
    }

    changed_since_publish = False
    last_publish = time.time()
    last_gps_check = 0.0
    base_station_pos = None

    while True:
        msg = connection.recv_match(blocking=False)

        if msg:
            msg_type = msg.get_type()

            if msg_type == 'SYS_STATUS':
                data["voltage_battery"]   = msg.voltage_battery / 1000.0
                data["current_battery"]   = msg.current_battery / 100.0
                data["battery_remaining"] = msg.battery_remaining

            elif msg_type == 'GPS_RAW_INT':
                data["satellites_visible"] = msg.satellites_visible
                data["gps_hdop"]           = msg.eph / 100.0

            elif msg_type == 'GLOBAL_POSITION_INT':
                data["lat"]     = msg.lat / 1e7
                data["lon"]     = msg.lon / 1e7
                data["alt_msl"] = msg.alt / 1000.0
                data["alt_rel"] = msg.relative_alt / 1000.0
                data["heading"] = msg.hdg / 100.0
                data["vx"]      = msg.vx / 100.0
                data["vy"]      = msg.vy / 100.0
                data["vz"]      = msg.vz / 100.0

            changed_since_publish = True

        # Refresh GPS position every 30 seconds
        now = time.time()
        if now - last_gps_check > 30:
            pos = get_gps_position()
            if pos:
                base_station_pos = pos
            else:
                base_station_pos = [42.34899, -71.10590]
            last_gps_check = now

        # Publish at 5 Hz when data has changed
        if now - last_publish > 0.2 and changed_since_publish:
            data["timestamp"] = now
            payload = dict(data)
            if base_station_pos:
                payload["base_station_position"] = base_station_pos

            mqtt_client.publish(TOPIC, json.dumps(payload))
            last_publish = now
            changed_since_publish = False

            print(
                f"{data['voltage_battery']:.1f}V | "
                f"{data['satellites_visible']} sats | "
                f"{data['alt_rel']:.1f}m alt",
                end='\r'
            )

        time.sleep(0.001)

if __name__ == "__main__":
    main()
