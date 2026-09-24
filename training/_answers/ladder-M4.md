# M4 reference: per-route JS budgets + calibrated vitals

## Explain-before-touching: reference answers
1. A route's client JS = the framework runtime + the client-reference closure of every `'use client'` module **imported** by that route's
   server component tree (page + layouts), + dynamic chunks those modules request at runtime. `layout.tsx` wraps **every** route,
   so a client component there (such as `<Toast/>`, which imports `useAppStore`, which imports `@/data` (the seed) and
   `baseline`/`schedule`) would ship the store, the seed and the scheduler on `/`. Hence the comment and DECISIONS #34.
2. `if (typeof window !== 'undefined') void import('./MapViewInner')` runs when the `MapView` module is **evaluated in the browser**,
   which happens on any route whose client graph includes `MapView.tsx`. Today that's `/dispatch` and `/driver/[id]`. A component on `/`
   importing anything from the `@/components/map` barrel (even `UNASSIGNED_COLOR`) would pull `MapView.tsx` into `/`'s client graph, and
   the landing page would start downloading Leaflet at idle. The barrel's comment says the exports are "server-safe". They are, but safe
   isn't the same as cheap.
3. Byte counts come from the build output and don't depend on CPU contention. Timings (FCP, LCP, blocking time) move with background
   load and thermal state, which is why the probe and `scripts/performance.mjs` take medians. Timings still matter because users feel
   time, not bytes, and the same bytes cost different time depending on what executes (parse and compile vs run).
4. Lab CLS covers load only, with no user input, one viewport, and a clean state. A dispatcher's session has late shifts too (toasts,
   strips, sheets snapping, legend toggles), and field CLS is the largest session window over the whole visit.

## Reference design
- `scripts/budget.mjs`: after `next build`, read the per-route client manifests in `.next/` (for App Router, `app-build-manifest.json`
  or `.next/server/app/<route>/page_client-reference-manifest.js`, depending on version. Inspect them and don't guess), sum the chunk files'
  sizes (raw and `zlib.gzipSync`), and compare with `perf-budget.json`:
  `{ "/": { "gzipKB": 200 }, "/dispatch": {...}, "/driver/[id]": {...} }`, seeded from today's numbers plus 5%. Exit 1 with a per-route diff table.
- The lab-vitals run: the probe `--runs=5`. Store `{ commit, machine: os.cpus()[0].model, benchmarkIndex, cpuThrottle, medians }` in JSON.
  Compare only rows with the same machine and throttle.
- **Critical vs prefetched:** the landing page's `<Link>`s prefetch `/dispatch` and `/driver` chunks at idle in production, so "total JS
  fetched" on `/` already includes a 43 KB store + seed chunk on `main`. Budget the **scripts referenced by the built HTML**
  (`.next/server/app/index.html`: `<script src>` + modulepreload) plus a forbidden-module check (grep the critical chunks for
  `routeiq-v1`, `latLngToContainerPoint`).
- Prove the gate: incident 001's change moves `/`'s critical JS from 591 KB / 184 KB gzip (9 scripts) to 619 KB / 194 KB gzip
  (10 scripts, one containing the store + seed), while total fetched moves only +6 KB. A total-bytes budget passes it. The critical +
  forbidden-module budget fails it.

## Reference numbers on `main` (probe, 4× CPU, 390×844, medians of 3, 2026-09-24)
| Route | decoded JS | FCP | LCP | CLS | Leaflet |
|---|---|---|---|---|---|
| `/` | 609 KB (incl. idle prefetch; 591 KB critical) | 1,380 ms | 1,380 ms | 0 | no |
| `/dispatch` | 802 KB | 392 ms | 392 ms | 0 | yes |
| `/driver/D1` | 904 KB | 492 ms | 492 ms | 0 | yes |
Why FCP on `/` is slower than on `/dispatch` in this run: they're small samples on a busy laptop, and a single measurement order effect
can do it. That's exactly why budgets use bytes and timings use medians and deltas.

## Rubric
Reads the build output, not a server (3) · gzip + decoded per route with headroom (2) · the gate proven to fail (2) · the method doc with calibration (2) · no regression table (1).
