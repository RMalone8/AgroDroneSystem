import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgroDroneMap } from '../AgroDroneMap';

// Mock maplibre-gl (no WebGL in jsdom)
vi.mock('maplibre-gl', () => ({ default: {} }));

// Mock react-maplibre — Map renders children, Marker/Popup/useControl are stubs
vi.mock('@vis.gl/react-maplibre', () => ({
  Map: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useControl: vi.fn(),
}));

// Mock DrawControl so it renders a detectable element without needing WebGL
vi.mock('../DrawControl', () => ({
  DrawControl: () => <div data-testid="draw-control" />,
}));

// Mock Geocoder (also uses MapLibre internals)
vi.mock('../Geocoder', () => ({
  default: () => null,
}));

const baseDroneData = {
  droneLat: '',
  droneLng: '',
  baseStationPos: undefined,
};

const drawRef = { current: null };

describe('AgroDroneMap — polygon drawing (DrawControl)', () => {
  it('renders DrawControl on the planning tab', () => {
    render(
      <AgroDroneMap activeTab="planning" droneData={baseDroneData as any} drawRef={drawRef as any} />
    );
    expect(screen.getByTestId('draw-control')).toBeInTheDocument();
  });

  it('renders DrawControl on the flights tab', () => {
    render(
      <AgroDroneMap activeTab="flights" droneData={baseDroneData as any} drawRef={drawRef as any} />
    );
    expect(screen.getByTestId('draw-control')).toBeInTheDocument();
  });

  it('does NOT render DrawControl on the sensor tab', () => {
    render(
      <AgroDroneMap activeTab="sensor" droneData={baseDroneData as any} drawRef={drawRef as any} />
    );
    expect(screen.queryByTestId('draw-control')).not.toBeInTheDocument();
  });
});

describe('AgroDroneMap — map is always rendered', () => {
  it('renders the map container on every tab', () => {
    const { rerender } = render(
      <AgroDroneMap activeTab="planning" droneData={baseDroneData as any} drawRef={drawRef as any} />
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();

    rerender(
      <AgroDroneMap activeTab="sensor" droneData={baseDroneData as any} drawRef={drawRef as any} />
    );
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });
});
