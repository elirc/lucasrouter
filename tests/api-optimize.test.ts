import { describe, expect, it } from 'vitest';
import { getSeed } from '@/data';
import type { OptimizeResponse, Stop } from '@/lib/types';
import { POST } from '@/app/api/optimize/route';
import { GET as getSeedRoute } from '@/app/api/seed/route';
import { GET as getHealth } from '@/app/api/health/route';

// The route handlers are plain functions of a Fetch `Request`, so they can be
// exercised without a server. These tests pin the validation contract: size
// caps, unique ids, the reserved 'DEPOT' id, the "HH:MM" refine, unknown-key
// stripping, the 400 issue shape, and the seed / health GET routes.

interface ErrorBody {
  error: string;
  issues: { path: string; message: string }[];
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/optimize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

function stopLike(id: string, i: number): Stop {
  return {
    id,
    address: `${i} Test St`,
    lat: 43.1 + (i % 50) * 0.001,
    lng: -89.33 - (i % 37) * 0.001,
    recipient: 'R',
    packages: 1,
    priority: 'standard',
    serviceMinutes: 3,
    status: 'pending',
  };
}

describe('POST /api/optimize validation', () => {
  const seed = getSeed();

  it('optimizes the seed and returns an OptimizeResponse', async () => {
    const res = await post(seed);
    expect(res.status).toBe(200);
    const json = (await res.json()) as OptimizeResponse;
    expect(json.algorithm).toBe('nn-2opt-v1');
    expect(json.routes).toHaveLength(3);
    expect(json.unassignedStopIds).toEqual([]);
    expect(json.metrics.timeWindowViolations).toBe(0);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await post('{not json');
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toMatch(/valid JSON/);
  });

  it('rejects duplicate stop ids', async () => {
    const stops = [...seed.stops, { ...seed.stops[0] }];
    const res = await post({ ...seed, stops });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe('Invalid OptimizeRequest');
    expect(body.issues.some((i) => i.path === 'stops' && /Duplicate stop ids: S001/.test(i.message))).toBe(true);
  });

  it('rejects duplicate driver ids', async () => {
    const drivers = [...seed.drivers, { ...seed.drivers[1] }];
    const res = await post({ ...seed, drivers });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.issues.some((i) => i.path === 'drivers' && /Duplicate driver ids: D2/.test(i.message))).toBe(true);
  });

  it("rejects the reserved stop id 'DEPOT'", async () => {
    const stops = [...seed.stops, stopLike('DEPOT', 1)];
    const res = await post({ ...seed, stops });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.issues.some((i) => i.path === 'stops.45.id' && /reserved/.test(i.message))).toBe(true);
  });

  it('caps stops at 1000 and drivers at 50', async () => {
    const tooManyStops = Array.from({ length: 1001 }, (_, i) => stopLike(`X${i}`, i));
    const res1 = await post({ ...seed, stops: tooManyStops });
    expect(res1.status).toBe(400);
    const body1 = (await res1.json()) as ErrorBody;
    expect(body1.issues.some((i) => i.path === 'stops' && /At most 1000 stops/.test(i.message))).toBe(true);

    const tooManyDrivers = Array.from({ length: 51 }, (_, i) => ({ ...seed.drivers[0], id: `Z${i}` }));
    const res2 = await post({ ...seed, drivers: tooManyDrivers });
    expect(res2.status).toBe(400);
    const body2 = (await res2.json()) as ErrorBody;
    expect(body2.issues.some((i) => i.path === 'drivers' && /At most 50 drivers/.test(i.message))).toBe(true);
  });

  it('still accepts exactly 1000 unique stops', async () => {
    const stops = Array.from({ length: 1000 }, (_, i) => stopLike(`X${i}`, i));
    // Big capacities so nothing is left unassigned and the response is trivially checkable.
    const drivers = seed.drivers.map((d) => ({ ...d, capacityPackages: 100000 }));
    const res = await post({ ...seed, drivers, stops, options: { respectTimeWindows: false } });
    expect(res.status).toBe(200);
    const json = (await res.json()) as OptimizeResponse;
    const ids = [...json.routes.flatMap((r) => r.stopIds), ...json.unassignedStopIds];
    expect(ids).toHaveLength(1000);
    expect(new Set(ids).size).toBe(1000);
  }, 60_000);
});

describe('POST /api/optimize schema details', () => {
  const seed = getSeed();

  it('returns the 400 issue shape { error, issues: [{ path, message }] } for a wrong-shaped body', async () => {
    const res = await post({ nope: 1 });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    expect(body.error).toBe('Invalid OptimizeRequest');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    for (const issue of body.issues) {
      expect(typeof issue.path).toBe('string');
      expect(typeof issue.message).toBe('string');
    }
    expect(body.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['depot', 'drivers', 'stops']));
  });

  it('rejects a non-object JSON body (array / null) with 400 and no crash', async () => {
    expect((await post([])).status).toBe(400);
    expect((await post('null')).status).toBe(400);
    expect((await post('"just a string"')).status).toBe(400);
  });

  it('validates "HH:MM" strings (format + range) on windows and shift starts', async () => {
    const badFormat = { ...seed, stops: seed.stops.map((s, i) => (i === 0 ? { ...s, timeWindow: { start: '9am', end: '11:00' } } : s)) };
    const r1 = await post(badFormat);
    expect(r1.status).toBe(400);
    const b1 = (await r1.json()) as ErrorBody;
    expect(b1.issues.some((i) => i.path === 'stops.0.timeWindow.start' && /HH:MM/.test(i.message))).toBe(true);

    const badRange = { ...seed, drivers: seed.drivers.map((d, i) => (i === 1 ? { ...d, shiftStart: '25:00' } : d)) };
    const r2 = await post(badRange);
    expect(r2.status).toBe(400);
    const b2 = (await r2.json()) as ErrorBody;
    expect(b2.issues.some((i) => i.path === 'drivers.1.shiftStart' && /0-23/.test(i.message))).toBe(true);

    // Single-digit hours are fine.
    const ok = { ...seed, drivers: seed.drivers.map((d, i) => (i === 0 ? { ...d, shiftStart: '8:00' } : d)) };
    expect((await post(ok)).status).toBe(200);
  });

  it('rejects out-of-range coordinates, negative packages and unknown enums', async () => {
    const stops = seed.stops.map((s, i) => (i === 2 ? { ...s, lat: 95, packages: -1, priority: 'urgent' } : s));
    const res = await post({ ...seed, stops });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorBody;
    const paths = body.issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['stops.2.lat', 'stops.2.packages', 'stops.2.priority']));
  });

  it('strips unknown keys instead of rejecting them, and honours options', async () => {
    const stops = seed.stops.map((s) => ({ ...s, extra: 'ignored' }));
    const res = await post({ ...seed, stops, options: { avgSpeedKmh: 64, futureFlag: true }, debug: 1 });
    expect(res.status).toBe(200);
    const json = (await res.json()) as OptimizeResponse;
    expect(res.headers.get('cache-control')).toBe('no-store');
    // Twice the speed -> markedly fewer minutes than the default-speed plan.
    const base = (await (await post(seed)).json()) as OptimizeResponse;
    expect(json.metrics.totalMinutes).toBeLessThan(base.metrics.totalMinutes);
    expect(json.routes).toHaveLength(3);
  });

  it('accepts a request without options and with an empty drivers list (everything unassigned)', async () => {
    const res = await post({ depot: seed.depot, drivers: [], stops: seed.stops.slice(0, 3) });
    expect(res.status).toBe(200);
    const json = (await res.json()) as OptimizeResponse;
    expect(json.routes).toEqual([]);
    expect(json.unassignedStopIds).toHaveLength(3);
    expect(json.metrics.stopsPerDriver).toEqual({});
  });

  it('keeps the response consistent with the OptimizeResponse contract on the seed', async () => {
    const res = await post(seed);
    const json = (await res.json()) as OptimizeResponse;
    expect(json.routes.map((r) => r.driverId)).toEqual(seed.drivers.map((d) => d.id));
    for (const r of json.routes) {
      expect(r.legs).toHaveLength(r.stopIds.length + 1);
      expect(r.legs[0]?.fromId).toBe('DEPOT');
      expect(r.legs.at(-1)?.toId).toBe('DEPOT');
      for (const id of r.stopIds) expect(r.etaByStopId[id]).toMatch(/^\d{2}:\d{2}$/);
    }
    expect(typeof json.computeMs).toBe('number');
    expect(json.metrics.stopsPerDriver).toEqual({
      D1: json.routes[0].stopIds.length,
      D2: json.routes[1].stopIds.length,
      D3: json.routes[2].stopIds.length,
    });
  });
});

describe('GET /api/seed and /api/health', () => {
  it('/api/seed returns the bundled seed with no-store caching', async () => {
    const res = await getSeedRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const json = (await res.json()) as { depot: { id: string }; drivers: unknown[]; stops: unknown[] };
    expect(json.depot.id).toBe('DEPOT');
    expect(json.drivers).toHaveLength(3);
    expect(json.stops).toHaveLength(45);
    expect(json).toEqual(getSeed()); // identical to the local fallback
  });

  it('/api/health reports ok + the deployed algorithm + a version', async () => {
    const res = await getHealth();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; algorithm: string; version: string };
    expect(json.ok).toBe(true);
    expect(json.algorithm).toBe('nn-2opt-v1');
    expect(json.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
