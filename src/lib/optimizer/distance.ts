// Distance and drive-time primitives. Everything downstream (assignment,
// sequencing, repair, schedule) goes through these functions so the numbers
// the UI shows always agree with the numbers the optimizer used.
//
// DISTANCE MODEL
// --------------
// We have no road network at runtime (no paid routing API), so road distance is
// ESTIMATED as great-circle (haversine) distance x `ROAD_FACTOR`. Every
// kilometre that leaves this module - the distance matrix, `RouteLeg.distanceKm`,
// `Route.totalDistanceKm`, `RouteMetrics.totalDistanceKm` - is that estimated
// road km, and drive minutes are simply `roadKm / avgSpeedKmh * 60`. Callers
// that need the raw straight-line figure (tests, map helpers) use `haversineKm`.

import type { Matrix, Point } from './types';

/** Mean Earth radius in km (WGS-84 mean). */
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Straight-line (haversine) distances are shorter than real streets. Multiply
 * by this factor to approximate urban road distance (and hence drive time).
 */
export const ROAD_FACTOR = 1.3;

/** Default average urban speed, km/h (matches `OptimizeOptions.avgSpeedKmh` default). */
export const DEFAULT_SPEED_KMH = 32;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points in kilometres (raw, no road factor). */
export function haversineKm(a: Point, b: Point): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Estimated road distance between two points in kilometres:
 * `haversineKm(a, b) * ROAD_FACTOR`. This is THE distance the optimizer plans
 * with and the UI reports.
 */
export function estimatedRoadKm(a: Point, b: Point, roadFactor: number = ROAD_FACTOR): number {
  return haversineKm(a, b) * roadFactor;
}

/**
 * Initial compass bearing from `from` to `to`, in degrees [0, 360).
 * 0 = north, 90 = east. Used to seed the angular sectors in `assign.ts`.
 */
export function bearingDeg(from: Point, to: Point): number {
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/**
 * Build a full symmetric matrix of ESTIMATED ROAD km (`estimatedRoadKm`).
 * Callers pass `[depot, ...stops]` so that index 0 is the depot and index `i`
 * is `stops[i - 1]`. Sequencing / repair read drive minutes straight off this
 * matrix via `driveMinutes`, so the matrix and the scheduled legs agree.
 *
 * O(n^2) but n is tiny (46 points -> ~1k haversines, well under a millisecond).
 */
export function buildDistanceMatrix(points: Point[]): Matrix {
  const n = points.length;
  const m: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = estimatedRoadKm(points[i], points[j]);
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
}

/**
 * Convert an estimated ROAD distance (already includes `ROAD_FACTOR`) into
 * drive minutes: `roadKm / avgSpeedKmh * 60`. Non-positive speeds yield 0
 * rather than Infinity.
 */
export function driveMinutes(roadKm: number, avgSpeedKmh: number = DEFAULT_SPEED_KMH): number {
  if (!(avgSpeedKmh > 0)) return 0;
  return (roadKm / avgSpeedKmh) * 60;
}

/** Arithmetic mean of a non-empty set of points (fine at city scale). */
export function centroidOf(points: Point[]): Point | null {
  if (points.length === 0) return null;
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}
