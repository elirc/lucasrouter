/**
 * RouteIQ application store (zustand 5 + `persist`).
 *
 * PERSISTENCE
 * -----------
 * The store is persisted to `localStorage` under the key `routeiq-v1` so a
 * dispatcher's optimized plan and a driver's delivery progress survive reloads
 * and are shared between the /dispatch and /driver tabs on the same device.
 * Ephemeral UI state (selectedStopId, toast, hasHydrated, isOptimizing,
 * optimizeError) is deliberately NOT persisted — see `partialize` below.
 *
 * Storage is only touched in the browser (`typeof window !== 'undefined'`);
 * on the server a no-op in-memory storage is used so importing this module
 * from a server bundle never throws and never warns.
 *
 * HYDRATION GATING
 * ----------------
 * Because the persisted state only exists on the client, the very first
 * client render must produce the same markup as the server (which knows
 * nothing about localStorage). Pages therefore render skeletons until
 * `useHasHydrated()` returns true, and only then read the store for real
 * content. `hasHydrated` is flipped by persist's `onRehydrateStorage`
 * callback; `useHasHydrated()` additionally uses `useSyncExternalStore` with a
 * server snapshot of `false`, so it is `false` during SSR / hydration and
 * `true` right after mount — even when persist finished rehydrating
 * synchronously (localStorage is synchronous) before any React subscription
 * existed.
 *
 * SELECTOR NOTE
 * -------------
 * `selectStopsById` / `selectDriverColorByStopId` build fresh objects, so do
 * NOT pass them directly to `useAppStore(selector)` (zustand 5 requires stable
 * snapshots). Select the raw slices (`stops`, `routes`, `drivers`) and derive
 * with `useMemo`, or wrap with `useShallow` from `zustand/react/shallow`.
 */

import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';

import { getSeed } from '@/data';
import { baseline, optimize as optimizeLocal, schedule } from '@/lib/optimizer';
import type {
  Depot,
  Driver,
  OptimizeRequest,
  OptimizeResponse,
  Route,
  RouteMetrics,
  Stop,
  StopStatus,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastState {
  id: number;
  message: string;
  tone?: ToastTone;
}

export interface AppState {
  depot: Depot | null;
  drivers: Driver[];
  stops: Stop[];
  routes: Route[] | null; // null until optimized
  baselineMetrics: RouteMetrics | null;
  optimizedMetrics: RouteMetrics | null;
  algorithm: string | null;
  computeMs: number | null;
  isOptimizing: boolean;
  optimizeError: string | null;
  lastOptimizedAt: string | null; // ISO
  activeDriverId: string | null; // last chosen driver on /driver
  hiddenDriverIds: string[]; // legend toggles on the dispatcher map
  selectedStopId: string | null; // NOT persisted
  hasHydrated: boolean; // NOT persisted; set true by persist onRehydrateStorage
  toast: ToastState | null; // NOT persisted

  // actions
  loadSeed(): Promise<void>;
  optimize(): Promise<void>;
  resetDemo(): Promise<void>;
  moveStop(stopId: string, toDriverId: string, index?: number): void;
  setStopStatus(stopId: string, status: StopStatus, notes?: string): void;
  setActiveDriver(id: string | null): void;
  toggleDriverVisibility(driverId: string): void;
  setSelectedStop(id: string | null): void;
  showToast(message: string, tone?: ToastTone): void;
  dismissToast(): void;
  setHasHydrated(v: boolean): void;
  exportRoutesJson(): string;
}

/** Shape of `GET /api/seed` (and of the local `getSeed()` fallback). */
interface SeedPayload {
  depot: Depot;
  drivers: Driver[];
  stops: Stop[];
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** localStorage key. Bump the suffix when the persisted shape changes. */
export const PERSIST_KEY = 'routeiq-v1';

/** Known failure reasons — used to keep notes tidy when a stop is re-attempted. */
const FAILURE_REASONS = ['No one home', 'Wrong address', 'Damaged', 'Other'] as const;

/** Monotonic toast id so identical consecutive messages still re-trigger. */
let toastSeq = 0;

/** No-op storage used during SSR so persist never touches `window`. */
const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Light structural check on the seed payload before trusting the network. */
function isSeedPayload(v: unknown): v is SeedPayload {
  return (
    isRecord(v) &&
    isRecord(v.depot) &&
    typeof v.depot.lat === 'number' &&
    Array.isArray(v.drivers) &&
    Array.isArray(v.stops)
  );
}

/** Light structural check on an optimize response before trusting the network. */
function isOptimizeResponse(v: unknown): v is OptimizeResponse {
  return (
    isRecord(v) &&
    Array.isArray(v.routes) &&
    isRecord(v.metrics) &&
    typeof v.algorithm === 'string' &&
    typeof v.computeMs === 'number'
  );
}

/**
 * Compose stop notes when a status change carries a reason (e.g. a failed
 * delivery). We keep the original seed notes visible for the dispatcher by
 * producing `"<reason> · <original notes>"`. If the notes already start with
 * the reason we leave them alone; if they start with a *different* known
 * failure reason from a previous attempt, that prefix is replaced instead of
 * being stacked. Reverting to `pending` leaves notes untouched (demo
 * simplicity — the dispatcher still sees what happened last time).
 */
function composeNotes(reason: string, current: string | undefined): string {
  const trimmedReason = reason.trim();
  if (!current) return trimmedReason;
  if (current.startsWith(trimmedReason)) return current;

  // Strip a stale "<known reason> · " prefix from an earlier attempt.
  let base = current;
  for (const known of FAILURE_REASONS) {
    const prefix = `${known} · `;
    if (base.startsWith(prefix)) {
      base = base.slice(prefix.length);
      break;
    }
    if (base === known) {
      base = '';
      break;
    }
  }
  return base ? `${trimmedReason} · ${base}` : trimmedReason;
}

/**
 * Derive `driverId -> ordered stopIds` from the current routes, guaranteeing a
 * key for every driver (possibly `[]`) as `schedule()` requires.
 */
function assignmentsFromRoutes(drivers: Driver[], routes: Route[]): Record<string, string[]> {
  const assignments: Record<string, string[]> = {};
  for (const d of drivers) assignments[d.id] = [];
  for (const r of routes) {
    if (r.driverId in assignments) assignments[r.driverId] = [...r.stopIds];
  }
  return assignments;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      depot: null,
      drivers: [],
      stops: [],
      routes: null,
      baselineMetrics: null,
      optimizedMetrics: null,
      algorithm: null,
      computeMs: null,
      isOptimizing: false,
      optimizeError: null,
      lastOptimizedAt: null,
      activeDriverId: null,
      hiddenDriverIds: [],
      selectedStopId: null,
      hasHydrated: false,
      toast: null,

      // -- data loading -----------------------------------------------------

      async loadSeed() {
        // Already loaded (possibly rehydrated from localStorage): keep it —
        // that is what preserves delivery progress across reloads.
        if (get().depot) return;

        let seed: SeedPayload | null = null;
        try {
          const res = await fetch('/api/seed', { cache: 'no-store' });
          if (res.ok) {
            const json: unknown = await res.json();
            if (isSeedPayload(json)) seed = json;
          }
        } catch {
          // network / parsing failure — fall through to the local seed
        }
        if (!seed) seed = getSeed();

        // Guard against a concurrent load that finished while we awaited.
        if (get().depot) return;
        set({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops });
      },

      // -- optimization -----------------------------------------------------

      async optimize() {
        const state = get();
        if (state.isOptimizing) return; // ignore concurrent calls
        if (!state.depot) {
          state.showToast('Load the demo data first', 'error');
          return;
        }

        set({ isOptimizing: true, optimizeError: null });

        // Status does not affect planning: delivered/failed stops are still
        // part of the plan (they simply render as done in the UI).
        const req: OptimizeRequest = {
          depot: state.depot,
          drivers: state.drivers,
          stops: state.stops,
        };

        try {
          let result: OptimizeResponse | null = null;
          try {
            const res = await fetch('/api/optimize', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(req),
            });
            if (res.ok) {
              const json: unknown = await res.json();
              if (isOptimizeResponse(json)) result = json;
              else console.warn('[RouteIQ] /api/optimize returned an unexpected shape; optimizing locally');
            } else {
              console.warn(`[RouteIQ] /api/optimize responded ${res.status}; optimizing locally`);
            }
          } catch (err) {
            console.warn('[RouteIQ] /api/optimize unreachable; optimizing locally', err);
          }
          if (!result) result = optimizeLocal(req);

          // Baseline ("before") is always computed locally — it is cheap.
          const base = baseline(req);

          set({
            routes: result.routes,
            optimizedMetrics: result.metrics,
            baselineMetrics: base.metrics,
            algorithm: result.algorithm,
            computeMs: result.computeMs,
            lastOptimizedAt: new Date().toISOString(),
            isOptimizing: false,
            optimizeError: null,
          });
          get().showToast(`Optimized in ${Math.round(result.computeMs)} ms · ${result.algorithm}`, 'success');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Optimization failed';
          set({ isOptimizing: false, optimizeError: message });
          get().showToast(message, 'error');
        }
      },

      async resetDemo() {
        set({
          depot: null,
          drivers: [],
          stops: [],
          routes: null,
          baselineMetrics: null,
          optimizedMetrics: null,
          algorithm: null,
          computeMs: null,
          lastOptimizedAt: null,
          optimizeError: null,
          isOptimizing: false,
          selectedStopId: null,
          hiddenDriverIds: [],
          // activeDriverId is intentionally kept so the driver phone stays on
          // its driver after a reset.
        });
        await get().loadSeed(); // depot is null → fetches a fresh seed with fresh statuses
        get().showToast('Demo reset', 'info');
      },

      // -- manual reassignment ---------------------------------------------

      moveStop(stopId, toDriverId, index) {
        const { depot, drivers, stops, routes } = get();
        if (!depot || !routes) return;
        if (!drivers.some((d) => d.id === toDriverId)) return;
        if (!stops.some((s) => s.id === stopId)) return;

        const assignments = assignmentsFromRoutes(drivers, routes);

        // Remove from wherever it currently sits (it may be unassigned).
        for (const id of Object.keys(assignments)) {
          assignments[id] = assignments[id].filter((s) => s !== stopId);
        }

        // Insert at the requested position (default append; clamped).
        const target = assignments[toDriverId];
        const at =
          index === undefined || Number.isNaN(index)
            ? target.length
            : Math.max(0, Math.min(Math.trunc(index), target.length));
        target.splice(at, 0, stopId);

        const out = schedule({ depot, drivers, stops, assignments });
        set({ routes: out.routes, optimizedMetrics: out.metrics });
      },

      // -- driver progress --------------------------------------------------

      setStopStatus(stopId, status, notes) {
        set((s) => ({
          stops: s.stops.map((stop) => {
            if (stop.id !== stopId) return stop;
            const next: Stop = { ...stop, status };
            // `deliveredAt` records the attempt time for delivered AND failed;
            // it is cleared when a stop is reverted to pending.
            if (status === 'pending') {
              delete next.deliveredAt;
            } else {
              next.deliveredAt = new Date().toISOString();
            }
            if (notes !== undefined && notes.trim() !== '') {
              next.notes = composeNotes(notes, stop.notes);
            }
            return next;
          }),
        }));
      },

      // -- UI state ---------------------------------------------------------

      setActiveDriver(id) {
        set({ activeDriverId: id });
      },

      toggleDriverVisibility(driverId) {
        set((s) => ({
          hiddenDriverIds: s.hiddenDriverIds.includes(driverId)
            ? s.hiddenDriverIds.filter((id) => id !== driverId)
            : [...s.hiddenDriverIds, driverId],
        }));
      },

      setSelectedStop(id) {
        set({ selectedStopId: id });
      },

      showToast(message, tone = 'info') {
        toastSeq += 1;
        set({ toast: { id: toastSeq, message, tone } });
      },

      dismissToast() {
        set({ toast: null });
      },

      setHasHydrated(v) {
        set({ hasHydrated: v });
      },

      // -- export -----------------------------------------------------------

      exportRoutesJson() {
        const { depot, drivers, routes, optimizedMetrics } = get();
        return JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            depot,
            drivers,
            routes: routes ?? [],
            metrics: optimizedMetrics,
          },
          null,
          2,
        );
      },
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() =>
        typeof window !== 'undefined' ? window.localStorage : noopStorage,
      ),
      // Persist data + durable UI prefs only; ephemeral flags stay in memory.
      partialize: (s) => ({
        depot: s.depot,
        drivers: s.drivers,
        stops: s.stops,
        routes: s.routes,
        baselineMetrics: s.baselineMetrics,
        optimizedMetrics: s.optimizedMetrics,
        algorithm: s.algorithm,
        computeMs: s.computeMs,
        lastOptimizedAt: s.lastOptimizedAt,
        activeDriverId: s.activeDriverId,
        hiddenDriverIds: s.hiddenDriverIds,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) console.warn('[RouteIQ] failed to rehydrate persisted state', error);
        state?.setHasHydrated(true);
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Hooks & selectors
// ---------------------------------------------------------------------------

const subscribeHydration = (cb: () => void) => useAppStore.persist.onFinishHydration(cb);
const getHydrated = () => useAppStore.persist.hasHydrated();
const getServerHydrated = () => false;

/**
 * `false` during SSR and the hydration render, `true` after mount — even when
 * persist rehydrated synchronously before this component subscribed (the
 * client snapshot reads `persist.hasHydrated()` directly, so it does not
 * depend on catching the finish event).
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(subscribeHydration, getHydrated, getServerHydrated);
}

/** The route currently assigned to a driver (undefined before optimization). */
export function selectRouteForDriver(state: AppState, driverId: string): Route | undefined {
  return state.routes?.find((r) => r.driverId === driverId);
}

/** stopId -> Stop lookup. Derive with useMemo (new object each call). */
export function selectStopsById(state: AppState): Record<string, Stop> {
  const byId: Record<string, Stop> = {};
  for (const s of state.stops) byId[s.id] = s;
  return byId;
}

/** stopId -> driver hex color, for assigned stops only. Derive with useMemo. */
export function selectDriverColorByStopId(state: AppState): Record<string, string> {
  const colorByDriver: Record<string, string> = {};
  for (const d of state.drivers) colorByDriver[d.id] = d.color;
  const out: Record<string, string> = {};
  for (const r of state.routes ?? []) {
    const color = colorByDriver[r.driverId];
    if (!color) continue;
    for (const id of r.stopIds) out[id] = color;
  }
  return out;
}

export interface DriverProgress {
  total: number;
  done: number; // delivered + failed
  delivered: number;
  failed: number;
  nextIndex: number; // index (in route order) of the first pending stop, -1 when complete
}

/** Progress summary for a driver's route (safe for `undefined` route). */
export function driverProgress(
  route: Route | undefined,
  stopsById: Record<string, Stop>,
): DriverProgress {
  if (!route) return { total: 0, done: 0, delivered: 0, failed: 0, nextIndex: -1 };
  let delivered = 0;
  let failed = 0;
  let nextIndex = -1;
  route.stopIds.forEach((id, i) => {
    const status = stopsById[id]?.status ?? 'pending';
    if (status === 'delivered') delivered += 1;
    else if (status === 'failed') failed += 1;
    else if (nextIndex === -1) nextIndex = i;
  });
  return {
    total: route.stopIds.length,
    done: delivered + failed,
    delivered,
    failed,
    nextIndex,
  };
}
