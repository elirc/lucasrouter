# S2 reference: frontend quality gates + RUM

## Explain-before-touching: reference answers
1. **Never at unit level:** 001 (bundle composition is a build property), 003 (native top-layer and inert behaviour of `showModal`
   needs a real browser), 005 (layout shift needs layout). 002 is catchable only by a component test that asserts the region exists
   *before* the text (unit tests on the store can't). 004's re-render storm needs a render-count or interaction-latency assertion.
2. RUM INP is the worst (≈ p98) interaction **per page visit**, then the p75 across visits, over all interaction types, on real
   devices. The probe measures p75 of 12 scripted marker clicks on one machine. They're different statistics over different populations.
   Use the probe for **deltas** in CI and RUM for **truth** in production.
3. Make the repair stage deterministic in tests: inject the clock or budget (`repairTimeWindows(..., { deadline: Infinity })` or an
   iteration cap) through options, so production keeps a time cap and tests use an iteration budget. Until then, run optimizer tests
   in a separate serial Vitest project.

## Gate matrix (reference)
| Incident | component test | e2e smoke + axe | bundle budget | lab vitals (LHCI/probe) | RUM |
|---|---|---|---|---|---|
| 001 landing bundle | – | – | **PR** | PR (JS KB, TBT) | prod (LCP/INP on `/`) |
| 002 toast live region | **PR** (region pre-exists) | PR (the probe's "regionExistedBefore") | – | – | – (SR users don't show in vitals) |
| 003 sheet keyboard | partial (jsdom `<dialog>` is weak) | **PR** (Escape closes, `:modal`) | – | – | – |
| 004 search re-render storm | PR (render-count test) | – | – | **PR** (typing INP proxy) | prod (INP attribution: input element) |
| 005 status strip CLS | – | – | – | **PR** (CLS on `/dispatch` 390 px) | prod (CLS attribution: shifted node) |
Note the column for "screen-reader users": no automated signal. That's why the M3 audit is repeated per release.

## CI (reference shape)
Jobs: `verify` (typecheck, lint, node + dom Vitest; the optimizer project serial) → `build` (cache the pnpm store + `.next/cache`, upload
`.next`) → in parallel: `budget` (reads the build), `e2e` (start the server, run the smoke + axe on 6 states + the probe's a11y checks),
`lab-vitals` (the probe, 5 runs, only compared with `main`'s artifact from the same runner type, failing on a delta > 15% or > 0.05 CLS).
About 10 min. The flake budget: lab-vitals is **non-blocking** for its first 2 weeks, and its false-positive rate is tracked before it
becomes blocking.

## RUM
`web-vitals/attribution` in a tiny client module, loaded after `load`. Sample 20% of sessions. Beacon `{route, metric, value, rating,
attribution: {interactionTarget selector | largestShiftTarget | lcpElement}, deviceClass, build}` to `POST /api/rum` (validate with
Zod, and **no** stop, address or recipient text: selectors only, with ids hashed). Store in a time-series table, and graph p75 per
route × device class × build.

## Alerts + runbook
Page if `/dispatch` INP p75 > 300 ms or CLS p75 > 0.1 for 30 min **and** the change coincides with a deploy (join on `build`). If it
doesn't coincide with a deploy, check the traffic mix (device class share) before rolling back. Rollback: Vercel "Promote" the previous
production deployment (no rebuild), confirm the p75 recovers within 1 hour, then bisect with the probe locally.

## Rubric
Matrix correct for all 5 (3) · CI shape with honest flake handling (2) · RUM privacy + attribution (2) · alert tied to deploys + rollback without rebuild (2) · determinism fix for repair.ts (1).
