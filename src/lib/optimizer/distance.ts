// Distance and drive-time primitives. Everything downstream (assignment,
// sequencing, repair, schedule) goes through these three functions so the
// numbers the UI shows always agree with the numbers the optimizer used.

import type { Matrix, Point } from './types';

/** Mean Earth radius in km (WGS-84 mean). */
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Straight-line (haversine) distances are shorter than real streets. Multiply
 * by this factor to approximate urban road distance / drive time.
 */
export const ROAD_FACTOR = 1.3;

/** Default average urban speed, km/h (matches `OptimizeOptions.avgSpeedKmh` default). */
export const DEFAULT_SPEED_KMH = 32;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two points in kilometres. */
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
 * Build a full symmetric haversine matrix (km). Callers pass `[depot, ...stops]`
 * so that index 0 is the depot and index `i` is `stops[i - 1]`.
 *
 * O(n^2) but n is tiny (46 points -> ~1k haversines, well under a millisecond).
 */
export function buildDistanceMatrix(points: Point[]): Matrix {
  const n = points.length;
  const m: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversineKm(points[i], points[j]);
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
}

/**
 * Convert a straight-line distance into estimated drive minutes:
 * `km / avgSpeedKmh * 60 * roadFactor`.
 */
export function driveMinutes(
  km: number,
  avgSpeedKmh: number = DEFAULT_SPEED_KMH,
  roadFactor: number = ROAD_FACTOR,
): number {
  if (!(avgSpeedKmh > 0)) return 0;
  return (km / avgSpeedKmh) * 60 * roadFactor;
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
