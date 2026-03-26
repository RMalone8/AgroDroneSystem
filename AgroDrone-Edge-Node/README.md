### Project folder must include a .env and .onboard.env

.env includes the following values:
* DRONE_TOKEN (uuid for authorization to communicate with the backend)
* BACKEND_URL
* WAYPOINT_PATH (path to your waypoints.json file)
* DATA_PATH (path to your image data received from onboard Pi)
* TELEMETRY_PATH (path to your telemetry.json file)

.onboard.env includes the following values:
* DRONE_PI_IP (IP of onboard Pi, static for testing)
* DRONE_PI_USER (onboard Pi user)
* LOCAL_FILE (same as WAYPOINT_PATH)
* REMOTE_DEST (where the onboard Pi will read the waypoints)
