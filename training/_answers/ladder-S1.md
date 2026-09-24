# S1 reference: 1,500 stops on old office PCs

## Explain-before-touching: reference answers
1. **O(N) per interaction:** today every selection re-renders the whole dispatch tree plus every visible row (M1). React work per
   marker, and Leaflet DOM per marker (1,500 absolutely positioned divs, and every pan or zoom repositions them). **O(N) memory and
   persistence:** one `JSON.stringify` of the whole slice per edit. **O(N²):** precomputed road paths per stop pair
   (`paths.json`: 1,035 pairs at 45 stops becomes about 1.1 M pairs at 1,500). They're unshippable as a static file, so this hits first
   at **build/data** time. At **runtime** the first wall is DOM markers + whole-tree re-renders (interaction), then persistence
   serialization (edits), then the main-thread fallback solver.
2. Canvas markers aren't focusable and have no `alt`. The equivalent path is: the panel list is the primary keyboard/SR interface
   (it already has the ⋯ `MoveStopMenu` with roving focus), plus a "Selected stop" region that mirrors the map popup's contents and
   actions as real DOM, plus keyboard pan/zoom on the map container itself. Document it in the VPAT (M3).
3. INP measures the time from input to next paint on the **main thread**. The API runs elsewhere. What matters is what the UI does when
   the answer lands (one huge `set` → full re-render) and while it waits (spinner vs blocked thread). The only way the API touches INP
   is the fallback solver running locally.

## Reference design outline
1. **Measure:** a synthetic generator `scripts/seed-scale.ts` (1,500 stops, 25 drivers, seeded RNG), the probe at 1× and 4× with the machine
   recorded, Profiler traces. Gates per phase: marker-click p75, row-click p75, `/dispatch` LCP, and Optimize end-to-end.
2. **Map:** `preferCanvas` + `CircleMarker` for unselected stops, with a single DOM marker for the **selected** stop (it keeps a focusable,
   labelled element and a popup). Cluster below zoom 13. Route polylines from the server per route, not per pair. Draw only visible drivers.
3. **Panel:** collapsed cards by default (already true), virtualize rows within an expanded card (`@tanstack/react-virtual`). Replace
   `scrollIntoView` with `virtualizer.scrollToIndex`. Keep "find stop" search as the SR path. Rows memoized, with a boolean selection selector.
4. **State:** the selection subscription moves out of `DispatchScreen`. Selectors are per row and per marker. Normalize (`stopsById`)
   in the store once instead of in every component's `useMemo`. Persistence moves to IndexedDB with per-entity records (the photos first), and
   `PERSIST_VERSION` 2 with a migration.
5. **Optimizer:** raise `MAX_STOPS` behind a flag, move to async jobs above N = 500 (submit → progress), and put the fallback in a Web Worker
   (`OptimizeRequest` is plain JSON, so it's transferable). Replace the wall-clock repair deadline with an iteration budget for determinism.
6. **Rollout:** `largeFleetMode` flag per tenant, and the 45-stop path unchanged. Enable for one carrier depot, watch RUM INP p75 per
   interaction type (S2) and optimize job latency, and roll back by flag.
**Won't do:** WebGL map, CRDT sync, driver app changes.

## Rubric
Correct first bottleneck with reasoning (2) · a11y equivalent for canvas (2) · measurement gates (2) · state/persistence plan with migration (2) · flag rollout + what to watch (2).
