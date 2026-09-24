# INC-001 answer: the store dragged onto the static landing page

## Root cause
`src/app/page.tsx` is a server component, and until this PR it imported only `Logo` (server-safe) and lucide icons. The new
`LandingProgress` is `'use client'` and imports `@/store/useAppStore`, which pulls into `/`'s client graph:
- `zustand` + `zustand/middleware` (persist),
- `@/data`: **`stops.json` (11 KB), `drivers.json`, `depot.json`**, bundled as JS,
- `@/lib/optimizer/baseline` + `@/lib/optimizer/schedule` (+ distance/types): the scheduler the store uses for manual moves,
- the store module's top-level side effects: `create(persist(...))` **rehydrates from localStorage on load** (a `JSON.parse` of a blob
  that can hold up to 1.5 MB of photo data URLs), and **`installCrossTabSync()`** at module scope (`useAppStore.ts:1157`) adds a
  `storage` listener to the marketing page.
`src/app/layout.tsx`'s comment and DECISIONS #34 exist to prevent exactly this ("it reads the store, which would drag the optimizer +
seed into every page's bundle").

## Measured (2026-09-24, production builds, same laptop)
- **Hydration-critical JS on `/`** (scripts in the server HTML): 591 → **619 KB raw**, 184 → **194 KB gzip**, 9 → 10 scripts. The new
  chunk `0k1j3ost31r5l.js` (22.8 KB) contains the seed (`Pinckney` from `stops.json`) and the store (`routeiq-v1`).
- **Total JS fetched** (probe, including idle work): 609 → 615 KB, only +6 KB. **Why so small:** on `main` the landing page's
  `<Link href="/dispatch">`/`<Link href="/driver">` already **prefetch** those routes' chunks at idle in production, including a 43 KB
  chunk with the store + seed (`1x7odn67ejat7.js`). The bytes were already downloaded, just *after* the page was usable and at low
  priority. The regression moved them **onto the hydration-critical path** and made them **execute** on the landing page.
- So "+6 KB, noise, close it" is the wrong call. The right metric is critical-path JS plus what executes at load, not total bytes
  fetched. (The same prefetch effect inflates the "JS KB" numbers in docs/REBUILD.md for any page with `<Link>`s to heavier routes. They are
  totals including prefetch, not the page's own cost.)

## Diagnostic path
Separate critical from prefetched bytes: list the `<script src>` in the built `.next/server/app/index.html` (or DevTools → Network,
"Initiator" = the document vs prefetch) and compare with `main`. Then find **which modules**: search the new critical chunk for
`routeiq-v1` or a seed address such as "1 S Pinckney St", and walk the import chain from `page.tsx`.

## Fix options
- **A (chosen):** don't import the store on `/`. `LandingProgress` reads `localStorage['routeiq-v1']` directly in an effect, parses only
  `state.stops[].status` in a `try/catch`, and renders "—" until then. That's about 1 KB, and there's no cross-tab listener. It duplicates
  the key name, so export `PERSIST_KEY` from a tiny `src/store/persistKey.ts` that doesn't import the store.
- **B:** `next/dynamic(() => import('./LandingProgress'), { ssr: false })` so the store loads **after** the page is interactive. The bytes
  still ship, just not on the critical path, and the side effects still run.
- **C:** drop the live number from the marketing page. It's a product decision, and it's legitimate. The landing page says "Ready-to-use demo".

## Guard
The per-route JS budget (ladder M4) fails the PR. Plus an ESLint `no-restricted-imports` in `src/app/page.tsx` and `src/app/layout.tsx`
for `@/store/*` and `@/components/map*`, with a message pointing to DECISIONS #34.

## Postmortem essentials
Impact: every landing visit downloads and executes store + seed + scheduler code, and parses possibly megabytes of persisted state on
load. Detection: the weekly lab report, not CI. Lesson: in the App Router, **one `'use client'` import decides a route's bundle**.
Budgets must be automated because the diff looks trivial.
