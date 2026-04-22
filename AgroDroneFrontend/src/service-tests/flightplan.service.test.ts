/**
 * Flight plan HTTP + MQTT service tests.
 *
 * Requires the backend and MQTT broker to be running:
 *   docker compose up mqtt backend -d
 *
 * Reads credentials from .env (gitignored):
 *   VITE_BACKEND_URL       — e.g. http://localhost:8787  (optional, defaults below)
 *   TEST_USER_EMAIL        — email for the test account
 *   TEST_USER_PASSWORD     — password for the test account
 *   TEST_ACCESS_TOKEN      — a client access token issued by an admin via POST /admin/access-token
 *
 * Run with: npm run test:service
 * Run one suite: npm run test:service -- -t "suite name"
 */

import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import mqtt from 'mqtt';

const BACKEND_URL   = process.env.VITE_BACKEND_URL || 'http://localhost:8787';
const BROKER_WS_URL = 'ws://localhost:9001';

const TEST_EMAIL        = process.env.TEST_USER_EMAIL    ?? 'servicetest@agrodrone.test';
const TEST_PASSWORD     = process.env.TEST_USER_PASSWORD ?? 'ServiceTest123!';
const TEST_ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN  ?? 'AGRO-ALPHA-TOKEN-1';

// JWT and MQTT credentials obtained once at file level and shared across all describes
let AUTH_HEADER     = '';
let TEST_USER_ID    = '';
let TEST_MQTT_TOKEN = '';

// ── One-time auth setup ───────────────────────────────────────────────────────
// Try login first; if the account doesn't exist yet, register it.
beforeAll(async () => {
  let res = await fetch(`${BACKEND_URL}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (res.status === 401) {
    // Account doesn't exist — create it with the test access token
    res = await fetch(`${BACKEND_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:       TEST_EMAIL,
        password:    TEST_PASSWORD,
        accessToken: TEST_ACCESS_TOKEN,
      }),
    });
  }

  if (!res.ok) {
    throw new Error(`Auth setup failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json() as { token: string; userId: string; mqttToken: string };
  AUTH_HEADER     = `Bearer ${data.token}`;
  TEST_USER_ID    = data.userId;
  TEST_MQTT_TOKEN = data.mqttToken;
});

// ── Fixed IDs so cleanup is reliable across runs ──────────────────────────────
const SAVE_MISSION_ID     = '00000000-test-save-0000-service-test1';
const MQTT_MISSION_ID     = '00000000-test-mqtt-0000-service-test2';
const DELETE_MISSION_ID   = '00000000-test-del0-0000-service-test3';
const ACTIVATE_MISSION_ID = '00000000-test-actv-0000-service-test4';
const ACTIVATE_MQTT_ID    = '00000000-actv-mqtt-0000-service-test5';

const ALL_MISSION_IDS = [
  SAVE_MISSION_ID,
  MQTT_MISSION_ID,
  DELETE_MISSION_ID,
  ACTIVATE_MISSION_ID,
  ACTIVATE_MQTT_ID,
];

function makePlan(fpid: string) {
  return {
    fpid,
    createdAt: new Date().toISOString(),
    totalVertices: 3,
    vertices: [
      { order: 0, lng: -71.1382523, lat: 42.3894243 },
      { order: 1, lng: -71.1392523, lat: 42.3904243 },
      { order: 2, lng: -71.1372523, lat: 42.3904243 },
      { order: 3, lng: -71.1382523, lat: 42.3894243 }, // closing vertex
    ],
  };
}

async function savePlan(fpid: string) {
  return fetch(`${BACKEND_URL}/flightplan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH_HEADER },
    body:    JSON.stringify(makePlan(fpid)),
  });
}

async function deletePlan(fpid: string) {
  return fetch(`${BACKEND_URL}/flightplan/${fpid}`, {
    method:  'DELETE',
    headers: { Authorization: AUTH_HEADER },
  });
}

// Clean up all known test IDs after the full suite, regardless of which tests ran
afterAll(async () => {
  await Promise.all(ALL_MISSION_IDS.map(deletePlan));
});

// ── Save mission ──────────────────────────────────────────────────────────────

describe('Save mission — POST /flightplan', () => {
  afterAll(() => deletePlan(SAVE_MISSION_ID));

  it('returns 200 and confirms the flight plan was saved', async () => {
    const response = await savePlan(SAVE_MISSION_ID);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('Flight Plan Saved');
  });

  it('returns 401 without a valid token', async () => {
    const response = await fetch(`${BACKEND_URL}/flightplan`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(makePlan(SAVE_MISSION_ID)),
    });
    expect(response.status).toBe(401);
  });
});

// ── Get all flight plans ──────────────────────────────────────────────────────

describe('Get all flight plans — GET /flightplan/all', () => {
  beforeAll(() => savePlan(SAVE_MISSION_ID));
  afterAll(()  => deletePlan(SAVE_MISSION_ID));

  it('returns an object with a flightplans array and metadata', async () => {
    const response = await fetch(`${BACKEND_URL}/flightplan/all`, {
      headers: { Authorization: AUTH_HEADER },
    });
    expect(response.status).toBe(200);
    const data = await response.json() as { flightplans: unknown[]; metadata: Record<string, unknown> };
    expect(Array.isArray(data.flightplans)).toBe(true);
    expect(typeof data.metadata).toBe('object');
  });

  it('includes the flight plan saved in beforeAll', async () => {
    const response = await fetch(`${BACKEND_URL}/flightplan/all`, {
      headers: { Authorization: AUTH_HEADER },
    });
    const data = await response.json() as { flightplans: { fpid: string }[] };
    const found = data.flightplans.find((fp) => fp.fpid === SAVE_MISSION_ID);
    expect(found).toBeDefined();
    expect(found?.fpid).toBe(SAVE_MISSION_ID);
  });

  it('returns 401 without a valid token', async () => {
    const response = await fetch(`${BACKEND_URL}/flightplan/all`);
    expect(response.status).toBe(401);
  });
});

// ── MQTT delivery ─────────────────────────────────────────────────────────────

describe('Flight plan MQTT delivery — backend publishes after POST', () => {
  afterAll(() => deletePlan(MQTT_MISSION_ID));

  it('delivers the saved flight plan to the flightplan MQTT topic', () =>
    new Promise<void>((resolve, reject) => {
      const topic = `${TEST_USER_ID}/flightplan`;

      // User subscribes — backend publishes to ${userId}/flightplan after a POST
      const subscriber = mqtt.connect(BROKER_WS_URL, {
        username: TEST_USER_ID,
        password: TEST_MQTT_TOKEN,
      });

      subscriber.on('connect', () => {
        subscriber.subscribe(topic, (err) => {
          if (err) return reject(err);
          savePlan(MQTT_MISSION_ID).catch(reject);
        });
      });

      subscriber.on('message', (_topic, payload) => {
        try {
          const received = JSON.parse(payload.toString()) as { fpid: string };
          if (received.fpid !== MQTT_MISSION_ID) return;
          expect(received.fpid).toBe(MQTT_MISSION_ID);
          subscriber.end();
          resolve();
        } catch (e) {
          subscriber.end();
          reject(e);
        }
      });

      subscriber.on('error', reject);
    }));
});

// ── Delete flight plan ────────────────────────────────────────────────────────

describe('Delete flight plan — DELETE /flightplan/:id', () => {
  beforeAll(() => savePlan(DELETE_MISSION_ID));
  // No afterAll — the test itself deletes the plan; file-level afterAll covers failure cases

  it('deletes a flight plan and confirms it is gone', async () => {
    // Confirm it exists
    const beforeRes = await fetch(`${BACKEND_URL}/flightplan/all`, { headers: { Authorization: AUTH_HEADER } });
    const before = await beforeRes.json() as { flightplans: { fpid: string }[] };
    expect(before.flightplans.find(fp => fp.fpid === DELETE_MISSION_ID)).toBeDefined();

    // Delete
    const deleteRes = await deletePlan(DELETE_MISSION_ID);
    expect(deleteRes.status).toBe(200);

    // Confirm it is gone
    const afterRes = await fetch(`${BACKEND_URL}/flightplan/all`, { headers: { Authorization: AUTH_HEADER } });
    const after = await afterRes.json() as { flightplans: { fpid: string }[] };
    expect(after.flightplans.find(fp => fp.fpid === DELETE_MISSION_ID)).toBeUndefined();
  });

  it('returns 401 without a valid token', async () => {
    const response = await fetch(`${BACKEND_URL}/flightplan/${DELETE_MISSION_ID}`, {
      method: 'DELETE',
    });
    expect(response.status).toBe(401);
  });
});

// ── Activate flight plan ──────────────────────────────────────────────────────

describe('Activate flight plan — PUT /flightplan/:id/activate', () => {
  beforeAll(() => Promise.all([
    savePlan(ACTIVATE_MISSION_ID),
    savePlan(ACTIVATE_MQTT_ID),
  ]));
  afterAll(() => Promise.all([
    deletePlan(ACTIVATE_MISSION_ID),
    deletePlan(ACTIVATE_MQTT_ID),
  ]));

  it('activates a flight plan and confirms it becomes the active plan', async () => {
    const activateRes = await fetch(`${BACKEND_URL}/flightplan/${ACTIVATE_MISSION_ID}/activate`, {
      method:  'PUT',
      headers: { Authorization: AUTH_HEADER },
    });
    expect(activateRes.status).toBe(200);

    const allRes = await fetch(`${BACKEND_URL}/flightplan/all`, { headers: { Authorization: AUTH_HEADER } });
    const data = await allRes.json() as { flightplans: { fpid: string }[]; metadata: { currentFlightPlan: string } };
    expect(data.metadata.currentFlightPlan).toBe(ACTIVATE_MISSION_ID);
  });

  it('returns 404 for a non-existent mission ID', async () => {
    const response = await fetch(`${BACKEND_URL}/flightplan/00000000-0000-0000-0000-000000000000/activate`, {
      method:  'PUT',
      headers: { Authorization: AUTH_HEADER },
    });
    expect(response.status).toBe(404);
  });

  it('returns 401 without a valid token', async () => {
    const response = await fetch(`${BACKEND_URL}/flightplan/${ACTIVATE_MISSION_ID}/activate`, {
      method: 'PUT',
    });
    expect(response.status).toBe(401);
  });

  it('publishes the activated plan to the flightplan MQTT topic', () =>
    new Promise<void>((resolve, reject) => {
      const topic = `${TEST_USER_ID}/flightplan`;

      const subscriber = mqtt.connect(BROKER_WS_URL, {
        username: TEST_USER_ID,
        password: TEST_MQTT_TOKEN,
      });

      subscriber.on('connect', () => {
        subscriber.subscribe(topic, (err) => {
          if (err) return reject(err);

          fetch(`${BACKEND_URL}/flightplan/${ACTIVATE_MQTT_ID}/activate`, {
            method:  'PUT',
            headers: { Authorization: AUTH_HEADER },
          }).catch(reject);
        });
      });

      subscriber.on('message', (_topic, payload) => {
        try {
          const received = JSON.parse(payload.toString()) as { fpid: string };
          if (received.fpid !== ACTIVATE_MQTT_ID) return;
          expect(received.fpid).toBe(ACTIVATE_MQTT_ID);
          subscriber.end();
          resolve();
        } catch (e) {
          subscriber.end();
          reject(e);
        }
      });

      subscriber.on('error', reject);
    }));
});

// ── Auth endpoints ────────────────────────────────────────────────────────────

describe('Auth — POST /auth/register + /auth/login', () => {
  const uniqueEmail = `auth-test-${Date.now()}@agrodrone.test`;
  const password    = 'AuthTest123!';

  it('registers a new account with a valid access token', async () => {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:       uniqueEmail,
        password,
        accessToken: TEST_ACCESS_TOKEN,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string; userId: string };
    expect(typeof body.token).toBe('string');
    expect(typeof body.userId).toBe('string');
  });

  it('rejects registration with an invalid access token', async () => {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:       `another-${Date.now()}@agrodrone.test`,
        password:    'pass',
        accessToken: 'INVALID-TOKEN',
      }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects duplicate registration for the same email', async () => {
    const res = await fetch(`${BACKEND_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:       uniqueEmail,
        password,
        accessToken: TEST_ACCESS_TOKEN,
      }),
    });
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials and returns a JWT', async () => {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: uniqueEmail, password }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string; userId: string };
    expect(typeof body.token).toBe('string');
  });

  it('rejects login with wrong password', async () => {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: uniqueEmail, password: 'wrongpassword' }),
    });
    expect(res.status).toBe(401);
  });
});
