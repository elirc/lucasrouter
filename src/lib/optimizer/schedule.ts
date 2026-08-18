// Stage 4 of the optimizer AND the piece the UI re-runs on its own: turn an
// ordered assignment (driverId -> stopIds) into concrete `Route` objects with
// legs, ETAs, totals and aggregate `RouteMetrics`.
//
// `schedule()` is pure and fast (< 1 ms for the seed). The store calls it
// directly after a manual drag-and-drop reassignment, so nothing in here may
// depend on the assignment / sequencing stages.
//
// ETA rules (mirrored in docs/ALGORITHM_INTEGRATION.md):
//   * clock starts at `driver.shiftStart`;
//   * arrival = previous departure + drive minutes for the leg;
//   * arriving before `timeWindow.start` means the driver WAITS: arrival is
//     clamped to the window start (not a violation);
//   * arriving (rounded to the minute, as displayed) strictly after
//     `timeWindow.end` IS a violation;
//   * departure = arrival + serviceMinutes;
//   * the last leg returns to the depot; `totalMinutes` = depot arrival - shift
//     start, i.e. drive + service + waiting;
//   * ETAs are "HH:MM" on the shift day's clock and keep counting past
//     midnight ("25:13"), so they stay monotonic and comparable to the windows.
//
// Distances: every km here is ESTIMATED ROAD km (`estimatedRoadKm` = haversine
// x ROAD_FACTOR, see distance.ts); drive minutes = road km / avgSpeedKmh * 60.

import type {
  Depot,
  Driver,
  OptimizeOptions,
  Route,
  RouteLeg,
  RouteMetrics,
  Stop,
} from '@/lib/types';
import { formatHHMM, parseHHMM } from '@/lib/time';
import { driveMinutes, estimatedRoadKm } from './distance';
import { resolveOptions } from './types';

export interface ScheduleInput {
  depot: Depot;
  drivers: Driver[];
  /** ALL stops (used as a lookup by id); stops not in any assignment are ignored. */
  stops: Stop[];
  /** driverId -> ORDERED stopIds. Missing keys / unknown ids are tolerated. */
  assignments: Record<string, string[]>;
  /** avgSpeedKmh default 32; distances are haversine x 1.3 (estimated road km). */
  options?: OptimizeOptions;
}

export interface ScheduleOutput {
  routes: Route[];
  metrics: RouteMetrics;
}

/** Per-stop result of `simulateEtas` (minutes since midnight, unrounded). */
export interface EtaStep {
  /** Arrival after any wait for the window to open. */
  arrivalMin: number;
  /** Minutes spent waiting for the window to open (0 if none). */
  waitMin: number;
  /** Arrival + service. */
  departureMin: number;
  /** True when the rounded arrival is strictly after `timeWindow.end`. */
  late: boolean;
}

export interface EtaSimulation {
  steps: EtaStep[];
  /** Arrival back at the depot (equals `shiftStartMin` when there are no stops). */
  depotArrivalMin: number;
  /** Number of late stops. */
  violations: number;
}

/**
 * Pre-parsed timing facts of one stop, so hot loops (the repair pass evaluates
 * thousands of candidate orders) do not re-parse "HH:MM" strings every time.
 */
export interface StopTiming {
  /** Window open/close in minutes since midnight, or null when the stop has no window. */
  window: { start: number; end: number } | null;
  serviceMinutes: number;
}

/** Extract the timing facts of a stop (see `StopTiming`). */
export function stopTiming(stop: Stop): StopTiming {
  return {
    window: stop.timeWindow
      ? { start: parseHHMM(stop.timeWindow.start), end: parseHHMM(stop.timeWindow.end) }
      : null,
    serviceMinutes: stop.serviceMinutes,
  };
}

/**
 * Walk one route and compute arrival / departure times. `legMinutes` must have
 * `stops.length + 1` entries (the last one is the return to the depot), or be
 * empty when there are no stops. Shared by `schedule()` and the time-window
 * repair pass so both agree on what "late" means.
 */
export function simulateEtas(shiftStartMin: number, stops: Stop[], legMinutes: number[]): EtaSimulation {
  return simulateTimings(shiftStartMin, stops.map(stopTiming), legMinutes);
}

/**
 * `simulateEtas` on pre-parsed timings (the single source of truth for the ETA
 * rules listed in the file header).
 */
export function simulateTimings(
  shiftStartMin: number,
  timings: StopTiming[],
  legMinutes: number[],
): EtaSimulation {
  const steps: EtaStep[] = [];
  let clock = shiftStartMin;
  let violations = 0;
  if (timings.length === 0) {
    return { steps, depotArrivalMin: shiftStartMin, violations: 0 };
  }
  for (let i = 0; i < timings.length; i++) {
    const { window, serviceMinutes } = timings[i];
    let arrival = clock + legMinutes[i];
    let wait = 0;
    let late = false;
    if (window) {
      if (arrival < window.start) {
        wait = window.start - arrival;
        arrival = window.start;
      }
      // Compare on the minute we will actually display so metrics match the UI.
      if (Math.round(arrival) > window.end) late = true;
    }
    if (late) violations++;
    const departure = arrival + serviceMinutes;
    steps.push({ arrivalMin: arrival, waitMin: wait, departureMin: departure, late });
    clock = departure;
  }
  const depotArrivalMin = clock + legMinutes[timings.length];
  return { steps, depotArrivalMin, violations };
}

/** Round to 2 decimals (km) without the usual `toFixed` string round-trip. */
const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * Build routes + metrics for the given ordered assignments. Always returns one
 * `Route` per driver, in `drivers` order; a driver with no stops gets an empty
 * route (`stopIds: []`, `legs: []`, totals 0, `etaByStopId: {}`).
 */
export function schedule(input: ScheduleInput): ScheduleOutput {
  const { depot, drivers, stops, assignments } = input;
  const opts = resolveOptions(input.options);
  const stopsById = new Map<string, Stop>();
  for (const s of stops) stopsById.set(s.id, s);

  const routes: Route[] = drivers.map((driver) => {
    // Defensive: tolerate missing keys and unknown / duplicate stop ids.
    const seen = new Set<string>();
    const routeStops: Stop[] = [];
    for (const id of assignments[driver.id] ?? []) {
      const s = stopsById.get(id);
      if (s && !seen.has(id)) {
        seen.add(id);
        routeStops.push(s);
      }
    }
    return buildRoute(depot, driver, routeStops, opts.avgSpeedKmh);
  });

  return { routes, metrics: computeMetrics(routes, stops) };
}

/** Build a single driver's route from an ordered list of stop objects. */
function buildRoute(depot: Depot, driver: Driver, routeStops: Stop[], avgSpeedKmh: number): Route {
  if (routeStops.length === 0) {
    return {
      driverId: driver.id,
      stopIds: [],
      legs: [],
      totalDistanceKm: 0,
      totalMinutes: 0,
      etaByStopId: {},
    };
  }

  const shiftStartMin = parseHHMM(driver.shiftStart);
  const points = [depot, ...routeStops, depot];
  const legKm: number[] = [];
  const legMin: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const km = estimatedRoadKm(points[i], points[i + 1]); // road km, not straight-line
    legKm.push(km);
    legMin.push(driveMinutes(km, avgSpeedKmh));
  }

  const sim = simulateEtas(shiftStartMin, routeStops, legMin);

  const legs: RouteLeg[] = [];
  const idAt = (i: number): string => (i === 0 || i === points.length - 1 ? 'DEPOT' : routeStops[i - 1].id);
  for (let i = 0; i < points.length - 1; i++) {
    legs.push({
      fromId: idAt(i),
      toId: idAt(i + 1),
      distanceKm: round2(legKm[i]),
      driveMinutes: Math.round(legMin[i]),
    });
  }

  const etaByStopId: Record<string, string> = {};
  routeStops.forEach((s, i) => {
    etaByStopId[s.id] = formatHHMM(sim.steps[i].arrivalMin);
  });

  return {
    driverId: driver.id,
    stopIds: routeStops.map((s) => s.id),
    legs,
    totalDistanceKm: round2(legKm.reduce((a, b) => a + b, 0)),
    totalMinutes: Math.round(sim.depotArrivalMin - shiftStartMin),
    etaByStopId,
  };
}

/**
 * Aggregate metrics over a set of routes. Time-window violations are derived
 * from the `etaByStopId` strings (arrival strictly after `timeWindow.end`), so
 * this can be recomputed by anyone holding routes + stops. Because ETAs do not
 * wrap at midnight ("25:13"), a next-day arrival correctly counts as late.
 */
export function computeMetrics(routes: Route[], stops: Stop[]): RouteMetrics {
  const stopsById = new Map<string, Stop>();
  for (const s of stops) stopsById.set(s.id, s);

  let totalDistanceKm = 0;
  let totalMinutes = 0;
  let longestRouteMinutes = 0;
  let timeWindowViolations = 0;
  const stopsPerDriver: Record<string, number> = {};

  for (const route of routes) {
    totalDistanceKm += route.totalDistanceKm;
    totalMinutes += route.totalMinutes;
    longestRouteMinutes = Math.max(longestRouteMinutes, route.totalMinutes);
    stopsPerDriver[route.driverId] = route.stopIds.length;
    for (const id of route.stopIds) {
      const stop = stopsById.get(id);
      const eta = route.etaByStopId[id];
      if (!stop?.timeWindow || eta === undefined) continue;
      if (parseHHMM(eta) > parseHHMM(stop.timeWindow.end)) timeWindowViolations++;
    }
  }

  return {
    totalDistanceKm: round2(totalDistanceKm),
    totalMinutes: Math.round(totalMinutes),
    stopsPerDriver,
    longestRouteMinutes: Math.round(longestRouteMinutes),
    timeWindowViolations,
  };
}
