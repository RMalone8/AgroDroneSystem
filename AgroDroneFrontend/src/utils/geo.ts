const EARTH_RADIUS_M = 6_371_000;

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
