# AgroDrone System

A multi-tenant agricultural drone management platform. An AgroDrone admin registers edge nodes for clients, each client's drone streams telemetry only to their own dashboard, and flight plans are routed back to the correct drone.

---

## Architecture

```
┌─────────────┐       HTTPS        ┌──────────────────────┐
│   Frontend  │ ◄────────────────► │   AgroDroneBackend   │
│  (React)    │                    │  (Cloudflare Worker) │
└──────┬──────┘                    └──────────┬───────────┘
       │ MQTT / WebSocket                      │ MQTT / TCP          ▲ HTTPS
       │  user: userId                         │  user: agrodrone-   │  POST /mosaic
       │  pass: mqttToken                      │        backend      │  Authorization: Bearer DEVICE_TOKEN
       ▼                                       ▼  pass: MQTT_ADMIN   │  X-Device-Id: DEVICE_ID
┌────────────────────────────────────────────────────────┐           │
│               Mosquitto MQTT Broker                     │           │
│          Dynamic Security Plugin (ACL enforced)         │           │
│                                                         │           │
│  {userId}/telemetry   — device pub,   frontend sub      │           │
│  {userId}/flightplan  — backend pub,  device sub        │           │
│  {userId}/emergency   — frontend pub, device sub        │           │
└─────────────────────────────┬──────────────────────────┘           │
                              │ MQTT / TCP                            │
                              │  user: device-{deviceId}             │
                              │  pass: DEVICE_TOKEN                  │
                     ┌────────┴──────────┐                           │
                     │    Edge Node      │ ──────────────────────────┘
                     │  (Raspberry Pi)   │
                     └───────────────────┘
```

### Key isolation guarantee

Every MQTT client is restricted to **only** the topics that belong to their `userId`. A device registered for User A cannot publish to User B's topics, and User B's frontend cannot subscribe to User A's telemetry. This is enforced at the broker level by Mosquitto Dynamic Security ACLs.

---

## Edge node environment variables

When an admin registers an edge node, three values are produced:

| Variable | What it is |
|---|---|
| `DEVICE_ID` | A UUID assigned to this specific physical device. Used as the MQTT `client_id` and for HTTP requests via the `X-Device-Id` header. |
| `DEVICE_TOKEN` | A 64-character random secret. Used as the MQTT password (`device-{DEVICE_ID}`) and as the HTTP `Authorization: Bearer` token. **Shown only once — store it securely.** |
| `USER_ID` | The UUID of the client account that owns this device. Determines which `{userId}/*` MQTT topics the device publishes to and subscribes from. |

These go in `AgroDrone-Edge-Node/.env`:

```env
DEVICE_ID=<paste from admin panel>
DEVICE_TOKEN=<paste from admin panel>
USER_ID=<paste from admin panel>
```

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (for the full stack via Compose)
- [Node.js 20+](https://nodejs.org/) and [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (for backend dev without Docker)
- [Python 3.11+](https://www.python.org/) and `pip` (for edge node without Docker)

---

## Running the full stack locally

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8787 |
| MQTT broker (TCP) | localhost:1883 |
| MQTT broker (WebSocket) | localhost:9001 |

### Backend environment (`.dev.vars`)

The backend reads secrets from `AgroDroneBackend/.dev.vars`. A development copy is already committed with safe placeholder values. For production, rotate every value:

```env
# MQTT broker credentials (must match MQTT/dynamic-security.json)
MQTT_ADMIN_USERNAME=agrodrone-backend
MQTT_ADMIN_PASSWORD=<strong random secret>

# JWT signing key — generate with: openssl rand -hex 32
JWT_SECRET=<strong random secret>

# Multi-use tokens for client account creation (dev only)
VALID_ACCESS_TOKENS=AGRO-ALPHA-TOKEN-1,AGRO-ALPHA-TOKEN-2

# Multi-use tokens for admin account creation — keep these private
VALID_ADMIN_ACCESS_TOKENS=AGRO-ADMIN-TOKEN-1,AGRO-ADMIN-TOKEN-2
```

---

## First-time setup: creating an admin account

An admin account requires an **admin access token**. In development these are listed in `.dev.vars` under `VALID_ADMIN_ACCESS_TOKENS`.

1. Open http://localhost:5173
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

1. Client opens http://localhost:5173 and clicks **Register**
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

On the Raspberry Pi (or wherever the edge node runs), edit `AgroDrone-Edge-Node/.env`:

```env
BACKEND_URL=http://<your-backend-host>:8787
MQTT_HOST=<your-broker-host>
MQTT_PORT=1883

DEVICE_ID=<paste from Step 3>
DEVICE_TOKEN=<paste from Step 3>
USER_ID=<paste from Step 3>
```

Then start the edge node:

```bash
cd AgroDrone-Edge-Node
pip install -r requirements.txt
python src/flight_plan.py   # listens for flight plans and drives waypoints
# In a separate terminal:
python src/telemetry.py     # publishes one telemetry reading
```

Or via Docker (recommended for production):

```bash
docker build -t agrodrone-edge ./AgroDrone-Edge-Node
docker run --env-file AgroDrone-Edge-Node/.env agrodrone-edge
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

## Running E2E tests

### Static tests (pre-seeded credentials)

Tests two isolated tenants with credentials baked into `MQTT/dynamic-security.test.json`:

```bash
docker compose -f compose.test.yaml up --build --abort-on-container-exit
```

### Dynamic tests (credentials provisioned at runtime)

Starts a clean broker, has a setup container provision credentials via the Mosquitto Dynamic Security API, then verifies routing:

```bash
docker compose -f compose.dynamic.yaml up --build --abort-on-container-exit
```

The startup order is:

```
mqtt (healthy)
  └─► setup (provisioning → exits 0)
        └─► edge-node-a  (publishes telemetry for user dyn-user-a)
        └─► edge-node-b  (publishes telemetry for user dyn-user-b)
        └─► test-runner  (pytest verifies ACL isolation)
```

---

## Project structure

```
AgroDroneSystem/
├── AgroDroneBackend/        Cloudflare Worker (auth, flight plans, device tokens)
│   ├── src/
│   │   ├── index.js         HTTP routes + raw MQTT publisher
│   │   ├── auth.js          JWT, password hashing, device tokens, access tokens
│   │   └── storage.js       R2 operations (flight plans, mosaics, base station pos)
│   ├── wrangler.jsonc        KV + R2 bindings
│   └── .dev.vars            Local secrets (never commit real values)
├── AgroDroneFrontend/       React + Vite dashboard
│   └── src/
│       ├── contexts/AuthContext.tsx   JWT + mqttToken state
│       ├── hooks/useDroneData.ts      MQTT subscriber (telemetry)
│       ├── pages/AdminPanel.tsx       Admin-only device + token management
│       └── components/map/            MapLibre GL map + flight plan UI
├── AgroDrone-Edge-Node/     Python edge node (Raspberry Pi)
│   ├── src/
│   │   ├── telemetry.py       Publish one telemetry reading over MQTT
│   │   ├── telemetry_loop.py  Continuous publisher (used in E2E tests)
│   │   ├── flight_plan.py     Subscribe to flight plans over MQTT, drive waypoints
│   │   └── mosaic.py          POST /mosaic to backend (HTTPS, device token auth)
│   └── .env                 DEVICE_ID / DEVICE_TOKEN / USER_ID go here
├── MQTT/
│   ├── mosquitto.conf                 Production broker config (dynsec, no anon)
│   ├── dynamic-security.json          Bootstrap: admin client only
│   ├── mosquitto.test.conf            Test broker config
│   ├── dynamic-security.test.json     Pre-seeded test credentials
│   ├── mosquitto.bootstrap.conf       Dynamic-test broker config
│   └── dynamic-security.bootstrap.json  Bootstrap for dynamic tests
├── tests/e2e/
│   ├── conftest.py              Fixtures for static tests
│   ├── test_multi_tenant.py     Static ACL + routing tests
│   ├── setup_dynamic.py         Runtime credential provisioner
│   └── test_dynamic_routing.py  Dynamic routing tests
├── compose.yaml             Development stack
├── compose.test.yaml        Static E2E test stack
└── compose.dynamic.yaml     Dynamic E2E test stack
```
