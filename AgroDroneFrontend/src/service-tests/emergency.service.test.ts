/**
 * Emergency signal MQTT service tests.
 *
 * Requires the backend and MQTT broker to be running:
 *   docker compose up mqtt backend -d
 *
 * Reads credentials from .env (gitignored):
 *   VITE_BACKEND_URL           — e.g. http://localhost:8787  (optional, defaults below)
 *   TEST_USER_EMAIL            — email for the test account
 *   TEST_USER_PASSWORD         — password for the test account
 *   TEST_ACCESS_TOKEN          — a client access token issued by an admin via POST /admin/access-token
 *   TEST_MQTT_ADMIN_USERNAME   — MQTT admin username (can subscribe to any topic)
 *   TEST_MQTT_ADMIN_PASSWORD   — MQTT admin password
 *
 * Run with: npm run test:service
 * Run one suite: npm run test:service -- -t "suite name"
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mqtt, { MqttClient } from 'mqtt';
import { sendEmergencySignal } from '../hooks/sendEmergencySignal';

const BACKEND_URL   = process.env.VITE_BACKEND_URL || 'http://localhost:8787';
const BROKER_WS_URL = 'ws://localhost:9001';

const TEST_EMAIL        = process.env.TEST_USER_EMAIL    ?? 'servicetest@agrodrone.test';
const TEST_PASSWORD     = process.env.TEST_USER_PASSWORD ?? 'ServiceTest123!';
const TEST_ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN  ?? 'AGRO-ALPHA-TOKEN-1';

// Admin credentials — used to subscribe to the emergency topic (admin can subscribe to any topic)
const MQTT_ADMIN_USERNAME = process.env.TEST_MQTT_ADMIN_USERNAME ?? 'agrodrone-backend';
const MQTT_ADMIN_PASSWORD = process.env.TEST_MQTT_ADMIN_PASSWORD ?? '';

let TEST_USER_ID    = '';
let TEST_MQTT_TOKEN = '';

beforeAll(async () => {
  let res = await fetch(`${BACKEND_URL}/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (res.status === 401) {
    res = await fetch(`${BACKEND_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, accessToken: TEST_ACCESS_TOKEN }),
    });
  }

  if (!res.ok) throw new Error(`Auth setup failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { token: string; userId: string; mqttToken: string };
  TEST_USER_ID    = data.userId;
  TEST_MQTT_TOKEN = data.mqttToken;
});

function waitForMessage(subscriber: MqttClient, expected: string): Promise<void> {
  return new Promise((resolve, reject) => {
    subscriber.on('message', (_topic, payload) => {
      try {
        if (payload.toString() !== expected) return;
        expect(payload.toString()).toBe(expected);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    subscriber.on('error', reject);
  });
}

// ── Broker relay ──────────────────────────────────────────────────────────────
// Verifies the broker itself routes messages on the emergency topic correctly,
// independent of the sendEmergencySignal function.
// User publishes to ${userId}/emergency; admin subscribes (simulates the edge node/backend).

describe('Emergency MQTT broker relay', () => {
  it('relays an ABORT message to subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const topic = `${TEST_USER_ID}/emergency`;

      // Admin subscribes (simulates the edge node that receives emergency commands)
      const subscriber = mqtt.connect(BROKER_WS_URL, {
        username: MQTT_ADMIN_USERNAME,
        password: MQTT_ADMIN_PASSWORD,
      });
      // User publishes (simulates the frontend sending the emergency signal)
      const publisher = mqtt.connect(BROKER_WS_URL, {
        username: TEST_USER_ID,
        password: TEST_MQTT_TOKEN,
      });

      let subReady = false;
      let pubReady = false;

      const tryPublish = () => {
        if (subReady && pubReady) publisher.publish(topic, 'ABORT');
      };

      subscriber.on('connect', () => {
        subscriber.subscribe(topic, (err) => {
          if (err) return reject(err);
          subReady = true;
          tryPublish();
        });
      });

      publisher.on('connect', () => { pubReady = true; tryPublish(); });
      publisher.on('error', reject);

      subscriber.on('message', (_topic, payload) => {
        try {
          expect(payload.toString()).toBe('ABORT');
          subscriber.end();
          publisher.end();
          resolve();
        } catch (e) {
          subscriber.end();
          publisher.end();
          reject(e);
        }
      });

      subscriber.on('error', reject);
    }));

  it('relays a LAND message to subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const topic = `${TEST_USER_ID}/emergency`;

      const subscriber = mqtt.connect(BROKER_WS_URL, {
        username: MQTT_ADMIN_USERNAME,
        password: MQTT_ADMIN_PASSWORD,
      });
      const publisher = mqtt.connect(BROKER_WS_URL, {
        username: TEST_USER_ID,
        password: TEST_MQTT_TOKEN,
      });

      let subReady = false;
      let pubReady = false;

      const tryPublish = () => {
        if (subReady && pubReady) publisher.publish(topic, 'LAND');
      };

      subscriber.on('connect', () => {
        subscriber.subscribe(topic, (err) => {
          if (err) return reject(err);
          subReady = true;
          tryPublish();
        });
      });

      publisher.on('connect', () => { pubReady = true; tryPublish(); });
      publisher.on('error', reject);

      subscriber.on('message', (_topic, payload) => {
        try {
          expect(payload.toString()).toBe('LAND');
          subscriber.end();
          publisher.end();
          resolve();
        } catch (e) {
          subscriber.end();
          publisher.end();
          reject(e);
        }
      });

      subscriber.on('error', reject);
    }));
});

// ── sendEmergencySignal end-to-end ────────────────────────────────────────────
// Calls the real function and verifies the message reaches a live subscriber.
// sendEmergencySignal publishes as the user; admin subscriber receives it.

describe('sendEmergencySignal — end-to-end', () => {
  // Keep a reference to each subscriber so afterAll can force-close on failure
  const openSubscribers: MqttClient[] = [];

  afterAll(() => {
    openSubscribers.forEach((s) => s.end(true));
  });

  it('delivers ABORT to emergency topic subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const topic = `${TEST_USER_ID}/emergency`;

      const subscriber = mqtt.connect(BROKER_WS_URL, {
        username: MQTT_ADMIN_USERNAME,
        password: MQTT_ADMIN_PASSWORD,
      });
      openSubscribers.push(subscriber);

      subscriber.on('connect', () => {
        subscriber.subscribe(topic, (err) => {
          if (err) return reject(err);
          sendEmergencySignal('ABORT', { userId: TEST_USER_ID, mqttToken: TEST_MQTT_TOKEN }, BROKER_WS_URL);
        });
      });

      waitForMessage(subscriber, 'ABORT')
        .then(() => { subscriber.end(); resolve(); })
        .catch((e) => { subscriber.end(); reject(e); });
    }));

  it('delivers LAND to emergency topic subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const topic = `${TEST_USER_ID}/emergency`;

      const subscriber = mqtt.connect(BROKER_WS_URL, {
        username: MQTT_ADMIN_USERNAME,
        password: MQTT_ADMIN_PASSWORD,
      });
      openSubscribers.push(subscriber);

      subscriber.on('connect', () => {
        subscriber.subscribe(topic, (err) => {
          if (err) return reject(err);
          sendEmergencySignal('LAND', { userId: TEST_USER_ID, mqttToken: TEST_MQTT_TOKEN }, BROKER_WS_URL);
        });
      });

      waitForMessage(subscriber, 'LAND')
        .then(() => { subscriber.end(); resolve(); })
        .catch((e) => { subscriber.end(); reject(e); });
    }));
});
