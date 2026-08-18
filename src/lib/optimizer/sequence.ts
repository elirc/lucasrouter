// Stage 2 of the placeholder optimizer: decide the ORDER in which one driver
// visits their stops. Classic nearest-neighbour construction followed by 2-opt
// local search on the closed tour depot -> s1 -> ... -> sN -> depot.
//
// All functions work in matrix-index space (see `buildDistanceMatrix`): the
// depot is a fixed endpoint and is never part of `order`.

import type { Matrix } from './types';

/** Improvements smaller than this are treated as zero (floating-point noise). */
const EPSILON = 1e-9;

/** Hard cap on 2-opt sweeps; in practice a 15-stop route converges in < 10. */
export const MAX_TWO_OPT_PASSES = 500;

/**
 * Total length (km) of the closed tour depot -> order[0] -> ... -> order[n-1] -> depot.
 * An empty order has length 0 (the driver never leaves).
 */
export function routeDistance(order: number[], matrix: Matrix, depotIndex: number): number {
  if (order.length === 0) return 0;
  let total = matrix[depotIndex][order[0]];
  for (let i = 0; i < order.length - 1; i++) {
    total += matrix[order[i]][order[i + 1]];
  }
  total += matrix[order[order.length - 1]][depotIndex];
  return total;
}

/**
 * Greedy nearest-neighbour ordering starting from the depot: repeatedly go to
 * the closest unvisited stop. Ties are broken by position in `stopIndices`, so
 * the result is deterministic. Duplicate indices are ignored.
 */
export function nearestNeighborOrder(
  matrix: Matrix,
  depotIndex: number,
  stopIndices: number[],
): number[] {
  const remaining = [...new Set(stopIndices)];
  const order: number[] = [];
  let current = depotIndex;
  while (remaining.length > 0) {
    let bestPos = 0;
    let bestD = Infinity;
    for (let p = 0; p < remaining.length; p++) {
      const d = matrix[current][remaining[p]];
      if (d < bestD) {
        bestD = d;
        bestPos = p;
      }
    }
    current = remaining[bestPos];
    order.push(current);
    remaining.splice(bestPos, 1);
  }
  return order;
}

/**
 * 2-opt local search on a closed tour with a fixed depot endpoint. Repeatedly
 * reverses the segment `order[i..j]` whenever doing so shortens the tour, until
 * a full sweep finds no gain larger than `EPSILON` (or `maxPasses` is hit).
 * Returns a NEW array; the input is not mutated. Never returns a longer tour.
 */
export function twoOptImprove(
  order: number[],
  matrix: Matrix,
  depotIndex: number,
  maxPasses: number = MAX_TWO_OPT_PASSES,
): number[] {
  const tour = order.slice();
  const n = tour.length;
  if (n < 3) return tour; // with <= 2 stops every reversal is a mirror image (same length)

  let improved = true;
  for (let pass = 0; improved && pass < maxPasses; pass++) {
    improved = false;
    for (let i = 0; i < n - 1; i++) {
      const prev = i === 0 ? depotIndex : tour[i - 1];
      for (let j = i + 1; j < n; j++) {
        const a = tour[i]; // re-read: an earlier reversal in this row may have changed it
        const b = tour[j];
        const next = j === n - 1 ? depotIndex : tour[j + 1];
        // Edges (prev,a) + (b,next) are replaced by (prev,b) + (a,next).
        const delta = matrix[prev][b] + matrix[a][next] - matrix[prev][a] - matrix[b][next];
        if (delta < -EPSILON) {
          reverseInPlace(tour, i, j);
          improved = true;
        }
      }
    }
  }
  return tour;
}

/** Nearest-neighbour + 2-opt: the full sequencing step for one driver. */
export function sequenceRoute(matrix: Matrix, depotIndex: number, stopIndices: number[]): number[] {
  const nn = nearestNeighborOrder(matrix, depotIndex, stopIndices);
  return twoOptImprove(nn, matrix, depotIndex);
}

/** Reverse `arr[i..j]` (inclusive) in place. */
function reverseInPlace(arr: number[], i: number, j: number): void {
  while (i < j) {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
    i++;
    j--;
  }
}
