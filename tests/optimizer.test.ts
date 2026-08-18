import { describe, expect, it } from 'vitest';
import { getSeed } from '@/data';
import { parseHHMM } from '@/lib/time';
import type { Depot, Driver, OptimizeResponse, Route, Stop } from '@/lib/types';
import {
  ALGORITHM,
  BASELINE_ALGORITHM,
  ROAD_FACTOR,
  baseline,
  buildDistanceMatrix,
  computeMetrics,
  driveMinutes,
  estimatedRoadKm,
  haversineKm,
  optimize,
  schedule,
} from '@/lib/optimizer';
import { assignStops } from '@/lib/optimizer/assign';
import { repairTimeWindows } from '@/lib/optimizer/repair';
import { simulateEtas } from '@/lib/optimizer/schedule';
import {
  nearestNeighborOrder,
  routeDistance,
  sequenceRoute,
  twoOptImprove,
} from '@/lib/optimizer/sequence';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const CAPITOL = { lat: 43.0747, lng: -89.3842 };

/** All stop ids that appear in routes + unassigned, in order of appearance. */
function allIds(res: OptimizeResponse): string[] {
  return [...res.routes.flatMap((r) => r.stopIds), ...res.unassignedStopIds];
}

/** Assert legs form the closed chain DEPOT -> stopIds... -> DEPOT. */
function expectClosedChain(route: Route): void {
  if (route.stopIds.length === 0) {
    expect(route.legs).toEqual([]);
    return;
  }
  const expected = ['DEPOT', ...route.stopIds, 'DEPOT'];
  expect(route.legs).toHaveLength(expected.length - 1);
  route.legs.forEach((leg, i) => {
    expect(leg.fromId).toBe(expected[i]);
    expect(leg.toId).toBe(expected[i + 1]);
    expect(leg.distanceKm).toBeGreaterThanOrEqual(0);
    expect(leg.driveMinutes).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(leg.driveMinutes)).toBe(true);
  });
}

function makeStop(id: string, lat: number, lng: number, extra: Partial<Stop> = {}): Stop {
  return {
    id,
    address: `${id} Test St, Madison, WI`,
    lat,
    lng,
    recipient: `Recipient ${id}`,
    packages: 1,
    priority: 'standard',
    serviceMinutes: 5,
    status: 'pending',
    ...extra,
  };
}

function makeDriver(id: string, extra: Partial<Driver> = {}): Driver {
  return {
    id,
    name: `Driver ${id}`,
    vehicle: `Van ${id}`,
    color: '#000000',
    shiftStart: '08:00',
    capacityPackages: 60,
    ...extra,
  };
}

const TEST_DEPOT: Depot = {
  id: 'DEPOT',
  name: 'Test Depot',
  address: '1 Depot Way',
  lat: 43.1214,
  lng: -89.3305,
};

// ---------------------------------------------------------------------------
// distance
// ---------------------------------------------------------------------------

describe('haversineKm', () => {
  const seed = getSeed();

  it('Capitol Square -> depot is about 6.7 km', () => {
    const km = haversineKm(CAPITOL, seed.depot);
    expect(km).toBeGreaterThan(5.7);
    expect(km).toBeLessThan(7.7);
  });

  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(CAPITOL, CAPITOL)).toBe(0);
    expect(haversineKm(CAPITOL, seed.depot)).toBeCloseTo(haversineKm(seed.depot, CAPITOL), 12);
  });

  it('estimatedRoadKm is haversine x ROAD_FACTOR (1.3)', () => {
    expect(ROAD_FACTOR).toBe(1.3);
    const hav = haversineKm(CAPITOL, seed.depot);
    expect(estimatedRoadKm(CAPITOL, seed.depot)).toBeCloseTo(hav * 1.3, 12);
    expect(estimatedRoadKm(CAPITOL, CAPITOL)).toBe(0);
  });

  it('builds a symmetric ROAD-km matrix with a zero diagonal and depot at index 0', () => {
    const pts = [seed.depot, ...seed.stops.slice(0, 5)];
    const m = buildDistanceMatrix(pts);
    expect(m).toHaveLength(6);
    for (let i = 0; i < 6; i++) {
      expect(m[i][i]).toBe(0);
      for (let j = 0; j < 6; j++) expect(m[i][j]).toBe(m[j][i]);
    }
    expect(m[0][1]).toBeCloseTo(estimatedRoadKm(seed.depot, seed.stops[0]), 12);
    expect(m[0][1]).toBeCloseTo(haversineKm(seed.depot, seed.stops[0]) * ROAD_FACTOR, 12);
  });

  it('drive minutes are road km / speed * 60 (the road factor is already in the km)', () => {
    // 41.6 road km (= 32 straight-line km x 1.3) at 32 km/h = 78 min.
    expect(driveMinutes(41.6, 32)).toBeCloseTo(78, 9);
    expect(driveMinutes(estimatedRoadKm(CAPITOL, seed.depot), 32)).toBeCloseTo(
      (haversineKm(CAPITOL, seed.depot) * 1.3 * 60) / 32,
      9,
    );
    expect(driveMinutes(16)).toBeCloseTo(30, 9); // default speed 32
    expect(driveMinutes(0)).toBe(0);
    expect(driveMinutes(10, 0)).toBe(0); // invalid speed -> 0, never Infinity
  });
});

// ---------------------------------------------------------------------------
// sequencing
// ---------------------------------------------------------------------------

describe('2-opt', () => {
  const seed = getSeed();
  const matrix = buildDistanceMatrix([seed.depot, ...seed.stops]);
  const all = seed.stops.map((_, i) => i + 1);

  it('never increases route distance versus nearest-neighbour input', () => {
    const subsets = [all.slice(0, 10), all.slice(10, 25), all.slice(20, 45), all];
    for (const subset of subsets) {
      const nn = nearestNeighborOrder(matrix, 0, subset);
      const improved = twoOptImprove(nn, matrix, 0);
      expect(improved).toHaveLength(nn.length);
      expect([...improved].sort()).toEqual([...nn].sort());
      expect(routeDistance(improved, matrix, 0)).toBeLessThanOrEqual(
        routeDistance(nn, matrix, 0) + 1e-9,
      );
    }
  });

  it('substantially improves deliberately bad orders', () => {
    const bad = [all.slice(0, 15), [...all.slice(0, 15)].reverse(), all.filter((i) => i % 3 === 0)];
    // Interleave far-apart stops to make it worse.
    const zig: number[] = [];
    for (let i = 0; i < 12; i++) zig.push(i % 2 === 0 ? all[i] : all[all.length - 1 - i]);
    bad.push(zig);
    for (const order of bad) {
      const before = routeDistance(order, matrix, 0);
      const after = routeDistance(twoOptImprove(order, matrix, 0), matrix, 0);
      expect(after).toBeLessThanOrEqual(before + 1e-9);
      expect(after).toBeLessThan(before); // these are bad enough that a gain must exist
    }
  });

  it('handles trivial orders', () => {
    expect(twoOptImprove([], matrix, 0)).toEqual([]);
    expect(twoOptImprove([3], matrix, 0)).toEqual([3]);
    expect(twoOptImprove([3, 4], matrix, 0)).toEqual([3, 4]);
    expect(routeDistance([], matrix, 0)).toBe(0);
    expect(nearestNeighborOrder(matrix, 0, [])).toEqual([]);
  });

  it('does not mutate its input', () => {
    const order = all.slice(0, 8);
    const copy = order.slice();
    twoOptImprove(order, matrix, 0);
    expect(order).toEqual(copy);
  });

  it('nearest neighbour visits the closest stop first', () => {
    const order = nearestNeighborOrder(matrix, 0, all);
    const closest = all.reduce((best, i) => (matrix[0][i] < matrix[0][best] ? i : best), all[0]);
    expect(order[0]).toBe(closest);
    expect(new Set(order).size).toBe(all.length);
  });

  it('sequenceRoute keeps the same set of stops', () => {
    const order = sequenceRoute(matrix, 0, all.slice(5, 20));
    expect([...order].sort()).toEqual(all.slice(5, 20).sort());
  });
});

// ---------------------------------------------------------------------------
// optimize() on the seed
// ---------------------------------------------------------------------------

describe('optimize() on the seed dataset', () => {
  const seed = getSeed();
  const res = optimize(seed);
  const base = baseline(seed);

  it('reports the algorithm and a sane compute time', () => {
    expect(res.algorithm).toBe(ALGORITHM);
    expect(ALGORITHM).toBe('nn-2opt-v1');
    expect(base.algorithm).toBe(BASELINE_ALGORITHM);
    expect(res.computeMs).toBeGreaterThanOrEqual(0);
    expect(res.computeMs).toBeLessThan(1500);
  });

  it('places every one of the 45 stops exactly once, none unassigned', () => {
    const ids = allIds(res);
    expect(ids).toHaveLength(45);
    expect(new Set(ids).size).toBe(45);
    expect([...ids].sort()).toEqual(seed.stops.map((s) => s.id).sort());
    expect(res.unassignedStopIds).toEqual([]);
  });

  it('returns 3 routes in driver order', () => {
    expect(res.routes.map((r) => r.driverId)).toEqual(seed.drivers.map((d) => d.id));
  });

  it('respects capacity per driver', () => {
    const byId = new Map(seed.stops.map((s) => [s.id, s]));
    res.routes.forEach((r, i) => {
      const load = r.stopIds.reduce((sum, id) => sum + (byId.get(id)?.packages ?? 0), 0);
      expect(load).toBeLessThanOrEqual(seed.drivers[i].capacityPackages);
    });
  });

  it('balances stop counts to within 3', () => {
    const counts = res.routes.map((r) => r.stopIds.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
    expect(res.metrics.stopsPerDriver).toEqual({
      D1: counts[0],
      D2: counts[1],
      D3: counts[2],
    });
  });

  it('legs form a closed depot chain matching stopIds', () => {
    for (const r of res.routes) expectClosedChain(r);
  });

  it('gives every assigned stop an ETA and rounds outputs', () => {
    for (const r of res.routes) {
      for (const id of r.stopIds) {
        expect(r.etaByStopId[id]).toMatch(/^\d{2}:\d{2}$/);
      }
      expect(Object.keys(r.etaByStopId).sort()).toEqual([...r.stopIds].sort());
      expect(Number.isInteger(r.totalMinutes)).toBe(true);
      expect(Math.round(r.totalDistanceKm * 100) / 100).toBe(r.totalDistanceKm);
    }
  });

  it('reports leg / route km as estimated road km (haversine x 1.3)', () => {
    const byId = new Map(seed.stops.map((s) => [s.id, s]));
    const pointOf = (id: string) => (id === 'DEPOT' ? seed.depot : byId.get(id)!);
    for (const r of res.routes) {
      let sum = 0;
      for (const leg of r.legs) {
        const hav = haversineKm(pointOf(leg.fromId), pointOf(leg.toId));
        expect(leg.distanceKm).toBeCloseTo(hav * ROAD_FACTOR, 2);
        expect(leg.distanceKm).toBeGreaterThan(hav); // never shorter than the crow flies
        // drive minutes are the same road km at 32 km/h, rounded to the minute
        expect(leg.driveMinutes).toBe(Math.round(((hav * ROAD_FACTOR) / 32) * 60));
        sum += hav * ROAD_FACTOR;
      }
      expect(r.totalDistanceKm).toBeCloseTo(sum, 1);
    }
  });

  it('metrics.totalDistanceKm equals the sum of route totals', () => {
    const sum = res.routes.reduce((a, r) => a + r.totalDistanceKm, 0);
    expect(Math.abs(res.metrics.totalDistanceKm - sum)).toBeLessThan(0.05);
    const minutes = res.routes.reduce((a, r) => a + r.totalMinutes, 0);
    expect(res.metrics.totalMinutes).toBe(minutes);
    expect(res.metrics.longestRouteMinutes).toBe(Math.max(...res.routes.map((r) => r.totalMinutes)));
  });

  it('beats the round-robin baseline on distance', () => {
    expect(res.metrics.totalDistanceKm).toBeLessThan(base.metrics.totalDistanceKm);
    // Sanity: the improvement should be substantial for a demo.
    expect(res.metrics.totalDistanceKm).toBeLessThan(base.metrics.totalDistanceKm * 0.8);
  });

  it('reports non-negative time-window violations (and no more than the baseline)', () => {
    expect(res.metrics.timeWindowViolations).toBeGreaterThanOrEqual(0);
    expect(res.metrics.timeWindowViolations).toBeLessThanOrEqual(base.metrics.timeWindowViolations);
  });

  it('meets every window on the seed and does not idle mid-route for hours', () => {
    expect(res.metrics.timeWindowViolations).toBe(0);
    // Each driver owns one 13:00-15:00 stop, so some waiting is intrinsic to the
    // data - but the repair pass must push it to the tail instead of parking the
    // driver at 09:20 with deliverable stops left. Before the later-pass existed
    // the seed came out at 1136 total minutes / 408 longest.
    expect(res.metrics.totalMinutes).toBeLessThanOrEqual(1100);
    expect(res.metrics.longestRouteMinutes).toBeLessThanOrEqual(400);

    const byId = new Map(seed.stops.map((s) => [s.id, s]));
    for (const r of res.routes) {
      const driver = seed.drivers.find((d) => d.id === r.driverId)!;
      const routeStops = r.stopIds.map((id) => byId.get(id)!);
      const sim = simulateEtas(
        parseHHMM(driver.shiftStart),
        routeStops,
        r.legs.map((l) => l.driveMinutes),
      );
      // Every stop WITHOUT a window that comes after a long wait would have been
      // deliverable before that wait -> the later-pass must have moved it up.
      // Concretely: no un-windowed stop may be scheduled after a wait > 60 min.
      let longWaitSeen = false;
      routeStops.forEach((stop, i) => {
        if (sim.steps[i].waitMin > 60) longWaitSeen = true;
        else if (longWaitSeen) expect(stop.timeWindow).toBeDefined();
      });
    }
  });

  it('is deterministic', () => {
    const again = optimize(getSeed());
    expect(again.routes).toEqual(res.routes);
    expect(again.unassignedStopIds).toEqual(res.unassignedStopIds);
    expect(again.metrics).toEqual(res.metrics);
  });

  it('does not depend on stop status', () => {
    const mutated = getSeed();
    mutated.stops[0].status = 'delivered';
    mutated.stops[1].status = 'failed';
    const again = optimize(mutated);
    expect(again.routes.map((r) => r.stopIds)).toEqual(res.routes.map((r) => r.stopIds));
  });

  it('works when options are omitted or partial', () => {
    const noTw = optimize({ ...getSeed(), options: { respectTimeWindows: false } });
    expect(allIds(noTw)).toHaveLength(45);
    const slow = optimize({ ...getSeed(), options: { avgSpeedKmh: 16 } });
    expect(slow.metrics.totalMinutes).toBeGreaterThan(res.metrics.totalMinutes);
    const unbalanced = optimize({ ...getSeed(), options: { balanceLoad: false } });
    expect(allIds(unbalanced)).toHaveLength(45);
  });
});

// ---------------------------------------------------------------------------
// baseline()
// ---------------------------------------------------------------------------

describe('baseline()', () => {
  const seed = getSeed();
  const base = baseline(seed);

  it('is round-robin in file order with no sequencing', () => {
    expect(base.routes).toHaveLength(3);
    base.routes.forEach((r, d) => {
      const expected = seed.stops.filter((_, i) => i % 3 === d).map((s) => s.id);
      expect(r.stopIds).toEqual(expected);
      expectClosedChain(r);
    });
    expect(base.unassignedStopIds).toEqual([]);
    expect(base.algorithm).toBe('baseline-round-robin-v1');
  });
});

// ---------------------------------------------------------------------------
// schedule()
// ---------------------------------------------------------------------------

describe('schedule()', () => {
  const seed = getSeed();
  const res = optimize(seed);
  const assignments: Record<string, string[]> = Object.fromEntries(
    res.routes.map((r) => [r.driverId, r.stopIds]),
  );

  it('reproduces the optimizer routes from the same assignments', () => {
    const out = schedule({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops, assignments });
    expect(out.routes).toEqual(res.routes);
    expect(out.metrics).toEqual(res.metrics);
    expect(computeMetrics(out.routes, seed.stops)).toEqual(res.metrics);
  });

  it('moving a stop between drivers changes only those two routes', () => {
    const moved = structuredClone(assignments);
    const stopId = moved.D1[moved.D1.length - 1];
    moved.D1 = moved.D1.filter((id) => id !== stopId);
    moved.D3 = [...moved.D3, stopId];
    const out = schedule({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops, assignments: moved });
    expect(out.routes[1]).toEqual(res.routes[1]); // D2 untouched
    expect(out.routes[0].stopIds).not.toContain(stopId);
    expect(out.routes[2].stopIds).toContain(stopId);
    expect(out.routes[2].etaByStopId[stopId]).toMatch(/^\d{2}:\d{2}$/);
    expectClosedChain(out.routes[0]);
    expectClosedChain(out.routes[2]);
    expect(out.metrics.stopsPerDriver).toEqual({
      D1: res.routes[0].stopIds.length - 1,
      D2: res.routes[1].stopIds.length,
      D3: res.routes[2].stopIds.length + 1,
    });
  });

  it('produces monotonic ETAs within a route', () => {
    for (const r of res.routes) {
      let prev = parseHHMM(seed.drivers.find((d) => d.id === r.driverId)!.shiftStart);
      for (const id of r.stopIds) {
        const eta = parseHHMM(r.etaByStopId[id]);
        expect(eta).toBeGreaterThanOrEqual(prev);
        prev = eta;
      }
    }
  });

  it('waits at a time window instead of arriving early (not a violation)', () => {
    // One stop 1 km from the depot (~2.4 min drive) with a 10:00 window.
    const stop = makeStop('W1', TEST_DEPOT.lat + 0.009, TEST_DEPOT.lng, {
      timeWindow: { start: '10:00', end: '11:00' },
      serviceMinutes: 5,
    });
    const after = makeStop('W2', TEST_DEPOT.lat + 0.018, TEST_DEPOT.lng);
    const driver = makeDriver('D1', { shiftStart: '08:00' });
    const out = schedule({
      depot: TEST_DEPOT,
      drivers: [driver],
      stops: [stop, after],
      assignments: { D1: ['W1', 'W2'] },
    });
    const route = out.routes[0];
    expect(route.etaByStopId.W1).toBe('10:00');
    // W2 is reached after the wait + service + a short drive.
    expect(parseHHMM(route.etaByStopId.W2)).toBeGreaterThanOrEqual(parseHHMM('10:05'));
    expect(out.metrics.timeWindowViolations).toBe(0);
    // Waiting counts toward the route duration.
    expect(route.totalMinutes).toBeGreaterThan(120);
  });

  it('counts a late arrival as a violation', () => {
    const stop = makeStop('L1', TEST_DEPOT.lat + 0.009, TEST_DEPOT.lng, {
      timeWindow: { start: '07:00', end: '07:30' },
    });
    const out = schedule({
      depot: TEST_DEPOT,
      drivers: [makeDriver('D1', { shiftStart: '08:00' })],
      stops: [stop],
      assignments: { D1: ['L1'] },
    });
    expect(out.metrics.timeWindowViolations).toBe(1);
  });

  it('handles empty stops', () => {
    const out = schedule({
      depot: TEST_DEPOT,
      drivers: seed.drivers,
      stops: [],
      assignments: { D1: [], D2: [], D3: [] },
    });
    expect(out.routes).toHaveLength(3);
    for (const r of out.routes) {
      expect(r).toEqual({
        driverId: r.driverId,
        stopIds: [],
        legs: [],
        totalDistanceKm: 0,
        totalMinutes: 0,
        etaByStopId: {},
      });
    }
    expect(out.metrics).toEqual({
      totalDistanceKm: 0,
      totalMinutes: 0,
      stopsPerDriver: { D1: 0, D2: 0, D3: 0 },
      longestRouteMinutes: 0,
      timeWindowViolations: 0,
    });
  });

  it('tolerates missing keys and unknown stop ids', () => {
    const out = schedule({
      depot: seed.depot,
      drivers: seed.drivers,
      stops: seed.stops,
      assignments: { D1: ['S001', 'NOPE', 'S002', 'S001'] },
    });
    expect(out.routes[0].stopIds).toEqual(['S001', 'S002']);
    expect(out.routes[1].stopIds).toEqual([]);
    expect(out.routes[2].legs).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// edge cases through optimize()
// ---------------------------------------------------------------------------

describe('optimize() edge cases', () => {
  const seed = getSeed();

  it('handles zero stops', () => {
    const res = optimize({ ...seed, stops: [] });
    expect(res.routes).toHaveLength(3);
    for (const r of res.routes) expect(r.stopIds).toEqual([]);
    expect(res.unassignedStopIds).toEqual([]);
    expect(res.metrics.totalDistanceKm).toBe(0);
  });

  it('handles a single driver (gets everything, sequenced)', () => {
    // The seed carries 118 packages, so lift the cap for a one-van scenario.
    const solo = { ...seed.drivers[0], capacityPackages: 200 };
    const res = optimize({ ...seed, drivers: [solo] });
    expect(res.routes).toHaveLength(1);
    expect(res.routes[0].stopIds).toHaveLength(45);
    expect(res.unassignedStopIds).toEqual([]);
    expectClosedChain(res.routes[0]);
    // A single sequenced route must beat the same stops in file order.
    const naive = schedule({
      depot: seed.depot,
      drivers: [solo],
      stops: seed.stops,
      assignments: { D1: seed.stops.map((s) => s.id) },
    });
    expect(res.routes[0].totalDistanceKm).toBeLessThan(naive.routes[0].totalDistanceKm);
  });

  it('a single driver at seed capacity (60 of 118 packages) leaves the rest unassigned', () => {
    const res = optimize({ ...seed, drivers: [seed.drivers[0]] });
    const byId = new Map(seed.stops.map((s) => [s.id, s]));
    const load = res.routes[0].stopIds.reduce((sum, id) => sum + byId.get(id)!.packages, 0);
    expect(load).toBeLessThanOrEqual(60);
    expect(res.unassignedStopIds.length).toBeGreaterThan(0);
    expect(allIds(res)).toHaveLength(45);
  });

  it('handles zero drivers (everything unassigned)', () => {
    const res = optimize({ ...seed, drivers: [] });
    expect(res.routes).toEqual([]);
    expect(res.unassignedStopIds).toEqual(seed.stops.map((s) => s.id));
    expect(res.metrics.totalDistanceKm).toBe(0);
    expect(res.metrics.stopsPerDriver).toEqual({});
    const base = baseline({ ...seed, drivers: [] });
    expect(base.routes).toEqual([]);
    expect(base.unassignedStopIds).toEqual(seed.stops.map((s) => s.id));
  });

  it('handles more drivers than stops', () => {
    const res = optimize({
      depot: seed.depot,
      drivers: [makeDriver('A'), makeDriver('B'), makeDriver('C'), makeDriver('D')],
      stops: seed.stops.slice(0, 2),
    });
    expect(res.routes.map((r) => r.driverId)).toEqual(['A', 'B', 'C', 'D']);
    expect(allIds(res).sort()).toEqual(['S001', 'S002']);
    expect(res.unassignedStopIds).toEqual([]);
  });

  it('leaves stops unassigned when capacity is exhausted', () => {
    const drivers = [makeDriver('A', { capacityPackages: 5 }), makeDriver('B', { capacityPackages: 5 })];
    const res = optimize({ depot: seed.depot, drivers, stops: seed.stops });
    const byId = new Map(seed.stops.map((s) => [s.id, s]));
    for (const r of res.routes) {
      const load = r.stopIds.reduce((sum, id) => sum + byId.get(id)!.packages, 0);
      expect(load).toBeLessThanOrEqual(5);
    }
    expect(res.unassignedStopIds.length).toBeGreaterThan(0);
    expect(allIds(res)).toHaveLength(45);
    expect(new Set(allIds(res)).size).toBe(45);
  });

  it('a stop heavier than every van is unassigned', () => {
    const heavy = makeStop('HEAVY', 43.08, -89.4, { packages: 99 });
    const res = optimize({ depot: seed.depot, drivers: seed.drivers, stops: [heavy, ...seed.stops] });
    expect(res.unassignedStopIds).toEqual(['HEAVY']);
    expect(allIds(res)).toHaveLength(46);
  });
});

// ---------------------------------------------------------------------------
// assignStops() and repair directly
// ---------------------------------------------------------------------------

describe('assignStops()', () => {
  const seed = getSeed();

  it('is a function of geometry only and has a key for every driver', () => {
    const a = assignStops(seed.depot, seed.drivers, seed.stops);
    const b = assignStops(seed.depot, seed.drivers, structuredClone(seed.stops).map((s) => ({ ...s, status: 'delivered' as const })));
    expect(a).toEqual(b);
    expect(Object.keys(a.assignments).sort()).toEqual(['D1', 'D2', 'D3']);
  });

  it('respects balanceLoad=false by not forcing counts together', () => {
    const balanced = assignStops(seed.depot, seed.drivers, seed.stops, { balanceLoad: true });
    const counts = Object.values(balanced.assignments).map((a) => a.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(3);
    const free = assignStops(seed.depot, seed.drivers, seed.stops, { balanceLoad: false });
    expect(Object.values(free.assignments).flat()).toHaveLength(45);
  });
});

describe('repairTimeWindows()', () => {
  it('pulls a late stop earlier and reduces violations', () => {
    // Three stops in a line north of the depot; the farthest has an early window
    // that a distance-only order (near -> far) would miss.
    const s1 = makeStop('A', TEST_DEPOT.lat + 0.02, TEST_DEPOT.lng, { serviceMinutes: 30 });
    const s2 = makeStop('B', TEST_DEPOT.lat + 0.04, TEST_DEPOT.lng, { serviceMinutes: 30 });
    const s3 = makeStop('C', TEST_DEPOT.lat + 0.06, TEST_DEPOT.lng, {
      serviceMinutes: 5,
      timeWindow: { start: '08:00', end: '08:30' },
    });
    const stops = [s1, s2, s3];
    const matrix = buildDistanceMatrix([TEST_DEPOT, ...stops]);
    const ctx = { matrix, depotIndex: 0, stops, shiftStartMin: parseHHMM('08:00'), avgSpeedKmh: 32 };
    const distanceOnly = sequenceRoute(matrix, 0, [1, 2, 3]);
    expect(distanceOnly).toEqual([1, 2, 3]);
    const repaired = repairTimeWindows(distanceOnly, ctx);
    expect(repaired.violations).toBe(0);
    expect(repaired.order[0]).toBe(3);
    expect([...repaired.order].sort()).toEqual([1, 2, 3]);
  });

  it('pushes a stop that would idle at a closed window to the tail (later pass)', () => {
    // Three window-free stops in a line north of the depot plus one stop with an
    // afternoon window sitting right next to the depot, so nearest-neighbour
    // visits it FIRST at ~08:01 and would then wait until 13:00 with three
    // deliverable stops still on the van.
    const win = makeStop('W', TEST_DEPOT.lat + 0.005, TEST_DEPOT.lng, {
      timeWindow: { start: '13:00', end: '15:00' },
    });
    const a = makeStop('A', TEST_DEPOT.lat + 0.01, TEST_DEPOT.lng);
    const b = makeStop('B', TEST_DEPOT.lat + 0.02, TEST_DEPOT.lng);
    const c = makeStop('C', TEST_DEPOT.lat + 0.03, TEST_DEPOT.lng);
    const stops = [win, a, b, c];
    const matrix = buildDistanceMatrix([TEST_DEPOT, ...stops]);
    const ctx = { matrix, depotIndex: 0, stops, shiftStartMin: parseHHMM('08:00'), avgSpeedKmh: 32 };

    const distanceOnly = sequenceRoute(matrix, 0, [1, 2, 3, 4]);
    expect(distanceOnly[0]).toBe(1); // W is visited first by NN + 2-opt

    const legMin = (order: number[]) => {
      const out: number[] = [];
      let prev = 0;
      for (const i of order) {
        out.push(driveMinutes(matrix[prev][i], 32));
        prev = i;
      }
      out.push(driveMinutes(matrix[prev][0], 32));
      return out;
    };
    const before = simulateEtas(480, distanceOnly.map((i) => stops[i - 1]), legMin(distanceOnly));
    expect(before.steps[0].waitMin).toBeGreaterThan(200); // idles ~5 h at W

    const repaired = repairTimeWindows(distanceOnly, ctx);
    expect(repaired.violations).toBe(0);
    expect([...repaired.order].sort()).toEqual([1, 2, 3, 4]);
    expect(repaired.order[repaired.order.length - 1]).toBe(1); // W is now last
    const after = simulateEtas(480, repaired.order.map((i) => stops[i - 1]), legMin(repaired.order));
    expect(after.depotArrivalMin).toBeLessThan(before.depotArrivalMin);
    // A, B, C are delivered in the morning; W exactly at its window start.
    for (let i = 0; i < 3; i++) expect(after.steps[i].arrivalMin).toBeLessThan(parseHHMM('09:00'));
    expect(after.steps[3].arrivalMin).toBe(parseHHMM('13:00'));
  });

  it('is a no-op when nothing is late and nobody waits', () => {
    const seed = getSeed();
    const stops = seed.stops.slice(0, 6).map((s) => ({ ...s, timeWindow: undefined }));
    const matrix = buildDistanceMatrix([seed.depot, ...stops]);
    const ctx = { matrix, depotIndex: 0, stops, shiftStartMin: 480, avgSpeedKmh: 32 };
    const order = sequenceRoute(matrix, 0, [1, 2, 3, 4, 5, 6]);
    expect(repairTimeWindows(order, ctx)).toEqual({ order, violations: 0 });
  });

  it('is deterministic and keeps the stop multiset on every seed route', () => {
    const seed = getSeed();
    const matrix = buildDistanceMatrix([seed.depot, ...seed.stops]);
    const { assignments } = assignStops(seed.depot, seed.drivers, seed.stops);
    const indexOf = new Map(seed.stops.map((s, i) => [s.id, i + 1]));
    for (const driver of seed.drivers) {
      const idx = assignments[driver.id].map((id) => indexOf.get(id)!);
      const ctx = {
        matrix,
        depotIndex: 0,
        stops: seed.stops,
        shiftStartMin: parseHHMM(driver.shiftStart),
        avgSpeedKmh: 32,
      };
      const order = sequenceRoute(matrix, 0, idx);
      const r1 = repairTimeWindows(order, ctx);
      const r2 = repairTimeWindows(order, ctx);
      expect(r1).toEqual(r2);
      expect([...r1.order].sort()).toEqual([...order].sort());
      expect(r1.violations).toBe(0);
    }
  });
});
