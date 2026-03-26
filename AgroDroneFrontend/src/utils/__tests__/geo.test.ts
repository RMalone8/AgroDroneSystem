import { describe, it, expect } from 'vitest';
import { haversineMeters, isWithinRange } from '../geo';

// Reference: Boston City Hall ~42.3601° N, 71.0589° W
const CITY_HALL = { lat: 42.3601, lng: -71.0589 };
// Faneuil Hall ~135m northeast of City Hall
const FANEUIL_HALL = { lat: 42.3602, lng: -71.0554 };

describe('haversineMeters', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineMeters(42.0, -71.0, 42.0, -71.0)).toBe(0);
  });

  it('is roughly symmetric', () => {
    const d1 = haversineMeters(CITY_HALL.lat, CITY_HALL.lng, FANEUIL_HALL.lat, FANEUIL_HALL.lng);
    const d2 = haversineMeters(FANEUIL_HALL.lat, FANEUIL_HALL.lng, CITY_HALL.lat, CITY_HALL.lng);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });

  it('returns ~29 m for two points ~29 m apart', () => {
    // Two points ~29 m apart along latitude (1° lat ≈ 111,000 m → 0.000261° ≈ 29 m)
    const d = haversineMeters(42.0, -71.0, 42.000261, -71.0);
    expect(d).toBeGreaterThan(28);
    expect(d).toBeLessThan(30);
  });

  it('returns ~31 m for two points ~31 m apart', () => {
    const d = haversineMeters(42.0, -71.0, 42.000279, -71.0);
    expect(d).toBeGreaterThan(30);
    expect(d).toBeLessThan(32);
  });
});

describe('isWithinRange', () => {
  const base = { lat: 42.0, lng: -71.0 };

  // A vertex exactly at the base station (0 m away)
  const atBase = { lat: 42.0, lng: -71.0 };
  // A vertex ~29 m away (within 30 m)
  const near = { lat: 42.000261, lng: -71.0 };
  // A vertex ~31 m away (outside 30 m)
  const far = { lat: 42.000279, lng: -71.0 };
  // A vertex ~1 km away
  const veryFar = { lat: 42.009, lng: -71.0 };

  it('returns true when a vertex is exactly at the base station', () => {
    expect(isWithinRange([atBase], base.lat, base.lng, 30)).toBe(true);
  });

  it('returns true when a vertex is within range', () => {
    expect(isWithinRange([near], base.lat, base.lng, 30)).toBe(true);
  });

  it('returns false when all vertices are outside range', () => {
    expect(isWithinRange([far, veryFar], base.lat, base.lng, 30)).toBe(false);
  });

  it('returns true when at least one vertex is within range even if others are not', () => {
    expect(isWithinRange([veryFar, near, far], base.lat, base.lng, 30)).toBe(true);
  });

  it('returns false for an empty vertex array', () => {
    expect(isWithinRange([], base.lat, base.lng, 30)).toBe(false);
  });

  it('respects the rangeMeters parameter — same vertex inside 50 m but outside 20 m', () => {
    // near is ~29 m away
    expect(isWithinRange([near], base.lat, base.lng, 50)).toBe(true);
    expect(isWithinRange([near], base.lat, base.lng, 20)).toBe(false);
  });

  // ── Edge (perimeter) proximity ──────────────────────────────────────────────
  //
  // Build a square polygon whose vertices are all ~200 m from the base station,
  // but whose south edge passes ~10 m north of it.
  //
  // Base station: (42.0, -71.0)
  // Square corners (all ~200 m out):
  //   SW: (42.000090, -71.001800)   ~170 m west, ~10 m north  → south edge runs east-west ~10 m north
  //   SE: (42.000090, -71.000000+0.001800) = (42.000090, -70.998200)
  //   NE: (42.001800, -70.998200)
  //   NW: (42.001800, -71.001800)
  //
  // 0.000090° lat ≈ 10 m, 0.001800° lng ≈ 150 m at lat 42

  const squareSW = { lat: 42.000090, lng: -71.001800 };
  const squareSE = { lat: 42.000090, lng: -70.998200 };
  const squareNE = { lat: 42.001800, lng: -70.998200 };
  const squareNW = { lat: 42.001800, lng: -71.001800 };
  // Polygon with closing vertex
  const squareAbove = [squareSW, squareSE, squareNE, squareNW, squareSW];

  it('returns true when base station is close to an edge but not near any vertex', () => {
    // All vertices are >150 m away, but the south edge is only ~10 m north of base
    expect(isWithinRange(squareAbove, base.lat, base.lng, 30)).toBe(true);
  });

  it('returns false when base station is far from all edges', () => {
    // Move the square 500 m north — now all edges are far away
    const offset = 0.0045; // ~500 m in latitude
    const farSquare = squareAbove.map((v) => ({ lat: v.lat + offset, lng: v.lng }));
    expect(isWithinRange(farSquare, base.lat, base.lng, 30)).toBe(false);
  });

  // ── Point-in-polygon ────────────────────────────────────────────────────────
  //
  // Large square that completely contains the base station.
  // All edges are >500 m away but the base is inside.

  const bigSquare = [
    { lat: 41.995, lng: -71.005 },
    { lat: 41.995, lng: -70.995 },
    { lat: 42.005, lng: -70.995 },
    { lat: 42.005, lng: -71.005 },
    { lat: 41.995, lng: -71.005 }, // closing vertex
  ];

  it('returns true when base station is inside the polygon even if all edges are far away', () => {
    // Edges are ~500 m away in each direction, but base is inside
    expect(isWithinRange(bigSquare, base.lat, base.lng, 30)).toBe(true);
  });

  it('returns false for a large polygon that does not contain the base and is far away', () => {
    // Same large square shifted 2° north — base is outside and >200 km away
    const farBigSquare = bigSquare.map((v) => ({ lat: v.lat + 2, lng: v.lng }));
    expect(isWithinRange(farBigSquare, base.lat, base.lng, 30)).toBe(false);
  });
});
