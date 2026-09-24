# J1 reference: "still to deliver" counts failed stops

## Explain-before-touching: reference answers
1. **Change:** a new `src/lib/daySummary.ts` (or similar), `DispatchOverview.tsx` (formatting only), and a new `tests/day-summary.test.ts`.
   **Don't change:** `useAppStore.ts` (no new state), `dispatch.css` mobile rule, and `driverProgress` semantics (the driver screens depend on it).
2. It re-renders when `stops`, `drivers`, `optimizedMetrics` or `baselineMetrics` change identity, **and whenever `DispatchScreen`
   re-renders** (it isn't memoized, and DispatchScreen subscribes to `selectedStopId`). A `useMemo` keyed on `stops` adds no renders.
3. `driverProgress(...)` in `useAppStore.ts` counts per driver. `report.ts` counts for the end-of-day report. Reference choice: extract a
   small pure `countStatuses(stops)` and use it in the overview. Leave `driverProgress` alone unless its semantics are identical.
   A second, subtly different "done" definition is exactly how this bug started (`done = delivered only`).
4. A node-environment Vitest test (`tests/*.test.ts`). It's a pure function over `Stop[]`, so no DOM is needed. Build stops with the
   seed (`getSeed()`) and mutate statuses.
5. Each tab derives from its own copy of `stops`. Cross-tab sync applies the whole persisted slice last-writer-wins, so counts can
   differ briefly or permanently if an edit is lost. The overview is only as right as the tab's state.

## Reference change (sketch)
```ts
// src/lib/daySummary.ts
export function countStatuses(stops: readonly Stop[]) {
  let delivered = 0, failed = 0;
  for (const s of stops) { if (s.status === 'delivered') delivered++; else if (s.status === 'failed') failed++; }
  return { delivered, failed, toDeliver: stops.length - delivered - failed };
}
```
Overview: `const c = useMemo(() => countStatuses(stops), [stops]);` → detail `` `${c.failed} failed · ${c.toDeliver} to deliver` ``.

## Tests that matter
Empty → all zeros. All pending → `toDeliver = n`. Mixed → sum invariant. Undo: build with the store (`recordFailure` then `undoStop`) and
assert the stop counts as `toDeliver` again. That last test proves the function agrees with store semantics, not just with itself.

## Rubric
Pure function + sum invariant test (4) · no new store state (2) · noticed `driverProgress` and justified reuse or not (2) · mobile untouched (1) · verify green (1).
