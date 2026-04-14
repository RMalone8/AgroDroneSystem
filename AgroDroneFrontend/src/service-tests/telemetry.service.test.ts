/**
 * Telemetry MQTT service test.
 *
 * Requires the MQTT broker to be running:
 *   docker compose up mqtt -d
 *
 * Run with: npm run test:service
 */

import { describe, it, expect, beforeAll } from 'vitest';
import mqtt from 'mqtt';

const BACKEND_URL    = process.env.VITE_BACKEND_URL || 'http://localhost:8787';
const BROKER_WS_URL  = 'ws://localhost:9001';

const TEST_EMAIL        = process.env.TEST_USER_EMAIL    ?? 'servicetest@agrodrone.test';
const TEST_PASSWORD     = process.env.TEST_USER_PASSWORD ?? 'ServiceTest123!';
const TEST_ACCESS_TOKEN = process.env.TEST_ACCESS_TOKEN  ?? 'AGRO-ALPHA-TOKEN-1';

// Admin credentials — used to publish to the telemetry topic (only devices/backend may publish)
const MQTT_ADMIN_USERNAME = process.env.TEST_MQTT_ADMIN_USERNAME ?? 'agrodrone-backend';
const MQTT_ADMIN_PASSWORD = process.env.TEST_MQTT_ADMIN_PASSWORD ?? '';

let TEST_USER_ID   = '';
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

const sampleTelemetry = {
  voltage_battery: 23.98,
  current_battery: 0.88,
  battery_remaining: 77,
  satellites_visible: 24,
  gps_hdop: 0.33,
  lat: 42.3894243,
  lon: -71.1382523,
  alt_msl: 5.64,
  alt_rel: 0.562,
  heading: 38.8,
  vx: 0.02,
  vy: 0.06,
  vz: 0.22,
  timestamp: 1771798711.105927,
  base_station_position: [42.3894463, -71.1384583]
};

describe('Telemetry MQTT pipeline', () => {
  it('broker relays a published telemetry message to subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const topic = `${TEST_USER_ID}/telemetry`;

      // Subscriber uses frontend user credentials (subscribe permission on telemetry topic)
      const subscriber = mqtt.connect(BROKER_WS_URL, {
        username: TEST_USER_ID,
        password: TEST_MQTT_TOKEN,
      });

      // Publisher uses backend admin credentials (only devices/backend may publish telemetry)
      const publisher = mqtt.connect(BROKER_WS_URL, {
        username: MQTT_ADMIN_USERNAME,
        password: MQTT_ADMIN_PASSWORD,
      });

      let subscriberReady = false;
      let publisherReady  = false;

      const tryPublish = () => {
        if (subscriberReady && publisherReady) {
          publisher.publish(topic, JSON.stringify(sampleTelemetry));
        }
      };

      subscriber.on('connect', () => {
        subscriber.subscribe(topic, (err) => {
          if (err) return reject(err);
          subscriberReady = true;
          tryPublish();
        });
      });

      publisher.on('connect', () => {
        publisherReady = true;
        tryPublish();
      });

      subscriber.on('message', (_topic, payload) => {
        try {
          const received = JSON.parse(payload.toString());

          expect(received.battery_remaining).toBe(sampleTelemetry.battery_remaining);
          expect(received.lat).toBe(sampleTelemetry.lat);
          expect(received.lon).toBe(sampleTelemetry.lon);
          expect(received.alt_msl).toBe(sampleTelemetry.alt_msl);
          expect(received.heading).toBe(sampleTelemetry.heading);
          expect(received.satellites_visible).toBe(sampleTelemetry.satellites_visible);
          expect(received.gps_hdop).toBe(sampleTelemetry.gps_hdop);
          expect(received.vx).toBe(sampleTelemetry.vx);
          expect(received.vy).toBe(sampleTelemetry.vy);
          expect(received.vz).toBe(sampleTelemetry.vz);

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
      publisher.on('error', reject);
    }));
});
