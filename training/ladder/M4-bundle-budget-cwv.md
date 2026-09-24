# M4 · Per-route JS budgets and calibrated Core Web Vitals

**Rung:** mid · **Time:** 1 day · **Skills:** Next App Router module graph, bundle analysis, CWV lab measurement, calibration, CI gates

## Context
`docs/REBUILD.md` and `docs/performance-{before,after}.json` hold careful local samples: decoded JS per route (`/` 608.6 KB,
`/dispatch` 801.8 KB, `/driver/D1` 904.1 KB), FCP and blocking time. The probe agrees on `main` (its totals include idle `<Link>` prefetch): `/` 609 KB, `/dispatch` 802 KB,
`/driver/D1` 904 KB, CLS 0 on all three. Leaflet is downloaded on `/dispatch` and `/driver/D1` only. Nothing **enforces** any of this.
A one-line import can add a store, a seed and an optimizer to the landing page, and no check fails (see incident 001).

## Ticket
> **RIQ-172** "Performance is a feature we already paid for. Make it stay paid for. Add a per-route JS budget that fails the build
> and a repeatable lab-vitals run whose numbers we can compare across commits on the same machine."

## Constraints
- The budget reads the **build output**, not a live server. Budgets are per route and in bytes (gzip *and* decoded), with 5% headroom
  over today's numbers.
- A lab-vitals script (extend `scripts/performance.mjs` or `training/tools/frontend-probe.mjs`) records LCP, CLS, TBT or a long-task sum,
  and an INP proxy, as the median of ≥ 5 runs. It also records the machine's calibration (Lighthouse's `benchmarkIndex`, or a
  fixed CPU micro-benchmark) next to the numbers.
- No numbers in docs without the command that produced them and the machine they came from.

## Definition of done
- `pnpm budget` checks **hydration-critical** JS per route (the scripts the built HTML references), separately from prefetched or lazy
  chunks. It fails when a route's critical gzip grows > 3%, or when a forbidden module (the store, Leaflet) appears in `/`'s critical
  chunks. Prove it by temporarily importing `useAppStore` into a client component on `src/app/page.tsx`.
- A `docs/perf-method.md` of about half a page: how to run it, how to read medians and deltas, and why this laptop's absolute scores
  aren't comparable with Lighthouse's reference device (DECISIONS #42–44).
- Before/after table for `main` vs your branch (it should show no regression).

## Explain before touching
1. For the App Router, where does a route's client JS come from? Explain the client-reference boundary (`'use client'`) and why
   `src/app/layout.tsx` refuses to render `<Toast />`.
2. `MapView.tsx` starts `import('./MapViewInner')` at module evaluation. On which routes does that run, and what would happen if a
   component on `/` imported anything from `@/components/map`?
3. Why are decoded bytes more stable than timings between runs? Why do timings still matter? And why can "total JS fetched" on `/`
   include code from `/dispatch`? (Look at what the landing page's `<Link>`s do in production.)
4. Lab vs field: what does lab CLS miss that a real dispatcher's session would include?

<details><summary>Hints</summary>

`.next/` contains per-route client manifests after `next build`. Read them rather than parsing the build log. `zlib.gzipSync` gives gzip size.
</details>

Sealed answer: `training/_answers/ladder-M4.md`
