# RouteIQ — Delivery Route Optimizer Demo

Mobile-first web app that demonstrates delivery route optimization for a package operation in **Madison, Wisconsin**. A **dispatcher** sees every stop on a map, runs the optimizer, gets three driver routes with before/after metrics and can reassign stops by hand; a **driver** follows their route stop-by-stop on a phone, marking deliveries as delivered or failed.

The routing algorithm is a **swappable placeholder** (`nn-2opt-v1`: nearest-neighbour + 2-opt with time-window repair) behind a single API endpoint — the production algorithm drops into `POST /api/optimize` with zero UI changes. See [`docs/ALGORITHM_INTEGRATION.md`](docs/ALGORITHM_INTEGRATION.md).

- Zero paid APIs, **no API keys** — OpenStreetMap tiles via Leaflet.
- Deploys to **Vercel free tier** with `git push`.
- Mock data only: 45 stops, 3 drivers, 1 depot. No accounts, no database.

## Screenshots

| Landing | Dispatcher (mobile) | Driver (mobile) |
| --- | --- | --- |
| _screenshot placeholder_ | _screenshot placeholder_ | _screenshot placeholder_ |

| Dispatcher (desktop) |
| --- |
| _screenshot placeholder_ |

## Screens

| Route | What it is |
| --- | --- |
| `/` | Landing — pick **Dispatcher** or **Driver app** |
| `/dispatch` | Map of all stops + depot; **Optimize routes**; Before/After metrics; per-driver route cards; drag (desktop) or ⋯ menu (mobile) to move stops between drivers; legend; reset / export |
| `/driver` | Driver picker (remembers your last choice) |
| `/driver/[id]` | Phone experience: progress header, **Next Stop** card with Delivered / Failed / Navigate, focused map of the current leg, ordered stop list, "Route complete" summary |
| `POST /api/optimize` | `OptimizeRequest → OptimizeResponse` (zod-validated) — **the algorithm seam** |
| `GET /api/seed` | `{ depot, drivers, stops }` mock data |
| `GET /api/health` | `{ ok, algorithm, version }` |

## Local development

Requirements: Node 20+ and pnpm 9+ (npm works too — replace `pnpm` with `npm run`).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

Other scripts:

```bash
pnpm build        # production build (zero TS / ESLint errors is the gate)
pnpm start        # serve the production build
pnpm test         # vitest: optimizer + time utilities
pnpm lint         # eslint .
pnpm typecheck    # tsc --noEmit
pnpm precompute-paths   # (optional, one-off) refresh src/data/paths.json from the OSRM demo server
```

The demo state (optimized routes, delivery progress, last driver) lives in `localStorage` under `routeiq-v1`; use **Reset demo** in the dispatcher (or clear site data) to start over.

## Deploy to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket.
2. In Vercel: **Add New → Project → Import** the repo. Framework preset **Next.js** is auto-detected; keep the defaults (build `next build`, install `pnpm install`). No environment variables are needed.
3. Deploy. Every `git push` to the production branch redeploys.

Or, from the CLI: `npx vercel` (accept the defaults) and `npx vercel --prod`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FYOUR_ORG%2FYOUR_REPO)

## Swapping in the real algorithm

Everything the UI needs is in the `OptimizeRequest → OptimizeResponse` contract (`src/lib/types.ts`). Two ways to plug in the production optimizer:

1. **TypeScript** — replace the body of `optimize()` in [`src/lib/optimizer/index.ts`](src/lib/optimizer/index.ts) and set `algorithm` to your version string.
2. **Python on Vercel** — add a Python serverless function (e.g. `api/optimize_py.py`) and have [`src/app/api/optimize/route.ts`](src/app/api/optimize/route.ts) proxy to it.

Full contract, JSON example, invariants and the Python skeleton: [`docs/ALGORITHM_INTEGRATION.md`](docs/ALGORITHM_INTEGRATION.md).

Manual reassignment in the dispatcher only re-runs `schedule()` (legs/ETAs/metrics), so it keeps working with any algorithm.

## Project structure

```
src/
  app/
    page.tsx                  landing
    dispatch/page.tsx         dispatcher
    driver/page.tsx           driver picker
    driver/[id]/page.tsx      driver route
    api/{optimize,seed,health}/route.ts
    layout.tsx, globals.css, manifest.ts, icon.svg
  components/
    map/        Leaflet MapView (dynamic, ssr:false), markers, polylines, legend
    ui/         Button, Card, BottomSheet, MetricsCompare, DriverCard, StopRow, badges, Toast…
    dispatch/   dispatcher panel, driver route lists (dnd-kit), move menus
    driver/     next-stop card, fail-reason sheet, stop list, route-complete card
  lib/
    types.ts                  domain model + API contract
    optimizer/                index (optimize/baseline), distance, assign, sequence, repair, schedule, baseline
    time.ts, geo.ts, cn.ts
  store/useAppStore.ts        zustand store, persisted to localStorage (routeiq-v1)
  data/                       depot.json, drivers.json, stops.json, paths.json (precomputed road polylines), index.ts, paths.ts
scripts/
  precompute-paths.ts         one-off OSRM fetch → src/data/paths.json (never called at runtime)
  generate-icons.mjs          dependency-free PNG icon generator
tests/                        vitest (optimizer, time)
docs/ALGORITHM_INTEGRATION.md
public/                       sw.js, icons/
DECISIONS.md                  every assumption made where the spec was silent
```

## How the placeholder optimizer works

1. Haversine distance matrix over depot + stops; drive time = km / 32 km/h × 60 × 1.3 road factor.
2. Assign stops to drivers with angle-seeded k-means, then rebalance for capacity and a ≤ 3 stop-count spread.
3. Sequence each route with nearest-neighbour + 2-opt.
4. Repair time-window violations by pulling late stops earlier.
5. Schedule: legs, ETAs (waiting for a window to open is allowed and counted), totals, metrics.
6. `baseline()` — round-robin in file order, unsequenced — provides the "before" numbers.

On the seed data: **273 km → 123 km**, 6 → 0 time-window violations, in ~20 ms.

## Notes

- Map tiles come from `tile.openstreetmap.org` under the OSM tile usage policy (attribution included, default zoom levels).
- Road-shaped route lines are drawn from `src/data/paths.json`, precomputed once from the public OSRM demo server; the app itself never calls OSRM.
- PWA: `manifest.webmanifest` + a minimal service worker (installable; offline caching intentionally minimal).
