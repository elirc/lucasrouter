# J1 · "Still to deliver" counts failed stops

**Rung:** junior · **Time:** 1.5 h · **Skills:** React derived state, pure functions, unit tests

## Context
The fleet overview strip on `/dispatch` (desktop only) is `src/components/dispatch/DispatchOverview.tsx`. Its "Delivered" card
shows `done` and `` `${stops.length - done} still to deliver` ``, where `done` counts only `status === 'delivered'`.
A `Stop.status` is `'pending' | 'delivered' | 'failed'` (`src/lib/types.ts`).

## Ticket
> **RIQ-112** Ops lead: "At 4 pm the overview said *6 still to deliver*. Two of those were failed attempts (no one home). Nobody is
> driving to them today. I need the card to split *to deliver* from *failed*, so I can plan re-attempts."

## Constraints
- No new store fields. This is derived data, so compute it from `stops`.
- Put the counting in a pure function under `src/lib/` (for example `summarizeDay(stops)`). The component only formats.
- Don't touch the mobile layout. `.dispatch-overview` is `display:none` below 768 px (`dispatch.css`).

## Definition of done
- The card reads, for example, "31 delivered · 2 failed · 12 to deliver". The three numbers always add up to `stops.length`.
- Unit tests in `tests/` cover: an empty day, all pending, a mix, and a stop that was undone (`undoStop` puts it back to `pending`).
- `pnpm verify` is green.

## Explain before touching (write your answers first)
1. Which files change, and which file must NOT change?
2. `stops` comes from `useAppStore(s => s.stops)`. When does this component re-render, and does your change add renders?
3. Does anything else in the repo already count stop statuses? Search before you write a second copy (hint: `driverProgress` in the store,
   `src/components/driver/report.ts`).
4. Which test file style fits a pure function here, and why is no DOM needed?
5. What is the risk if the dispatcher tab and a driver tab disagree about a stop's status? (Read the cross-tab sync header in `useAppStore.ts`.)

<details><summary>Hints</summary>

- `driverProgress(...)` in `useAppStore.ts` already counts per driver. Decide whether to reuse it or extract a shared helper, and justify the choice.
- `useMemo(() => summarizeDay(stops), [stops])` keeps the render cheap.
</details>

Sealed answer: `training/_answers/ladder-J1.md`
