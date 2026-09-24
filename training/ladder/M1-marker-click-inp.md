# M1 · Clicking a stop on the map feels sticky

**Rung:** mid · **Time:** 1 day · **Skills:** INP, React Profiler, zustand selector granularity, memoization, measuring before/after

## Context
Measured on `main` (fafe0c7) with `training/tools/frontend-probe.mjs --only=clicks`: production build, desktop `/dispatch` after
Optimize, 12 marker clicks, Event Timing API.

| CPU | p75 click duration | worst interaction |
|---|---|---|
| 1× (this laptop, unthrottled) | **224–240 ms** (two runs) | 680–856 ms |
| 4× throttle | **~1,060–1,460 ms** (four runs) | 1,568–2,144 ms |

The INP "good" threshold is 200 ms. This laptop is slower than Lighthouse's reference device (DECISIONS #44), so the 4× numbers
exaggerate a real phone. The 1× number is already over budget on a desktop.

## Ticket
> **RIQ-140** Dispatcher (desktop): "When I click pins one after another, each popup takes a beat. On the tablet it's worse."
> Get marker-click INP p75 under 200 ms at 1× and cut it at least in half at 4×, without breaking list↔map sync.

## Constraints
- Measure first. Record a React Profiler trace (dev build) **and** a Performance-panel trace (prod build) before changing anything.
- Fixes must be PR-sized. No map-library swap, no virtualization in this ticket (that's S1).
- Keep the behaviour: selecting on the map expands and scrolls the matching row in the panel (`DriverRoutes` derived-state block,
  `StopListItem` `scrollIntoView`), and on phones the sheet snaps to `half`.
- Every change comes with a before/after number from the same machine and session.

## Definition of done
- A table like the one above, before vs after, at 1× and 4×, with the commit for each row.
- A one-paragraph causal explanation that names the components re-rendering per click and why.
- No new ESLint warnings. `pnpm verify` and `pnpm smoke` green.

## Explain before touching
1. Trace one marker click: `StopMarker` `click` handler → `onSelectStop` → store → which subscribers? List every component that
   selects `selectedStopId` (grep) and every component that re-renders only because its **parent** did.
2. `DispatchScreen` wraps the map in `memo(MapView)`. What does that memo protect, and what does it not protect (the panel side)?
3. `StopListItem` isn't memoized and receives `drivers`, `onActivate` and `onMove`. Which of those are referentially stable?
4. What does Leaflet do on click that React doesn't control (popup mount, `autoPan`, `panBy`)? How do you tell React cost from Leaflet
   cost in a trace?
5. Why is "wrap everything in `memo`" not an answer? Name one memo that would *add* cost here.

<details><summary>Hints</summary>

- React DevTools → Profiler → "Record why each component rendered".
- Look at what `DispatchPanel` → `StopSearch` → `children` does on every `DispatchScreen` render.
- `useAppStore(s => s.selectedStopId === stop.id)` is a boolean selector. Who could use one?
</details>

Sealed answer: `training/_answers/ladder-M1.md` · Agentic run of this ticket: `training/agentic/WORKFLOW.md`
