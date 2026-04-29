"""
Demo edge node — simulates a drone flying from Boston Common.

Reads credentials from /shared/demo_credentials.json (written by setup_demo.py),
connects to the MQTT broker, and streams idle telemetry at 1 Hz.

When a flight plan arrives on {userId}/flightplan:
  1. Generates waypoints via waypoints.create_waypoints()
  2. Simulates takeoff → fly each waypoint → return to base → land
  3. Returns to idle, ready for the next flight plan
"""

import json
import math
import os
import queue
import sys
import threading
import time
import uuid

import requests

# Make `import waypoints` resolve to src/waypoints.py regardless of cwd
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import waypoints

import paho.mqtt.client as mqtt

SHARED_PATH         = "/shared/demo_credentials.json"
MQTT_HOST           = os.getenv("MQTT_HOST", "mqtt")
MQTT_PORT           = int(os.getenv("MQTT_PORT", 1883))
BACKEND_URL         = os.getenv("BACKEND_URL", "http://localhost:8787")
DATA_PATH           = os.getenv("DATA_PATH", "")
DEMO_SESSION_ID     = os.getenv("DEMO_SESSION_ID", "")
DEMO_ORCHESTRATOR_URL = os.getenv("DEMO_ORCHESTRATOR_URL", "")

BASE_LAT = 42.3551
BASE_LON = -71.0656

CRUISE_ALT    = 30.0   # metres
SPEED_MPS     = 10.0   # metres per second
DEG_PER_M_LAT = 1.0 / 111111.0


def deg_per_m_lon(lat):
    return 1.0 / (111111.0 * math.cos(math.radians(lat)))


def make_telemetry():
    return {
        "voltage_battery":    24.0,
        "current_battery":    0.8,
        "battery_remaining":  100,
        "satellites_visible": 20,
        "gps_hdop":           0.35,
        "lat":                BASE_LAT,
        "lon":                BASE_LON,
        "alt_msl":            5.0,
        "alt_rel":            0.0,
        "heading":            0.0,
        "vx":                 0.0,
        "vy":                 0.0,
        "vz":                 0.0,
        "timestamp":          time.time(),
        "base_station_position": [BASE_LAT, BASE_LON],
    }


def publish(client, topic, tel):
    tel["timestamp"] = time.time()
    tel["alt_msl"]   = tel["alt_rel"] + 5.0
    client.publish(topic, json.dumps(tel))


def navigate_to(client, topic, tel, target_lat, target_lon, emergency=None):
    """Move the simulated drone toward (target_lat, target_lon) at SPEED_MPS.

    Checks emergency every step and returns early if set.
    Pass emergency=None to navigate without interruption (e.g. RTB leg itself).
    """
    dlat = target_lat - tel["lat"]
    dlon = target_lon - tel["lon"]

    north_m = dlat / DEG_PER_M_LAT
    east_m  = dlon / deg_per_m_lon(tel["lat"])
    dist_m  = math.sqrt(north_m ** 2 + east_m ** 2)

    if dist_m < 0.5:
        return

    heading_rad = math.atan2(east_m, north_m)
    heading_deg = math.degrees(heading_rad) % 360
    steps       = max(1, int(dist_m / SPEED_MPS))
    lat_step    = dlat / steps
    lon_step    = dlon / steps

    tel["heading"] = heading_deg
    tel["vx"]      = SPEED_MPS * math.cos(heading_rad)
    tel["vy"]      = SPEED_MPS * math.sin(heading_rad)

    for _ in range(steps):
        if emergency and emergency.is_set():
            return
        tel["lat"] += lat_step
        tel["lon"] += lon_step
        publish(client, topic, tel)
        time.sleep(1.0)

    # Snap to exact target to avoid floating-point drift
    tel["lat"] = target_lat
    tel["lon"] = target_lon


def simulate_flight(client, topic, tel, wp_list, emergency) -> bool:
    """Simulate a full drone flight. Returns True if all waypoints were visited."""
    print(f"Starting flight — {len(wp_list)} waypoints")
    all_visited = True

    # Phase 1: Takeoff
    for step in range(1, 6):
        if emergency.is_set():
            all_visited = False
            break
        tel["alt_rel"] = (step / 5.0) * CRUISE_ALT
        tel["vz"]      = -(CRUISE_ALT / 5.0)   # negative = climbing (MAVLink convention)
        tel["vx"]      = 0.0
        tel["vy"]      = 0.0
        publish(client, topic, tel)
        time.sleep(1.0)
    tel["vz"] = 0.0

    # Phase 2: Fly each waypoint (skipped entirely on emergency)
    if not emergency.is_set():
        print("Airborne at 30m")
        for wp in wp_list:
            if emergency.is_set():
                all_visited = False
                break
            navigate_to(client, topic, tel, wp["lat"], wp["lng"], emergency)
            if not emergency.is_set():
                tel["vx"] = 0.0
                tel["vy"] = 0.0
                publish(client, topic, tel)
                time.sleep(1.0)
    else:
        all_visited = False

    # Phase 3: Return to base station (always runs; no emergency check mid-leg)
    if emergency.is_set():
        print("Emergency — aborting mission, returning to base")
    else:
        print("Returning to base")
    navigate_to(client, topic, tel, BASE_LAT, BASE_LON)
    tel["vx"] = 0.0
    tel["vy"] = 0.0

    # Phase 4: Land (descend from current altitude to handle mid-takeoff emergencies)
    start_alt = tel["alt_rel"]
    for step in range(1, 6):
        tel["alt_rel"] = start_alt * (1.0 - step / 5.0)
        tel["vz"]      = start_alt / 5.0   # positive = descending
        publish(client, topic, tel)
        time.sleep(1.0)
    tel["alt_rel"] = 0.0
    tel["vz"]      = 0.0
    tel["battery_remaining"] = max(20, tel["battery_remaining"] - 15)
    publish(client, topic, tel)
    emergency.clear()
    print("Landed — returning to idle")
    return all_visited


def _upload_mock_images(fpid, mid, waypoints_list, device_token, device_id):
    """Generate a mock green NDVI image for each waypoint and POST to /sensor-image."""
    from PIL import Image
    import io

    auth_headers = {
        "Authorization": f"Bearer {device_token}",
        "X-Device-Id": device_id,
    }

    for i, wp in enumerate(waypoints_list):
        img = Image.new("RGB", (320, 240), color=(45, 120, 45))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=60)
        buf.seek(0)

        try:
            resp = requests.post(
                f"{BACKEND_URL}/sensor-image",
                headers=auth_headers,
                data={
                    "fpid":      fpid,
                    "mid":       mid,
                    "index":     str(i),
                    "lat":       str(wp["lat"]),
                    "lng":       str(wp["lng"]),
                    "heading":   "0.0",
                    "altitude":  str(CRUISE_ALT),
                    "timestamp": "",
                },
                files={"image": (f"ndvi_{i}.jpg", buf, "image/jpeg")},
                timeout=10,
            )
            print(f"Mock image {i} uploaded: {resp.status_code}")
        except Exception as e:
            print(f"Warning: mock image upload failed for waypoint {i}: {e}")


def main():
    # Prefer env-var credentials (injected per-session by the orchestrator);
    # fall back to the shared credentials file for standalone demo usage.
    env_user_id      = os.getenv("DEMO_USER_ID", "")
    env_device_id    = os.getenv("DEMO_DEVICE_ID", "")
    env_device_token = os.getenv("DEMO_DEVICE_TOKEN", "")

    if env_user_id and env_device_id and env_device_token:
        user_id      = env_user_id
        device_id    = env_device_id
        device_token = env_device_token
    else:
        with open(SHARED_PATH) as f:
            creds = json.load(f)
        user_id      = creds["userId"]
        device_id    = creds["deviceId"]
        device_token = creds["deviceToken"]
    topic        = f"{user_id}/telemetry"
    fp_topic     = f"{user_id}/flightplan"

    flight_queue   = queue.Queue()
    emergency      = threading.Event()
    em_topic       = f"{user_id}/emergency"

    def on_connect(c, _ud, _flags, rc):
        if rc == 0:
            c.subscribe(fp_topic)
            c.subscribe(em_topic)
            print(f"Connected to broker, subscribed to {fp_topic} and {em_topic}")
            # Notify the demo orchestrator that this edge node is ready
            if DEMO_SESSION_ID and DEMO_ORCHESTRATOR_URL:
                try:
                    requests.post(
                        f"{DEMO_ORCHESTRATOR_URL}/demo/ready/{DEMO_SESSION_ID}",
                        timeout=5,
                    )
                    print(f"Notified orchestrator: session {DEMO_SESSION_ID} ready")
                except Exception as e:
                    print(f"Warning: could not notify orchestrator: {e}")
        else:
            print(f"MQTT connection refused rc={rc}")

    def on_message(_c, _ud, msg):
        if msg.topic == em_topic:
            signal = msg.payload.decode().strip()
            print(f"Emergency signal received: {signal}")
            emergency.set()
            return
        try:
            data = json.loads(msg.payload.decode())
            wp_result = waypoints.create_waypoints(data)
            mid = str(uuid.uuid4())
            # Write fpid + mid into local metadata.json so mosaic.py can use them
            if DATA_PATH:
                meta_path = os.path.join(DATA_PATH, "metadata.json")
                if os.path.exists(meta_path):
                    with open(meta_path, "r") as mf:
                        local_meta = json.load(mf)
                    local_meta["fpid"] = data["fpid"]
                    local_meta["mid"]  = mid
                    with open(meta_path, "w") as mf:
                        json.dump(local_meta, mf, indent=4)
            try:
                resp = requests.post(
                    f"{BACKEND_URL}/flightplan/waypoints",
                    json={"fpid": data["fpid"], "waypoints": wp_result["waypoints"]},
                    headers={
                        "Authorization": f"Bearer {device_token}",
                        "X-Device-Id": device_id,
                    },
                    timeout=5,
                )
                print(f"Waypoints POSTed: {resp.status_code}")
            except Exception as e:
                print(f"Warning: waypoints POST failed: {e}")
            flight_queue.put({"fpid": data["fpid"], "mid": mid, "waypoints": wp_result["waypoints"]})
            print(f"Flight plan queued: {wp_result['totalWaypoints']} waypoints")
        except Exception as e:
            print(f"Error processing flight plan: {e}")

    client = mqtt.Client(client_id=device_id)
    client.username_pw_set(username=f"device-{device_id}", password=device_token)
    client.on_connect = on_connect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=1, max_delay=30)
    client.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
    client.loop_start()

    tel = make_telemetry()
    print(f"Demo node started — streaming idle telemetry for user {user_id}")

    while True:
        emergency.clear()   # discard any signal received while idle
        try:
            job = flight_queue.get_nowait()
            completed = simulate_flight(client, topic, tel, job["waypoints"], emergency)
            if completed:
                _upload_mock_images(job["fpid"], job["mid"], job["waypoints"], device_token, device_id)
        except queue.Empty:
            try:
                publish(client, topic, tel)
            except Exception as e:
                print(f"Publish failed: {e}")
            time.sleep(1.0)


if __name__ == "__main__":
    main()
