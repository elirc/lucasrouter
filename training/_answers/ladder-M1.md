# M1 reference: marker-click INP

## Explain-before-touching: reference answers
1. **Subscribers to `selectedStopId`** (grep `s.selectedStopId`): `DispatchScreen`, `DriverRoutes`, `UnassignedSection`
   (`DispatchScreen.tsx:69`, `DriverRoutes.tsx:92`, `UnassignedSection.tsx:31`). **Re-rendered only because a parent did:** everything `DispatchScreen` renders that isn't memoized: `DispatchTopBar`,
   `DispatchOverview`, `PanelHeader`, `DispatchPanel` → `MetricsCompare`, `StopSearch` (its `children` prop is a fresh element tree each
   time) → `DriverRoutes` → every `DriverRouteCard` → every rendered `StopListItem`/`SortableStopRow` + `MoveStopMenu` + `StopRow`,
   `LegendOverlay` → `RouteLegend`, and `Toast`.
2. `memo(MapView)` stops panel-only updates (isOptimizing, metrics, toasts) from re-rendering the map. It doesn't help the panel, and
   because `selectedStopId` is a map prop, every click does re-render `MapViewInner`. There, the `StopMarker` memo limits work to the 2
   markers whose `selected` changed.
3. `onActivate` (`handleActivateStop`, `useCallback` on `[isDesktop, setSelectedStop]`) is stable. `onMove` (`handleMove`) is stable
   until `stops`/`routes` change. `drivers` is a store slice, so it's stable. So a `memo(StopListItem)` **would** hold on mobile. On
   desktop the dnd path renders `slots.Row` with dnd-kit's `useSortable`, whose context re-renders rows anyway. That needs its own
   check in the Profiler.
4. Leaflet's work: popup DOM creation (`Popup` mounts only when selected), `autoPan` (an animated pan), `panBy` for off-screen markers,
   and `setZIndexOffset`. In a Performance trace, React work shows up as `performWorkUntilDeadline`/`commitRoot` stacks. Leaflet shows up as
   `_updatePosition`, `_adjustPan`, and style/layout from popup insertion. Measure both before you blame React.
5. `memo` compares props every render. On components whose props change on every click anyway (the selected row, the map), it's pure
   overhead. Memoizing `DispatchPanel` without fixing `StopSearch`'s children identity does nothing.

## Reference plan (PR-sized, in order)
1. **Move the selection subscription out of `DispatchScreen`.** A small `DispatchMap` (memo) subscribes to `selectedStopId` and renders
   `MemoMapView`, so `DispatchScreen` no longer re-renders on a click. *Measured below: it didn't move INP. Keep it only if the
   Profiler shows a real render saving, and don't claim a latency win.*
2. **Rows subscribe to their own selection:** `StopListItem` takes `stopId` and does `useAppStore(s => s.selectedStopId === stopId)`.
   `DriverRoutes` keeps only the "expand the card containing the selection" logic, subscribing to the selected stop's *driver id*
   (a derived primitive) instead of the id itself. Then `memo(StopListItem)`.
3. **Re-measure,** then decide whether the remaining cost is Leaflet (popup + autoPan). If it is, open the popup without animation for
   list-driven selection, and consider CSS containment on the panel (`contain: content`).

## Verified numbers for step 1 (scratch build, 2026-09-24, probe `--only=clicks`, 12 marker clicks per run)
Step 1 was applied in a scratch worktree (a `DispatchMap` wrapper that owns the `selectedStopId` subscription; `DispatchScreen` no
longer subscribes). It builds, and behaviour looked the same in the probe run.

| Build | p75 click @1× (runs) | p75 click @4× (runs) |
|---|---|---|
| `main` | 240, 224 ms | 1,456, 1,288, 1,064, 1,184 ms |
| step 1 only | 272, 240 ms | 1,312, 1,136 ms |

**Result: no measurable improvement.** The run-to-run spread (±150 ms at 4×) is larger than any effect. That's the most important lesson
in this answer. The "obvious" React fix, which the Profiler would show removing a whole-screen re-render per click, **wasn't where the
time goes**. A strong submission:
- shows the Profiler improvement *and* the unchanged interaction latency, and says so plainly;
- then traces the click at 4× in the Performance panel and attributes the long task. Candidates, in order of suspicion: the Leaflet
  popup mount + `autoPan` (an animated pan, with layout on every frame), `DriverRoutes` + rows (they still subscribe to
  `selectedStopId`, and with no memo every row re-renders; the card may also expand and `scrollIntoView`), and style recalculation
  over 45 marker nodes + SVG polylines;
- fixes the attributed cause and measures again. Only claims that survive the probe go in the PR.
If you can't get under 200 ms at 1× without a larger redesign, the right deliverable is the attribution + a proposal (S1), not a pile of `memo`.

## Rubric
Profiler-backed causal chain (3) · each change measured separately (3) · behaviour preserved (list↔map, sheet snap, focus) (2) · next bottleneck named with trace evidence (2).
