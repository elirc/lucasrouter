import { describe, expect, it } from 'vitest';
import { DEPOT, STOPS } from '@/data';
import { decodePolyline, getLegPath, hasPrecomputedPaths } from '@/data/paths';
import { haversineKm } from '@/lib/optimizer';

// `src/data/paths.ts` is the map's road-geometry lookup: a hand-rolled Google
// polyline decoder over the precomputed `paths.json`. It never influences the
// optimizer (haversine model), but a wrong decode would draw routes through
// the lake, so pin the decoder against Google's documented example and check
// the seed lookups start/end where the legs do.

/**
 * The worked example from Google's "Encoded Polyline Algorithm Format" page:
 * three points, precision 5.
 */
const GOOGLE_EXAMPLE = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
const GOOGLE_POINTS: [number, number][] = [
  [38.5, -120.2],
  [40.7, -120.95],
  [43.252, -126.453],
];

/** Encode [lat, lng] tuples (precision 5) — the inverse of `decodePolyline`, for round-trips. */
function encodePolyline(points: [number, number][]): string {
  let out = '';
  let prevLat = 0;
  let prevLng = 0;
  const encodeValue = (v: number): string => {
    let value = v < 0 ? ~(v << 1) : v << 1;
    let chunk = '';
    while (value >= 0x20) {
      chunk += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
      value >>= 5;
    }
    chunk += String.fromCharCode(value + 63);
    return chunk;
  };
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * 1e5);
    const iLng = Math.round(lng * 1e5);
    out += encodeValue(iLat - prevLat) + encodeValue(iLng - prevLng);
    prevLat = iLat;
    prevLng = iLng;
  }
  return out;
}

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;

describe('decodePolyline()', () => {
  it("decodes Google's documented example exactly", () => {
    expect(decodePolyline(GOOGLE_EXAMPLE)).toEqual(GOOGLE_POINTS);
  });

  it('returns an empty array for an empty string', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('round-trips arbitrary coordinates (incl. negatives, zero deltas, and 5-decimal precision)', () => {
    const points: [number, number][] = [
      [43.1214, -89.3305], // depot
      [43.1214, -89.3305], // zero delta
      [-33.86882, 151.20929], // southern + eastern hemisphere
      [0, 0],
      [89.99999, -179.99999],
      [43.0745, -89.3818],
    ];
    const encoded = encodePolyline(points);
    const decoded = decodePolyline(encoded);
    expect(decoded).toHaveLength(points.length);
    decoded.forEach(([lat, lng], i) => {
      expect(lat).toBeCloseTo(points[i][0], 5);
      expect(lng).toBeCloseTo(points[i][1], 5);
    });
    // Re-encoding what we decoded gives the same string back.
    expect(encodePolyline(decoded.map(([a, b]) => [round5(a), round5(b)]))).toBe(encoded);
  });
});

describe('getLegPath()', () => {
  const stopsById = new Map(STOPS.map((s) => [s.id, s]));

  it('has precomputed paths for the seed', () => {
    expect(hasPrecomputedPaths()).toBe(true);
  });

  it("DEPOT -> S001 starts near the depot and ends near S001 (road geometry, not a straight line)", () => {
    const path = getLegPath('DEPOT', 'S001');
    expect(path).toBeDefined();
    expect(path!.length).toBeGreaterThan(2);
    const s001 = stopsById.get('S001')!;
    const first = { lat: path![0][0], lng: path![0][1] };
    const last = { lat: path![path!.length - 1][0], lng: path![path!.length - 1][1] };
    // OSRM snaps to the nearest road, so allow a few hundred metres of slack.
    expect(haversineKm(first, DEPOT)).toBeLessThan(0.3);
    expect(haversineKm(last, s001)).toBeLessThan(0.3);
    // Every vertex stays inside greater Madison.
    for (const [lat, lng] of path!) {
      expect(lat).toBeGreaterThan(42.9);
      expect(lat).toBeLessThan(43.3);
      expect(lng).toBeGreaterThan(-89.7);
      expect(lng).toBeLessThan(-89.1);
    }
  });

  it('reversing the direction reverses the geometry (paths are stored once per unordered pair)', () => {
    const forward = getLegPath('DEPOT', 'S001')!;
    const backward = getLegPath('S001', 'DEPOT')!;
    expect(backward).toEqual([...forward].reverse());
    // The cached forward array is not mutated by the reversed lookup.
    expect(getLegPath('DEPOT', 'S001')).toEqual(forward);
  });

  it('is oriented in travel direction for a stop -> stop leg too', () => {
    const path = getLegPath('S002', 'S001')!;
    const s001 = stopsById.get('S001')!;
    const s002 = stopsById.get('S002')!;
    const first = { lat: path[0][0], lng: path[0][1] };
    const last = { lat: path[path.length - 1][0], lng: path[path.length - 1][1] };
    expect(haversineKm(first, s002)).toBeLessThan(0.3);
    expect(haversineKm(last, s001)).toBeLessThan(0.3);
  });

  it('returns undefined for unknown ids and for a zero-length leg', () => {
    expect(getLegPath('DEPOT', 'NOPE')).toBeUndefined();
    expect(getLegPath('S001', 'S001')).toBeUndefined();
  });

  it('covers every unordered pair of seed points (46 points -> 1035 pairs)', () => {
    const ids = ['DEPOT', ...STOPS.map((s) => s.id)];
    expect(ids).toHaveLength(46);
    let missing = 0;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        if (!getLegPath(ids[i], ids[j])) missing += 1;
      }
    }
    expect(missing).toBe(0);
  });
});
