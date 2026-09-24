# Model answers: TECHNICAL_QUESTIONS.md (short form, with the mechanism)

1. The click → `setSelectedStop`. `DispatchScreen` subscribes to `selectedStopId`, so it re-renders along with every non-memo child:
   `DispatchOverview`, `PanelHeader`, `DispatchPanel` → `MetricsCompare`, `StopSearch` (and the `children` elements it's handed are new),
   `DriverRoutes` (which also subscribes) → every rendered `StopListItem` + `MoveStopMenu`. `MemoMapView` re-renders because
   `selectedStopId` is a prop, and `StopMarker` memo limits that to the 2 markers whose `selected` changed. **Necessary:** 2 markers,
   2 rows, and the card expansion. Everything else is waste (M1).
2. `viewportInset` (an object) and `fitPadding` (already module constants). `useStableCallback` only stabilizes **functions** through a
   ref. An inline object is a new identity every render, `memo`'s shallow compare fails, and the whole map subtree renders (markers are
   memoized, but `MapViewInner` recomputes and `FitBounds` gets new props).
3. The selector returns a new array on every `getSnapshot` call, so `useSyncExternalStore` sees an always-changing snapshot. In dev that's
   the "getSnapshot should be cached" warning, and at worst an infinite update loop. Alternatives: select `s.stops` and filter in `useMemo`,
   or `useAppStore(useShallow(s => s.stops.filter(...)))` (shallow-equal arrays of the same elements).
4. The initial value: on the first render `deferredStops` is `EMPTY_STOPS`, so the first commit contains tiles + depot + viewport only.
   The 45 markers render in a background (interruptible) pass. That protects LCP and total blocking time on slow phones.
5. It's correct when the derived state depends only on the previous prop value and you store that previous value. It broke combined
   with an effect that schedules a state update when idle, so a stale queued `setShown(null)` could win over the render-phase
   `setShown(toast)` on a later unrelated re-render (M2).
6. Swapping a `Suspense` fallback for the loaded tree unmounts the fallback subtree, so a focused ⋯ button loses focus to `<body>`.
   The external store plus the explicit re-focus (`describeFocus` → restore in `useLayoutEffect`) keeps keyboard users in place.
7. It's honest about "first meaningful paint of *something*", but it flatters "map usable". Add a custom mark for the first tile `load`
   (the Leaflet `TileLayer` `load` event) and for "45 markers present" (the smoke run already asserts < 2 s), and report both.
8. Any `'use client'` component imported by `page.tsx` becomes part of `/`'s client graph. If it imports `useAppStore`, the module
   graph brings `@/data` (the seed JSON), `baseline`, `schedule`, zustand + persist, and `installCrossTabSync()` runs on load. Prove it with
   probe/`performance.mjs` JS bytes or the build's client manifest. Prevent it with a per-route budget (M4), an ESLint
   `no-restricted-imports` for the store in `src/app/page.tsx`, or reading `localStorage` directly in a tiny island loaded after idle.
9. CLS counts unexpected movement of already-painted content. A strip inserted **above** the map after a fetch resolves pushes the
   whole map down after first paint, while content present at first paint moved nothing. Fixes: reserve its height in SSR (render a
   placeholder row of the same height), overlay it (absolute, over the map, no layout impact), or put it below the fold (in the panel).
10. Report deltas of medians on one machine with the calibration stated ("benchmarkIndex ≈ 700 vs LH reference ≈ 1500; 54 at default
    4× throttle, 71 at 2× which approximates the reference device"), plus field data when you have it. Never a single run, never a
    cross-machine comparison.
11. Screen readers watch live regions that already exist in the accessibility tree. A region inserted along with its content has no
    "previous" state to diff against, so many AT/browser pairs don't announce it. `StopSearch.tsx`: the
    `<p role="status">{n} stops found</p>` exists only while `filtering`.
12. The top layer (above any z-index), an inert background (click, focus, **and** the accessibility tree), Escape → `cancel` → close, and
    the `:modal` state, which is what makes `aria-modal="true"` true. Also `::backdrop`. To fix the z-index issue instead, render the toast
    **inside** the open dialog, or use the Popover API (`popover="manual"`), which also lives in the top layer.
13. 2.2.1 Timing Adjustable (and 2.2.3 in spirit). Options: pause the timer while the toast has focus or hover, extend it for toasts
    with actions (10 s+), move focus to Undo only for keyboard-initiated actions, or keep Undo available elsewhere (the activity log
    or the stop details sheet) so the toast isn't the only path.
14. No: 45 tab stops in data order, no spatial logic, and the popup lives in another pane, so Tab doesn't enter it. Better: one tab stop for
    the map (arrow keys pan), the panel list as the primary keyboard path (search → row → ⋯ menu → "Move to D2"), and a "Selected stop"
    DOM region with the popup's actions. The keyboard path to "reassign S017" is: focus search, type "5301", Enter on the result, then the
    row's ⋯ menu.
15. The server validates *requests*. The client can't trust *responses* from a swappable algorithm (the endpoint's whole point).
    `isOptimizeResponse` checks shapes and `HH:MM` ETAs so a bad deployment degrades to the local solver instead of crashing the UI.
16. v0 plans used straight-line km, so `migratePersisted` drops routes, metrics and optimize info (cheap to recompute: one click) but keeps
    stops (with delivery status and proof), the log, and UI prefs. Losing a driver's progress is expensive and unrecoverable. Losing a
    plan isn't.
17. Each tab applies the other's whole persisted slice when its `storage` event arrives. The later writer's blob wins in both tabs, and the
    earlier edit is lost. The store header says so under "Known limit" (demo-sized trade-off; field-level merging not worth it here).
18. Rendering, ARIA, focus, timers in components, layout (CLS), the module graph (bundles), and real browser features (`<dialog>`, top
    layer). Add component tests first (J2). They're cheap, fast, and would have caught the Toast bugs (M2, incident 002).
19. The output depends on CPU speed and contention, so the same input can give different plans (different numbers of repaired windows),
    and assertions become flaky under parallel test workers or on slow CI runners. Fix: make the budget injectable (an iteration cap in
    tests, time in production), or separate "time cap reached" from "result" so tests can assert invariants rather than exact plans.
20. RUM with `web-vitals/attribution` (the `largestShiftTarget` selector), p75 per route and device class, joined to the build id.
    Alert when `/dispatch` CLS p75 > 0.1 for 30 min after a deploy. Confirm locally with the probe's CLS on both builds.
