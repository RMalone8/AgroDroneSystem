import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockClient } = vi.hoisted(() => {
  const mockClient = {
    connected: false,
    publish: vi.fn(),
    once: vi.fn(),
    on: vi.fn(),
    end: vi.fn(),
  };
  return { mockClient };
});

vi.mock('mqtt', () => ({
  default: { connect: vi.fn(() => mockClient) },
}));

import mqtt from 'mqtt';
import { sendEmergencySignal } from '../sendEmergencySignal';

const CREDS = { userId: 'user-abc', mqttToken: 'tok-123' };
const TOPIC = `${CREDS.userId}/emergency`;

describe('sendEmergencySignal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.connected = false;
  });

  it('connects to the broker with the provided credentials', () => {
    sendEmergencySignal('ABORT', CREDS);
    expect(mqtt.connect).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ username: CREDS.userId, password: CREDS.mqttToken }),
    );
  });

  describe('when the MQTT client is already connected', () => {
    it('publishes immediately without waiting for a connect event', () => {
      mockClient.connected = true;
      sendEmergencySignal('ABORT', CREDS);
      expect(mockClient.publish).toHaveBeenCalledTimes(1);
      expect(mockClient.once).not.toHaveBeenCalled();
    });

    it('publishes to the per-user emergency topic', () => {
      mockClient.connected = true;
      sendEmergencySignal('ABORT', CREDS);
      expect(mockClient.publish).toHaveBeenCalledWith(TOPIC, 'ABORT', {}, expect.any(Function));
    });

    it('publishes the LAND message verbatim', () => {
      mockClient.connected = true;
      sendEmergencySignal('LAND', CREDS);
      expect(mockClient.publish).toHaveBeenCalledWith(TOPIC, 'LAND', {}, expect.any(Function));
    });
  });

  describe('when the MQTT client is not yet connected', () => {
    it('does not publish immediately', () => {
      sendEmergencySignal('ABORT', CREDS);
      expect(mockClient.publish).not.toHaveBeenCalled();
    });

    it('registers a one-time connect listener', () => {
      sendEmergencySignal('ABORT', CREDS);
      expect(mockClient.once).toHaveBeenCalledWith('connect', expect.any(Function));
    });

    it('publishes to the emergency topic once the connect event fires', () => {
      sendEmergencySignal('ABORT', CREDS);
      const [, connectCallback] = mockClient.once.mock.calls[0] as [string, () => void];
      connectCallback();
      expect(mockClient.publish).toHaveBeenCalledWith(TOPIC, 'ABORT', {}, expect.any(Function));
    });

    it('publishes the LAND message once the connect event fires', () => {
      sendEmergencySignal('LAND', CREDS);
      const [, connectCallback] = mockClient.once.mock.calls[0] as [string, () => void];
      connectCallback();
      expect(mockClient.publish).toHaveBeenCalledWith(TOPIC, 'LAND', {}, expect.any(Function));
    });
  });
});
