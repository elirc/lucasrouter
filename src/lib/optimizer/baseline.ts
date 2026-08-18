// The "what dispatch does today" baseline: hand stops out round-robin in the
// order they appear in the manifest and drive them in that same order. No
// clustering, no sequencing, no time-window awareness. The dashboard compares
// this against `optimize()` to show the improvement.

import type { OptimizeRequest, OptimizeResponse } from '@/lib/types';
import { schedule } from './schedule';

export const BASELINE_ALGORITHM = 'baseline-round-robin-v1';

/**
 * Round-robin baseline: stop `i` goes to driver `i % drivers.length`, kept in
 * file order, then scheduled as-is.
 *
 * Capacity is deliberately ignored (`unassignedStopIds` is always `[]`): the
 * baseline represents the naive manual plan, and a manual plan does not leave
 * parcels on the dock - it just overloads a van. Keeping every stop in the
 * baseline also makes the comparison honest (same set of stops on both sides).
 * With zero drivers there is nobody to deliver anything, so every stop is
 * reported as unassigned instead.
 */
export function baseline(req: OptimizeRequest): OptimizeResponse {
  const t0 = performance.now();
  const { depot, drivers, stops, options } = req;

  const assignments: Record<string, string[]> = {};
  for (const d of drivers) assignments[d.id] = [];
  const unassignedStopIds: string[] = [];

  if (drivers.length === 0) {
    for (const s of stops) unassignedStopIds.push(s.id);
  } else {
    stops.forEach((s, i) => {
      assignments[drivers[i % drivers.length].id].push(s.id);
    });
  }

  const { routes, metrics } = schedule({ depot, drivers, stops, assignments, options });

  return {
    routes,
    unassignedStopIds,
    metrics,
    algorithm: BASELINE_ALGORITHM,
    computeMs: roundMs(performance.now() - t0),
  };
}

/** Milliseconds rounded to one decimal place (keeps JSON tidy). */
export function roundMs(ms: number): number {
  return Math.max(0, Math.round(ms * 10) / 10);
}
