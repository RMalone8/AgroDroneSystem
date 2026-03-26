import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { activateFlightPlan } from '../FlightPlans';

// Stub import.meta.env before importing the module
Object.assign(import.meta.env, {
  VITE_BACKEND_URL: 'http://localhost:8787',
  VITE_DEVICE_TOKEN: 'test-token',
});

describe('activateFlightPlan', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true and calls PUT /flightplan/:id/activate on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true } as Response);

    const result = await activateFlightPlan('abc-123');

    expect(result).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/flightplan/abc-123/activate'),
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') }),
      })
    );
  });

  it('returns false when the server responds with a non-ok status', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 404 } as Response);

    const result = await activateFlightPlan('missing-id');

    expect(result).toBe(false);
  });

  it('returns false on a network error', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

    const result = await activateFlightPlan('any-id');

    expect(result).toBe(false);
  });
});
