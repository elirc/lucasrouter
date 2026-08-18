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
 * Storage goes through a small custom `PersistStorage` (`persistStorage`)
 * rather than the stock `createJSONStorage`, because:
 *   * it is TOLERANT — every `localStorage` access is wrapped in try/catch
 *     (Safari "block all cookies", sandboxed iframes, quota errors) and a
 *     corrupt blob is discarded instead of throwing, so the app always boots
 *     into a usable (default) state and `loadSeed()` runs;
 *   * it DEDUPES writes — zustand re-serialises the whole persisted slice on
 *     EVERY `set`, including ephemeral-only ones (toast, marker selection).
 *     `setItem` compares the serialised blob against the last value it knows to
 *     be in storage and skips identical writes, so a tab that only shows a
 *     toast never overwrites what another tab persisted in the meantime.
 *
 * CROSS-TAB SYNC
 * --------------
 * `installCrossTabSync()` (called once on the client) listens to the `storage`
 * event and applies the *persisted slices* written by another tab straight into
 * this tab's store (`useAppStore.setState(partial)`), never touching the
 * ephemeral fields and never flipping the hydration flag. Combined with the
 * write dedupe above, /dispatch and /driver tabs stay consistent: a driver's
 * "Delivered" shows up in the open dispatcher tab, and a dispatcher's move shows
 * up on the open driver tab, instead of the two clobbering each other.
 *
 * Storage is only touched in the browser (`typeof window !== 'undefined'`);
 * on the server every storage call is a no-op / null so importing this module
 * from a server bundle never throws and never warns.
 *
 * HYDRATION GATING
 * ----------------
 * Because the persisted state only exists on the client, the very first
 * client render must produce the same markup as the server (which knows
 * nothing about localStorage). Pages therefore render skeletons until
 * `useHasHydrated()` returns true, and only then read the store for real
 * content. Hydration is tracked by a module-level flag that persist's
 * `onRehydrateStorage` callback sets in BOTH its success and error branches
 * (zustand's own `persist.hasHydrated()` stays false forever after an error,
 * which would leave every page on its skeleton). `useHasHydrated()` uses
 * `useSyncExternalStore` with a server snapshot of `false`, so it is `false`
 * during SSR / hydration and `true` right after mount — even when persist
 * finished rehydrating synchronously (localStorage is synchronous) before any
 * React subscription existed.
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
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware';

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
  routes: Route[] | null; // null until optimized (or until the first manual reassignment)
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
  hasHydrated: boolean; // NOT persisted; set true once persist finished (or failed) rehydrating
  toast: ToastState | null; // NOT persisted

  // actions
  loadSeed(): Promise<void>;
  optimize(): Promise<void>;
  resetDemo(): Promise<void>;
  /**
   * Manual reassignment (drag-and-drop, "Move to…", map popup). Works before
   * any optimisation too (bootstraps an empty plan). Returns `true` when the
   * plan actually changed, `false` for a no-op or an unknown stop / driver —
   * callers should only toast on `true`.
   */
  moveStop(stopId: string, toDriverId: string, index?: number): boolean;
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
// Persistence internals
// ---------------------------------------------------------------------------

/** localStorage key. Bump the suffix when the persisted shape changes. */
export const PERSIST_KEY = 'routeiq-v1';

/**
 * Persisted-blob version (zustand writes `{ state, version }`). Version 0 blobs
 * (pre-1 builds) carried plans computed with straight-line km; `migrate` keeps
 * everything from them except the plan (see `migratePersisted`).
 */
export const PERSIST_VERSION = 1;

/** The keys of `AppState` that survive a reload, in the order they are serialised. */
const PERSISTED_KEYS = [
  'depot',
  'drivers',
  'stops',
  'routes',
  'baselineMetrics',
  'optimizedMetrics',
  'algorithm',
  'computeMs',
  'lastOptimizedAt',
  'activeDriverId',
  'hiddenDriverIds',
] as const;

type PersistedKey = (typeof PERSISTED_KEYS)[number];

/** The slice of `AppState` that is written to storage. */
export type PersistedSlice = Pick<AppState, PersistedKey>;

/** Values a fresh (never persisted) store starts with; also used to fill migrations. */
const INITIAL_PERSISTED: PersistedSlice = {
  depot: null,
  drivers: [],
  stops: [],
  routes: null,
  baselineMetrics: null,
  optimizedMetrics: null,
  algorithm: null,
  computeMs: null,
  lastOptimizedAt: null,
  activeDriverId: null,
  hiddenDriverIds: [],
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isNullOr =
  <T>(guard: (v: unknown) => v is T) =>
  (v: unknown): v is T | null =>
    v === null || guard(v);
const hasId = (v: unknown): v is { id: string } => isRecord(v) && typeof v.id === 'string';
const isPoint = (v: unknown): v is { lat: number; lng: number } =>
  isRecord(v) && typeof v.lat === 'number' && typeof v.lng === 'number';

/**
 * Per-key structural guards for the persisted slice. Deliberately shallow: we
 * only reject shapes that would crash a selector or a page (a `stops` that is
 * not an array, a route without `stopIds`, ...). Anything deeper is the
 * optimizer's / UI's problem and would have come from this same code anyway.
 */
const PERSISTED_GUARDS: { [K in PersistedKey]: (v: unknown) => v is PersistedSlice[K] } = {
  depot: isNullOr((v): v is Depot => isPoint(v) && 'id' in v && typeof v.id === 'string'),
  drivers: (v): v is Driver[] => Array.isArray(v) && v.every(hasId),
  stops: (v): v is Stop[] => Array.isArray(v) && v.every((s) => hasId(s) && isPoint(s)),
  routes: isNullOr(
    (v): v is Route[] =>
      Array.isArray(v) &&
      v.every(
        (r) =>
          isRecord(r) && typeof r.driverId === 'string' && isStringArray(r.stopIds) && Array.isArray(r.legs),
      ),
  ),
  baselineMetrics: isNullOr((v): v is RouteMetrics => isRecord(v) && typeof v.totalDistanceKm === 'number'),
  optimizedMetrics: isNullOr((v): v is RouteMetrics => isRecord(v) && typeof v.totalDistanceKm === 'number'),
  algorithm: isNullOr((v): v is string => typeof v === 'string'),
  computeMs: isNullOr((v): v is number => typeof v === 'number'),
  lastOptimizedAt: isNullOr((v): v is string => typeof v === 'string'),
  activeDriverId: isNullOr((v): v is string => typeof v === 'string'),
  hiddenDriverIds: isStringArray,
};

/**
 * Pick the persisted keys out of an untrusted blob (`state` of a stored value,
 * possibly written by an older build, another tab, or a hand-edited devtools
 * entry). Keys that are missing or fail their guard are simply omitted, so the
 * caller keeps its current value for them.
 */
export function pickPersisted(raw: unknown): Partial<PersistedSlice> {
  const out: Partial<PersistedSlice> = {};
  if (!isRecord(raw)) return out;
  for (const key of PERSISTED_KEYS) pickKey(raw, key, out);
  return out;
}

/** Copy `raw[key]` into `out` when present and well-formed (generic so the guard's predicate narrows). */
function pickKey<K extends PersistedKey>(raw: Record<string, unknown>, key: K, out: Partial<PersistedSlice>): void {
  if (!(key in raw)) return;
  const value = raw[key];
  const guard: (v: unknown) => v is PersistedSlice[K] = PERSISTED_GUARDS[key];
  if (guard(value)) out[key] = value;
}

/**
 * Bring an older blob up to `PERSIST_VERSION`. Version 0 plans were computed
 * with straight-line km, so the plan (routes + metrics + optimisation info) is
 * dropped — re-optimising takes milliseconds — while data, delivery progress
 * and UI prefs are kept.
 */
function migratePersisted(raw: unknown, fromVersion: number): PersistedSlice {
  const picked = pickPersisted(raw);
  if (fromVersion < 1) {
    delete picked.routes;
    delete picked.baselineMetrics;
    delete picked.optimizedMetrics;
    delete picked.algorithm;
    delete picked.computeMs;
    delete picked.lastOptimizedAt;
  }
  return { ...INITIAL_PERSISTED, ...picked };
}

/** `window.localStorage`, or null when we are on the server or access throws. */
function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null; // Safari "Block all cookies", sandboxed iframe, ...
  }
}

/**
 * The serialised blob we last read from / wrote to / saw written to storage.
 * `persistStorage.setItem` skips writes that would store this exact string
 * (ephemeral-only updates), and the cross-tab listener records the incoming
 * blob here so applying it does not echo a write back.
 */
let knownStored: string | null = null;
let warnedWriteFailure = false;

/**
 * Tolerant, deduplicating JSON storage for `persist` (see file header). All
 * methods are safe to call on the server (no-ops / null).
 */
const persistStorage: PersistStorage<PersistedSlice> = {
  getItem(name): StorageValue<PersistedSlice> | null {
    const ls = safeLocalStorage();
    if (!ls) return null;
    let raw: string | null;
    try {
      raw = ls.getItem(name);
    } catch {
      return null;
    }
    if (raw === null) {
      knownStored = null;
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || !('state' in parsed)) throw new Error('unexpected persisted shape');
      knownStored = raw;
      return {
        // `merge` / `migrate` run every value through `pickPersisted`, so an
        // untyped `state` is fine here.
        state: parsed.state as PersistedSlice,
        version: typeof parsed.version === 'number' ? parsed.version : undefined,
      };
    } catch (err) {
      // A corrupt blob would otherwise throw inside persist's hydration and
      // leave the app on its skeleton forever. Drop it and start clean.
      console.warn('[RouteIQ] discarding unreadable persisted state', err);
      try {
        ls.removeItem(name);
      } catch {
        // ignore — nothing more we can do
      }
      knownStored = null;
      return null;
    }
  },

  setItem(name, value): void {
    const ls = safeLocalStorage();
    if (!ls) return;
    const serialized = JSON.stringify(value);
    // Ephemeral-only update (toast, selection, ...): the persisted slice is
    // byte-identical to what storage already holds — do not touch storage, so
    // we never overwrite a newer blob written by another tab.
    if (serialized === knownStored) return;
    try {
      ls.setItem(name, serialized);
      knownStored = serialized;
    } catch (err) {
      if (!warnedWriteFailure) {
        warnedWriteFailure = true;
        console.warn('[RouteIQ] could not persist state (storage full or disabled); continuing in memory', err);
      }
    }
  },

  removeItem(name): void {
    knownStored = null;
    const ls = safeLocalStorage();
    if (!ls) return;
    try {
      ls.removeItem(name);
    } catch {
      // ignore
    }
  },
};

// -- hydration flag ---------------------------------------------------------

let hydrated = false;
const hydrationListeners = new Set<() => void>();

/** Flip the module-level hydration flag (idempotent) and notify `useHasHydrated` subscribers. */
function markHydrated(): void {
  if (hydrated) return;
  hydrated = true;
  hydrationListeners.forEach((cb) => cb());
}

const subscribeHydration = (cb: () => void): (() => void) => {
  hydrationListeners.add(cb);
  return () => {
    hydrationListeners.delete(cb);
  };
};
const getHydrated = (): boolean => hydrated;
const getServerHydrated = (): boolean => false;

// ---------------------------------------------------------------------------
// Domain internals
// ---------------------------------------------------------------------------

/** Known failure reasons — used to keep notes tidy when a stop is re-attempted / undone. */
const FAILURE_REASONS = ['No one home', 'Wrong address', 'Damaged', 'Other'] as const;

/** Monotonic toast id so identical consecutive messages still re-trigger. */
let toastSeq = 0;

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
 * Remove a leading known failure reason (`"<reason>"` or `"<reason> · rest"`)
 * from a stop's notes and return what is left — `undefined` when nothing
 * remains. Notes that do not start with a known reason are returned unchanged.
 */
function stripFailureReason(notes: string | undefined): string | undefined {
  if (!notes) return undefined;
  for (const known of FAILURE_REASONS) {
    if (notes === known) return undefined;
    const prefix = `${known} · `;
    if (notes.startsWith(prefix)) {
      const rest = notes.slice(prefix.length).trim();
      return rest === '' ? undefined : rest;
    }
  }
  return notes;
}

/**
 * Compose stop notes when a status change carries a reason (e.g. a failed
 * delivery). We keep the original seed notes visible for the dispatcher by
 * producing `"<reason> · <original notes>"`. If the notes already start with
 * the reason we leave them alone; if they start with a *different* known
 * failure reason from a previous attempt, that prefix is replaced instead of
 * being stacked. Reverting to `pending` strips the prefix again (see
 * `setStopStatus`), so an undone mis-tap leaves no trace.
 */
function composeNotes(reason: string, current: string | undefined): string {
  const trimmedReason = reason.trim();
  if (!current) return trimmedReason;
  if (current.startsWith(trimmedReason)) return current;
  const base = stripFailureReason(current);
  return base ? `${trimmedReason} · ${base}` : trimmedReason;
}

/**
 * Derive `driverId -> ordered stopIds` from the current routes, guaranteeing a
 * key for every driver (possibly `[]`) as `schedule()` requires. With
 * `routes = null` (nothing optimised yet) this is an empty plan.
 */
function assignmentsFromRoutes(drivers: Driver[], routes: Route[] | null): Record<string, string[]> {
  const assignments: Record<string, string[]> = {};
  for (const d of drivers) assignments[d.id] = [];
  for (const r of routes ?? []) {
    if (r.driverId in assignments) assignments[r.driverId] = [...r.stopIds];
  }
  return assignments;
}

/** True when both assignment maps hold the same ordered ids for every driver. */
function sameAssignments(a: Record<string, string[]>, b: Record<string, string[]>): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => {
    const x = a[k];
    const y = b[k];
    return y !== undefined && x.length === y.length && x.every((id, i) => id === y[i]);
  });
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...INITIAL_PERSISTED,
      isOptimizing: false,
      optimizeError: null,
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

      moveStop(stopId, toDriverId, index): boolean {
        const { depot, drivers, stops, routes } = get();
        if (!depot) return false;
        if (!drivers.some((d) => d.id === toDriverId)) return false;
        if (!stops.some((s) => s.id === stopId)) return false;

        // Before any optimisation there is no plan: start from an empty one
        // (every driver `[]`) so the very first "Reassign to…" creates a route.
        // `algorithm` / `lastOptimizedAt` stay null (nothing was optimised) and
        // `baselineMetrics` stays null (there is no "before" to compare with).
        const before = assignmentsFromRoutes(drivers, routes);
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

        if (sameAssignments(before, assignments)) return false; // dropped where it already was

        const out = schedule({ depot, drivers, stops, assignments });
        set({ routes: out.routes, optimizedMetrics: out.metrics });
        return true;
      },

      // -- driver progress --------------------------------------------------

      /**
       * Status changes:
       *  - `delivered` / `failed` stamp `deliveredAt` (attempt time); a reason
       *    passed as `notes` (failed) is prefixed onto the stop's notes via
       *    `composeNotes`;
       *  - `pending` (undo / re-attempt) clears `deliveredAt` AND strips a
       *    leading known failure reason from the notes, restoring the original
       *    delivery instructions — otherwise the Next Stop card would show
       *    "No one home" as if it were an instruction.
       */
      setStopStatus(stopId, status, notes) {
        set((s) => ({
          stops: s.stops.map((stop) => {
            if (stop.id !== stopId) return stop;
            const next: Stop = { ...stop, status };
            if (status === 'pending') {
              delete next.deliveredAt;
              const restored = stripFailureReason(stop.notes);
              if (restored === undefined) delete next.notes;
              else next.notes = restored;
            } else {
              next.deliveredAt = new Date().toISOString();
            }
            if (notes !== undefined && notes.trim() !== '') {
              next.notes = composeNotes(notes, next.notes);
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
      version: PERSIST_VERSION,
      storage: persistStorage,
      // Persist data + durable UI prefs only; ephemeral flags stay in memory.
      // (Same key order as PERSISTED_KEYS so serialised blobs compare equal.)
      partialize: (s): PersistedSlice => ({
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
      // Only known keys with a sane shape make it into the store; anything else
      // keeps its default. Ephemeral fields are never in the blob.
      merge: (persisted, current) => ({ ...current, ...pickPersisted(persisted) }),
      migrate: migratePersisted,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('[RouteIQ] failed to rehydrate persisted state; starting from defaults', error);
          // Drop the offending blob so the next load does not hit it again.
          try {
            persistStorage.removeItem(PERSIST_KEY);
          } catch {
            // ignore
          }
          // `state` is undefined in the error branch, and `useAppStore` may
          // still be in its temporal dead zone (localStorage hydration runs
          // synchronously inside `create()`), so flip the store flag on the
          // next microtask.
          queueMicrotask(() => {
            try {
              useAppStore.setState({ hasHydrated: true });
            } catch {
              // ignore
            }
          });
        } else {
          state?.setHasHydrated(true);
        }
        // Either way the app is now allowed to render for real (and to load
        // the seed when the store came up empty).
        markHydrated();
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// Cross-tab sync
// ---------------------------------------------------------------------------

let crossTabInstalled = false;

/**
 * Listen for writes to `PERSIST_KEY` made by OTHER tabs (the `storage` event
 * never fires in the writing tab) and apply their persisted slice to this
 * tab's store. Only the persisted keys are touched — selection, toast,
 * hydration and optimisation flags stay local. Installed once per page; safe
 * to call on the server (no-op). Exported for tests.
 */
export function installCrossTabSync(): void {
  if (crossTabInstalled || typeof window === 'undefined') return;
  crossTabInstalled = true;
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== PERSIST_KEY) return; // includes `null` (storage.clear()) — keep our copy
    if (!e.newValue) return; // key removed by another tab (reset / corrupt blob) — keep our copy
    try {
      const parsed: unknown = JSON.parse(e.newValue);
      if (!isRecord(parsed)) return;
      const partial = pickPersisted(parsed.state);
      if (Object.keys(partial).length === 0) return;
      // Record the blob as "what storage holds" BEFORE applying it, so the
      // write that `setState` triggers is recognised as identical and skipped
      // (no echo, no ping-pong between tabs).
      knownStored = e.newValue;
      useAppStore.setState(partial);
    } catch (err) {
      console.warn('[RouteIQ] ignoring unreadable cross-tab update', err);
    }
  });
}

installCrossTabSync();

// ---------------------------------------------------------------------------
// Hooks & selectors
// ---------------------------------------------------------------------------

/**
 * `false` during SSR and the hydration render, `true` after mount — even when
 * persist rehydrated synchronously before this component subscribed (the
 * client snapshot reads the module-level flag directly, so it does not depend
 * on catching the finish event). Never throws: it does not touch
 * `useAppStore.persist` at all, and the flag is set even when rehydration
 * failed (the app then simply starts from defaults).
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
