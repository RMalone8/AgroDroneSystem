const EARTH_RADIUS_M = 6_371_000;
const SQ_METERS_PER_ACRE = 4_046.86;

/**
 * Compute the area of a polygon (in acres) using the Shoelace formula
 * in a flat-earth metric projection centred on the first vertex.
 */
export function polygonAreaAcres(vertices: { lat: number; lng: number }[]): number {
  if (vertices.length < 3) return 0;
  const originLat = vertices[0].lat;
  const LAT_M = 111_111;
  const LNG_M = 111_111 * Math.cos((originLat * Math.PI) / 180);
  const pts = vertices.map((v) => ({
    x: (v.lng - vertices[0].lng) * LNG_M,
    y: (v.lat - originLat) * LAT_M,
  }));
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  }
  return Math.abs(area) / 2 / SQ_METERS_PER_ACRE;
}

export function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Returns true if the base station is within rangeMeters of the polygon defined
 * by vertices. Three cases return true:
 *   1. The base station is inside the polygon.
 *   2. The base station is within rangeMeters of any edge of the perimeter.
 *   3. (Implied by 2) The base station is within rangeMeters of any vertex.
 *
 * Uses a flat-earth approximation (valid for polygons < a few km in size).
 */
export function isWithinRange(
  vertices: { lat: number; lng: number }[],
  baseLat: number,
  baseLng: number,
  rangeMeters: number,
): boolean {
  if (vertices.length === 0) return false;

  // Project everything into a local metric plane centred on the base station.
  // At mid-latitudes the error is < 0.1 % for areas under ~10 km.
  const LAT_M = 111_111;
  const LNG_M = 111_111 * Math.cos((baseLat * Math.PI) / 180);

  const pts = vertices.map((v) => ({
    x: (v.lng - baseLng) * LNG_M,
    y: (v.lat - baseLat) * LAT_M,
  }));

  // Base station is at origin (0, 0) in the projected plane.

  // ── 1. Point-in-polygon (ray casting along +x axis) ────────────────────────
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const { x: xi, y: yi } = pts[i];
    const { x: xj, y: yj } = pts[j];
    // Does the edge cross the horizontal ray from (0,0) going right?
    if ((yi > 0) !== (yj > 0)) {
      const xIntersect = xj + ((0 - yj) / (yi - yj)) * (xi - xj);
      if (xIntersect > 0) inside = !inside;
    }
  }
  if (inside) return true;

  // ── 2. Minimum distance from base station to each perimeter edge ────────────
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j].x, ay = pts[j].y;
    const bx = pts[i].x, by = pts[i].y;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let dist: number;
    if (lenSq === 0) {
      // Degenerate edge — just measure to the point
      dist = Math.hypot(ax, ay);
    } else {
      // Project origin onto the segment, clamp t ∈ [0, 1]
      const t = Math.max(0, Math.min(1, (-ax * dx + -ay * dy) / lenSq));
      dist = Math.hypot(ax + t * dx, ay + t * dy);
    }

    if (dist <= rangeMeters) return true;
  }

  return false;
}

/**
 * Compute the 4 MapLibre image-source corners [lng, lat] for a nadir image
 * taken at (lat, lng) with given heading (degrees, 0=north CW) and altitude (m).
 * Camera: 62.2° H-FOV, 48.8° V-FOV (Raspberry Pi Camera Module 2).
 * Returns: [topLeft, topRight, bottomRight, bottomLeft] each as [lng, lat].
 */
export function computeImageCorners(
  lat: number, lng: number, heading: number, altitude: number
): [[number, number], [number, number], [number, number], [number, number]] {
  const HFOV = 62.2, VFOV = 48.8;
  const camW = 2 * altitude * Math.tan((HFOV / 2) * Math.PI / 180);
  const camH = 2 * altitude * Math.tan((VFOV / 2) * Math.PI / 180);
  const degPerMLat = 1 / 111111;
  const degPerMLng = 1 / (111111 * Math.cos(lat * Math.PI / 180));
  const h = heading * Math.PI / 180;
  const halfW = camW / 2, halfH = camH / 2;
  // forward unit: (cos h, sin h) in (dlat, dlng); right unit: (sin h, cos h) rotated
  const fLat = Math.cos(h) * halfH * degPerMLat;
  const fLng = Math.sin(h) * halfH * degPerMLng;
  const rLat = -Math.sin(h) * halfW * degPerMLat;
  const rLng = Math.cos(h) * halfW * degPerMLng;
  return [
    [lng + fLng - rLng, lat + fLat - rLat], // top-left
    [lng + fLng + rLng, lat + fLat + rLat], // top-right
    [lng - fLng + rLng, lat - fLat + rLat], // bottom-right
    [lng - fLng - rLng, lat - fLat - rLat], // bottom-left
  ];
}
