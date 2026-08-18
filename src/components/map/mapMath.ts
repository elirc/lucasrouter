// Small pure geometry helpers used only by the map layer (bearings, leg
// midpoints, path assembly). Kept local so the map does not depend on the
// optimizer's internals, which are owned by another module.

import type { Depot, Route, RouteLeg, Stop } from '@/lib/types';
import type { LatLngTuple } from '@/lib/geo';

const EARTH_RADIUS_M = 6_371_000;
const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// Road geometry (loaded on demand)
// ---------------------------------------------------------------------------

/**
 * `src/data/paths.json` is ~96 KB — a quarter of everything the map downloads —
 * and nothing on screen needs it until there is a route to draw. A static
 * import would put it in the Leaflet chunk group, so a dispatcher who has not
 * optimized yet (and every first visit) pays for geometry that is never drawn.
 * It is therefore pulled in with a dynamic import, and `RoutePolyline` waits
 * for `loadRoadPaths()` before drawing rather than flashing straight lines that
 * snap to roads a moment later. A failed load resolves to "no road paths", so
 * routes still render as straight segments instead of not at all.
 */
type GetLegPath = (fromId: string, toId: string) => LatLngTuple[] | undefined;

const NO_ROAD_PATHS: GetLegPath = () => undefined;

let getLegPath: GetLegPath | null = null;
let roadPathsLoad: Promise<void> | null = null;

/** Fetch the precomputed road geometry (idempotent; never rejects). */
export function loadRoadPaths(): Promise<void> {
  roadPathsLoad ??= import('@/data/paths').then(
    (m) => {
      getLegPath = m.getLegPath;
    },
    (err: unknown) => {
      console.warn('[RouteIQ] road geometry unavailable; drawing straight legs', err);
      getLegPath = NO_ROAD_PATHS;
    },
  );
  return roadPathsLoad;
}

/** True once `loadRoadPaths()` has settled (successfully or not). */
export function roadPathsReady(): boolean {
  return getLegPath !== null;
}

/** Great-circle distance in metres between two [lat, lng] tuples. */
export function haversineMeters(a: LatLngTuple, b: LatLngTuple): number {
  const dLat = (b[0] - a[0]) * DEG;
  const dLng = (b[1] - a[1]) * DEG;
  const lat1 = a[0] * DEG;
  const lat2 = b[0] * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing (0..360, clockwise from north) from a to b. */
export function bearingDeg(a: LatLngTuple, b: LatLngTuple): number {
  const lat1 = a[0] * DEG;
  const lat2 = b[0] * DEG;
  const dLng = (b[1] - a[1]) * DEG;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

/**
 * Resolve a leg endpoint id ('DEPOT' or a stop id) to coordinates.
 * Returns null when the id is unknown (e.g. a stop was removed).
 */
export function resolvePoint(
  id: string,
  depot: Depot,
  stopsById: Record<string, Stop>,
): LatLngTuple | null {
  if (id === 'DEPOT') return [depot.lat, depot.lng];
  const s = stopsById[id];
  return s ? [s.lat, s.lng] : null;
}

/**
 * Coordinates a leg is drawn through, in priority order:
 *  1. `leg.path` if the optimizer supplied one,
 *  2. the precomputed road polyline from `src/data/paths.json` (seed pairs only,
 *     fetched once from OSRM by scripts/precompute-paths.ts — never at runtime,
 *     and only in the browser once `loadRoadPaths()` has resolved),
 *  3. a straight segment between the two endpoints.
 * Road paths are snapped so the drawn line starts/ends exactly on the markers.
 */
export function legPositions(
  leg: RouteLeg,
  depot: Depot,
  stopsById: Record<string, Stop>,
): LatLngTuple[] {
  if (leg.path && leg.path.length >= 2) return leg.path;
  const from = resolvePoint(leg.fromId, depot, stopsById);
  const to = resolvePoint(leg.toId, depot, stopsById);
  if (!from || !to) return [];
  const road = getLegPath?.(leg.fromId, leg.toId);
  if (road && road.length >= 2) return [from, ...road, to];
  return [from, to];
}

/**
 * Concatenate a route's legs (depot → stops… → depot) into a single closed
 * polyline. Consecutive duplicate vertices (leg end == next leg start) are
 * dropped so arrows/halos do not double up.
 */
export function routePositions(
  route: Route,
  depot: Depot,
  stopsById: Record<string, Stop>,
): LatLngTuple[] {
  const out: LatLngTuple[] = [];
  const legs =
    route.legs.length > 0 ? route.legs : syntheticLegs(route.stopIds);
  for (const leg of legs) {
    const pts = legPositions(leg, depot, stopsById);
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;
      out.push(p);
    }
  }
  return out;
}

/** Straight-line legs for a route whose `legs` array is empty but has stops. */
function syntheticLegs(stopIds: string[]): RouteLeg[] {
  const ids = ['DEPOT', ...stopIds, 'DEPOT'];
  const legs: RouteLeg[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    legs.push({ fromId: ids[i], toId: ids[i + 1], distanceKm: 0, driveMinutes: 0 });
  }
  return legs;
}

export interface LegMidpoint {
  /** Point half-way along the leg (by path length). */
  position: LatLngTuple;
  /** Bearing of the path segment that contains the midpoint. */
  bearing: number;
  /** Total drawn length of the leg in metres. */
  lengthMeters: number;
}

/**
 * Midpoint (by cumulative length) and local bearing of a leg. Returns null when
 * the leg has fewer than two distinct points.
 */
export function legMidpoint(positions: LatLngTuple[]): LegMidpoint | null {
  if (positions.length < 2) return null;
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < positions.length - 1; i++) {
    const d = haversineMeters(positions[i], positions[i + 1]);
    segLens.push(d);
    total += d;
  }
  if (total <= 0) return null;

  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i];
    if (acc + len >= half) {
      const t = len === 0 ? 0 : (half - acc) / len;
      const a = positions[i];
      const b = positions[i + 1];
      return {
        position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        bearing: bearingDeg(a, b),
        lengthMeters: total,
      };
    }
    acc += len;
  }
  // Floating-point fallthrough: use the final segment.
  const a = positions[positions.length - 2];
  const b = positions[positions.length - 1];
  return { position: b, bearing: bearingDeg(a, b), lengthMeters: total };
}

/**
 * Pick at most `budget` items spread evenly across `items` (keeps order).
 * Used to cap the number of direction arrows drawn per route.
 */
export function sampleEvenly<T>(items: T[], budget: number): T[] {
  if (budget <= 0) return [];
  if (items.length <= budget) return items;
  const out: T[] = [];
  const step = items.length / budget;
  for (let i = 0; i < budget; i++) {
    out.push(items[Math.min(items.length - 1, Math.floor(i * step + step / 2))]);
  }
  return out;
}
