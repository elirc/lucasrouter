// Stage 3 of the placeholder optimizer: time-window repair.
//
// 2-opt only looks at distance, so a stop with a 09:00-11:00 window can end up
// at the tail of a route and be reached at 13:00. This pass simulates the ETAs
// of a driver's route (same rules as `schedule()`) and, for every late stop,
// tries every earlier insertion position. The single best move (fewest
// remaining violations, then shortest tour) is applied and the process repeats
// until no move helps. Arriving early is a wait, never a violation.
//
// This is a local heuristic: it will not always reach zero violations (a route
// can simply have too many stops for the windows), and it accepts a slightly
// longer tour in exchange for fewer late arrivals. It is deterministic.

import { driveMinutes } from './distance';
import { simulateEtas } from './schedule';
import { routeDistance } from './sequence';
import { stopAtIndex } from './types';
import type { RouteContext } from './types';

export interface RepairResult {
  /** Repaired order (matrix indices). Same multiset as the input order. */
  order: number[];
  /** Time-window violations remaining after repair. */
  violations: number;
}

/** Hard cap on repair iterations (each iteration applies at most one move). */
export const MAX_REPAIR_ITERATIONS = 100;

/** Drive minutes for every leg of the closed tour, in matrix-index space. */
function legMinutesFor(order: number[], ctx: RouteContext): number[] {
  if (order.length === 0) return [];
  const legs: number[] = [];
  let prev = ctx.depotIndex;
  for (const idx of order) {
    legs.push(driveMinutes(ctx.matrix[prev][idx], ctx.avgSpeedKmh));
    prev = idx;
  }
  legs.push(driveMinutes(ctx.matrix[prev][ctx.depotIndex], ctx.avgSpeedKmh));
  return legs;
}

/** Simulate a candidate order: total violations plus a per-position late flag. */
function evaluate(order: number[], ctx: RouteContext): { violations: number; late: boolean[] } {
  const stops = order.map((i) => stopAtIndex(ctx, i));
  const sim = simulateEtas(ctx.shiftStartMin, stops, legMinutesFor(order, ctx));
  return { violations: sim.violations, late: sim.steps.map((s) => s.late) };
}

/** Number of stops in `order` that would be reached after their window closes. */
export function countViolations(order: number[], ctx: RouteContext): number {
  return evaluate(order, ctx).violations;
}

/**
 * Move `order[from]` to position `to` (< from), shifting the stops in between
 * one place later. Returns a new array.
 */
function moveEarlier(order: number[], from: number, to: number): number[] {
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Repair time-window violations by pulling late stops earlier in the sequence.
 * See the file header for the strategy. Returns the (possibly unchanged) order
 * and the number of violations that remain.
 */
export function repairTimeWindows(
  order: number[],
  ctx: RouteContext,
  maxIterations: number = MAX_REPAIR_ITERATIONS,
): RepairResult {
  let current = order.slice();
  if (current.length < 2) {
    return { order: current, violations: countViolations(current, ctx) };
  }

  let { violations, late } = evaluate(current, ctx);

  for (let iter = 0; iter < maxIterations && violations > 0; iter++) {
    let best: { order: number[]; violations: number; late: boolean[]; distance: number } | null = null;

    for (let from = 0; from < current.length; from++) {
      if (!late[from]) continue;
      for (let to = 0; to < from; to++) {
        const candidate = moveEarlier(current, from, to);
        const ev = evaluate(candidate, ctx);
        if (ev.violations >= violations) continue; // must strictly reduce violations
        const d = routeDistance(candidate, ctx.matrix, ctx.depotIndex);
        if (
          best === null ||
          ev.violations < best.violations ||
          (ev.violations === best.violations && d < best.distance - 1e-9)
        ) {
          best = { order: candidate, violations: ev.violations, late: ev.late, distance: d };
        }
      }
    }

    if (best === null) break; // no single move helps -> local optimum
    current = best.order;
    violations = best.violations;
    late = best.late;
  }

  return { order: current, violations };
}
