# J2 reference: component-test foundation

## Explain-before-touching: reference answers
1. `tests/store.test.ts` builds a **hand-rolled fake `window`** with `localStorage` and a `fireStorage` helper to drive cross-tab sync
   deterministically. jsdom would give a real `window` with its own `localStorage` and `storage`-event semantics (jsdom doesn't fire
   `storage` in the same window), so the tests would change meaning. Keep them in node. Add a separate DOM project.
2. The store is a module singleton. `toast`, `selectedStopId` and the persisted slice leak between tests, and so do the **module-level**
   `toastSeq`, `knownStored` and `lastPersistedSlice` in `useAppStore.ts`. Reset with `useAppStore.setState(initial, true)` and
   `localStorage.clear()` in `afterEach`. For module-level variables, either accept monotonic ids (assert on text, not id) or use
   `vi.resetModules()` + a dynamic import.
3. **Can move down:** "no horizontal scroll" is still e2e, but "Toast renders the message", "Search filters by status", "Move menu
   Escape returns focus", "Driver dialog focuses the panel" can move. **Must stay e2e:** markers within 2 s (real Leaflet + network),
   two-tab sync with real `storage` events, the network host allow-list, real `<dialog>` top-layer behaviour (jsdom's `showModal` support is
   partial), and PWA/manifest.
4. `Toast` uses `useEffect` + `setTimeout` (auto-dismiss 3,500 ms, exit 200 ms) and a render-phase state adjustment. Wrap timer
   advancement in `act(() => vi.advanceTimersByTime(...))` so React flushes the resulting updates and effects.

## Reference config (Vitest 4)
```ts
test: {
  projects: [
    { extends: true, test: { name: 'node', include: ['tests/**/*.test.ts'], environment: 'node' } },
    { extends: true, test: { name: 'dom', include: ['tests/components/**/*.test.tsx'], environment: 'jsdom',
      setupFiles: ['tests/components/setup.ts'] } },
  ],
}
```
Dev dependencies: `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`. Configure JSX via the
existing TS config (`jsx: preserve` needs `esbuild.jsx = 'automatic'` in the Vitest config).

## Reference tests (names)
- `Toast › renders store toast inside a pre-existing status region`: render with no toast, then assert `getByRole('status')` exists
  and is empty → `act(() => useAppStore.getState().showToast('Routes ready · 3 drivers · 175 km', 'success'))` → the same element now
  has the text.
- `Toast › stays visible for the auto-dismiss window`: fake timers. Advance 3,000 ms and the text is present. Advance to 3,700 ms and it's gone.
  **Expected on `main`:** this may or may not reproduce M2 in jsdom. The bug needs a pending idle-branch update plus a later unrelated
  re-render. To reproduce it: mount, advance 250 ms (the idle exit timer fires), show a toast, then force a re-render (for example
  `setState({ selectedStopId: 'S001' })`) and assert the text is still present. Record what you observed either way.
- `StopSearch › filters by text and status`: type "univ", select "Pending", and assert `getByRole('status')` has text `/\d+ stops? found/`.

## What the PR note should say
Component tests catch render/state/ARIA regressions in milliseconds with no server. The smoke run catches integration: real Leaflet,
real network, real top layer, real two-tab storage. Neither catches perf. That's M4.

## Rubric
Two projects, node tests untouched (3) · role-based queries (2) · store and module-state isolation handled (2) · timer test with `act` (2) · honest note on M2 reproduction (1).
