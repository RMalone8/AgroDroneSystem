# AgroDrone

The AgroDrone System is a semi-autonomous monitoring platform designed for small farmers. Access is managed via admin-distributed tokens, ensuring secure entry for authorized users. At the core of the infrastructure, admins register edge nodes for each client which act as the central nervous system, routing telemetry, flight plans, emergency signals, and sensor data between the web dashboard and deployed drones.

## Edge node environment variables

When an admin registers an edge node, three values are produced:

| Variable | What it is |
|---|---|
| `DEVICE_ID` | A UUID assigned to this specific physical device. Used as the MQTT `client_id` and for HTTP requests via the `X-Device-Id` header. |
| `DEVICE_TOKEN` | A 64-character random secret. Used as the MQTT password (`device-{DEVICE_ID}`) and as the HTTP `Authorization: Bearer` token. **Shown only once — store it securely.** |
| `USER_ID` | The UUID of the client account that owns this device. Determines which `{userId}/*` MQTT topics the device publishes to and subscribes from. |

These go in `AgroDrone-Edge-Node/.env` on the edge node itself:

```env
DEVICE_ID=<paste from admin panel>
DEVICE_TOKEN=<paste from admin panel>
USER_ID=<paste from admin panel>
```

---

## First-time setup: creating an admin account

An admin account requires an **admin access token**. In development these are listed in `.dev.vars` under `VALID_ADMIN_ACCESS_TOKENS`.

1. Open http://localhost
2. Click **Register**
3. Enter an email, password, and one of the admin access tokens (e.g. `AGRO-ADMIN-TOKEN-1`)
4. You will land on the **Admin Panel**

Admin accounts can also be created for production by setting `VALID_ADMIN_ACCESS_TOKENS` in the deployed Worker's secrets.

---

## Onboarding a new client

This is the full end-to-end flow for getting a client's drone connected to their dashboard.

### Step 1 — Issue a client access token

1. Log in as an admin → Admin Panel
2. Under **Issue Client Access Token**, click **Generate Access Token**
3. A single-use token appears (e.g. `AGRO-A1B2C3D4`) — share it with the client over email or another secure channel

### Step 2 — Client creates their account

1. Client opens http://localhost and clicks **Register**
2. They enter their email, a password, and the access token you gave them
3. After registering they land on their dashboard

### Step 3 — Register the edge node

1. Back in the Admin Panel, refresh the page — the client's email now appears in the **Register Edge Node** dropdown
2. Select the client and click **Register Device**
3. The panel shows the three values to copy — **these will never be shown again**:
   ```
   DEVICE_ID=<uuid>
   DEVICE_TOKEN=<64-char hex>
   USER_ID=<client's userId>
   ```
4. The device also appears immediately in the **Registered Devices** table (Device ID, owner email, and registration date)

> **Note:** The `DEVICE_TOKEN` is hashed before storage. If it is lost, register a new device — there is no way to recover the token.

### Step 4 — Configure the edge node

On the Edge Node (Raspberry Pi 4), create `AgroDrone-Edge-Node/.env`:

```env
BACKEND_URL=http://<your-host>
MQTT_HOST=<your-host>
MQTT_PORT=1883

DEVICE_ID=<paste from Step 3>
DEVICE_TOKEN=<paste from Step 3>
USER_ID=<paste from Step 3>

WAYPOINT_PATH=<absolute path to waypoints.json on this device>
```

> **Note:** `BACKEND_URL` and `MQTT_HOST` should both point at the nginx host (no port suffix needed — nginx routes HTTP on port 80 and TCP MQTT on port 1883).

Also create `AgroDrone-Edge-Node/.onboard.env` for the script that rsyncs waypoints to the onboard Pi:

```env
DRONE_PI_IP=<static IP of the onboard Raspberry Pi>
DRONE_PI_USER=<SSH username on the onboard Pi>
LOCAL_FILE=<same as WAYPOINT_PATH — local path to waypoints.json>
REMOTE_DEST=<destination path on the onboard Pi where waypoints will be written>
```

### Step 5 — Verify

- The client logs in → their dashboard shows live telemetry from their drone
- No other client can see that telemetry (ACL-enforced at the broker)
- The admin can see the registered device in the **Registered Devices** table

---

## Viewing registered devices (admin)

The **Registered Devices** section of the Admin Panel lists every device that has been registered, showing:

- **Device ID** — the UUID to use for `DEVICE_ID` in the edge node `.env`
- **Owner** — the client's email and `userId`
- **Registered** — the registration date

Device tokens are never shown here. If a token needs to be rotated, register a new device for the same client and update the edge node's `.env`.

---

## Local development setup

This section is for developers standing the stack up from scratch.

### Step 1 — Install prerequisites

- [Docker](https://www.docker.com/get-started/) with Compose support

Only needed if running the backend or edge node **outside** Docker:
- [Node.js 20+](https://nodejs.org/) and [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) — backend only
- [Python 3.11+](https://www.python.org/) — edge node only

---

### Step 2 — Run the setup script

Several config files are gitignored and must be created from their committed examples before the stack will start. Run this once after cloning:

```bash
sh setup.sh
```

This creates the following files (skipping any that already exist):

| Created file | Source |
|---|---|
| `AgroDroneBackend/.dev.vars` | `AgroDroneBackend/.dev.vars.example` |
| `AgroDroneFrontend/.env` | `AgroDroneFrontend/.env.example` |

The defaults in the example files work out of the box for local development. Key things to know if you need to customise:

- **`AgroDroneBackend/.dev.vars`** — backend secrets (JWT key, MQTT admin password, registration tokens). `MQTT_ADMIN_PASSWORD` must match the `agrodrone-backend` entry in `MQTT/dynsec/dynamic-security.json`.
- **`AgroDroneFrontend/.env`** — `VITE_BACKEND_URL` points the frontend at nginx (defaults to `http://localhost`). Change this to your nginx host when building for production.
- **`AgroDroneBackend/wrangler.jsonc`** — KV and R2 bindings. Placeholder IDs are fine locally; replace with real Cloudflare IDs for production deployment.

---

### Step 3 — Start the stack

```bash
docker compose up --build
```

| Service | URL / address |
|---|---|
| Frontend (load balanced) | http://localhost |
| Backend API | http://localhost/auth, /admin, /flightplan, /basestation, /sensor, /sensor-image |
| MQTT broker (TCP) | localhost:1883 |
| MQTT broker (WebSocket) | ws://localhost/mqtt |

Account and flight data persists in the `wrangler_state` Docker volume between restarts. To wipe all state:

```bash
docker compose down -v
```

---

### Step 4 — Create an admin account

See [First-time setup: creating an admin account](#first-time-setup-creating-an-admin-account) above. Use one of the `VALID_ADMIN_ACCESS_TOKENS` from `.dev.vars` when registering.

---

### Demo mode

To run with a simulated drone instead of real hardware:

```bash
docker compose -f compose.demo.yaml up --build
```

This provisions demo accounts automatically and streams simulated telemetry. Demo state is stored separately from the regular stack — resetting it does not affect your real accounts:

```bash
docker compose -f compose.demo.yaml down -v
```

---

### E2E tests

```bash
# Static tests — credentials pre-seeded in MQTT/dynamic-security.test.json
docker compose -f compose.test.yaml up --build --abort-on-container-exit

# Dynamic tests — credentials provisioned at runtime via Mosquitto Dynamic Security
# Note: do NOT use --abort-on-container-exit here; the setup service exits with 0
# intentionally and that flag would tear down the network before the tests finish.
docker compose -f tests/compose.dynamic.yaml up --build -d
docker compose -f tests/compose.dynamic.yaml wait test-runner
docker compose -f tests/compose.dynamic.yaml down -v
```