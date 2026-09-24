# Reference review: RouteIQ @ fafe0c7 (24 findings)

Ranked by production severity. **[RUN]** = verified by running the app. **[READ]** = verified by reading code. **[AI]** = a typical
old-AI-generated smell. Probe = `training/tools/frontend-probe.mjs` against `pnpm build && pnpm start`, on this laptop, 2026-09-24.

## High
1. **The dispatcher's "Routes ready" toast is visible for ~161 ms.** [RUN] Correctness/UX + a11y. `src/components/ui/Toast.tsx`: the
   derived-state block (`if (toast !== prevToast) … setShown(toast)`) interacts with the idle-branch exit timer the effect schedules on
   mount (`setTimeout(() => setShown(null), EXIT_MS)` while `toast === null`). After Optimize, `shown` flips back to `null` while the store's
   `toast` is still set. Evidence: MutationObserver shows the card removed about 200 ms after insertion. Instrumented dev build: no
   `dismissToast` call and no exit timer fired in that window, yet `shown` is null. Skipping the idle-mount timer makes the toast stay
   3.5 s. The Export toast works. *Why it matters:* the one feedback message for the app's main action is unreadable and very likely
   unannounced. No test covers it (ladder M2).
2. **Marker-click INP p75 is 224–240 ms at 1× and about 1.1–1.5 s at 4× CPU.** [RUN] Performance. One click → `setSelectedStop` →
   `DispatchScreen` (subscribes `selectedStopId`) re-renders the whole screen, `DriverRoutes` (also subscribes) re-renders every
   `StopListItem` + `MoveStopMenu` (not memoized), and Leaflet mounts the popup and runs `autoPan`. **Attribution is not settled:** in a
   scratch experiment, removing `DispatchScreen`'s subscription left p75 unchanged within noise (ladder M1 answer), so the time is
   elsewhere. *Why it matters:* the dispatcher's core interaction is over the INP "good" budget even on desktop.
3. **`/api/optimize` is public, unauthenticated, CPU-bound, and parses unbounded bodies.** [READ] Security/cost. `route.ts` `POST`:
   `await request.json()` before any size or content-type check. Up to 1,000 stops × a repair pass with a wall-clock budget, and
   `maxDuration = 30`. The repo is public with a one-click deploy button, so anyone can burn the owner's function minutes. No rate limit.
   The 500 branch echoes `err.message` (ladder J3).

## Medium
4. **A live region mounts together with its text.** [READ] A11y. `StopSearch.tsx`: the `<p role="status">N stops found</p>` exists only
   while `filtering`, so the first result count after typing is inserted at the same time as its region, and many screen readers skip it.
   *Why:* search is how keyboard and SR users find a stop. (This is the same pattern incident 002 introduces into `Toast`.)
5. **Undo lives in a toast that auto-dismisses after 3.5 s, with no pause on hover or focus.** [READ] A11y, WCAG 2.2.1 Timing Adjustable.
   `Toast.tsx` `AUTO_DISMISS_MS`. The driver's only undo for a mis-tap (DECISIONS #50) disappears before a keyboard or SR user can reach it.
6. **No component-test layer, and no CI.** [READ] Tests/operability. `vitest.config.mts` `environment: 'node'`. DECISIONS #3. No `.github/`.
   All four frontend incidents and finding #1 pass `pnpm verify`. The smoke run is manual, needs local Chrome, and missed #1.
7. **Optimizer output depends on machine load.** [READ] Tests/correctness. `src/lib/optimizer/repair.ts:173,235`,
   `if (performance.now() > deadline) break`. docs/REBUILD.md tells you to run vitest serially after a build. Flaky in CI, and
   non-reproducible plans in production under load.
8. **The main-thread optimizer fallback.** [READ] Performance. `useAppStore.ts` `optimize()`: on API failure or bad shape it runs
   `import('@/lib/optimizer')` → `optimize(req)` synchronously. At 45 stops that's cheap. At `MAX_STOPS` it freezes the page.
9. **Every real edit serializes the whole persisted slice, photos included, on the main thread.** [READ] Performance.
   `persistStorage.setItem` → `JSON.stringify(value)` of up to about 1.5 MB of photo data URLs (`PHOTO_BUDGET_BYTES`) on each delivery,
   undo or move. The reference compare only protects *ephemeral* updates. Magnitude UNMEASURED. Measure "Confirm delivery" INP with 30
   photos stored.
10. **Whole-slice last-writer-wins across tabs.** [READ] Data integrity. Documented in the store header as a "Known limit". A dispatcher's
    move and a driver's delivery landing within milliseconds lose one edit. Acceptable for a demo. It has to be the first thing to go
    for a product.
11. **Map keyboard model: 45 marker tab stops in data order, and the popup lives in another pane.** [READ] A11y. `StopMarker.tsx`
    `keyboard`. The popup renders in Leaflet's popup pane, not after the marker in the DOM, so Tab from an opened marker goes to the next
    marker, not into "Reassign to…" (confirm in the M3 audit). The panel's ⋯ menu is the real keyboard path. Nothing tells the user that.
12. **Pointer-only instruction.** [READ] A11y/UX. `DispatchScreen.tsx` map label: "Select a marker to view details".

## Low
13. **"Still to deliver" counts failed stops.** [READ] Correctness. `DispatchOverview.tsx`: `` `${stops.length - done} still to deliver` ``
    where `done` is delivered only (ladder J1).
14. **Docs describe config the code doesn't have.** [READ][AI] DECISIONS #54 "The stylesheet ships inside the HTML
    (`experimental.inlineCss`)", but `next.config.ts` has no `experimental` block (docs/REBUILD.md says the rebuild reversed it). The
    docs are a changelog of intentions. Check each one against config and runtime.
15. **Rebuild-era components written in a compressed one-line style.** [READ][AI] Maintainability. `StopSearch.tsx:26-31` and
    `DispatchOverview.tsx` pack whole trees into single JSX lines, unlike the rest of the codebase. It's harder to review, and it's where
    #4 and #13 hide (commit fafe0c7 "rebuild workspace UI").
16. **The perf docs' "JS KB" per route includes Next's idle `<Link>` prefetch of other routes.** [RUN] Operability/measurement. On `/`, the
    probe's 609 KB includes a prefetched 43 KB chunk with the store + seed for `/dispatch`. The landing's own hydration-critical JS is
    591 KB raw / 184 KB gzip (the scripts in the built HTML). docs/REBUILD.md's per-route table mixes both, so a real regression can hide
    inside it (incident 001) and a "saving" can be a prefetch change. There's no budget either way (ladder M4).
17. **Marker target size.** [READ] A11y. 28 px Leaflet pins overlap in dense clusters. DECISIONS #44 attributes the a11y score of 96 to the
    target-size audit.
18. **The client timeout (8 s) and server `maxDuration` (30 s) aren't aligned.** [READ] Failure handling. The client falls back to local
    solving while the server keeps burning CPU for up to 22 s more. There's no cancellation to the server.
19. **Unbounded icon cache.** [READ] Memory. `icons.ts` `stopIconCache` is keyed by colour × seq × priority × status × selected. It's
    bounded today, but any key with free-form input (for example a search term) grows it forever.
20. **No telemetry.** [READ] Operability. No RUM, no error reporting (`error.tsx` renders but reports nowhere). Field INP, LCP and CLS are
    unknown. Every perf number in the docs is lab-only on one laptop (ladder S2).
21. **`.env.local` present.** [READ] Secrets hygiene, informational. It holds a Vercel OIDC token. It's gitignored (`.gitignore` `.env*`),
    and `git log --all -- .env.local` shows it was never committed. Fine. Just know it's there.
22. **The smoke harness is the only e2e, and it's a script, not a runner.** [READ] Tests. `scripts/smoke-e2e.mjs` (547 lines) has
    hand-rolled `check()`, no retries or isolation per test, and no traces or screenshots on failure beyond fixed shots. It's fine for a demo,
    and a maintenance cost at team scale (ladder S2 compares it with Playwright).

23. **Landing page fails colour contrast in 13–14 places, while the docs still say a11y 100.** [RUN][AI] A11y + docs drift. axe-core 4.10.2
    on `/` (both viewports): `color-contrast` serious ×13/×14 (`.home-footnote`, `.preview-summary span`, and more; `src/app/home.css`
    palette from the fafe0c7 rebuild). DECISIONS #44 reports landing a11y 100, measured before the rebuild. `/dispatch` desktop adds ×2
    (`.overview-heading p`, the overview card detail).
24. **Keyboard: 116 Tab presses from the top of `/dispatch` to "Export JSON"** after Optimize. [RUN] A11y. 46 marker stops plus
    **unnamed focusable route polylines** (`path.leaflet-interactive`). There's no skip link and no single map tab stop.

## Top 5 by production impact
#1 (broken feedback on the main action) · #2 (core interaction over the INP budget) · #3 (cost and abuse surface on a public deploy) ·
#6 (no gate would catch #1, #2 or the incidents) · #5/#4 (keyboard and SR users can't undo or hear results).

## What a strong review notices about this repo
It's unusually well-engineered, and its comments are unusually persuasive. The bugs hide in the **gaps between comments and runtime**
(#1, #14) and in things you only see by **running** it (#1, #2, #16). A read-only review scores low here by design.
