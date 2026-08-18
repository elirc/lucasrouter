// Stage 1 of the placeholder optimizer: decide WHICH driver visits WHICH stops.
//
// Approach: k-means-style clustering (k = number of drivers) seeded by angle
// around the depot, followed by a deterministic rebalance pass that enforces
// per-driver package capacity and (optionally) keeps stop counts within 3 of
// each other. Assignment is a function of geometry + capacity only; a stop's
// status, priority or time window does not influence which driver gets it.
//
// Everything here is deterministic: no `Math.random`, and every sort has an
// explicit tie-break on stop id / cluster index.

import type { Depot, Driver, OptimizeOptions, Stop } from '@/lib/types';
import { bearingDeg, centroidOf, haversineKm } from './distance';
import { resolveOptions } from './types';
import type { AssignmentResult, ClusterState, Point } from './types';

/** Maximum k-means iterations (it usually converges in < 10 for 45 stops). */
export const MAX_KMEANS_ITERATIONS = 20;

/** Maximum allowed difference in stop counts between any two drivers when balancing. */
export const MAX_COUNT_SPREAD = 3;

/**
 * Cluster stops around the depot and hand each cluster to a driver.
 * See the file header for the algorithm; see `AssignmentResult` for the shape.
 */
export function assignStops(
  depot: Depot,
  drivers: Driver[],
  stops: Stop[],
  options?: OptimizeOptions,
): AssignmentResult {
  const opts = resolveOptions(options);
  const assignments: Record<string, string[]> = {};
  for (const d of drivers) assignments[d.id] = [];

  // Degenerate inputs -------------------------------------------------------
  if (drivers.length === 0) {
    return { assignments, unassignedStopIds: stops.map((s) => s.id) };
  }
  if (stops.length === 0) {
    return { assignments, unassignedStopIds: [] };
  }

  const k = drivers.length;
  const n = stops.length;

  // 1. Seed centroids by angle: sort by bearing from depot, cut into k sectors.
  const state = seedByAngle(depot, stops, k);

  // 2. Lloyd iterations: assign to nearest centroid, recompute, until stable.
  runKMeans(state, stops, k);

  // 3. Rebalance: capacity first (hard constraint), then optional count balance.
  const unassigned = new Set<number>();
  enforceCapacity(state, stops, drivers, unassigned);
  readmitUnassigned(state, stops, drivers, unassigned);
  if (opts.balanceLoad) {
    balanceCounts(state, stops, drivers, unassigned);
  }

  // 4. Materialise: keep stops in input (file) order within a cluster; sequencing
  //    is a later stage and this order does not matter for the result.
  for (let i = 0; i < n; i++) {
    if (unassigned.has(i)) continue;
    assignments[drivers[state.clusterOf[i]].id].push(stops[i].id);
  }
  const unassignedStopIds = [...unassigned].sort((a, b) => a - b).map((i) => stops[i].id);

  return { assignments, unassignedStopIds };
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/**
 * Sort stops by compass bearing from the depot and split the sorted list into
 * `k` contiguous angular sectors of (as near as possible) equal size. Each
 * sector's mean position becomes the initial centroid for cluster `j`, so
 * driver `j` starts with a wedge of the city. Sectors that receive no stops
 * (only possible when k > n) are seeded at the depot itself.
 */
function seedByAngle(depot: Depot, stops: Stop[], k: number): ClusterState {
  const n = stops.length;
  const order = stops
    .map((s, i) => ({ i, bearing: bearingDeg(depot, s) }))
    .sort((a, b) => a.bearing - b.bearing || stops[a.i].id.localeCompare(stops[b.i].id))
    .map((x) => x.i);

  const clusterOf = new Array<number>(n).fill(0);
  const centroids: Point[] = [];
  for (let j = 0; j < k; j++) {
    const from = Math.floor((j * n) / k);
    const to = Math.floor(((j + 1) * n) / k);
    const members = order.slice(from, to);
    for (const i of members) clusterOf[i] = j;
    centroids.push(centroidOf(members.map((i) => stops[i])) ?? { lat: depot.lat, lng: depot.lng });
  }
  return { centroids, clusterOf };
}

// ---------------------------------------------------------------------------
// k-means
// ---------------------------------------------------------------------------

/** Standard Lloyd iterations on the seeded state (mutates `state`). */
function runKMeans(state: ClusterState, stops: Stop[], k: number): void {
  for (let iter = 0; iter < MAX_KMEANS_ITERATIONS; iter++) {
    let changed = false;
    for (let i = 0; i < stops.length; i++) {
      const best = nearestCentroid(stops[i], state.centroids);
      if (best !== state.clusterOf[i]) {
        state.clusterOf[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
    recomputeCentroids(state, stops, k);
  }
}

/** Index of the nearest centroid (ties -> lower cluster index). */
function nearestCentroid(p: Point, centroids: Point[]): number {
  let best = 0;
  let bestD = Infinity;
  for (let j = 0; j < centroids.length; j++) {
    const d = haversineKm(p, centroids[j]);
    if (d < bestD) {
      bestD = d;
      best = j;
    }
  }
  return best;
}

/**
 * Recompute each centroid as the mean of its members. A cluster that has lost
 * all of its members keeps its previous centroid so it can win stops back on
 * the next iteration (and so the balance pass has somewhere to aim).
 */
function recomputeCentroids(state: ClusterState, stops: Stop[], k: number): void {
  const buckets: Point[][] = Array.from({ length: k }, () => []);
  for (let i = 0; i < stops.length; i++) buckets[state.clusterOf[i]].push(stops[i]);
  for (let j = 0; j < k; j++) {
    const c = centroidOf(buckets[j]);
    if (c) state.centroids[j] = c;
  }
}

// ---------------------------------------------------------------------------
// Rebalancing helpers
// ---------------------------------------------------------------------------

/** Members (stop indices, ascending) of each cluster, excluding unassigned. */
function membersOf(state: ClusterState, n: number, unassigned: Set<number>): number[][] {
  const out: number[][] = Array.from({ length: state.centroids.length }, () => []);
  for (let i = 0; i < n; i++) {
    if (!unassigned.has(i)) out[state.clusterOf[i]].push(i);
  }
  return out;
}

/** Sum of packages currently in each cluster. */
function loadsOf(members: number[][], stops: Stop[]): number[] {
  return members.map((m) => m.reduce((sum, i) => sum + stops[i].packages, 0));
}

/**
 * Hard constraint: no driver may carry more packages than `capacityPackages`.
 *
 * For each over-capacity cluster (in driver order) we repeatedly move out the
 * member that loses the least by leaving — i.e. the one whose distance to the
 * best alternative centroid (with room) minus its distance to its own centroid
 * is smallest. If no member fits anywhere else, the member farthest from the
 * cluster centroid is dropped to `unassigned` (the caller reports it).
 */
function enforceCapacity(
  state: ClusterState,
  stops: Stop[],
  drivers: Driver[],
  unassigned: Set<number>,
): void {
  const k = drivers.length;
  const n = stops.length;
  const members = membersOf(state, n, unassigned);
  const loads = loadsOf(members, stops);

  for (let c = 0; c < k; c++) {
    let guard = 0;
    while (loads[c] > drivers[c].capacityPackages && members[c].length > 0 && guard++ <= n) {
      let bestStop = -1;
      let bestTarget = -1;
      let bestCost = Infinity;
      for (const i of members[c]) {
        const own = haversineKm(stops[i], state.centroids[c]);
        for (let t = 0; t < k; t++) {
          if (t === c) continue;
          if (loads[t] + stops[i].packages > drivers[t].capacityPackages) continue;
          const cost = haversineKm(stops[i], state.centroids[t]) - own;
          if (cost < bestCost - 1e-12) {
            bestCost = cost;
            bestStop = i;
            bestTarget = t;
          }
        }
      }

      if (bestStop === -1) {
        // Nothing fits anywhere: drop the farthest member that actually carries
        // packages (deterministic tie -> lower index). A 0-package stop uses no
        // capacity, so dropping it could never bring the load down.
        let farthest = -1;
        let farthestD = -1;
        for (const i of members[c]) {
          if (stops[i].packages <= 0) continue;
          const d = haversineKm(stops[i], state.centroids[c]);
          if (d > farthestD + 1e-12) {
            farthestD = d;
            farthest = i;
          }
        }
        if (farthest === -1) break; // cannot happen while loads[c] > capacity, but be safe
        removeFrom(members[c], farthest);
        loads[c] -= stops[farthest].packages;
        unassigned.add(farthest);
        continue;
      }

      removeFrom(members[c], bestStop);
      members[bestTarget].push(bestStop);
      members[bestTarget].sort((a, b) => a - b);
      loads[c] -= stops[bestStop].packages;
      loads[bestTarget] += stops[bestStop].packages;
      state.clusterOf[bestStop] = bestTarget;
    }
  }
}

/**
 * Soft constraint (`balanceLoad`): keep stop counts within `MAX_COUNT_SPREAD`.
 *
 * While the largest and smallest clusters differ by more than the spread, move
 * one boundary stop out of the largest cluster: the member closest (relative
 * to its own centroid) to the target cluster's centroid that also fits the
 * target's capacity. Targets are tried smallest-first; only targets at least
 * two below the largest count are considered so every move strictly reduces
 * the imbalance and the loop provably terminates (there is a guard anyway).
 */
function balanceCounts(
  state: ClusterState,
  stops: Stop[],
  drivers: Driver[],
  unassigned: Set<number>,
): void {
  const k = drivers.length;
  if (k < 2) return;
  const n = stops.length;
  const members = membersOf(state, n, unassigned);
  const loads = loadsOf(members, stops);

  for (let guard = 0; guard < n * 2; guard++) {
    // Largest cluster (ties -> lower index) and clusters sorted by ascending count.
    let big = 0;
    for (let c = 1; c < k; c++) if (members[c].length > members[big].length) big = c;
    const byCount = Array.from({ length: k }, (_, c) => c)
      .filter((c) => c !== big)
      .sort((a, b) => members[a].length - members[b].length || a - b);
    const small = byCount[0];
    if (members[big].length - members[small].length <= MAX_COUNT_SPREAD) break;

    let moved = false;
    for (const target of byCount) {
      if (members[target].length > members[big].length - 2) break; // would not reduce spread
      let bestStop = -1;
      let bestCost = Infinity;
      for (const i of members[big]) {
        if (loads[target] + stops[i].packages > drivers[target].capacityPackages) continue;
        const cost =
          haversineKm(stops[i], state.centroids[target]) - haversineKm(stops[i], state.centroids[big]);
        if (cost < bestCost - 1e-12) {
          bestCost = cost;
          bestStop = i;
        }
      }
      if (bestStop === -1) continue; // capacity blocks this target; try the next smallest
      removeFrom(members[big], bestStop);
      members[target].push(bestStop);
      members[target].sort((a, b) => a - b);
      loads[big] -= stops[bestStop].packages;
      loads[target] += stops[bestStop].packages;
      state.clusterOf[bestStop] = target;
      moved = true;
      break;
    }
    if (!moved) break; // capacity makes further balancing impossible
  }
}

/**
 * Second chance for stops dropped by `enforceCapacity`: a stop dropped early
 * from an over-full cluster may fit somewhere once later drops have freed room
 * (or in another cluster that was never full). Stops are retried in input
 * order and go to the nearest centroid with capacity, so the invariant "only
 * stops that fit nowhere stay unassigned" holds after this pass.
 */
function readmitUnassigned(
  state: ClusterState,
  stops: Stop[],
  drivers: Driver[],
  unassigned: Set<number>,
): void {
  if (unassigned.size === 0) return;
  const k = drivers.length;
  const members = membersOf(state, stops.length, unassigned);
  const loads = loadsOf(members, stops);
  for (const i of [...unassigned].sort((a, b) => a - b)) {
    let best = -1;
    let bestD = Infinity;
    for (let t = 0; t < k; t++) {
      if (loads[t] + stops[i].packages > drivers[t].capacityPackages) continue;
      const d = haversineKm(stops[i], state.centroids[t]);
      if (d < bestD - 1e-12) {
        bestD = d;
        best = t;
      }
    }
    if (best === -1) continue; // still fits nowhere
    unassigned.delete(i);
    state.clusterOf[i] = best;
    loads[best] += stops[i].packages;
    members[best].push(i);
  }
}

/** Remove a value from a numeric array in place (no-op if absent). */
function removeFrom(arr: number[], value: number): void {
  const idx = arr.indexOf(value);
  if (idx !== -1) arr.splice(idx, 1);
}
