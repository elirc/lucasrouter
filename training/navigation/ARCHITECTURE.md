# RouteIQ: architecture reconstruction (with evidence)

Read this with the code open. Every claim names the file that proves it. `main` = fafe0c7.

## 1. System context
- **One Next.js 16 app** (App Router, Turbopack, React 19.2) with no database. See `package.json` and DECISIONS #1.
- **Browser state is the source of truth.** A zustand store persisted to `localStorage['routeiq-v1']` (`src/store/useAppStore.ts:202`).
  Dispatcher and driver "sync" only between **tabs of the same browser**, through the `storage` event (`installCrossTabSync`,
  `useAppStore.ts:1128`, installed at module load, `:1157`). There is no multi-device story.
- **Server side:** three route handlers. `POST /api/optimize` (Zod-validated, runs `nn-2opt-v1`), `GET /api/seed`, and `GET /api/health`
  (`src/app/api/*/route.ts`). The seed is bundled into the client store chunk, so the app never calls `/api/seed`
  (`useAppStore.ts` `loadSeed()` comment).
- **Third parties at runtime:** OSM tiles only (`MapViewInner.tsx` `OSM_URL`, preconnect in `MapView.tsx`). Road polylines were
  precomputed from OSRM **offline** into `src/data/paths.json` (`scripts/precompute-paths.ts`).
- **Deploy:** Vercel (`.vercel/project.json`, the README deploy button). A minimal service worker (`public/sw.js`) does no caching.

## 2. Components
| Area | Files | Role |
|---|---|---|
| Pages | `src/app/page.tsx` (static landing), `dispatch/page.tsx`, `driver/page.tsx`, `driver/[id]/page.tsx` (SSG D1–D3) | Thin server wrappers around client screens |
| Store | `src/store/useAppStore.ts` (~1,240 lines) | All mutations, persistence (tolerant + deduping storage), hydration flag, cross-tab sync, optimize client |
| Optimizer | `src/lib/optimizer/{assign,sequence,repair,schedule,baseline,distance}.ts` | Assign → sequence (NN + 2-opt) → time-window repair (wall-clock budget) → schedule ETAs |
| Map | `src/components/map/MapView.tsx` (dynamic, `ssr:false`) → `MapViewInner.tsx` → `StopMarker`, `RoutePolyline`, `FitBounds` | Leaflet via react-leaflet. Markers deferred with `useDeferredValue` |
| Dispatcher UI | `src/components/dispatch/*` | `DispatchScreen` does layout. Panel = `PanelHeader` + `DispatchPanel` (`StopSearch` → `DriverRoutes` / `UnassignedSection`) |
| Driver UI | `src/components/driver/*` | `DriverRouteScreen` (next-stop card, focus leg), sheets on `DriverDialog` (native `<dialog>`) |
| Shared UI | `src/components/ui/*` | `Toast` (per screen, never in the layout), `BottomSheet`, `Button`, `StopRow` |

## 3. Three request flows, file by file
**A. Optimize (dispatcher).** `PanelHeader.tsx` button → `useAppStore.optimize()` (`useAppStore.ts:733`) → `fetch('/api/optimize')` with an
8 s `AbortSignal.timeout` → `route.ts` `POST`: `request.json()` → `optimizeRequestSchema.safeParse` → `optimize(req)` →
back in the store, `isOptimizeResponse` shape-check → `baseline(req)` → one `set({...})` → `showToast('Routes ready · …')`.
If the API is unreachable or returns the wrong shape, the store lazily `import('@/lib/optimizer')` and solves on the **main thread**.
Re-render fan-out: `DispatchScreen` (routes, lastOptimizedAt → new `fitKey`) → `MemoMapView` → `RoutePolylines` fetch `paths.json` on
first draw → `DriverRoutes` (desktop: loads dnd-kit through a tiny external store, `DriverRoutes.tsx` `useDndModule`).

**B. Select a stop on the map.** `StopMarker` `click` → `setPopupOpen(true)` + `onSelectStop(id)` → `setSelectedStop` → subscribers of
`selectedStopId`: `DispatchScreen` (so the whole screen re-renders), `DriverRoutes` (derived-state block expands the card) →
`StopListItem` `scrollIntoView` → `StopMarker` effect opens the popup and pans it clear of the sheet (`insetRef`). Cost: ladder M1.

**C. Driver delivers.** `NextStopCard` "Delivered" (press guard `settled()`) → `DeliverySheet` in `DriverDialog` (`showModal`, focus
into the panel) → `recordDelivery(stopId, proof)` (`useAppStore.ts`, photo budget `PHOTO_BUDGET_BYTES = 1.5 MB`) → `set` →
`persistStorage.setItem` (reference compare, then `JSON.stringify` of the whole slice) → `localStorage` → the `storage` event in the
dispatcher tab → `useAppStore.setState(persisted slice)` → the map marker gets its delivered badge.

## 4. Data model (`src/lib/types.ts`)
`Depot` 1 · `Driver` n (color, shiftStart, capacityPackages) · `Stop` n (status, priority, timeWindow?, proof?) ·
`Route` per driver (`stopIds[]`, `legs[]`, `etaByStopId`) · `RouteMetrics` (baseline vs optimized) · `DeliveryEvent` (append-only log,
capped at `MAX_LOG_EVENTS = 2000`). Persisted shape versioned by `PERSIST_VERSION = 1` with `migratePersisted`.

## 5. Dependency boundaries
- Leaflet only enters through `MapView`'s `next/dynamic(..., { ssr:false })`. The barrel `src/components/map/index.ts` is written to be
  server-safe. The layout deliberately doesn't render `Toast` (`layout.tsx` comment, DECISIONS #34) so the landing never loads the store.
- Mobile/desktop split is decided at runtime by `useIsDesktop` (`matchMedia('(min-width: 768px)')`). **Different component trees mount**
  (`BottomSheet` vs `<aside>`, dnd-kit only on desktop).

## 6. Test strategy
Vitest in **node** only (`vitest.config.mts`): optimizer invariants, store (with a fake `window`), route handlers called as functions,
time utils. UI coverage is the puppeteer smoke (`scripts/smoke-e2e.mjs`, 56 checks) plus `scripts/workspace-e2e.mjs`. Both are manual
and need a production server and local Chrome. **No component tests and no CI.**

## 7. Build / deploy / measure
`pnpm verify` = `tsc --noEmit` + `eslint . --max-warnings=0` + vitest. `pnpm build` (about 4 min on this laptop). `scripts/performance.mjs`
writes local samples to `e2e-screens/`. Published numbers live in `docs/REBUILD.md` and DECISIONS #42–44 and #52–57, with a calibration caveat.
