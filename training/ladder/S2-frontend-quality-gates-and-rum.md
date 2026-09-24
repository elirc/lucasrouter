# S2 · Frontend quality gates + real-user vitals, then operate them

**Rung:** senior · **Time:** 2–3 days · **Skills:** CI design, e2e strategy, Lighthouse CI calibration, RUM (web-vitals attribution),
alerting on frontend regressions, preview deploys + rollback

## Context
- No CI in the repo (no `.github/`). Gates run by hand: `pnpm verify` (typecheck + `eslint --max-warnings=0` + vitest), `pnpm smoke`
  (puppeteer, 56 checks, needs a built server + local Chrome), `scripts/workspace-e2e.mjs`, `scripts/performance.mjs`.
- Deployed on Vercel (`.vercel/project.json`, README "Deploy" button). Preview deployments exist for every push.
- The optimizer has a **wall-clock** repair budget (`repair.ts`), and REBUILD.md says to run vitest with `--no-file-parallelism` on a busy
  machine. That is flaky-test fuel in CI.
- All five incidents in `training/incidents/` passed `pnpm verify`. Two of them (001, 005) are visible only in performance numbers,
  and two (002, 003) only to keyboard and screen-reader users.

## Ticket
> **RIQ-210** "Every incident this quarter shipped green. Design and build the gates that would have caught them, plus field telemetry
> for what gates can't catch, and write the runbook for when a vitals alert fires."

## Constraints
- CI runtime ≤ 12 min on a standard GitHub runner. Flaky gates are worse than no gates, so each gate needs a flake budget.
- Lab thresholds are calibrated to the runner (record `benchmarkIndex`). Never copy thresholds from this laptop.
- RUM must respect privacy: no addresses, recipient names or photo data in beacons (the seed data is realistic-looking).
- Rollback must not need a rebuild (Vercel "promote previous deployment" or an equivalent).

## Deliverable
1. A gate matrix: incident 001–005 × {unit, component (J2), e2e smoke, axe-in-e2e, bundle budget (M4), Lighthouse CI, RUM}. Mark
   which gate catches each one and when (PR, preview, prod).
2. The CI workflow YAML and the reasoning for its job ordering and caching (pnpm store, `.next/cache`).
3. RUM design: `web-vitals` with attribution (INP target element, LCP element, CLS sources), sampling, the endpoint (a route handler),
   storage, and a p75 dashboard per route and device class.
4. Alerts + runbook: which p75 moves page someone, how you tell a deploy regression from a traffic mix change, and the rollback steps.

## Explain before touching
1. Which of incidents 001–005 can a unit test never catch, even in principle?
2. Why is p75 INP from RUM not comparable with the probe's p75 click duration?
3. How do you keep the optimizer's wall-clock budget from making the CI red at random?

Sealed answer: `training/_answers/ladder-S2.md`
