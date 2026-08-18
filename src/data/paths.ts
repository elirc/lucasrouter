// Precomputed road-following polylines between seed points (see
// scripts/precompute-paths.ts). Used ONLY by the map for drawing legs; the
// optimizer keeps its haversine × road-factor estimates so the OptimizeRequest
// → OptimizeResponse contract stays independent of any external routing data.
//
// Paths are stored once per unordered pair as Google-encoded polylines and
// decoded lazily (with a small cache). If a pair is missing (e.g. a stop that is
// not part of the seed data) the caller draws a straight line instead.

import pathsJson from './paths.json';

type PathsFile = { ids: string[]; paths: Record<string, string> };

const FILE = pathsJson as PathsFile;
const cache = new Map<string, [number, number][]>();

/** Decode a Google-encoded polyline (precision 5) into [lat, lng] tuples. */
export function decodePolyline(encoded: string): [number, number][] {
  const out: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

/**
 * Road polyline from `fromId` to `toId` (stop ids or 'DEPOT'), oriented in
 * travel direction, or `undefined` when no precomputed path exists.
 */
export function getLegPath(fromId: string, toId: string): [number, number][] | undefined {
  if (fromId === toId) return undefined;
  const forward = fromId < toId;
  const key = forward ? `${fromId}|${toId}` : `${toId}|${fromId}`;
  const encoded = FILE.paths[key];
  if (!encoded) return undefined;
  let pts = cache.get(key);
  if (!pts) {
    pts = decodePolyline(encoded);
    cache.set(key, pts);
  }
  return forward ? pts : [...pts].reverse();
}

/** True when the precomputed file has at least one path. */
export function hasPrecomputedPaths(): boolean {
  return Object.keys(FILE.paths).length > 0;
}
