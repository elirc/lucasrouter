import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSeed } from '@/data';
import type { DeliveryEvent, Route, Stop } from '@/lib/types';

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

  it("does not echo a blob written by a different build (missing / extra keys) - no ping-pong", async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1());
    const win = makeWindow(storage);
    const { useAppStore } = await loadStore(win);
    const writesBefore = storage.writes;
    // Older build: no `editedSinceOptimize`; newer build: an unknown key.
    const foreign = JSON.stringify({
      state: {
        ...(JSON.parse(blobV1({ activeDriverId: 'D3' })) as { state: Record<string, unknown> }).state,
        someFutureKey: 42,
      },
      version: 1,
    });
    storage.writeFromOtherTab(KEY, foreign);
    win.fireStorage({ key: KEY, newValue: foreign });
    expect(useAppStore.getState().activeDriverId).toBe('D3');
    // Applied without writing anything back - the other tab would otherwise
    // receive our (differently-shaped) blob, apply it, write again, and so on.
    expect(storage.writes).toBe(writesBefore);
    // Local ephemeral update afterwards still does not write (slice unchanged).
    useAppStore.getState().showToast('hi');
    expect(storage.writes).toBe(writesBefore);
    // ...but a real local change does, and it carries our own shape.
    useAppStore.getState().toggleDriverVisibility('D1');
    expect(storage.writes).toBe(writesBefore + 1);
    const stored = JSON.parse(storage.getItem(KEY)!) as { state: Record<string, unknown> };
    expect(stored.state.editedSinceOptimize).toBe(false);
    expect('someFutureKey' in stored.state).toBe(false);
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
// Driver records: proof of delivery, failures, undo, defer, activity log
// ---------------------------------------------------------------------------

describe('delivery records', () => {
  /** Store with the seed loaded and an optimized plan (no network). */
  async function optimizedStore(): Promise<{ store: StoreModule['useAppStore']; storage: FakeStorage }> {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const storage = new FakeStorage();
    const { useAppStore } = await loadStore(makeWindow(storage));
    await useAppStore.getState().loadSeed();
    await useAppStore.getState().optimize();
    return { store: useAppStore, storage };
  }
  const stopOf = (store: StoreModule['useAppStore'], id: string) =>
    store.getState().stops.find((s) => s.id === id)!;
  const log = (store: StoreModule['useAppStore']) => store.getState().deliveryLog;

  it('recordDelivery() stamps the proof, flips the status and appends one event', async () => {
    const { store } = await optimizedStore();
    const d1 = store.getState().routes!.find((r) => r.driverId === 'D1')!;
    const id = d1.stopIds[0];
    const result = store.getState().recordDelivery(id, {
      method: 'door',
      recipientName: '  Ana Ruiz  ',
      note: ' behind the planter ',
      photo: 'data:image/jpeg;base64,AAAA',
    });
    expect(result).toEqual({ ok: true, photoDropped: false });

    const stop = stopOf(store, id);
    expect(stop.status).toBe('delivered');
    expect(stop.deliveredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(stop.proof?.method).toBe('door');
    expect(stop.proof?.recipientName).toBe('Ana Ruiz'); // trimmed
    expect(stop.proof?.note).toBe('behind the planter');
    expect(stop.proof?.photo).toBe('data:image/jpeg;base64,AAAA');
    expect(stop.proof?.at).toBe(stop.deliveredAt);

    expect(log(store)).toHaveLength(1);
    const [event] = log(store);
    expect(event).toMatchObject({
      stopId: id,
      driverId: 'D1',
      type: 'delivered',
      method: 'door',
      recipientName: 'Ana Ruiz',
      note: 'behind the planter',
      hasPhoto: true,
    });
    expect(event.id).toBeTruthy();
    expect(event.at).toBe(stop.deliveredAt);

    // Unknown stop: no record, no event.
    expect(store.getState().recordDelivery('S999')).toEqual({ ok: false, photoDropped: false });
    expect(log(store)).toHaveLength(1);
  });

  it('recordDelivery() omits empty optional fields and defaults to no photo', async () => {
    const { store } = await optimizedStore();
    const id = store.getState().routes![0].stopIds[0];
    store.getState().recordDelivery(id, { method: 'handed', recipientName: '   ', note: '' });
    const proof = stopOf(store, id).proof!;
    expect(proof.method).toBe('handed');
    expect('recipientName' in proof).toBe(false);
    expect('note' in proof).toBe(false);
    expect('photo' in proof).toBe(false);
    expect(log(store)[0].hasPhoto).toBeUndefined();
  });

  it('drops the photo (but keeps the record) once the photo budget is spent', async () => {
    const { store, storage } = await optimizedStore();
    const mod = await import('@/store/useAppStore');
    const [a, b] = store.getState().routes![0].stopIds;
    const big = 'x'.repeat(mod.PHOTO_BUDGET_BYTES - 100);
    expect(store.getState().recordDelivery(a, { method: 'handed', photo: big }).photoDropped).toBe(false);
    const second = store.getState().recordDelivery(b, { method: 'door', photo: 'x'.repeat(200) });
    expect(second).toEqual({ ok: true, photoDropped: true });
    // The delivery still happened; only the picture is missing.
    expect(stopOf(store, b).status).toBe('delivered');
    expect(stopOf(store, b).proof?.photo).toBeUndefined();
    expect(log(store)[1].hasPhoto).toBeUndefined();
    expect(storage.getItem(KEY)).toContain('"deliveryLog"');
  });

  it('recordFailure() keeps the reason-in-notes mechanism and adds a note + event', async () => {
    const { store } = await optimizedStore();
    const id = store.getState().routes![1].stopIds[0];
    const before = stopOf(store, id).notes;
    expect(store.getState().recordFailure(id, 'No one home', '  gate locked ')).toBe(true);
    const stop = stopOf(store, id);
    expect(stop.status).toBe('failed');
    expect(stop.notes?.startsWith('No one home')).toBe(true);
    if (before) expect(stop.notes).toContain(before);
    expect(stop.proof?.note).toBe('gate locked');
    expect(log(store)).toHaveLength(1);
    expect(log(store)[0]).toMatchObject({ type: 'failed', reason: 'No one home', note: 'gate locked', driverId: 'D2' });

    // Without a note nothing is stamped on the stop, but the event is still logged.
    const other = store.getState().routes![1].stopIds[1];
    expect(store.getState().recordFailure(other, 'Damaged')).toBe(true);
    expect(stopOf(store, other).proof).toBeUndefined();
    expect(log(store)).toHaveLength(2);
    expect(log(store)[1].note).toBeUndefined();
    expect(store.getState().recordFailure('S999', 'Other')).toBe(false);
  });

  it('undoStop() clears status + proof and appends an undo event', async () => {
    const { store } = await optimizedStore();
    const id = store.getState().routes![0].stopIds[0];
    store.getState().recordDelivery(id, { method: 'handed', note: 'left with Ana' });
    expect(stopOf(store, id).proof).toBeDefined();
    expect(store.getState().undoStop(id)).toBe(true);
    const stop = stopOf(store, id);
    expect(stop.status).toBe('pending');
    expect(stop.proof).toBeUndefined();
    expect(stop.deliveredAt).toBeUndefined();
    expect(log(store).map((e) => e.type)).toEqual(['delivered', 'undo']);
    // Already pending: nothing to undo.
    expect(store.getState().undoStop(id)).toBe(false);
    expect(store.getState().undoStop('S999')).toBe(false);
    expect(log(store)).toHaveLength(2);
  });

  it('deferStop() moves a pending stop to the end of its own route and logs it', async () => {
    const { store } = await optimizedStore();
    const d1 = store.getState().routes!.find((r) => r.driverId === 'D1')!;
    const first = d1.stopIds[0];
    expect(store.getState().deferStop(first)).toBe(true);
    const after = store.getState().routes!.find((r) => r.driverId === 'D1')!;
    expect(after.stopIds).toEqual([...d1.stopIds.slice(1), first]);
    expect(after.stopIds).toHaveLength(d1.stopIds.length);
    // ETAs were re-scheduled for the new order.
    expect(after.etaByStopId[first]).toMatch(/^\d{1,2}:\d{2}$/);
    expect(after.etaByStopId[first]).not.toBe(d1.etaByStopId[first]);
    expect(log(store)).toHaveLength(1);
    expect(log(store)[0]).toMatchObject({ type: 'deferred', stopId: first, driverId: 'D1' });

    // Already last (we just put it there) → no-op, and no event.
    expect(store.getState().deferStop(first)).toBe(false);
    // Done stops and unknown stops are never deferred.
    store.getState().recordDelivery(after.stopIds[0]);
    expect(store.getState().deferStop(after.stopIds[0])).toBe(false);
    expect(store.getState().deferStop('S999')).toBe(false);
    expect(log(store).filter((e) => e.type === 'deferred')).toHaveLength(1);
  });

  it('deferStop() re-schedules without marking the plan hand-edited', async () => {
    const { store } = await optimizedStore();
    expect(store.getState().editedSinceOptimize).toBe(false);
    const d1 = store.getState().routes!.find((r) => r.driverId === 'D1')!;
    // A driver skipping their own stop is not a dispatcher editing the plan:
    // the dispatcher panel must not start claiming "edited by hand".
    expect(store.getState().deferStop(d1.stopIds[0])).toBe(true);
    expect(store.getState().editedSinceOptimize).toBe(false);
    // ETAs were still re-scheduled, exactly as a move does.
    const after = store.getState().routes!.find((r) => r.driverId === 'D1')!;
    expect(after.stopIds).toEqual([...d1.stopIds.slice(1), d1.stopIds[0]]);
    expect(after.etaByStopId[d1.stopIds[0]]).not.toBe(d1.etaByStopId[d1.stopIds[0]]);
    expect(store.getState().optimizedMetrics).not.toBeNull();

    // A real hand edit still sets the flag, and a later skip does not wipe it.
    expect(store.getState().moveStop(after.stopIds[0], 'D2')).toBe(true);
    expect(store.getState().editedSinceOptimize).toBe(true);
    expect(store.getState().deferStop(store.getState().routes!.find((r) => r.driverId === 'D1')!.stopIds[0])).toBe(
      true,
    );
    expect(store.getState().editedSinceOptimize).toBe(true);
  });

  it('recordFailure() clears the proof a previous delivery left on the stop', async () => {
    const { store } = await optimizedStore();
    const id = store.getState().routes![0].stopIds[0];
    store.getState().recordDelivery(id, {
      method: 'handed',
      recipientName: 'Ana Ruiz',
      photo: 'data:image/jpeg;base64,AAAA',
    });
    expect(stopOf(store, id).proof?.photo).toBeDefined();

    // Mis-tap corrected the other way round: the stop is failed, so it must not
    // keep showing "Handed to recipient" + a photo of a parcel back in the van
    // (nor keep those bytes inside the photo budget).
    expect(store.getState().recordFailure(id, 'Damaged')).toBe(true);
    expect(stopOf(store, id).status).toBe('failed');
    expect(stopOf(store, id).proof).toBeUndefined();

    // With a note, the failure stamps its own proof — the note and nothing else.
    store.getState().recordDelivery(id, { method: 'handed', photo: 'data:image/jpeg;base64,AAAA' });
    expect(store.getState().recordFailure(id, 'No one home', 'gate locked')).toBe(true);
    expect(stopOf(store, id).proof).toEqual({ at: expect.any(String) as unknown as string, note: 'gate locked' });
    // The log still records both deliveries and both failures (history is kept).
    expect(log(store).map((e) => e.type)).toEqual(['delivered', 'failed', 'delivered', 'failed']);
  });

  it('deferStop() refuses a stop that is not on any route', async () => {
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    useAppStore.setState({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops });
    expect(useAppStore.getState().deferStop('S010')).toBe(false);
    expect(useAppStore.getState().deliveryLog).toEqual([]);
  });

  it('caps the log at MAX_LOG_EVENTS, dropping the oldest', async () => {
    const { store } = await optimizedStore();
    const mod = await import('@/store/useAppStore'); // same instance loadStore() just built
    const id = store.getState().routes![0].stopIds[0];
    // Pre-fill just under the cap with synthetic entries, then push real ones.
    const filler: DeliveryEvent[] = Array.from({ length: mod.MAX_LOG_EVENTS - 1 }, (_, i) => ({
      id: `old-${i}`,
      at: '2020-01-01T00:00:00.000Z',
      driverId: 'D1',
      stopId: id,
      type: 'delivered',
    }));
    store.setState({ deliveryLog: filler });
    store.getState().recordDelivery(id, { method: 'handed' });
    expect(log(store)).toHaveLength(mod.MAX_LOG_EVENTS);
    expect(log(store)[0].id).toBe('old-0');

    store.getState().undoStop(id);
    expect(log(store)).toHaveLength(mod.MAX_LOG_EVENTS);
    expect(log(store)[0].id).toBe('old-1'); // oldest dropped
    expect(log(store).at(-1)!.type).toBe('undo');
  });

  it('is persisted, hydrates from an older blob without the key, and resetDemo() clears it', async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1()); // no deliveryLog key at all
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const { useAppStore } = await loadStore(makeWindow(storage));
    expect(useAppStore.getState().deliveryLog).toEqual([]);
    await useAppStore.getState().optimize();
    const id = useAppStore.getState().routes![0].stopIds[0];
    useAppStore.getState().recordDelivery(id, { method: 'neighbour', recipientName: 'Sam' });

    const stored = JSON.parse(storage.getItem(KEY)!) as { state: { deliveryLog: DeliveryEvent[] } };
    expect(stored.state.deliveryLog).toHaveLength(1);
    expect(stored.state.deliveryLog[0]).toMatchObject({ type: 'delivered', method: 'neighbour' });

    await useAppStore.getState().resetDemo();
    expect(useAppStore.getState().deliveryLog).toEqual([]);
  });

  it('refuses a persisted log carrying an event type this build cannot render', async () => {
    const known: DeliveryEvent = {
      id: 'e1',
      at: '2024-05-05T09:00:00.000Z',
      driverId: 'D1',
      stopId: 'S001',
      type: 'delivered',
    };
    const ok = new FakeStorage();
    ok.writeFromOtherTab(KEY, blobV1({ deliveryLog: [known] }));
    const a = await loadStore(makeWindow(ok));
    expect(a.useAppStore.getState().deliveryLog).toHaveLength(1);

    // One event with an unknown type (a newer build, a hand-edited devtools
    // entry) used to reach the activity log, where `TYPE_META[type].badge`
    // threw and took the whole /driver/[id] screen down on load — and "Try
    // again" re-crashed, because the offending blob is persisted. The guard
    // now checks `type` against the known set, so the value never gets in.
    const spoiled = new FakeStorage();
    spoiled.writeFromOtherTab(KEY, blobV1({ deliveryLog: [known, { ...known, id: 'e2', type: 'rescheduled' }] }));
    const b = await loadStore(makeWindow(spoiled));
    expect(b.useAppStore.getState().deliveryLog).toEqual([]);

    // Same via the cross-tab path: keep what this tab has, apply nothing.
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1({ deliveryLog: [known] }));
    const win = makeWindow(storage);
    const c = await loadStore(win);
    const future = blobV1({ deliveryLog: [{ ...known, id: 'e3', type: 'rescheduled' }] });
    win.fireStorage({ key: KEY, newValue: future });
    expect(c.useAppStore.getState().deliveryLog).toEqual([known]);
  });

  it("accepts another tab's log and rejects a malformed one (cross-tab guard)", async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1());
    const win = makeWindow(storage);
    const { useAppStore } = await loadStore(win);

    const good = blobV1({
      deliveryLog: [
        { id: 'e1', at: '2024-05-05T09:00:00.000Z', driverId: 'D1', stopId: 'S001', type: 'delivered' },
      ],
    });
    storage.writeFromOtherTab(KEY, good);
    win.fireStorage({ key: KEY, newValue: good });
    expect(useAppStore.getState().deliveryLog).toHaveLength(1);

    // Entries missing their identity are not events: keep what we have.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bad = blobV1({ deliveryLog: [{ nope: 1 }] });
    storage.writeFromOtherTab(KEY, bad);
    win.fireStorage({ key: KEY, newValue: bad });
    expect(useAppStore.getState().deliveryLog).toHaveLength(1);
    const worse = blobV1({ deliveryLog: 'not-an-array' });
    win.fireStorage({ key: KEY, newValue: worse });
    expect(useAppStore.getState().deliveryLog).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled(); // a bad key is dropped silently, not a parse error
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
  it('loads the bundled seed synchronously-ish without a network round trip', async () => {
    // The seed ships in the store chunk; fetching /api/seed would only delay
    // the first map frame (both map pages gate on `depot`).
    const fetchMock = rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    expect(useAppStore.getState().depot).toBeNull();
    await useAppStore.getState().loadSeed();
    const s = useAppStore.getState();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s.depot?.id).toBe('DEPOT');
    expect(s.drivers.map((d) => d.id)).toEqual(['D1', 'D2', 'D3']);
    expect(s.stops).toHaveLength(45);
    expect(s.stops.every((x) => x.status === 'pending')).toBe(true);
    expect(s.routes).toBeNull();
  });

  it('hands out fresh copies (a status change never leaks into the next load)', async () => {
    const a = await loadStore(makeWindow(new FakeStorage()));
    await a.useAppStore.getState().loadSeed();
    a.useAppStore.getState().setStopStatus('S001', 'delivered');
    const b = await loadStore(makeWindow(new FakeStorage()));
    await b.useAppStore.getState().loadSeed();
    expect(b.useAppStore.getState().stops.find((x) => x.id === 'S001')?.status).toBe('pending');
  });

  it('keeps already-loaded (rehydrated) state', async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1({ stops: withStatus(seed.stops, 'S001', 'delivered') }));
    const { useAppStore } = await loadStore(makeWindow(storage));
    await useAppStore.getState().loadSeed();
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
    // Exactly one network call: the optimize attempt (the seed is bundled).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/optimize');
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it('falls back locally when the API returns malformed ETAs or routes (swapped-in algorithm guard)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { optimize } = await import('@/lib/optimizer');
    const local = optimize({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops });
    const badEta = {
      ...local,
      algorithm: 'remote-x',
      routes: local.routes.map((r, i) =>
        i === 0 ? { ...r, etaByStopId: { ...r.etaByStopId, [r.stopIds[0]]: '09:05:00' } } : r,
      ),
    };
    stubFetch((input) =>
      String(input) === '/api/seed'
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(new Response(JSON.stringify(badEta), { status: 200 })),
    );
    const a = await loadStore(makeWindow(new FakeStorage()));
    await a.useAppStore.getState().loadSeed();
    await a.useAppStore.getState().optimize();
    expect(a.useAppStore.getState().algorithm).toBe('nn-2opt-v1'); // not 'remote-x'

    // Past-midnight ETAs ("25:13") are valid "HH:MM" and pass.
    const lateEta = {
      ...local,
      algorithm: 'remote-y',
      routes: local.routes.map((r, i) =>
        i === 0 ? { ...r, etaByStopId: { ...r.etaByStopId, [r.stopIds[0]]: '25:13' } } : r,
      ),
    };
    stubFetch((input) =>
      String(input) === '/api/seed'
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(new Response(JSON.stringify(lateEta), { status: 200 })),
    );
    const b = await loadStore(makeWindow(new FakeStorage()));
    await b.useAppStore.getState().loadSeed();
    await b.useAppStore.getState().optimize();
    expect(b.useAppStore.getState().algorithm).toBe('remote-y');

    // A route without stopIds / legs arrays is rejected too.
    const noLegs = { ...local, algorithm: 'remote-z', routes: [{ driverId: 'D1', stopIds: [] }] };
    stubFetch((input) =>
      String(input) === '/api/seed'
        ? Promise.reject(new TypeError('offline'))
        : Promise.resolve(new Response(JSON.stringify(noLegs), { status: 200 })),
    );
    const c = await loadStore(makeWindow(new FakeStorage()));
    await c.useAppStore.getState().loadSeed();
    await c.useAppStore.getState().optimize();
    expect(c.useAppStore.getState().algorithm).toBe('nn-2opt-v1');
  });

  /**
   * Load the store with `@/lib/optimizer` mocked to fail the way a hashed chunk
   * does after a redeploy (or offline): the dynamic `import()` rejects.
   */
  async function loadStoreWithoutOptimizerChunk(win: FakeWindow): Promise<StoreModule> {
    vi.resetModules();
    vi.doMock('@/lib/optimizer', () => {
      throw new Error('ChunkLoadError: Loading chunk app/lib_optimizer failed');
    });
    (globalThis as { window?: unknown }).window = win;
    return import('@/store/useAppStore');
  }

  it('keeps the plan the API returned even when the optimizer chunk cannot load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { optimize } = await import('@/lib/optimizer');
    const local = optimize({ depot: seed.depot, drivers: seed.drivers, stops: seed.stops });
    const remote = { ...local, algorithm: 'remote-solver-9', computeMs: 7 };
    stubFetch(() => Promise.resolve(new Response(JSON.stringify(remote), { status: 200 })));
    try {
      const { useAppStore } = await loadStoreWithoutOptimizerChunk(makeWindow(new FakeStorage()));
      await useAppStore.getState().loadSeed();
      await useAppStore.getState().optimize();
      const s = useAppStore.getState();
      // The chunk is only needed for the local fallback and the "before"
      // numbers; losing it must not discard a plan we already have.
      expect(s.routes).toEqual(remote.routes);
      expect(s.algorithm).toBe('remote-solver-9');
      expect(s.optimizeError).toBeNull();
      expect(s.isOptimizing).toBe(false);
      expect(s.toast?.tone).toBe('success');
      expect(s.baselineMetrics).toBeNull(); // no comparison, but a usable plan
      expect(warn).toHaveBeenCalled(); // "optimizer chunk unavailable"
    } finally {
      vi.doUnmock('@/lib/optimizer');
      vi.resetModules();
    }
  });

  it('errors cleanly when neither the API nor the optimizer chunk is available', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    try {
      const { useAppStore } = await loadStoreWithoutOptimizerChunk(makeWindow(new FakeStorage()));
      await useAppStore.getState().loadSeed();
      await useAppStore.getState().optimize();
      const s = useAppStore.getState();
      expect(s.routes).toBeNull();
      expect(s.isOptimizing).toBe(false);
      expect(s.optimizeError).toBe('Optimizer unavailable offline');
      expect(s.toast).toMatchObject({ message: 'Optimizer unavailable offline', tone: 'error' });
    } finally {
      vi.doUnmock('@/lib/optimizer');
      vi.resetModules();
    }
  });

  it('tells the dispatcher and the driver different things about the same plan', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();

    // No argument = unchanged dispatcher behaviour (the demo's headline number).
    await useAppStore.getState().optimize();
    expect(useAppStore.getState().toast?.message).toMatch(/^Optimized in \d+ ms · nn-2opt-v1$/);

    // The driver's screen prepares its own plan (#45); "nn-2opt-v1" means
    // nothing on a phone.
    await useAppStore.getState().optimize({ toast: 'driver' });
    expect(useAppStore.getState().toast).toMatchObject({ message: 'Your route is ready', tone: 'success' });

    // Silent: the plan is still there, nothing is announced.
    useAppStore.getState().dismissToast();
    await useAppStore.getState().optimize({ toast: 'none' });
    expect(useAppStore.getState().toast).toBeNull();
    expect(useAppStore.getState().routes).toHaveLength(3);
    expect(useAppStore.getState().algorithm).toBe('nn-2opt-v1');
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

describe('moveStop(): done stops and the edited flag', () => {
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

  it('refuses to move a delivered or failed stop (it stays where it was done)', async () => {
    const store = await optimizedStore();
    const d1 = routeOf(store, 'D1');
    const [done, other] = d1.stopIds;
    store.getState().setStopStatus(done, 'delivered');
    expect(store.getState().moveStop(done, 'D2')).toBe(false);
    expect(store.getState().moveStop(done, 'D1', 3)).toBe(false); // not even reordered
    expect(routeOf(store, 'D1').stopIds).toEqual(d1.stopIds);
    store.getState().setStopStatus(other, 'failed');
    expect(store.getState().moveStop(other, 'D3')).toBe(false);
    // Back to pending: movable again.
    store.getState().setStopStatus(other, 'pending');
    expect(store.getState().moveStop(other, 'D3')).toBe(true);
    expect(routeOf(store, 'D3').stopIds).toContain(other);
  });

  it('tracks editedSinceOptimize: set by a real move, cleared by optimize / reset, persisted', async () => {
    const store = await optimizedStore();
    expect(store.getState().editedSinceOptimize).toBe(false);
    const d1 = routeOf(store, 'D1');
    // A no-op "move" (dropped where it already was) does not count as an edit.
    expect(store.getState().moveStop(d1.stopIds[0], 'D1', 0)).toBe(false);
    expect(store.getState().editedSinceOptimize).toBe(false);
    expect(store.getState().moveStop(d1.stopIds[0], 'D2')).toBe(true);
    expect(store.getState().editedSinceOptimize).toBe(true);
    await store.getState().optimize();
    expect(store.getState().editedSinceOptimize).toBe(false);
    store.getState().moveStop(routeOf(store, 'D2').stopIds[0], 'D3');
    expect(store.getState().editedSinceOptimize).toBe(true);
    await store.getState().resetDemo();
    expect(store.getState().editedSinceOptimize).toBe(false);
  });

  it('is persisted, and a blob without the key (older build) still hydrates with the default', async () => {
    const storage = new FakeStorage();
    storage.writeFromOtherTab(KEY, blobV1()); // no editedSinceOptimize key at all
    const { useAppStore } = await loadStore(makeWindow(storage));
    expect(useAppStore.getState().editedSinceOptimize).toBe(false);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    await useAppStore.getState().optimize();
    useAppStore.getState().moveStop(useAppStore.getState().routes![0].stopIds[0], 'D2');
    const stored = JSON.parse(storage.getItem(KEY)!) as { state: { editedSinceOptimize: boolean } };
    expect(stored.state.editedSinceOptimize).toBe(true);
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
  it('produces a self-contained pretty JSON export (stops, unassigned ids, baseline, provenance)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    rejectingFetch();
    const { useAppStore } = await loadStore(makeWindow(new FakeStorage()));
    await useAppStore.getState().loadSeed();

    // Before optimizing: routes export as [] and metrics as null.
    const empty = JSON.parse(useAppStore.getState().exportRoutesJson()) as Record<string, unknown>;
    expect(Object.keys(empty)).toEqual([
      'exportedAt',
      'algorithm',
      'optimizedAt',
      'depot',
      'drivers',
      'stops',
      'routes',
      'unassignedStopIds',
      'metrics',
      'baselineMetrics',
    ]);
    expect(empty.routes).toEqual([]);
    expect(empty.metrics).toBeNull();
    expect(empty.algorithm).toBeNull();
    // Nothing planned yet: every stop is unassigned, and the stops themselves are included.
    expect((empty.stops as unknown[]).length).toBe(45);
    expect((empty.unassignedStopIds as string[]).length).toBe(45);

    await useAppStore.getState().optimize();
    const text = useAppStore.getState().exportRoutesJson();
    expect(text).toContain('\n  "routes": [\n'); // pretty-printed (2 spaces)
    const json = JSON.parse(text) as {
      exportedAt: string;
      depot: { id: string };
      drivers: { id: string }[];
      routes: { driverId: string; stopIds: string[] }[];
      metrics: { totalDistanceKm: number };
      stops: { id: string }[];
      unassignedStopIds: string[];
      baselineMetrics: { totalDistanceKm: number };
      algorithm: string;
      optimizedAt: string;
    };
    expect(json.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(json.depot.id).toBe('DEPOT');
    expect(json.drivers.map((d) => d.id)).toEqual(['D1', 'D2', 'D3']);
    expect(json.routes.map((r) => r.driverId)).toEqual(['D1', 'D2', 'D3']);
    expect(json.metrics.totalDistanceKm).toBe(useAppStore.getState().optimizedMetrics!.totalDistanceKm);
    // Self-contained: every routed id resolves to an exported stop; nothing unassigned on the seed.
    const exported = new Set(json.stops.map((s) => s.id));
    for (const r of json.routes) for (const id of r.stopIds) expect(exported.has(id)).toBe(true);
    expect(json.unassignedStopIds).toEqual([]);
    expect(json.baselineMetrics.totalDistanceKm).toBe(useAppStore.getState().baselineMetrics!.totalDistanceKm);
    expect(json.algorithm).toBe(useAppStore.getState().algorithm);
    expect(json.optimizedAt).toBe(useAppStore.getState().lastOptimizedAt);
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
    // Unknown ids (inconsistent data) are skipped - not counted, never "next" -
    // so the driver screen cannot wedge on a stop it cannot show.
    expect(driverProgress(route, {})).toEqual({ total: 0, done: 0, delivered: 0, failed: 0, nextIndex: -1 });
    expect(driverProgress(route, byId(['A', 'delivered'], ['C', 'pending']))).toEqual({
      total: 2,
      done: 1,
      delivered: 1,
      failed: 0,
      nextIndex: 2, // C's position in the route
    });
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
