// @vitest-environment jsdom
/**
 * Positions service tests — drone & base station markers appear on the map.
 *
 * Renders AgroDroneMap directly with realistic telemetry props and verifies
 * that Marker elements appear at the correct coordinates.
 *
 * The MQTT→state pipeline is covered by telemetry.service.test.ts.
 *
 * Run with: npm run test:service
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgroDroneMap } from '../components/map/AgroDroneMap';
import { DroneTelemetry } from '../constants/types';

// ── Map mocks (no WebGL in jsdom) ────────────────────────────────────────────

vi.mock('maplibre-gl', () => ({ default: {} }));

vi.mock('@vis.gl/react-maplibre', () => ({
  Map: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="map">{children}</div>
  ),
  Marker: ({
    children,
    latitude,
    longitude,
  }: {
    children?: React.ReactNode;
    latitude: number;
    longitude: number;
  }) => (
    <div data-testid="map-marker" data-lat={latitude} data-lng={longitude}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useControl: vi.fn(),
}));

vi.mock('../components/map/DrawControl', () => ({
  DrawControl: () => null,
}));

vi.mock('../components/map/Geocoder', () => ({
  default: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const DRONE_LAT = 42.3894243;
const DRONE_LNG = -71.1382523;
const BASE_LAT = 42.123456;
const BASE_LNG = -71.654321;

const telemetry: DroneTelemetry = {
  battery: '77',
  altitude: '5.64',
  droneLat: String(DRONE_LAT),
  droneLng: String(DRONE_LNG),
  baseStationPos: [BASE_LAT, BASE_LNG],
  hdop: '0.33',
  heading: '38.8',
  satellitesVisible: '24',
  velocity: ['0.02', '0.06', '0.22'],
};

const drawRef = { current: null } as React.MutableRefObject<any>;

function renderMap(activeTab = 'planning') {
  render(
    <AgroDroneMap
      activeTab={activeTab}
      droneData={telemetry}
      drawRef={drawRef}
    />
  );
}

function findMarker(lat: number, lng: number) {
  return screen.getAllByTestId('map-marker').find(
    (m) =>
      Number(m.dataset.lat).toFixed(4) === lat.toFixed(4) &&
      Number(m.dataset.lng).toFixed(4) === lng.toFixed(4)
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AgroDroneMap — drone position', () => {
  it('renders a drone marker at the correct lat/lng', () => {
    renderMap();
    expect(findMarker(DRONE_LAT, DRONE_LNG)).toBeTruthy();
  });

  it('drone marker is present on the flights tab too', () => {
    renderMap('flights');
    expect(findMarker(DRONE_LAT, DRONE_LNG)).toBeTruthy();
  });
});

describe('AgroDroneMap — base station position', () => {
  it('renders a base station marker at the correct lat/lng', () => {
    renderMap();
    // AgroDroneMap passes baseStationPos[0] as latitude, [1] as longitude
    expect(findMarker(BASE_LAT, BASE_LNG)).toBeTruthy();
  });
});

describe('AgroDroneMap — no drone marker without GPS data', () => {
  it('omits the drone marker when lat/lng are empty strings', () => {
    render(
      <AgroDroneMap
        activeTab="planning"
        droneData={{ ...telemetry, droneLat: '', droneLng: '' }}
        drawRef={drawRef}
      />
    );
    expect(findMarker(DRONE_LAT, DRONE_LNG)).toBeUndefined();
  });
});
