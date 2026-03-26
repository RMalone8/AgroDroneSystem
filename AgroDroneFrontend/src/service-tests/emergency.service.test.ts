/**
 * Emergency signal MQTT service tests.
 *
 * Requires the MQTT broker to be running:
 *   docker compose up mqtt -d
 *
 * Run with: npm run test:service
 * Run one suite: npm run test:service -- -t "suite name"
 */

import { describe, it, expect, afterAll } from 'vitest';
import mqtt, { MqttClient } from 'mqtt';
import { sendEmergencySignal } from '../hooks/sendEmergencySignal';

const BROKER_WS_URL = 'ws://localhost:9001';
const TOPIC = 'emergency';

function waitForMessage(
  subscriber: MqttClient,
  expected: string,
): Promise<void> {
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

describe('Emergency MQTT broker relay', () => {
  it('relays an ABORT message to subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const subscriber = mqtt.connect(BROKER_WS_URL);
      const publisher  = mqtt.connect(BROKER_WS_URL);

      let subReady = false;
      let pubReady = false;

      const tryPublish = () => {
        if (subReady && pubReady) publisher.publish(TOPIC, 'ABORT');
      };

      subscriber.on('connect', () => {
        subscriber.subscribe(TOPIC, (err) => {
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
      const subscriber = mqtt.connect(BROKER_WS_URL);
      const publisher  = mqtt.connect(BROKER_WS_URL);

      let subReady = false;
      let pubReady = false;

      const tryPublish = () => {
        if (subReady && pubReady) publisher.publish(TOPIC, 'LAND');
      };

      subscriber.on('connect', () => {
        subscriber.subscribe(TOPIC, (err) => {
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
// The module-level MQTT client in sendEmergencySignal connects on import;
// the function's once('connect') path handles the not-yet-connected case.

describe('sendEmergencySignal — end-to-end', () => {
  // Keep a reference to each subscriber so afterAll can force-close on failure
  const openSubscribers: MqttClient[] = [];

  afterAll(() => {
    openSubscribers.forEach((s) => s.end(true));
  });

  it('delivers ABORT to emergency topic subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const subscriber = mqtt.connect(BROKER_WS_URL);
      openSubscribers.push(subscriber);

      subscriber.on('connect', () => {
        subscriber.subscribe(TOPIC, (err) => {
          if (err) return reject(err);
          sendEmergencySignal('ABORT');
        });
      });

      waitForMessage(subscriber, 'ABORT')
        .then(() => { subscriber.end(); resolve(); })
        .catch((e) => { subscriber.end(); reject(e); });
    }));

  it('delivers LAND to emergency topic subscribers', () =>
    new Promise<void>((resolve, reject) => {
      const subscriber = mqtt.connect(BROKER_WS_URL);
      openSubscribers.push(subscriber);

      subscriber.on('connect', () => {
        subscriber.subscribe(TOPIC, (err) => {
          if (err) return reject(err);
          sendEmergencySignal('LAND');
        });
      });

      waitForMessage(subscriber, 'LAND')
        .then(() => { subscriber.end(); resolve(); })
        .catch((e) => { subscriber.end(); reject(e); });
    }));
});
