// RouteIQ placeholder optimizer - public entry point.
//
// To plug in the production algorithm, replace the body of `optimize()` (or
// call out to a Python function) while preserving the
// `OptimizeRequest -> OptimizeResponse` contract. Set `algorithm` to your
// version string. See docs/ALGORITHM_INTEGRATION.md for the field-by-field
// contract, invariants and a Python serverless example.
//
// Pipeline of the placeholder ("nn-2opt-v1"):
//   1. distance matrix   - haversine km, index 0 = depot            (distance.ts)
//   2. assignment        - angle-seeded k-means + capacity/balance   (assign.ts)
//   3. sequencing        - nearest neighbour + 2-opt per driver      (sequence.ts)
//   4. time-window repair - pull late stops earlier                  (repair.ts)
//   5. schedule          - legs, ETAs, totals, metrics               (schedule.ts)
//
// The whole thing is pure, deterministic and runs in a few milliseconds for
// 45 stops / 3 drivers.

import type { OptimizeRequest, OptimizeResponse } from '@/lib/types';
import { parseHHMM } from '@/lib/time';
import { assignStops } from './assign';
import { baseline, BASELINE_ALGORITHM, roundMs } from './baseline';
import { buildDistanceMatrix } from './distance';
import { repairTimeWindows } from './repair';
import { schedule } from './schedule';
import { sequenceRoute } from './sequence';
import { resolveOptions } from './types';
import type { RouteContext } from './types';

/** Version string reported in `OptimizeResponse.algorithm`. */
export const ALGORITHM = 'nn-2opt-v1';

export { BASELINE_ALGORITHM, baseline };
export { schedule, computeMetrics } from './schedule';
export type { ScheduleInput, ScheduleOutput } from './schedule';

// Handy primitives for other modules (map helpers, scripts). Not required by
// the contract, but stable.
export { haversineKm, buildDistanceMatrix, driveMinutes, ROAD_FACTOR, DEFAULT_SPEED_KMH } from './distance';
export { assignStops } from './assign';

/**
 * Full placeholder optimisation. Every stop in `req.stops` ends up exactly once
 * in either a route or `unassignedStopIds`; `routes` has one entry per driver
 * in input order. Never throws for structurally valid input.
 */
export function optimize(req: OptimizeRequest): OptimizeResponse {
  const t0 = performance.now();
  const { depot, drivers, stops } = req;
  const opts = resolveOptions(req.options);

  // 1. Distance matrix over [depot, ...stops]; matrix index i (>= 1) is stops[i - 1].
  const matrix = buildDistanceMatrix([depot, ...stops]);
  const matrixIndexOf = new Map<string, number>();
  stops.forEach((s, i) => matrixIndexOf.set(s.id, i + 1));

  // 2. Which driver gets which stops.
  const { assignments, unassignedStopIds } = assignStops(depot, drivers, stops, opts);

  // 3 + 4. Order each driver's stops, then repair time-window violations.
  const ordered: Record<string, string[]> = {};
  for (const driver of drivers) {
    const indices = (assignments[driver.id] ?? [])
      .map((id) => matrixIndexOf.get(id))
      .filter((i): i is number => i !== undefined);

    let order = sequenceRoute(matrix, 0, indices);

    if (opts.respectTimeWindows && order.length > 1) {
      const ctx: RouteContext = {
        matrix,
        depotIndex: 0,
        stops,
        shiftStartMin: parseHHMM(driver.shiftStart),
        avgSpeedKmh: opts.avgSpeedKmh,
      };
      order = repairTimeWindows(order, ctx).order;
    }

    ordered[driver.id] = order.map((i) => stops[i - 1].id);
  }

  // 5. Concrete legs / ETAs / metrics.
  const { routes, metrics } = schedule({ depot, drivers, stops, assignments: ordered, options: opts });

  return {
    routes,
    unassignedStopIds,
    metrics,
    algorithm: ALGORITHM,
    computeMs: roundMs(performance.now() - t0),
  };
}
