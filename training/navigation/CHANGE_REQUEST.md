# Change request: "Announce and highlight late stops"

> **RIQ-230** Dispatch lead: "When a manual move or a failed attempt pushes a stop past the end of its time window, I want to see it
> immediately: a red ring on the marker, a 'Late' badge on the row, and a count in the panel header. Screen-reader users on my team need
> it announced ('2 stops now late'), but not on every render."

**Before any agent writes code, write down (in `training/_work/cr-late-stops.md`):**
1. **Where the rule lives.** Which module decides "late"? Is it store, optimizer, UI or a new `src/lib/` helper? Which existing function
   already computes ETAs per stop (`schedule.ts`? `Route.etaByStopId`?), and which one already knows about window violations
   (`RouteMetrics`, `repair.ts`)?
2. **Data changes.** Does anything need persisting? Is "late" derived or stored? What happens to old persisted blobs (`PERSIST_VERSION`)?
3. **Files to touch, and the order.** Include the marker (`icons.ts` cache key!), the row (`StopRow.tsx`/`StopListItem.tsx`), the header
   (`PanelHeader.tsx`), and whichever component owns the announcement.
4. **The announcement design.** Which element is the live region, when does it mount, and how do you avoid announcing on every re-render
   or on every tab's cross-tab sync?
5. **Performance.** What re-renders when the late count changes? Which selector do you use?
6. **Tests.** Unit (the rule), component (the badge + live region, if J2 is done), smoke (one end-to-end assertion). Name the files.
7. **What you won't do** in this PR.

Then hand your note to an implementer agent (see `training/agentic/WORKFLOW.md` for the loop), and compare with
`training/_answers/navigation-change-request.md`.
