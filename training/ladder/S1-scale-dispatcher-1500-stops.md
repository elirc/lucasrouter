# S1 · 1,500 stops, 25 drivers, same laptop

**Rung:** senior · **Time:** design doc (1 day) + spike (1–2 days) · **Skills:** rendering at scale, main-thread budgets, workers,
progressive loading, rollout

## Context
Everything in RouteIQ is sized for 45 stops and 3 drivers (`src/data/*.json`). Here is what grows with N, from the code:
- **Map:** one Leaflet `Marker` DOM node + one React `StopMarker` per stop (`MapViewInner.tsx`), SVG polylines per route from
  `src/data/paths.json` (1,035 precomputed pairs for 45 stops, about 96 KB. Pairs grow with N²).
- **Panel:** every row of every expanded route card renders (`DriverRoutes.tsx` → `StopListItem` + `MoveStopMenu`), not virtualized.
- **Optimizer:** `nn-2opt-v1` runs on the server (`/api/optimize`, `MAX_STOPS = 1000`) with a wall-clock repair budget
  (`src/lib/optimizer/repair.ts`). Its fallback runs **on the main thread** when the API fails.
- **Persistence:** the whole persisted slice is serialized into one `localStorage` key (`routeiq-v1`, about 5 MB quota) on every real edit.
- **Today at 45 stops:** marker-click p75 is 240 ms at 1× on this laptop (ladder M1).

## Ticket
> **RIQ-200** Sales signed a regional carrier: 1,500 stops/day, 25 drivers, dispatchers on 5-year-old office PCs. Keep marker/row
> interaction INP < 200 ms p75 and `/dispatch` LCP < 2.5 s on their hardware, and ship it without a big-bang release.

## Constraints
- The `/api/optimize` contract (`docs/ALGORITHM_INTEGRATION.md`) may be extended but not broken. Existing clients keep working.
- Driver phones still hold only *their* route.
- Budget: one engineer for 3 weeks. Say what you won't do.

## Deliverable: design doc (≤ 3 pages)
1. The measurement plan first: synthetic 1,500-stop seed, the probe at 1× and 4×, a Profiler trace. Which numbers gate each phase?
2. Map: DOM markers vs `L.canvas`/`preferCanvas` circle markers vs clustering vs WebGL. Decide how selection, keyboard access and
   popups work in each (the a11y cost of canvas markers is real. Cross-reference your M3 audit).
3. Panel: virtualization (and what it does to `scrollIntoView`, find-in-page, and screen readers), collapsed-by-default cards.
4. State: per-stop selectors vs derived maps, whether `localStorage` still fits, and IndexedDB migration.
5. Optimizer: server limits (`MAX_STOPS`), a timeout story, and moving the fallback into a Web Worker.
6. Rollout: flag by tenant/fleet size, keep the 45-stop path, and roll back by flag. What do you watch after enabling it for the first carrier?

## Explain before touching
1. List the O(N) and O(N²) costs above and say which one hits first as N grows.
2. What breaks for keyboard and screen-reader users if you switch to canvas markers? What is your equivalent path?
3. Why is "make the API faster" irrelevant to INP?

Sealed answer: `training/_answers/ladder-S1.md`
