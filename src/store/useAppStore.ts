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
 * (Known limit: the whole slice is applied last-writer-wins, so two tabs that
 * both write within the same few milliseconds - before either has received the
 * other's `storage` event - keep the later blob and lose the earlier edit. A
 * demo-sized trade-off; field-level merging is not worth its complexity here.)
 * Values that only describe THIS tab must not be re-derived from a synced
 * value in an effect (see `DriverRouteScreen`), or two tabs ping-pong forever.
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
import { schedule } from '@/lib/optimizer/schedule';
import type {
  DeliveryEvent,
  DeliveryProof,
  Depot,
  Driver,
  FailureReason,
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

/**
 * Optional single action rendered inside the toast (e.g. "Undo" after a
 * delivery). Not persisted — like the toast itself it only lives in memory.
 */
export interface ToastAction {
  label: string;
  onAction: () => void;
}

export interface ToastState {
  id: number;
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
}

/**
 * Which success toast `optimize()` shows. The dispatcher wants the numbers
 * ("Optimized in 70 ms · nn-2opt-v1" — the point of the demo); the driver whose
 * screen silently prepared its own plan (#45) wants to hear that their route is
 * ready, not the name of an algorithm. `'none'` stays quiet (failures still
 * toast — the driver screen shows a "Try again" state behind it).
 */
export type OptimizeToast = 'dispatch' | 'driver' | 'none';

export interface OptimizeActionOptions {
  toast?: OptimizeToast;
}

/** What the driver app passes to `recordDelivery` (the store stamps `at`). */
export type DeliveryProofInput = Omit<DeliveryProof, 'at'>;

/** Outcome of `recordDelivery`, so the UI can explain a dropped photo. */
export interface RecordDeliveryResult {
  ok: boolean;
  /** True when the photo was discarded to stay inside the storage budget. */
  photoDropped: boolean;
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
  /** True once the plan was changed by hand (move / drag) after the last optimisation. */
  editedSinceOptimize: boolean;
  activeDriverId: string | null; // last chosen driver on /driver
  hiddenDriverIds: string[]; // legend toggles on the dispatcher map
  /** Append-only driver activity log (oldest dropped past `MAX_LOG_EVENTS`). */
  deliveryLog: DeliveryEvent[];
  selectedStopId: string | null; // NOT persisted
  hasHydrated: boolean; // NOT persisted; set true once persist finished (or failed) rehydrating
  toast: ToastState | null; // NOT persisted

  // actions
  loadSeed(): Promise<void>;
  /** Plan today's routes. `optimize()` with no argument keeps the dispatcher toast. */
  optimize(options?: OptimizeActionOptions): Promise<void>;
  resetDemo(): Promise<void>;
  /**
   * Manual reassignment (drag-and-drop, "Move to…", map popup). Works before
   * any optimisation too (bootstraps an empty plan). Returns `true` when the
   * plan actually changed, `false` for a no-op, an unknown stop / driver, or a
   * stop that is already delivered / failed (a done stop stays where it was
   * done; moving it would credit another driver and pad their ETAs) —
   * callers should only toast on `true`.
   */
  moveStop(stopId: string, toDriverId: string, index?: number): boolean;
  setStopStatus(stopId: string, status: StopStatus, notes?: string): void;
  /**
   * Driver marks a stop delivered WITH proof: stamps `stop.proof`, flips the
   * status and appends a `delivered` event. The photo is dropped (and reported
   * back) when it would push the persisted blob past `PHOTO_BUDGET_BYTES`.
   */
  recordDelivery(stopId: string, proof?: DeliveryProofInput): RecordDeliveryResult;
  /** Driver marks a stop failed: reason into the notes (as before) + a log event. */
  recordFailure(stopId: string, reason: FailureReason, note?: string): boolean;
  /** Undo a delivered / failed stop: back to pending, proof cleared, `undo` event. */
  undoStop(stopId: string): boolean;
  /**
   * "Skip for now": move a still-pending stop to the END of the same driver's
   * route (re-schedules ETAs) and log a `deferred` event. Returns false when
   * the stop is unknown, already done, unrouted, or already last. Unlike
   * `moveStop` it does NOT set `editedSinceOptimize` — no dispatcher edited
   * anything.
   */
  deferStop(stopId: string): boolean;
  setActiveDriver(id: string | null): void;
  toggleDriverVisibility(driverId: string): void;
  setSelectedStop(id: string | null): void;
  showToast(message: string, tone?: ToastTone, action?: ToastAction): void;
  dismissToast(): void;
  setHasHydrated(v: boolean): void;
  exportRoutesJson(): string;
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
  'editedSinceOptimize',
  'activeDriverId',
  'hiddenDriverIds',
  'deliveryLog',
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
  editedSinceOptimize: false,
  activeDriverId: null,
  hiddenDriverIds: [],
  deliveryLog: [],
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

/** Every `DeliveryEvent['type']` this build knows how to render (see the log guard). */
const DELIVERY_EVENT_TYPES = new Set<string>([
  'delivered',
  'failed',
  'undo',
  'deferred',
] satisfies DeliveryEvent['type'][]);

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
  editedSinceOptimize: (v): v is boolean => typeof v === 'boolean',
  activeDriverId: isNullOr((v): v is string => typeof v === 'string'),
  hiddenDriverIds: isStringArray,
  // Same shallow contract as the rest: an entry must at least identify itself,
  // its stop and its outcome. `type` is checked against the KNOWN set, not just
  // `typeof === 'string'`: every consumer looks the type up in a table
  // (`TYPE_META` in the activity log), so one event with a type from a future
  // build — or a hand-edited devtools entry — used to crash the whole
  // `/driver/[id]` screen on load, and "Try again" crashed again because the
  // blob is persisted. Unknown events are dropped here, at the door.
  deliveryLog: (v): v is DeliveryEvent[] =>
    Array.isArray(v) &&
    v.every(
      (e) =>
        isRecord(e) &&
        typeof e.id === 'string' &&
        typeof e.at === 'string' &&
        typeof e.stopId === 'string' &&
        typeof e.type === 'string' &&
        DELIVERY_EVENT_TYPES.has(e.type),
    ),
};

/**
 * The persisted slice of a state object, keys in `PERSISTED_KEYS` order (so
 * serialised blobs from any tab compare byte-for-byte). This is persist's
 * `partialize`, and what the cross-tab listener uses to predict its own write.
 */
function persistedSliceOf(s: PersistedSlice): PersistedSlice {
  const out = {} as PersistedSlice;
  for (const key of PERSISTED_KEYS) (out as Record<string, unknown>)[key] = s[key];
  return out;
}

/** Exactly the string `persistStorage.setItem` would store for this slice. */
function serializePersisted(slice: PersistedSlice): string {
  return JSON.stringify({ state: slice, version: PERSIST_VERSION });
}

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
    delete picked.editedSinceOptimize;
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

/**
 * Hard cap on the persisted activity log; the oldest entries are dropped.
 * 2000 events is ~300 KB of JSON worst case — far more than a demo day
 * (45 stops) ever produces, and it keeps a wedged/looping caller from filling
 * localStorage.
 */
export const MAX_LOG_EVENTS = 2000;

/**
 * Total budget for proof photos inside the persisted blob. localStorage is
 * ~5 MB per origin and the plan itself takes ~250 KB, so 1.5 MB of thumbnails
 * (≈ 40 at ~40 KB) is generous while leaving the plan room to grow. Over
 * budget, the delivery is still recorded — only the photo is dropped, and the
 * UI says so.
 */
export const PHOTO_BUDGET_BYTES = 1_500_000;

/** Monotonic toast id so identical consecutive messages still re-trigger. */
let toastSeq = 0;

/** Per-tab counter so two events in the same millisecond still differ. */
let eventSeq = 0;

/**
 * Event id: time-ordered prefix + a per-tab counter + a random suffix. Random
 * because two tabs (or two devices sharing a blob) would otherwise collide on
 * the same millisecond/counter pair; ids are only used as React keys and for
 * de-duplication, never as a sort key (that is `at`).
 */
function newEventId(at: number): string {
  eventSeq += 1;
  return `e${at.toString(36)}-${eventSeq.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Which driver currently owns a stop (the route it sits in), or '' when unrouted. */
function driverIdForStop(routes: Route[] | null, stopId: string): string {
  return routes?.find((r) => r.stopIds.includes(stopId))?.driverId ?? '';
}

/**
 * Bytes the proof photos already stored occupy: the length of each data URL,
 * which is what the persisted blob actually carries (they are ASCII → 1 byte
 * per character). The delivery sheet shows a photo's size with the same
 * measure (`storedPhotoBytes` in components/driver/photo.ts), so what the
 * driver reads on the sheet and what this budget counts can never disagree.
 */
function photoBytesInUse(stops: Stop[]): number {
  let bytes = 0;
  for (const s of stops) bytes += s.proof?.photo?.length ?? 0;
  return bytes;
}

/** Append one event to the log, dropping the oldest beyond `MAX_LOG_EVENTS`. */
function appendEvent(log: DeliveryEvent[], event: DeliveryEvent): DeliveryEvent[] {
  const next = [...log, event];
  return next.length > MAX_LOG_EVENTS ? next.slice(next.length - MAX_LOG_EVENTS) : next;
}

/** Drop empty / whitespace-only strings so the blob never carries `""`. */
function trimmed(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/** Light structural check on an optimize response before trusting the network. */
const HHMM_RE = /^\d{1,2}:\d{2}$/;

/**
 * Structural check on what `/api/optimize` returned. A swapped-in algorithm
 * (the whole point of the endpoint) is the most likely source of surprises, so
 * routes must have `stopIds`/`legs` arrays and every ETA must be "HH:MM" -
 * anything else falls back to the local optimizer instead of reaching the UI.
 */
function isOptimizeResponse(v: unknown): v is OptimizeResponse {
  if (!isRecord(v) || !Array.isArray(v.routes) || !isRecord(v.metrics)) return false;
  if (typeof v.algorithm !== 'string' || typeof v.computeMs !== 'number') return false;
  if (!Array.isArray(v.unassignedStopIds)) return false;
  return v.routes.every((r) => {
    if (!isRecord(r) || typeof r.driverId !== 'string') return false;
    if (!Array.isArray(r.stopIds) || !Array.isArray(r.legs) || !isRecord(r.etaByStopId)) return false;
    return Object.values(r.etaByStopId).every((eta) => typeof eta === 'string' && HHMM_RE.test(eta));
  });
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

/**
 * The plan that results from moving `stopId` onto `toDriverId` at `index`
 * (default: append), or `null` when the move is impossible (no depot, unknown
 * driver / stop, a stop that is already done) or changes nothing.
 *
 * Pure — it reads a state snapshot and returns the new plan without touching
 * the store — because two callers need the same reorder-and-reschedule with
 * DIFFERENT bookkeeping: `moveStop` is a dispatcher's hand edit and sets
 * `editedSinceOptimize` (the panel then says "edited by hand"), while
 * `deferStop` is a driver's "Skip for now" and must not — the dispatcher never
 * touched this plan, and mislabelling it hides whether their own edits are
 * still in place.
 */
function planAfterMove(
  state: Pick<AppState, 'depot' | 'drivers' | 'stops' | 'routes'>,
  stopId: string,
  toDriverId: string,
  index?: number,
): { routes: Route[]; optimizedMetrics: RouteMetrics } | null {
  const { depot, drivers, stops, routes } = state;
  if (!depot) return null;
  if (!drivers.some((d) => d.id === toDriverId)) return null;
  const stop = stops.find((s) => s.id === stopId);
  if (!stop) return null;
  if (stop.status !== 'pending') return null; // done stops are not movable

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

  if (sameAssignments(before, assignments)) return null; // dropped where it already was

  const out = schedule({ depot, drivers, stops, assignments });
  return { routes: out.routes, optimizedMetrics: out.metrics };
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

        // The seed is bundled into this very chunk (`getSeed()`), so fetching
        // `/api/seed` would only put a request — a serverless round trip on a
        // deployed origin — in front of the first map frame, which gates on
        // `depot`, for data we already hold. The endpoint stays for API
        // consumers; the app itself never waits on it. (Kept `async` so the
        // call sites' `await`/`void` stay valid.)
        const seed = getSeed();
        set({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops });
      },

      // -- optimization -----------------------------------------------------

      async optimize(options): Promise<void> {
        const toastStyle: OptimizeToast = options?.toast ?? 'dispatch';
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
          // The assignment / sequencing / repair stages are only needed when
          // the user actually optimizes (and the API is down), so they are
          // loaded on demand instead of riding along in every page's boot
          // chunk; `schedule()` above is the only piece needed synchronously
          // (manual moves). The load is allowed to FAIL on its own (a stale
          // deploy's hashed chunk is gone, the device is offline): it must not
          // throw away a plan the API already returned — that would turn a
          // missing "before" comparison into "Optimization failed".
          let optimizer: typeof import('@/lib/optimizer') | null = null;
          try {
            optimizer = await import('@/lib/optimizer');
          } catch (err) {
            console.warn('[RouteIQ] optimizer chunk unavailable', err);
          }
          if (!result) {
            // Nothing from the API and no local optimizer: there is no plan to
            // be had, and the catch below turns this into the error state.
            if (!optimizer) throw new Error('Optimizer unavailable offline');
            result = optimizer.optimize(req);
          }

          // Baseline ("before") is always computed locally — it is cheap — but
          // it is a comparison, not the plan: without the chunk the plan still
          // ships and the dispatcher simply sees no "before" numbers.
          const base = optimizer ? optimizer.baseline(req) : null;

          set({
            routes: result.routes,
            optimizedMetrics: result.metrics,
            baselineMetrics: base ? base.metrics : null,
            algorithm: result.algorithm,
            computeMs: result.computeMs,
            lastOptimizedAt: new Date().toISOString(),
            editedSinceOptimize: false,
            isOptimizing: false,
            optimizeError: null,
          });
          if (toastStyle === 'dispatch') {
            get().showToast(`Optimized in ${Math.round(result.computeMs)} ms · ${result.algorithm}`, 'success');
          } else if (toastStyle === 'driver') {
            get().showToast('Your route is ready', 'success');
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Optimization failed';
          set({ isOptimizing: false, optimizeError: message });
          // A failure is worth saying out loud whoever asked (the driver screen
          // shows its "Try again" state behind the toast); only 'none' is mute.
          if (toastStyle !== 'none') get().showToast(message, 'error');
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
          editedSinceOptimize: false,
          optimizeError: null,
          isOptimizing: false,
          selectedStopId: null,
          hiddenDriverIds: [],
          // Statuses go back to pending, so yesterday's records would describe
          // deliveries that no longer exist: clear the log with them.
          deliveryLog: [],
          // activeDriverId is intentionally kept so the driver phone stays on
          // its driver after a reset.
        });
        // depot is null → loadSeed() loads a fresh (deep-cloned) bundled seed,
        // so every status is back to pending. No network is involved.
        await get().loadSeed();
        get().showToast('Demo reset', 'info');
      },

      // -- manual reassignment ---------------------------------------------

      moveStop(stopId, toDriverId, index): boolean {
        // A hand edit: the plan is no longer purely what the optimizer produced.
        const next = planAfterMove(get(), stopId, toDriverId, index);
        if (!next) return false;
        set({ ...next, editedSinceOptimize: true });
        return true;
      },

      // -- driver progress --------------------------------------------------

      /**
       * Status changes:
       *  - `delivered` / `failed` stamp `deliveredAt` (attempt time); a reason
       *    passed as `notes` (failed) is prefixed onto the stop's notes via
       *    `composeNotes`; `failed` also clears any `proof` a previous
       *    successful delivery of that stop left behind;
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
              // An undone mis-tap must leave no trace: the proof of delivery
              // goes with the status (the log still records that it happened).
              delete next.proof;
              const restored = stripFailureReason(stop.notes);
              if (restored === undefined) delete next.notes;
              else next.notes = restored;
            } else {
              next.deliveredAt = new Date().toISOString();
              // A failed attempt must not inherit the previous delivery's
              // proof: the stop details sheet would show "Handed to recipient"
              // and the photo of a parcel that is back in the van, and the
              // photo would keep eating the storage budget. `recordFailure`
              // stamps its own `{ at, note }` after this.
              if (status === 'failed') delete next.proof;
            }
            if (notes !== undefined && notes.trim() !== '') {
              next.notes = composeNotes(notes, next.notes);
            }
            return next;
          }),
        }));
      },

      // -- driver records (proof of delivery + activity log) -----------------
      //
      // These are the actions the driver app calls; `setStopStatus` stays the
      // low-level primitive (used by the dispatcher-side flows and by these).
      // Every one of them appends exactly one `DeliveryEvent`, so components
      // never build log entries by hand and the log can be trusted as the
      // single source for the activity sheet and the end-of-day report.

      recordDelivery(stopId, proof): RecordDeliveryResult {
        const state = get();
        const stop = state.stops.find((s) => s.id === stopId);
        if (!stop) return { ok: false, photoDropped: false };

        const now = new Date();
        const at = now.toISOString();
        const photo = trimmed(proof?.photo);
        // Keep the persisted blob inside its budget: the delivery is recorded
        // either way, only the picture is sacrificed (the caller toasts).
        const photoDropped =
          photo !== undefined && photoBytesInUse(state.stops) + photo.length > PHOTO_BUDGET_BYTES;
        const stored: DeliveryProof = { at };
        if (proof?.method) stored.method = proof.method;
        const recipientName = trimmed(proof?.recipientName);
        if (recipientName) stored.recipientName = recipientName;
        const note = trimmed(proof?.note);
        if (note) stored.note = note;
        if (photo && !photoDropped) stored.photo = photo;

        const event: DeliveryEvent = {
          id: newEventId(now.getTime()),
          at,
          driverId: driverIdForStop(state.routes, stopId),
          stopId,
          type: 'delivered',
        };
        if (stored.method) event.method = stored.method;
        if (recipientName) event.recipientName = recipientName;
        if (note) event.note = note;
        if (stored.photo) event.hasPhoto = true;

        set((s) => ({
          stops: s.stops.map((x) =>
            x.id === stopId ? { ...x, status: 'delivered', deliveredAt: at, proof: stored } : x,
          ),
          deliveryLog: appendEvent(s.deliveryLog, event),
        }));
        return { ok: true, photoDropped };
      },

      recordFailure(stopId, reason, note): boolean {
        const state = get();
        if (!state.stops.some((s) => s.id === stopId)) return false;
        const trimmedNote = trimmed(note);
        // The reason still goes into `notes` (unchanged mechanism, #25); the
        // free-text note rides along on `proof` so the dispatcher sees it too.
        state.setStopStatus(stopId, 'failed', reason);
        const at = new Date().toISOString();
        set((s) => ({
          stops: trimmedNote
            ? s.stops.map((x) => (x.id === stopId ? { ...x, proof: { at, note: trimmedNote } } : x))
            : s.stops,
          deliveryLog: appendEvent(s.deliveryLog, {
            id: newEventId(Date.now()),
            at,
            driverId: driverIdForStop(s.routes, stopId),
            stopId,
            type: 'failed',
            reason,
            ...(trimmedNote ? { note: trimmedNote } : {}),
          }),
        }));
        return true;
      },

      undoStop(stopId): boolean {
        const state = get();
        const stop = state.stops.find((s) => s.id === stopId);
        if (!stop || stop.status === 'pending') return false;
        state.setStopStatus(stopId, 'pending');
        set((s) => ({
          deliveryLog: appendEvent(s.deliveryLog, {
            id: newEventId(Date.now()),
            at: new Date().toISOString(),
            driverId: driverIdForStop(s.routes, stopId),
            stopId,
            type: 'undo',
          }),
        }));
        return true;
      },

      deferStop(stopId): boolean {
        const state = get();
        const stop = state.stops.find((s) => s.id === stopId);
        if (!stop || stop.status !== 'pending') return false;
        const driverId = driverIdForStop(state.routes, stopId);
        if (!driverId) return false;
        // Same reorder + re-schedule as a dispatcher move (same driver, no index
        // = append), so ETAs/metrics stay consistent — but deliberately WITHOUT
        // `editedSinceOptimize`: a driver skipping their own stop is not the
        // dispatcher editing the plan by hand, and the dispatcher panel used to
        // claim it was. `null` here means the stop is already last (nothing to
        // skip), which the caller explains in a toast.
        const next = planAfterMove(state, stopId, driverId);
        if (!next) return false;
        set((s) => ({
          ...next,
          deliveryLog: appendEvent(s.deliveryLog, {
            id: newEventId(Date.now()),
            at: new Date().toISOString(),
            driverId,
            stopId,
            type: 'deferred',
          }),
        }));
        return true;
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

      showToast(message, tone = 'info', action) {
        toastSeq += 1;
        set({ toast: { id: toastSeq, message, tone, ...(action ? { action } : {}) } });
      },

      dismissToast() {
        set({ toast: null });
      },

      setHasHydrated(v) {
        set({ hasHydrated: v });
      },

      // -- export -----------------------------------------------------------

      /**
       * Self-contained plan export: everything a consumer needs to resolve the
       * ids in `routes` (the stops themselves, with status and windows), plus
       * the "before" numbers and where the plan came from.
       */
      exportRoutesJson() {
        const { depot, drivers, stops, routes, optimizedMetrics, baselineMetrics, algorithm, lastOptimizedAt } =
          get();
        const assigned = new Set((routes ?? []).flatMap((r) => r.stopIds));
        return JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            algorithm,
            optimizedAt: lastOptimizedAt,
            depot,
            drivers,
            stops,
            routes: routes ?? [],
            unassignedStopIds: stops.filter((s) => !assigned.has(s.id)).map((s) => s.id),
            metrics: optimizedMetrics,
            baselineMetrics,
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
      partialize: (s): PersistedSlice => persistedSliceOf(s),
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

/**
 * "Installed" flag lives on `window`, not in module scope: in development a
 * hot reload re-evaluates this module, and a module-level flag would leave the
 * previous listener (bound to the orphaned store) attached alongside the new one.
 */
const CROSS_TAB_FLAG = '__routeiqCrossTabSync';

/**
 * Listen for writes to `PERSIST_KEY` made by OTHER tabs (the `storage` event
 * never fires in the writing tab) and apply their persisted slice to this
 * tab's store. Only the persisted keys are touched — selection, toast,
 * hydration and optimisation flags stay local. Installed once per page; safe
 * to call on the server (no-op). Exported for tests.
 */
export function installCrossTabSync(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { [CROSS_TAB_FLAG]?: () => void };
  w[CROSS_TAB_FLAG]?.(); // dev HMR: detach the previous module instance's listener
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PERSIST_KEY) return; // includes `null` (storage.clear()) — keep our copy
    if (!e.newValue) return; // key removed by another tab (reset / corrupt blob) — keep our copy
    try {
      const parsed: unknown = JSON.parse(e.newValue);
      if (!isRecord(parsed)) return;
      const partial = pickPersisted(parsed.state);
      if (Object.keys(partial).length === 0) return;
      // Record what THIS tab will serialise after applying the update as "what
      // storage holds", so the write that `setState` triggers is recognised as
      // identical and skipped (no echo, no ping-pong between tabs). Computed
      // from the merged slice rather than taken verbatim from `e.newValue`:
      // a blob from a tab running an older/newer build (a key added or dropped
      // since) would otherwise never compare equal and each tab would echo the
      // other's writes back forever.
      knownStored = serializePersisted({ ...persistedSliceOf(useAppStore.getState()), ...partial });
      useAppStore.setState(partial);
    } catch (err) {
      console.warn('[RouteIQ] ignoring unreadable cross-tab update', err);
    }
  };
  window.addEventListener('storage', onStorage);
  w[CROSS_TAB_FLAG] = () => window.removeEventListener('storage', onStorage);
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

/**
 * Progress summary for a driver's route (safe for `undefined` route). Stop ids
 * that are not in `stopsById` (inconsistent persisted / cross-tab data) are
 * skipped entirely - they are neither counted nor offered as the next stop, so
 * the screen can never wedge on a stop it cannot show.
 */
export function driverProgress(
  route: Route | undefined,
  stopsById: Record<string, Stop>,
): DriverProgress {
  if (!route) return { total: 0, done: 0, delivered: 0, failed: 0, nextIndex: -1 };
  let total = 0;
  let delivered = 0;
  let failed = 0;
  let nextIndex = -1;
  route.stopIds.forEach((id, i) => {
    const stop = stopsById[id];
    if (!stop) return;
    total += 1;
    if (stop.status === 'delivered') delivered += 1;
    else if (stop.status === 'failed') failed += 1;
    else if (nextIndex === -1) nextIndex = i;
  });
  return {
    total,
    done: delivered + failed,
    delivered,
    failed,
    nextIndex,
  };
}
