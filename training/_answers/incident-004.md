# INC-004 answer: a keystroke-rate value subscribed at the top of the tree

## Root cause
The PR moved the search text from `StopSearch`'s local `useState` into the global store (`searchQuery`) and subscribed
**`DispatchScreen`** to it, so it could pass `highlightQuery` to the map. Every keystroke now:
1. `set({ searchQuery })`, which notifies every store subscriber (cheap), and
2. re-renders `DispatchScreen`, and with it every non-memoized child: `DispatchOverview`, `PanelHeader`, `DispatchPanel` → `StopSearch` → its
   results list (while a query is typed, `StopSearch` shows results instead of `DriverRoutes`), `LegendOverlay`, `Toast`,
3. re-renders `MemoMapView` (the `highlightQuery` prop changed) → `MapViewInner`, which passes a new `highlightQuery` string to **all 45**
   `StopMarker`s, so every marker memo misses and each marker re-renders and recomputes `dimmed`. react-leaflet then calls `setOpacity`
   on each Leaflet marker,
4. the text now round-trips through a store the whole screen listens to (store updates through `useSyncExternalStore` render
   synchronously), so `StopSearch`'s own `useDeferredValue` no longer isolates the expensive work from the keystroke.
Before, typing re-rendered only `StopSearch` and its results list.
The review called it "well-contained" because each file's change was tiny. The cost is in **where the subscription sits**, which
no individual hunk shows.

## About the numbers (the brief's question)
Only 1 of 25 keydowns crossed Event Timing's 16 ms floor, yet about 20 long tasks (1.4–1.9 s total) ran during typing. So the per-event
durations under-report what users feel. **Don't guess which task the work lands in. Attribute it:** record a Performance trace while
typing, click a long task, and read its stack (React `performWorkUntilDeadline`/`flushSync` frames vs Leaflet `setOpacity` / style
recalculation), plus its initiator (input event vs a scheduler callback). (The reference numbers come from the probe. No trace was saved, so producing one is your job.) Whatever the task boundaries, that work blocks the next keystroke's
input and paint ("letters appear in bursts"). Long-task time, or a trace, is the better lens here than INP-style per-event numbers.
Field INP would surface it on whichever interaction next lands on the busy thread.

## Diagnostic path
Probe typing numbers (see the brief) → Performance trace while typing: long tasks with React commit stacks after each keystroke → Profiler
"why did this render": `DispatchScreen`: "hook changed" → the diff: the new `useAppStore((s) => s.searchQuery)` in `DispatchScreen`.

## Fix options
- **A (chosen):** keep the query local to `StopSearch` (urgent, for the input) and publish a **deferred** value for the map:
  `const deferred = useDeferredValue(query)`, then write `deferred` to the store in an effect, **or** better, let the map read a
  *derived* set: `useAppStore(s => s.searchQuery)` subscribed **inside** a small `DispatchMap` wrapper, not `DispatchScreen`. Pass
  `dimmed` as a boolean per marker (computed once in `MapViewInner` into a `Set` of matching ids), so only markers whose dimmed state
  flips re-render.
- **B:** debounce the store write (150 ms). Simpler, but it adds latency to the map feedback, and the tree-wide re-render still happens
  once per pause.
- **C:** drive marker opacity imperatively (a Leaflet `setOpacity` from one effect over the matching set). It's fast, but it bypasses React.
  Keep it as a fallback for large N (S1).

## Guard
A component/Profiler test: render `DispatchScreen` with `<Profiler onRender>` around the panel, type 5 characters, and assert the
`DriverRoutes` render count doesn't grow. Plus the probe's typing check in CI (S2), with the threshold set from `main`'s number on the runner.
An ESLint `no-restricted-syntax` rule or a review rule: `DispatchScreen` may only subscribe to layout-level slices (documented in FIRST_CHANGE #3).

## Postmortem essentials
Impact: typing latency for dispatchers on slow machines, no data impact. Detection: user complaint (no RUM). Lesson: **state
placement is a performance decision**. Lift state to the lowest common owner, and subscribe at the leaves.
