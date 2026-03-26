/**
 * Telemetry MQTT service test.
 *
 * Requires the MQTT broker to be running:
 *   docker compose up mqtt -d
 *
 * Run with: npm run test:service
 */

import { describe, it, expect } from 'vitest';
import mqtt from 'mqtt';

const BROKER_WS_URL = 'ws://localhost:9001';
const TOPIC = 'telemetry';

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
      const subscriber = mqtt.connect(BROKER_WS_URL);
      const publisher = mqtt.connect(BROKER_WS_URL);

      let subscriberReady = false;
      let publisherReady = false;

      const tryPublish = () => {
        if (subscriberReady && publisherReady) {
          publisher.publish(TOPIC, JSON.stringify(sampleTelemetry));
        }
      };

      subscriber.on('connect', () => {
        subscriber.subscribe(TOPIC, (err) => {
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
