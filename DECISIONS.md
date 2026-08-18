# DECISIONS.md — assumptions made where the spec was silent

Every entry below is a call made while building RouteIQ that the specification did not pin down (or pinned down loosely). Each one is reversible; none changes the `OptimizeRequest → OptimizeResponse` contract.

## Stack & tooling

1. **Next.js 16.3.1 (App Router, Turbopack), React 19.2, Tailwind CSS 4.** The spec says "Next.js 14+"; `create-next-app@latest` produced 16.3.1. Tailwind 4 has no `tailwind.config.js` — theme tokens live in `src/app/globals.css` (`@theme`). Route `params` are Promises in Next 16 (`await params` / `use(params)`).
2. **pnpm 9** as the package manager (`packageManager` field in `package.json`). `npm install` also works.
3. **Vitest 4** for the optimizer/utility tests (`tests/**/*.test.ts`, node environment, `@/*` alias). No component/e2e test framework was added — the spec asked to keep testing light; UI was verified in a real browser at 375×812 and desktop widths.
4. **No shadcn/ui.** All shared components are hand-written Tailwind (`src/components/ui`). Fewer moving parts, no CLI-generated files.
5. **ESLint** = `eslint-config-next` (core-web-vitals + typescript) with zero warnings allowed in the build gate. Prettier config (`.prettierrc`) is present for consistency but not enforced by a script.
6. **Line endings** are normalized to LF via `.gitattributes` (the build machine is Windows).

## Seed data (`src/data/`)

7. **Depot** exactly as suggested: Madison East Station, 4001 Anderson St, 43.1214 / −89.3305.
8. **45 stops** with invented house numbers on real Madison streets, spread over Capitol Square, State St, UW campus, Willy St, Atwood, East Towne, Hilldale/Shorewood, West Towne, Fitchburg edge, Monona, Middleton edge, Tenney Park, Vilas/Monroe St, South Park St and Northport. Priorities: 30 standard / 10 priority / 5 overnight; **13 stops** have time windows (spec: "about 12"); packages total 118 (fits comfortably in 3 × 60 capacity); `serviceMinutes` 2–8. Coordinates are approximate street-level positions (good enough for a demo, not geocoded).
9. Recipient names are fictional; a few stops carry `notes` (dock instructions, fragile, refrigerated) to make the driver UI feel real.

## Optimizer (`nn-2opt-v1`)

10. **Distance model**: haversine km × **1.3 road factor**, drive time = km / `avgSpeedKmh` (default 32) × 60. The road factor is applied to *time* via the km (i.e. `driveMinutes = km × 1.3 / 32 × 60`); reported `distanceKm` values are the raw haversine km rounded to 2 decimals. Baseline and optimized routes use the identical model, so the before/after comparison is apples-to-apples.
11. **Assignment**: k-means with k = drivers, centroids seeded by splitting stops into k angular sectors around the depot; ≤ 20 iterations; deterministic (no randomness). Rebalance pass enforces `capacityPackages` (hard) and, when `balanceLoad`, a max stop-count spread of 3 by moving boundary stops. Stops that fit nowhere by capacity become `unassignedStopIds`.
12. **Sequencing**: nearest-neighbour from the depot then 2-opt on the closed tour (depot → … → depot) until no improvement (capped at 500 passes for safety).
13. **Time windows**: arriving *before* a window opens means the driver **waits** — the ETA is clamped to the window start and the wait counts toward route time; this is **not** a violation. A violation is an arrival (rounded to the displayed minute) **strictly after** the window end. The repair pass only ever moves a late stop *earlier* in its own route (never across drivers) and keeps a move only if it reduces the violation count (ties broken by distance).
14. **`etaByStopId`** is the arrival time after any wait; departure = arrival + `serviceMinutes`. `Route.totalMinutes` = arrival back at depot − `shiftStart` (drive + service + wait). Per-leg `driveMinutes` are integer-rounded for display; totals use unrounded values, so summing legs can differ from `totalMinutes` by a minute.
15. **Metrics**: `totalDistanceKm` = Σ route km, `totalMinutes` = Σ route minutes, `longestRouteMinutes` = max, `timeWindowViolations` = count of late stops. `stopsPerDriver` keyed by driver id.
16. **Baseline** (`baseline-round-robin-v1`) = stops in file order dealt round-robin to drivers, no sequencing, no capacity check (it represents "what dispatch does today"). Zero drivers → everything unassigned.
17. **`computeMs`** is reported with one decimal (e.g. `22.3`), measured with `performance.now()`.
18. `optimize()` and `baseline()` are pure, dependency-free TypeScript so they run identically in the Route Handler and in the browser (used as an offline fallback — see 22).

## API

19. `POST /api/optimize` validates with **zod 4**; unknown keys are stripped rather than rejected; invalid input → `400 { error, issues: [{ path, message }] }`; an optimizer exception → `500`. All three routes set `runtime = 'nodejs'` and `dynamic = 'force-dynamic'`; `/api/seed` sends `Cache-Control: no-store`.
20. `/api/health` reports `version: '1.0.0'` (hard-coded; bump alongside `package.json`).

## State & persistence

21. Zustand store persisted under **`routeiq-v1`**. Persisted: depot, drivers, stops (incl. statuses), routes, both metrics, algorithm, computeMs, lastOptimizedAt, activeDriverId, hiddenDriverIds. Not persisted: selectedStopId, toast, isOptimizing, optimizeError, hasHydrated. Pages render skeletons until `useHasHydrated()` is true (avoids hydration mismatches).
22. **`optimize()` calls `POST /api/optimize`** (the swap seam) and only if that request fails or returns a malformed body does it fall back to the local `optimize()` with a `console.warn`. Baseline metrics are always computed locally (pure function). This keeps the demo working offline / behind a flaky network without hiding the API seam.
23. **Manual reassignment** (`moveStop`) rewrites the `driverId → stopIds[]` map and re-runs **only `schedule()`** — ETAs and metrics update synchronously; baseline metrics are left untouched (they are the "before").
24. **Stop status changes do not re-plan.** Marking a stop delivered/failed only updates the stop; ETAs stay as planned. `deliveredAt` is set for both `delivered` and `failed` (attempt time) and cleared when reverted to `pending`.
25. **Failure reasons** are stored in the existing `notes` field as `"<reason> · <original notes>"` (no schema change). Reverting to pending leaves the note in place (demo simplicity).
26. `resetDemo()` re-fetches the seed (fresh statuses), clears routes/metrics/legend toggles, and keeps `activeDriverId`.

## Map

27. **Precomputed road paths (optional §4.4) were implemented.** `scripts/precompute-paths.ts` fetched, once, the OSRM demo-server driving polylines for all 1,035 unordered pairs of seed points and stored them Google-encoded in `src/data/paths.json` (~96 KB, loaded only by the lazily imported map chunk). The map uses them purely for **drawing**; distances/ETAs remain the haversine model so the optimizer contract stays independent of any external routing data (leg km on screen are estimates, not road km). Paths are assumed symmetric (reversed for the opposite direction). The app never calls OSRM at runtime; if a pair is missing (e.g. a non-seed stop) the leg is drawn as a straight line.
28. Markers are Leaflet `divIcon`s (no image assets): 28 px coloured pins with the sequence number when routed, amber/violet dots for priority/overnight, a green check for delivered, red X for failed, ring for selected; depot is a 32 px slate square. Route lines get a white halo for contrast, and small direction arrows on legs longer than ~700 m (≤ 60 arrows total). Zoom control sits top-right so the mobile bottom sheet never covers it. Attribution is the OSM-required string.
29. In the driver view the "current position" is the previous stop (or the depot before the first stop) — no geolocation is used (spec).

## Dispatcher UX

30. Mobile: full-screen map + bottom sheet with `peek` / `half` / `full` snaps (drag handle, velocity-biased snapping, `100dvh`, safe-area padding). Desktop (≥ 768 px): map left, 420–460 px panel right.
31. Cross-driver moves: **desktop** drag-and-drop with `@dnd-kit` (pointer + keyboard sensors); **mobile** uses the per-row "⋯ → Move to Driver X" menu (spec: drag on a touch bottom sheet is fiddly). The map popup also offers a "Reassign to…" select on both.
32. "Reset demo" uses an inline confirm (no `window.confirm`, which would block browser automation and looks off-brand). "Export routes (JSON)" downloads `{ exportedAt, depot, drivers, routes, metrics }`.
33. Legend (per-driver show/hide) is a collapsible chip on mobile so it doesn't crowd a 375 px map.

## Driver UX

34. Failure reasons: `No one home` / `Wrong address` / `Damaged` / `Other`, chosen in a small modal sheet. "Navigate" opens the Google Maps directions deep link in a new tab (allowed by spec — no API key). "Return to depot" appears after the last stop and deep-links to the depot.
35. `/driver` remembers the last chosen driver (`activeDriverId`) and highlights it.

## PWA

36. Manifest is generated by `src/app/manifest.ts` (served at `/manifest.webmanifest`); icons 192/512 (+ 180 apple-touch) are PNGs produced by `scripts/generate-icons.mjs`, a dependency-free Node script (also used for `purpose: maskable`). `public/sw.js` is a minimal hand-written service worker: network-first for same-origin navigations with an inline offline fallback page; it never caches tiles or `/api/*`. It is registered only in production builds (`RegisterSW`).
37. Dark mode is not implemented (spec: not required); the scaffold's `prefers-color-scheme` block was removed so the map/cards never invert.

## Deployment

38. No `vercel.json` is needed — default Next.js settings on Vercel work as-is (`git push` → deploy). No environment variables, keys, or databases.
