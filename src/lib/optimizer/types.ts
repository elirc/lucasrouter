// Internal types shared by the optimizer stages. Nothing in here is part of the
// public contract (that lives in `src/lib/types.ts`); page-builders should not
// import from this file.

import type { OptimizeOptions, Stop } from '@/lib/types';

/** Minimal geographic point (depot, stop, or cluster centroid). */
export interface Point {
  lat: number;
  lng: number;
}

/**
 * Symmetric matrix of estimated ROAD km (haversine x ROAD_FACTOR, see
 * `buildDistanceMatrix`). By convention index 0 is the depot
 * and index `i >= 1` is `stops[i - 1]` of whatever stop list the matrix was
 * built from (see `buildDistanceMatrix`).
 */
export type Matrix = number[][];

/** `OptimizeOptions` with every field defaulted. */
export interface ResolvedOptions {
  respectTimeWindows: boolean;
  balanceLoad: boolean;
  avgSpeedKmh: number;
}

/**
 * Everything the sequencing / repair stages need to evaluate one driver's
 * route in matrix-index space (so we never re-do trigonometry in a hot loop).
 *
 * `stops[i - 1]` is the stop at matrix index `i`; use `stopAtIndex()` rather
 * than doing the arithmetic inline.
 */
export interface RouteContext {
  matrix: Matrix;
  /** Matrix row/column of the depot (always 0 for matrices we build). */
  depotIndex: number;
  /** All stops, aligned so that matrix index `i` (>= 1) is `stops[i - 1]`. */
  stops: Stop[];
  /** Driver shift start, minutes since midnight. */
  shiftStartMin: number;
  /** Average speed used to turn kilometres into minutes. */
  avgSpeedKmh: number;
}

/** State carried through the k-means loop in `assign.ts`. */
export interface ClusterState {
  /** One centroid per driver / cluster (never null; empty clusters keep their last centroid). */
  centroids: Point[];
  /** `clusterOf[stopIndex]` = cluster index the stop currently belongs to. */
  clusterOf: number[];
}

/** Result of the assignment stage. */
export interface AssignmentResult {
  /** driverId -> stopIds (unordered at this stage; sequencing happens later). */
  assignments: Record<string, string[]>;
  /** Stops that could not be placed with any driver (capacity). */
  unassignedStopIds: string[];
}

/** Resolve the matrix index of a stop back to the `Stop` object. */
export function stopAtIndex(ctx: Pick<RouteContext, 'stops' | 'depotIndex'>, matrixIndex: number): Stop {
  const stop = ctx.stops[matrixIndex - 1];
  if (matrixIndex === ctx.depotIndex || stop === undefined) {
    throw new Error(`Matrix index ${matrixIndex} does not map to a stop`);
  }
  return stop;
}

/** Defaults documented in `OptimizeOptions` (types.ts). */
export const DEFAULT_OPTIONS: ResolvedOptions = Object.freeze({
  respectTimeWindows: true,
  balanceLoad: true,
  avgSpeedKmh: 32,
});

/**
 * Fill in defaults for a possibly-undefined / partial options object. Invalid
 * speeds (non-finite or <= 0) fall back to the default rather than producing
 * NaN/Infinity ETAs.
 */
export function resolveOptions(options?: OptimizeOptions): ResolvedOptions {
  const speed = options?.avgSpeedKmh;
  return {
    respectTimeWindows: options?.respectTimeWindows ?? DEFAULT_OPTIONS.respectTimeWindows,
    balanceLoad: options?.balanceLoad ?? DEFAULT_OPTIONS.balanceLoad,
    avgSpeedKmh:
      typeof speed === 'number' && Number.isFinite(speed) && speed > 0
        ? speed
        : DEFAULT_OPTIONS.avgSpeedKmh,
  };
}
