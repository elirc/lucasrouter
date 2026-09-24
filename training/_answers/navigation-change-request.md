# Change request RIQ-230 reference: late stops

1. **Where the rule lives.** "Late" is already defined in one place: `simulateTimings` in `src/lib/optimizer/schedule.ts` sets
   `late: boolean` per step (`Math.round(arrival) > window.end`) and counts `violations`, and `repair.ts` uses the same definition ("so both
   agree on what 'late' means"). `schedule()` runs after every optimize **and** after every manual move (`planAfterMove` → `schedule`).
   So the reference is to surface per-stop lateness from `schedule()` output, for example `Route.lateStopIds: string[]`, instead of
   re-deriving it in the UI from `etaByStopId` strings. There must be one definition.
   A failed attempt doesn't reschedule today (DECISIONS #24, "Stop status changes do not re-plan"). Decide explicitly whether
   "failed" counts. The PM's sentence implies it doesn't push later stops, because the ETAs don't change.
2. **Data.** `lateStopIds` is derived from `routes`, which are persisted. Either persist it as part of `Route` (then bump
   `PERSIST_VERSION` to 2, and have `migratePersisted` drop or re-derive the plan as it does for v0), or keep `Route` unchanged and derive
   in a memoized selector from `routes` + `stops` via `simulateEtas`. The reference picks **derive** (no migration, one source of truth).
   `RouteMetrics` already carries a violation count for the header.
3. **Files, in order.** `schedule.ts` (export a helper `lateStopIds(route, stops, driver)`), a test in `tests/optimizer.test.ts`, then
   `icons.ts` (add `late` to `StopIconSpec` **and to the cache key**, or late markers reuse on-time icons), `StopMarker.tsx`/`MapViewInner.tsx`
   (pass `late` as a boolean prop so memo still works), `StopRow.tsx` (a "Late" badge: text, not colour only), `PanelHeader.tsx` (the count),
   and a new `LateAnnouncer.tsx`.
4. **Announcement.** One persistent `role="status"` element mounted with the panel (never conditionally). Its text is set from an effect
   **only when the count changes because of a user action in this tab**: compare with a ref of the last announced count, and skip updates
   that arrive via cross-tab sync (the store's `setState` from the `storage` listener) and the initial hydration. The message is
   "2 stops now late" / "No late stops". Don't reuse the toast: it auto-dismisses and has the M2 bug.
5. **Performance.** Markers get a boolean `late` (stable primitive). The count uses a selector that returns a number. Don't subscribe
   `DispatchScreen` to anything new (M1). Recompute lateness only when `routes`/`stops` change (`useMemo`).
6. **Tests.** Unit: the lateness helper matches `violations` for a seeded plan, and a manual move that pushes a stop past its window
   flips it. Component (if J2): `LateAnnouncer` announces on a count change and not on the initial mount. Smoke: move the stop, then the
   badge and the header count appear.
7. **Won't do:** re-planning on failure, notifications to drivers, colour-only indicators.

**Common wrong placements:** computing lateness in `StopRow` from `eta` strings (a second definition, and it breaks with the 12 h
formatting in `to12h`); a new persisted `isLate` on `Stop` (drifts from routes); announcing via the toast.
