// Stage 3 of the placeholder optimizer: time-window repair.
//
// 2-opt only looks at distance, so time windows are ignored during sequencing.
// This pass simulates the ETAs of a driver's route (same rules as `schedule()`)
// and fixes two kinds of problem with local "move one stop" edits:
//
//   LATE pass - a stop with a 09:00-11:00 window that sits at the tail of the
//     route and is reached at 13:00 (a violation). For every late stop we try
//     every EARLIER insertion position and apply the single best move (fewest
//     remaining violations, then shortest tour). Repeats until no move helps.
//
//   IDLE pass - a stop with a 13:00-15:00 window that a distance-only order
//     visits at 09:20: the driver would idle for hours (arrival is clamped to
//     the window start, see `simulateEtas`), and every stop after it inherits
//     the delay. While some stop waits for its window we try every single-stop
//     relocation (a waiting stop pushed later, or a stop behind the wait pulled
//     forward - both are needed: when two afternoon windows anchor the tail only
//     the pull-forward helps) and apply the single best move that does not
//     increase violations AND "finishes better": the route must get back to the
//     depot strictly earlier, or at the same time with a strictly lower sum of
//     stop arrival times. The second clause matters because a later window can
//     anchor the finish time; "same finish, everyone served earlier" is what
//     pushes the idle to the tail and gets the no-window stops delivered in the
//     morning instead of at 13:30. Ties keep the current order. Repeats until
//     no move helps.
//
// The two passes alternate until neither changes anything. Termination: the
// late pass only moves when violations strictly decrease; the idle pass never
// increases violations and strictly decreases (depot arrival, sum of arrivals)
// lexicographically, so each pass walks a finite strictly-monotone chain -
// and every loop is capped anyway.
//
// This is a local heuristic: it will not always reach zero violations (a route
// can simply have too many stops for the windows), and it accepts a slightly
// longer tour in exchange for fewer late arrivals / less idle time. It is
// deterministic (fixed scan order, explicit tie-breaks).

import { driveMinutes } from './distance';
import { simulateTimings, stopTiming } from './schedule';
import type { StopTiming } from './schedule';
import { routeDistance } from './sequence';
import { stopAtIndex } from './types';
import type { RouteContext } from './types';

export interface RepairResult {
  /** Repaired order (matrix indices). Same multiset as the input order. */
  order: number[];
  /** Time-window violations remaining after repair. */
  violations: number;
}

/** Hard cap on iterations of ONE pass (each iteration applies at most one move). */
export const MAX_REPAIR_ITERATIONS = 100;

/** Hard cap on late/idle alternations (in practice 2-3 rounds suffice). */
export const MAX_REPAIR_ROUNDS = 20;

/**
 * The idle pass evaluates every single-stop relocation (O(n^2) candidates, each
 * an O(n) simulation) per iteration. That is instant for a 15-stop route but
 * cubic, so routes longer than this only get the (cheaper, violation-driven)
 * late pass. The API caps requests at 1000 stops; a production solver would
 * replace this whole file anyway.
 */
export const MAX_IDLE_PASS_STOPS = 120;

/** Improvements smaller than this (minutes / km) are treated as zero. */
const EPSILON = 1e-6;

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

/** Everything a pass needs to know about a candidate order. */
interface Evaluation {
  violations: number;
  /** `late[i]` = order[i] is reached after its window closes. */
  late: boolean[];
  /** `wait[i]` = minutes order[i] idles for its window to open (0 if none). */
  wait: number[];
  /** Arrival back at the depot, minutes since midnight (unrounded). */
  depotArrivalMin: number;
  /** Sum of stop arrival times (minutes since midnight) - lower = served sooner. */
  sumArrivalMin: number;
}

/**
 * `RouteContext` plus the pre-parsed timing of every stop, indexed by MATRIX
 * index (so `timings[i]` belongs to `stops[i - 1]`; index 0 / the depot is
 * unused). Built once per `repairTimeWindows` call - the passes evaluate
 * thousands of candidate orders and must not re-parse "HH:MM" each time.
 */
interface RepairContext extends RouteContext {
  timings: StopTiming[];
}

function prepare(ctx: RouteContext): RepairContext {
  const timings: StopTiming[] = new Array<StopTiming>(ctx.stops.length + 1);
  for (let i = 1; i <= ctx.stops.length; i++) timings[i] = stopTiming(stopAtIndex(ctx, i));
  return { ...ctx, timings };
}

/** Simulate a candidate order with the same rules `schedule()` uses. */
function evaluate(order: number[], ctx: RepairContext): Evaluation {
  const timings = order.map((i) => ctx.timings[i]);
  const sim = simulateTimings(ctx.shiftStartMin, timings, legMinutesFor(order, ctx));
  let sumArrivalMin = 0;
  const late: boolean[] = [];
  const wait: number[] = [];
  for (const s of sim.steps) {
    sumArrivalMin += s.arrivalMin;
    late.push(s.late);
    wait.push(s.waitMin);
  }
  return { violations: sim.violations, late, wait, depotArrivalMin: sim.depotArrivalMin, sumArrivalMin };
}

/** Number of stops in `order` that would be reached after their window closes. */
export function countViolations(order: number[], ctx: RouteContext): number {
  return evaluate(order, prepare(ctx)).violations;
}

/**
 * Move `order[from]` to position `to` (either direction), shifting the stops in
 * between one place. Returns a new array; the input is not mutated.
 */
function moveTo(order: number[], from: number, to: number): number[] {
  const next = order.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * LATE pass: while some stop is late, apply the single best "move a late stop
 * earlier" edit that strictly reduces violations. Returns the new order and
 * whether anything changed.
 */
function latePass(
  order: number[],
  ctx: RepairContext,
  maxIterations: number,
): { order: number[]; changed: boolean } {
  let current = order;
  let changed = false;
  let { violations, late } = evaluate(current, ctx);

  for (let iter = 0; iter < maxIterations && violations > 0; iter++) {
    let best: { order: number[]; violations: number; late: boolean[]; distance: number } | null = null;

    for (let from = 0; from < current.length; from++) {
      if (!late[from]) continue;
      for (let to = 0; to < from; to++) {
        const candidate = moveTo(current, from, to);
        const ev = evaluate(candidate, ctx);
        if (ev.violations >= violations) continue; // must strictly reduce violations
        const d = routeDistance(candidate, ctx.matrix, ctx.depotIndex);
        if (
          best === null ||
          ev.violations < best.violations ||
          (ev.violations === best.violations && d < best.distance - EPSILON)
        ) {
          best = { order: candidate, violations: ev.violations, late: ev.late, distance: d };
        }
      }
    }

    if (best === null) break; // no single move helps -> local optimum
    current = best.order;
    violations = best.violations;
    late = best.late;
    changed = true;
  }

  return { order: current, changed };
}

/**
 * `true` when `a` is strictly better than `b` on the IDLE-pass objective:
 * back at the depot earlier, or at the same time with stops served earlier
 * (lower sum of arrival times).
 */
function finishesBetter(a: Evaluation, b: Evaluation): boolean {
  if (a.depotArrivalMin < b.depotArrivalMin - EPSILON) return true;
  if (a.depotArrivalMin > b.depotArrivalMin + EPSILON) return false;
  return a.sumArrivalMin < b.sumArrivalMin - EPSILON;
}

/**
 * IDLE pass: while some stop waits for its window to open, apply the single
 * best single-stop relocation that does not increase violations and
 * `finishesBetter` than the current order (see the file header). Among
 * acceptable candidates: fewest violations, then best finish, then shortest
 * tour, then the first candidate in scan order (from asc, to asc). Returns the
 * new order and whether anything changed.
 */
function idlePass(
  order: number[],
  ctx: RepairContext,
  maxIterations: number,
): { order: number[]; changed: boolean } {
  let current = order;
  let changed = false;
  if (current.length > MAX_IDLE_PASS_STOPS) return { order: current, changed };
  let ev = evaluate(current, ctx);

  for (let iter = 0; iter < maxIterations; iter++) {
    if (!ev.wait.some((w) => w > EPSILON)) break; // nobody idles -> nothing to do

    let best: { order: number[]; ev: Evaluation; distance: number } | null = null;

    for (let from = 0; from < current.length; from++) {
      for (let to = 0; to < current.length; to++) {
        if (to === from) continue;
        const candidate = moveTo(current, from, to);
        const cev = evaluate(candidate, ctx);
        if (cev.violations > ev.violations) continue; // never trade idle time for lateness
        if (!finishesBetter(cev, ev)) continue; // must strictly improve
        const d = routeDistance(candidate, ctx.matrix, ctx.depotIndex);
        if (
          best === null ||
          cev.violations < best.ev.violations ||
          (cev.violations === best.ev.violations &&
            (finishesBetter(cev, best.ev) ||
              (!finishesBetter(best.ev, cev) && d < best.distance - EPSILON)))
        ) {
          best = { order: candidate, ev: cev, distance: d };
        }
      }
    }

    if (best === null) break; // local optimum
    current = best.order;
    ev = best.ev;
    changed = true;
  }

  return { order: current, changed };
}

/**
 * Repair a driver's sequence for its time windows: pull late stops earlier and
 * reshuffle stops so nobody idles at a not-yet-open window with deliverable
 * stops still on the van. See the file header for the strategy. Returns the
 * (possibly unchanged) order and the number of violations that remain.
 *
 * `maxIterations` caps each pass; the alternation is capped by
 * `MAX_REPAIR_ROUNDS`.
 */
export function repairTimeWindows(
  order: number[],
  ctx: RouteContext,
  maxIterations: number = MAX_REPAIR_ITERATIONS,
): RepairResult {
  let current = order.slice();
  const rctx = prepare(ctx);
  if (current.length < 2) {
    return { order: current, violations: evaluate(current, rctx).violations };
  }

  for (let round = 0; round < MAX_REPAIR_ROUNDS; round++) {
    const late = latePass(current, rctx, maxIterations);
    const idle = idlePass(late.order, rctx, maxIterations);
    current = idle.order;
    if (!late.changed && !idle.changed) break; // fixed point
  }

  return { order: current, violations: evaluate(current, rctx).violations };
}
