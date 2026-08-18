import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSeed } from '@/data';
import type { Route, Stop } from '@/lib/types';

// The store module touches `window` / `localStorage` at import time (persist
// hydrates synchronously), so each test builds a fake `window`, installs it on
// `globalThis`, and imports a FRESH copy of the module (`vi.resetModules`).
// These tests pin the persistence contract: tolerant storage, write dedupe,
// cross-tab sync, hydration flag in every branch, migration — plus the two
// action fixes (`moveStop` before optimisation, undo strips the fail reason)
// and, further down, the actions themselves (loadSeed / optimize with `fetch`
// stubbed so the network fallbacks are exercised, moveStop index handling,
// resetDemo, exportRoutesJson, driverProgress and the selectors).

type StoreModule = typeof import('@/store/useAppStore');

class FakeStorage {
  private map = new Map<string, string>();
  /** Number of `setItem` calls made through the public API (the store's writes). */
  writes = 0;
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.writes += 1;
    this.map.set(k, v);
  }
  /** Simulate ANOTHER tab writing (does not count as one of our writes). */
  writeFromOtherTab(k: string, v: string): void {
    this.map.set(k, v);
  }
}

interface FakeWindow {
  localStorage: Storage;
  addEventListener(type: string, cb: (e: StorageEvent) => void): void;
  removeEventListener(type: string, cb: (e: StorageEvent) => void): void;
  /** Fire a `storage` event as the browser would for a write made in another tab. */
  fireStorage(e: { key: string | null; newValue: string | null }): void;
}

function makeWindow(storage: FakeStorage | 'throws'): FakeWindow {
  const listeners: ((e: StorageEvent) => void)[] = [];
  const win: FakeWindow = {
    // Replaced below when storage access must throw.
    localStorage: storage === 'throws' ? (null as unknown as Storage) : (storage as unknown as Storage),
    addEventListener(type, cb) {
      if (type === 'storage') listeners.push(cb);
    },
    removeEventListener() {
      /* not needed */
    },
    fireStorage(e) {
      for (const cb of listeners) cb(e as StorageEvent);
    },
  };
  if (storage === 'throws') {
    Object.defineProperty(win, 'localStorage', {
      get() {
        throw new Error('SecurityError: The operation is insecure.');
      },
    });
  }
  return win;
}

async function loadStore(win: FakeWindow): Promise<StoreModule> {
  vi.resetModules();
  (globalThis as { window?: unknown }).window = win;
  return import('@/store/useAppStore');
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const KEY = 'routeiq-v1';
const seed = getSeed();

/** A version-1 blob exactly as the store would write it (same key order). */
function blobV1(overrides: Partial<Record<string, unknown>> = {}, version: number = 1): string {
  return JSON.stringify({
    state: {
      depot: seed.depot,
      drivers: seed.drivers,
      stops: seed.stops,
      routes: null,
      baselineMetrics: null,
      optimizedMetrics: null,
      algorithm: null,
      computeMs: null,
      lastOptimizedAt: null,
      activeDriverId: null,
      hiddenDriverIds: [],
      ...overrides,
    },
    version,
  });
}

function withStatus(stops: Stop[], id: string, status: Stop['status']): Stop[] {
  return stops.map((s) => (s.id === id ? { ...s, status } : s));
}

describe('persistence: hydration and tolerant storage', () => {
  it('hydrates a valid blob and flips the hydration flag', async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1({ stops: withStatus(seed.stops, 'S001', 'delivered') }));
    const { useAppStore } = await loadStore(makeWindow(storage));
    const s = useAppStore.getState();
    expect(s.hasHydrated).toBe(true);
    expect(useAppStore.persist.hasHydrated()).toBe(true);
    expect(s.depot?.id).toBe('DEPOT');
    expect(s.stops.find((x) => x.id === 'S001')?.status).toBe('delivered');
    // Ephemeral fields keep their defaults even if a blob tried to smuggle them in.
    expect(s.selectedStopId).toBeNull();
    expect(s.toast).toBeNull();
  });

  it('discards a corrupt blob, removes it, and still hydrates (with defaults)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, '{not json');
    const { useAppStore } = await loadStore(makeWindow(storage));
    const s = useAppStore.getState();
    expect(s.hasHydrated).toBe(true); // pages leave the skeleton and call loadSeed()
    expect(useAppStore.persist.hasHydrated()).toBe(true);
    expect(s.depot).toBeNull();
    // The offending blob is gone: storage now holds a valid (default) blob.
    const stored = JSON.parse(storage.getItem(KEY)!) as { version: number; state: { depot: unknown } };
    expect(stored.version).toBe(1);
    expect(stored.state.depot).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('drops persisted keys with an invalid shape but keeps the valid ones', async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1({ stops: 'nope', hiddenDriverIds: [1, 2], activeDriverId: 'D2' }));
    const { useAppStore } = await loadStore(makeWindow(storage));
    const s = useAppStore.getState();
    expect(s.hasHydrated).toBe(true);
    expect(s.stops).toEqual([]); // invalid -> default
    expect(s.hiddenDriverIds).toEqual([]); // invalid -> default
    expect(s.activeDriverId).toBe('D2'); // valid -> kept
    expect(s.depot?.id).toBe('DEPOT');
  });

  it('boots and stays usable when localStorage access throws', async () => {
    const { useAppStore, useHasHydrated } = await loadStore(makeWindow('throws'));
    expect(useAppStore.persist).toBeDefined();
    expect(typeof useHasHydrated).toBe('function');
    expect(useAppStore.getState().hasHydrated).toBe(true);
    // Storage is simply absent: writes are silent no-ops, state still updates in memory.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    useAppStore.getState().setActiveDriver('D1');
    useAppStore.getState().setActiveDriver('D2');
    expect(useAppStore.getState().activeDriverId).toBe('D2');
    expect(warn).not.toHaveBeenCalled(); // storage is simply absent -> silent no-op
  });

  it('migrates a version-0 blob: keeps data + progress + prefs, drops the plan', async () => {
    const storage = new FakeStorage();
    const stops = withStatus(seed.stops, 'S003', 'failed');
    storage.writeFromOtherTab(
      KEY,
      blobV1(
        {
          stops,
          routes: [{ driverId: 'D1', stopIds: ['S003'], legs: [], totalDistanceKm: 1, totalMinutes: 1, etaByStopId: {} }],
          optimizedMetrics: { totalDistanceKm: 1, totalMinutes: 1, stopsPerDriver: {}, longestRouteMinutes: 1, timeWindowViolations: 0 },
          algorithm: 'nn-2opt-v1',
          activeDriverId: 'D3',
        },
        0,
      ),
    );
    const { useAppStore } = await loadStore(makeWindow(storage));
    const s = useAppStore.getState();
    expect(s.hasHydrated).toBe(true);
    expect(s.stops.find((x) => x.id === 'S003')?.status).toBe('failed');
    expect(s.activeDriverId).toBe('D3');
    expect(s.routes).toBeNull();
    expect(s.optimizedMetrics).toBeNull();
    expect(s.algorithm).toBeNull();
    // The migrated blob was written back at the new version.
    const stored = JSON.parse(storage.getItem(KEY)!) as { version: number; state: { routes: unknown } };
    expect(stored.version).toBe(1);
    expect(stored.state.routes).toBeNull();
  });
});

describe('persistence: write dedupe and cross-tab sync', () => {
  it('does not rewrite storage for ephemeral-only updates', async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1());
    const { useAppStore } = await loadStore(makeWindow(storage));
    const before = storage.writes;
    const st = useAppStore.getState();
    st.setSelectedStop('S005');
    st.showToast('hello', 'info');
    st.dismissToast();
    st.setSelectedStop(null);
    expect(storage.writes).toBe(before); // nothing persisted changed -> no write
    st.setStopStatus('S001', 'delivered');
    expect(storage.writes).toBe(before + 1); // a persisted slice changed -> exactly one write
    const stored = JSON.parse(storage.getItem(KEY)!) as { state: { stops: Stop[]; selectedStopId?: unknown } };
    expect(stored.state.stops.find((x) => x.id === 'S001')?.status).toBe('delivered');
    expect(stored.state.selectedStopId).toBeUndefined();
  });

  it("applies another tab's persisted slice from the storage event without echoing or clobbering", async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1());
    const win = makeWindow(storage);
    const { useAppStore } = await loadStore(win);
    useAppStore.getState().setSelectedStop('S009');
    useAppStore.getState().showToast('local toast', 'success');
    const writesBefore = storage.writes;

    // Other tab (driver) delivers S001 and picks driver D2.
    const otherBlob = blobV1({ stops: withStatus(seed.stops, 'S001', 'delivered'), activeDriverId: 'D2' });
    storage.writeFromOtherTab(KEY, otherBlob);
    win.fireStorage({ key: KEY, newValue: otherBlob });

    const s = useAppStore.getState();
    expect(s.stops.find((x) => x.id === 'S001')?.status).toBe('delivered');
    expect(s.activeDriverId).toBe('D2');
    // Local ephemeral state untouched, hydration flag untouched.
    expect(s.selectedStopId).toBe('S009');
    expect(s.toast?.message).toBe('local toast');
    expect(s.hasHydrated).toBe(true);
    // No echo write (the incoming blob is what storage already holds).
    expect(storage.writes).toBe(writesBefore);

    // A later ephemeral update in this tab still does not overwrite the other tab's progress...
    useAppStore.getState().dismissToast();
    expect(storage.writes).toBe(writesBefore);
    // ...and a real update here builds on top of it instead of clobbering it.
    useAppStore.getState().setStopStatus('S002', 'delivered');
    const stored = JSON.parse(storage.getItem(KEY)!) as { state: { stops: Stop[] } };
    expect(stored.state.stops.find((x) => x.id === 'S001')?.status).toBe('delivered');
    expect(stored.state.stops.find((x) => x.id === 'S002')?.status).toBe('delivered');
  });

  it('ignores storage events for other keys, removals and garbage', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1());
    const win = makeWindow(storage);
    const { useAppStore } = await loadStore(win);
    const snapshot = useAppStore.getState();

    win.fireStorage({ key: 'something-else', newValue: blobV1({ activeDriverId: 'D9' }) });
    win.fireStorage({ key: KEY, newValue: null }); // removed by another tab
    win.fireStorage({ key: null, newValue: null }); // storage.clear()
    win.fireStorage({ key: KEY, newValue: '{garbage' });
    win.fireStorage({ key: KEY, newValue: JSON.stringify({ state: { stops: 42, toast: { id: 1, message: 'x' } } }) });

    const s = useAppStore.getState();
    expect(s.stops).toBe(snapshot.stops); // untouched (same reference)
    expect(s.activeDriverId).toBeNull();
    expect(s.toast).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1); // only the unparsable blob warns
  });
});

describe('moveStop()', () => {
  async function freshStore(): Promise<StoreModule['useAppStore']> {
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    useAppStore.setState({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops });
    return useAppStore;
  }

  it('bootstraps an empty plan before any optimisation and returns true', async () => {
    const store = await freshStore();
    expect(store.getState().routes).toBeNull();
    expect(store.getState().moveStop('S010', 'D2')).toBe(true);
    const s = store.getState();
    expect(s.routes).toHaveLength(3);
    expect(s.routes!.map((r) => r.driverId)).toEqual(['D1', 'D2', 'D3']);
    expect(s.routes!.find((r) => r.driverId === 'D2')?.stopIds).toEqual(['S010']);
    expect(s.routes!.find((r) => r.driverId === 'D1')?.stopIds).toEqual([]);
    expect(s.optimizedMetrics?.stopsPerDriver).toEqual({ D1: 0, D2: 1, D3: 0 });
    expect(s.optimizedMetrics!.totalDistanceKm).toBeGreaterThan(0);
    // Nothing was optimised, so there is no "before" and no algorithm stamp.
    expect(s.baselineMetrics).toBeNull();
    expect(s.algorithm).toBeNull();
    expect(s.lastOptimizedAt).toBeNull();
  });

  it('returns false for unknown ids and for drops that change nothing', async () => {
    const store = await freshStore();
    expect(store.getState().moveStop('S010', 'D9')).toBe(false); // unknown driver
    expect(store.getState().moveStop('S999', 'D1')).toBe(false); // unknown stop
    expect(store.getState().routes).toBeNull(); // nothing bootstrapped on failure

    expect(store.getState().moveStop('S010', 'D2')).toBe(true);
    expect(store.getState().moveStop('S011', 'D2')).toBe(true);
    const routesBefore = store.getState().routes;
    expect(store.getState().moveStop('S010', 'D2', 0)).toBe(false); // already first on D2
    expect(store.getState().moveStop('S011', 'D2')).toBe(false); // append == already last
    expect(store.getState().routes).toBe(routesBefore); // no re-schedule, same reference
    expect(store.getState().moveStop('S010', 'D2', 1)).toBe(true); // reorder within D2
    expect(store.getState().routes!.find((r) => r.driverId === 'D2')?.stopIds).toEqual(['S011', 'S010']);
    expect(store.getState().moveStop('S010', 'D3')).toBe(true); // across drivers
    expect(store.getState().routes!.find((r) => r.driverId === 'D2')?.stopIds).toEqual(['S011']);
    expect(store.getState().routes!.find((r) => r.driverId === 'D3')?.stopIds).toEqual(['S010']);
  });

  it('returns false with no depot loaded', async () => {
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    expect(useAppStore.getState().moveStop('S010', 'D1')).toBe(false);
  });
});

describe('setStopStatus()', () => {
  it('prefixes the failure reason on failed and strips it again on undo', async () => {
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    const stops: Stop[] = seed.stops.slice(0, 3).map((s, i) => ({
      ...s,
      notes: i === 0 ? 'Signature required.' : undefined,
    }));
    useAppStore.setState({ depot: seed.depot, drivers: seed.drivers, stops });
    const [a, b] = stops.map((s) => s.id);
    const get = (id: string) => useAppStore.getState().stops.find((s) => s.id === id)!;

    useAppStore.getState().setStopStatus(a, 'failed', 'No one home');
    expect(get(a).status).toBe('failed');
    expect(get(a).notes).toBe('No one home · Signature required.');
    expect(get(a).deliveredAt).toBeDefined();

    // Re-fail with a different reason: replaced, not stacked.
    useAppStore.getState().setStopStatus(a, 'failed', 'Wrong address');
    expect(get(a).notes).toBe('Wrong address · Signature required.');

    // Undo -> original instructions restored, attempt time cleared.
    useAppStore.getState().setStopStatus(a, 'pending');
    expect(get(a).status).toBe('pending');
    expect(get(a).notes).toBe('Signature required.');
    expect(get(a).deliveredAt).toBeUndefined();

    // A stop with no original notes ends up with no notes at all after undo.
    useAppStore.getState().setStopStatus(b, 'failed', 'Damaged');
    expect(get(b).notes).toBe('Damaged');
    useAppStore.getState().setStopStatus(b, 'pending');
    expect(get(b).notes).toBeUndefined();

    // Delivered leaves notes alone.
    useAppStore.getState().setStopStatus(a, 'delivered');
    expect(get(a).status).toBe('delivered');
    expect(get(a).notes).toBe('Signature required.');
  });
});

// ---------------------------------------------------------------------------
// Actions: loading, optimizing, resetting, exporting, progress
// ---------------------------------------------------------------------------

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

/** Install a `fetch` stub for the duration of a test (restored in afterEach). */
function stubFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>): FetchMock {
  const mock = vi.fn<typeof fetch>(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

const rejectingFetch = () => stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));

describe('loadSeed()', () => {
  it('falls back to the bundled seed when /api/seed is unreachable', async () => {
    const fetchMock = rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    expect(useAppStore.getState().depot).toBeNull();
    await useAppStore.getState().loadSeed();
    const s = useAppStore.getState();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/seed');
    expect(s.depot?.id).toBe('DEPOT');
    expect(s.drivers.map((d) => d.id)).toEqual(['D1', 'D2', 'D3']);
    expect(s.stops).toHaveLength(45);
    expect(s.stops.every((x) => x.status === 'pending')).toBe(true);
    expect(s.routes).toBeNull();
  });

  it('uses the API payload when it is well-formed', async () => {
    const payload = { ...seed, drivers: seed.drivers.slice(0, 1), stops: seed.stops.slice(0, 5) };
    stubFetch(() => Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })));
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();
    expect(useAppStore.getState().drivers).toHaveLength(1);
    expect(useAppStore.getState().stops).toHaveLength(5);
  });

  it('ignores a malformed API payload and a non-2xx status (local seed instead)', async () => {
    stubFetch(() => Promise.resolve(new Response(JSON.stringify({ nope: 1 }), { status: 200 })));
    const a = await loadStore(makeWindow(new FakeStorage()));
    await a.useAppStore.getState().loadSeed();
    expect(a.useAppStore.getState().stops).toHaveLength(45);

    stubFetch(() => Promise.resolve(new Response('boom', { status: 500 })));
    const b = await loadStore(makeWindow(new FakeStorage()));
    await b.useAppStore.getState().loadSeed();
    expect(b.useAppStore.getState().stops).toHaveLength(45);
  });

  it('keeps already-loaded (rehydrated) state and does not refetch', async () => {
    const fetchMock = rejectingFetch();
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1({ stops: withStatus(seed.stops, 'S001', 'delivered') }));
    const { useAppStore } = await loadStore(makeWindow(storage));
    await useAppStore.getState().loadSeed();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().stops.find((x) => x.id === 'S001')?.status).toBe('delivered');
  });
});

describe('optimize()', () => {
  it('falls back to the local optimizer when POST /api/optimize is unreachable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchMock = rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();
    await useAppStore.getState().optimize();
    const s = useAppStore.getState();
    // One call for the seed, one for the optimize attempt.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe('/api/optimize');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
    expect(warn).toHaveBeenCalled(); // "unreachable; optimizing locally"
    expect(s.isOptimizing).toBe(false);
    expect(s.optimizeError).toBeNull();
    expect(s.algorithm).toBe('nn-2opt-v1');
    expect(s.routes).toHaveLength(3);
    expect(s.routes!.map((r) => r.driverId)).toEqual(['D1', 'D2', 'D3']);
    const assigned = s.routes!.flatMap((r) => r.stopIds);
    expect(assigned).toHaveLength(45);
    expect(new Set(assigned).size).toBe(45);
    // Baseline is always computed locally and is worse than the optimized plan.
    expect(s.baselineMetrics).not.toBeNull();
    expect(s.optimizedMetrics).not.toBeNull();
    expect(s.optimizedMetrics!.totalDistanceKm).toBeLessThan(s.baselineMetrics!.totalDistanceKm);
    expect(s.optimizedMetrics!.timeWindowViolations).toBe(0);
    expect(typeof s.computeMs).toBe('number');
    expect(s.lastOptimizedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(s.toast?.tone).toBe('success');
    expect(s.toast?.message).toMatch(/^Optimized in \d+ ms · nn-2opt-v1$/);
  });

  it('uses the API response when it is well-formed (algorithm string passes through)', async () => {
    const { optimize } = await import('@/lib/optimizer');
    const local = optimize({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops });
    const remote = { ...local, algorithm: 'remote-solver-9', computeMs: 12.5 };
    const fetchMock = stubFetch((input) => {
      const url = String(input);
      if (url === '/api/seed') return Promise.reject(new TypeError('offline'));
      return Promise.resolve(new Response(JSON.stringify(remote), { status: 200 }));
    });
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();
    await useAppStore.getState().optimize();
    const s = useAppStore.getState();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(s.algorithm).toBe('remote-solver-9');
    expect(s.computeMs).toBe(12.5);
    expect(s.routes).toEqual(local.routes);
    expect(s.toast?.message).toBe('Optimized in 13 ms · remote-solver-9');
  });

  it('falls back locally on a non-2xx status or an unexpected body shape', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch((input) =>
      String(input) === '/api/seed'
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(new Response(JSON.stringify({ error: 'nope' }), { status: 400 })),
    );
    const a = await loadStore(makeWindow(new FakeStorage()));
    await a.useAppStore.getState().loadSeed();
    await a.useAppStore.getState().optimize();
    expect(a.useAppStore.getState().algorithm).toBe('nn-2opt-v1');

    stubFetch((input) =>
      String(input) === '/api/seed'
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(new Response(JSON.stringify({ routes: 'not-an-array' }), { status: 200 })),
    );
    const b = await loadStore(makeWindow(new FakeStorage()));
    await b.useAppStore.getState().loadSeed();
    await b.useAppStore.getState().optimize();
    expect(b.useAppStore.getState().algorithm).toBe('nn-2opt-v1');
    expect(b.useAppStore.getState().routes).toHaveLength(3);
  });

  it('refuses to optimize before the seed is loaded (error toast, no fetch)', async () => {
    const fetchMock = rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().optimize();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAppStore.getState().routes).toBeNull();
    expect(useAppStore.getState().toast?.tone).toBe('error');
  });

  it('is deterministic and does not shuffle stops because of delivery status', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();
    await useAppStore.getState().optimize();
    const first = useAppStore.getState().routes!.map((r) => r.stopIds);
    useAppStore.getState().setStopStatus(first[0][0], 'delivered');
    useAppStore.getState().setStopStatus(first[1][0], 'failed', 'Damaged');
    await useAppStore.getState().optimize();
    expect(useAppStore.getState().routes!.map((r) => r.stopIds)).toEqual(first);
  });
});

describe('moveStop(): index handling and metrics', () => {
  async function optimizedStore(): Promise<StoreModule['useAppStore']> {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();
    await useAppStore.getState().optimize();
    return useAppStore;
  }
  const routeOf = (store: StoreModule['useAppStore'], driverId: string) =>
    store.getState().routes!.find((r) => r.driverId === driverId)!;

  it('moves a stop across drivers, re-schedules ETAs/metrics and leaves the baseline alone', async () => {
    const store = await optimizedStore();
    const before = store.getState();
    const [d1, d2] = [routeOf(store, 'D1'), routeOf(store, 'D2')];
    const moved = d1.stopIds[0];
    expect(store.getState().moveStop(moved, 'D2')).toBe(true);
    const after = store.getState();
    const [d1After, d2After] = [routeOf(store, 'D1'), routeOf(store, 'D2')];
    expect(d1After.stopIds).toEqual(d1.stopIds.slice(1));
    expect(d2After.stopIds).toEqual([...d2.stopIds, moved]); // default index = append
    expect(d2After.etaByStopId[moved]).toMatch(/^\d{2}:\d{2}$/);
    expect(d2After.legs).toHaveLength(d2After.stopIds.length + 1);
    expect(after.optimizedMetrics!.stopsPerDriver).toEqual({
      D1: d1After.stopIds.length,
      D2: d2After.stopIds.length,
      D3: routeOf(store, 'D3').stopIds.length,
    });
    expect(after.optimizedMetrics).not.toBe(before.optimizedMetrics);
    expect(after.baselineMetrics).toBe(before.baselineMetrics); // the "before" never changes
    expect(after.algorithm).toBe('nn-2opt-v1'); // manual moves do not re-run the algorithm
    expect(after.lastOptimizedAt).toBe(before.lastOptimizedAt);
    // Still every stop exactly once.
    const all = after.routes!.flatMap((r) => r.stopIds);
    expect(all).toHaveLength(45);
    expect(new Set(all).size).toBe(45);
  });

  it('inserts at the requested index, clamping out-of-range / NaN / fractional values', async () => {
    const store = await optimizedStore();
    const d1 = routeOf(store, 'D1');
    const d3 = routeOf(store, 'D3');
    const a = d1.stopIds[0];
    const b = d1.stopIds[1];
    const c = d1.stopIds[2];

    expect(store.getState().moveStop(a, 'D3', 0)).toBe(true);
    expect(routeOf(store, 'D3').stopIds[0]).toBe(a);

    expect(store.getState().moveStop(b, 'D3', 999)).toBe(true); // clamped to the end
    expect(routeOf(store, 'D3').stopIds.at(-1)).toBe(b);

    expect(store.getState().moveStop(c, 'D3', -5)).toBe(true); // clamped to 0
    expect(routeOf(store, 'D3').stopIds[0]).toBe(c);

    const len = routeOf(store, 'D3').stopIds.length;
    expect(store.getState().moveStop(c, 'D3', Number.NaN)).toBe(true); // NaN -> append
    expect(routeOf(store, 'D3').stopIds.at(-1)).toBe(c);
    expect(routeOf(store, 'D3').stopIds).toHaveLength(len);

    expect(store.getState().moveStop(c, 'D3', 1.9)).toBe(true); // truncated to 1
    expect(routeOf(store, 'D3').stopIds[1]).toBe(c);
    expect(routeOf(store, 'D3').stopIds).toHaveLength(d3.stopIds.length + 3);
  });

  it('reorders within the same route', async () => {
    const store = await optimizedStore();
    const d2 = routeOf(store, 'D2');
    const last = d2.stopIds.at(-1)!;
    expect(store.getState().moveStop(last, 'D2', 0)).toBe(true);
    expect(routeOf(store, 'D2').stopIds).toEqual([last, ...d2.stopIds.slice(0, -1)]);
    expect(routeOf(store, 'D2').stopIds).toHaveLength(d2.stopIds.length);
  });
});

describe('resetDemo()', () => {
  it('reloads a fresh seed, clears the plan / statuses / legend, keeps the active driver', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();
    await useAppStore.getState().optimize();
    useAppStore.getState().setStopStatus('S001', 'delivered');
    useAppStore.getState().setStopStatus('S002', 'failed', 'Other');
    useAppStore.getState().setActiveDriver('D2');
    useAppStore.getState().toggleDriverVisibility('D1');
    useAppStore.getState().setSelectedStop('S003');

    await useAppStore.getState().resetDemo();
    const s = useAppStore.getState();
    expect(s.routes).toBeNull();
    expect(s.baselineMetrics).toBeNull();
    expect(s.optimizedMetrics).toBeNull();
    expect(s.algorithm).toBeNull();
    expect(s.computeMs).toBeNull();
    expect(s.lastOptimizedAt).toBeNull();
    expect(s.hiddenDriverIds).toEqual([]);
    expect(s.selectedStopId).toBeNull();
    expect(s.stops).toHaveLength(45);
    expect(s.stops.every((x) => x.status === 'pending' && x.deliveredAt === undefined)).toBe(true);
    expect(s.stops.find((x) => x.id === 'S002')?.notes ?? '').not.toMatch(/^Other/);
    expect(s.activeDriverId).toBe('D2'); // the driver phone stays on its driver
    expect(s.toast?.message).toBe('Demo reset');
  });
});

describe('UI prefs', () => {
  it('toggleDriverVisibility() adds and removes ids; setActiveDriver() stores the choice', async () => {
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    const st = useAppStore.getState();
    st.toggleDriverVisibility('D1');
    st.toggleDriverVisibility('D3');
    expect(useAppStore.getState().hiddenDriverIds).toEqual(['D1', 'D3']);
    st.toggleDriverVisibility('D1');
    expect(useAppStore.getState().hiddenDriverIds).toEqual(['D3']);
    st.setActiveDriver('D2');
    expect(useAppStore.getState().activeDriverId).toBe('D2');
    st.setActiveDriver(null);
    expect(useAppStore.getState().activeDriverId).toBeNull();
  });

  it('showToast() issues increasing ids so identical messages re-trigger; dismissToast() clears', async () => {
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    useAppStore.getState().showToast('same');
    const first = useAppStore.getState().toast!;
    useAppStore.getState().showToast('same');
    const second = useAppStore.getState().toast!;
    expect(first.tone).toBe('info');
    expect(second.id).toBeGreaterThan(first.id);
    useAppStore.getState().dismissToast();
    expect(useAppStore.getState().toast).toBeNull();
  });
});

describe('exportRoutesJson()', () => {
  it('produces pretty JSON with { exportedAt, depot, drivers, routes, metrics }', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();

    // Before optimizing: routes export as [] and metrics as null.
    const empty = JSON.parse(useAppStore.getState().exportRoutesJson()) as Record<string, unknown>;
    expect(Object.keys(empty)).toEqual(['exportedAt', 'depot', 'drivers', 'routes', 'metrics']);
    expect(empty.routes).toEqual([]);
    expect(empty.metrics).toBeNull();

    await useAppStore.getState().optimize();
    const text = useAppStore.getState().exportRoutesJson();
    expect(text).toContain('\n  "routes": [\n'); // pretty-printed (2 spaces)
    const json = JSON.parse(text) as {
      exportedAt: string;
      depot: { id: string };
      drivers: { id: string }[];
      routes: { driverId: string; stopIds: string[] }[];
      metrics: { totalDistanceKm: number };
    };
    expect(json.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(json.depot.id).toBe('DEPOT');
    expect(json.drivers.map((d) => d.id)).toEqual(['D1', 'D2', 'D3']);
    expect(json.routes.map((r) => r.driverId)).toEqual(['D1', 'D2', 'D3']);
    expect(json.metrics.totalDistanceKm).toBe(useAppStore.getState().optimizedMetrics!.totalDistanceKm);
  });
});

describe('selectors', () => {
  it('driverProgress() counts delivered/failed and finds the next pending stop', async () => {
    const { driverProgress } = await loadStore(makeWindow(new FakeStorage()));
    const route: Route = {
      driverId: 'D1',
      stopIds: ['A', 'B', 'C', 'D'],
      legs: [],
      totalDistanceKm: 0,
      totalMinutes: 0,
      etaByStopId: {},
    };
    const mk = (id: string, status: Stop['status']): Stop => ({ ...seed.stops[0], id, status });
    const byId = (...entries: [string, Stop['status']][]): Record<string, Stop> =>
      Object.fromEntries(entries.map(([id, st]) => [id, mk(id, st)]));

    expect(driverProgress(undefined, {})).toEqual({ total: 0, done: 0, delivered: 0, failed: 0, nextIndex: -1 });
    expect(driverProgress(route, byId(['A', 'pending'], ['B', 'pending'], ['C', 'pending'], ['D', 'pending']))).toEqual({
      total: 4,
      done: 0,
      delivered: 0,
      failed: 0,
      nextIndex: 0,
    });
    expect(driverProgress(route, byId(['A', 'delivered'], ['B', 'failed'], ['C', 'pending'], ['D', 'pending']))).toEqual({
      total: 4,
      done: 2,
      delivered: 1,
      failed: 1,
      nextIndex: 2,
    });
    // A done stop AFTER a pending one does not move "next" past the pending stop.
    expect(driverProgress(route, byId(['A', 'delivered'], ['B', 'pending'], ['C', 'delivered'], ['D', 'pending'])).nextIndex).toBe(1);
    // Unknown ids count as pending; all done -> nextIndex -1.
    expect(driverProgress(route, {}).nextIndex).toBe(0);
    expect(driverProgress(route, byId(['A', 'delivered'], ['B', 'delivered'], ['C', 'failed'], ['D', 'delivered']))).toEqual({
      total: 4,
      done: 4,
      delivered: 3,
      failed: 1,
      nextIndex: -1,
    });
  });

  it('selectRouteForDriver / selectStopsById / selectDriverColorByStopId derive from state', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    const mod = await loadStore(makeWindow(new FakeStorage()));
    const { useAppStore, selectRouteForDriver, selectStopsById, selectDriverColorByStopId } = mod;
    await useAppStore.getState().loadSeed();
    expect(selectRouteForDriver(useAppStore.getState(), 'D1')).toBeUndefined();
    expect(selectDriverColorByStopId(useAppStore.getState())).toEqual({});
    const byId = selectStopsById(useAppStore.getState());
    expect(Object.keys(byId)).toHaveLength(45);
    expect(byId.S001.id).toBe('S001');

    await useAppStore.getState().optimize();
    const s = useAppStore.getState();
    const d2 = selectRouteForDriver(s, 'D2')!;
    expect(d2.driverId).toBe('D2');
    const colors = selectDriverColorByStopId(s);
    expect(Object.keys(colors)).toHaveLength(45);
    for (const id of d2.stopIds) expect(colors[id]).toBe(seed.drivers[1].color);
  });
});
