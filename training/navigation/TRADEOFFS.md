# Senior trade-offs: four "Why?" drills

For each drill, write your own answer to every bullet **before** reading the notes under it. The notes are the reference. They are
reconstructed from code and DECISIONS.md, not from the authors.

---
## 1. Browser-only state with `localStorage` + cross-tab `storage` sync instead of a backend
- **Problem:** a dispatcher and a driver must see the same plan and progress.
- **Naive approach:** keep state in React only, which dies on reload.
- **Where it fails:** reloads, and two tabs overwriting each other (the store header describes a ping-pong it had to fix).
- **Options:** A) localStorage + `storage` events (chosen) · B) a server DB + polling or SSE · C) a CRDT/sync engine (for example Yjs over WS).
- **Trade-offs:** A has zero infrastructure, works offline and deploys free, but it's single-device only, whole-slice last-writer-wins
  (`useAppStore.ts` header "Known limit"), and capped at about 5 MB with photos inside. B is real multi-device with auth, but it's a
  backend you have to run. C gives merge semantics at a large complexity cost.
- **Choice:** A. It's a demo that must run on Vercel free with no DB (DECISIONS "Deployment").
- **Failure modes:** edits lost within milliseconds, quota full (the photo budget guards it), a corrupt blob (tolerant `getItem` discards it).
- **Tested by:** `tests/store.test.ts` "persistence: write dedupe and cross-tab sync". **Monitored by:** nothing (no telemetry).
- **Revisit when:** there's a second device per role. That will be the first real customer.

## 2. Map behind `next/dynamic({ ssr:false })` + an image placeholder as the LCP element
- **Problem:** Leaflet touches `window` at import time and costs about 150 KB of JS on the critical path of `/dispatch`.
- **Naive approach:** a static import breaks SSR. A spinner makes LCP land on the first map tile.
- **Options:** A) dynamic import + raster placeholder with `fetchpriority=high` (chosen, `MapView.tsx`) · B) SSR a static map image
  (tile mosaic) · C) a vector map (MapLibre) with streaming.
- **Trade-offs:** A gives an early LCP but a "fake" one (the placeholder isn't the map), and the module-eval preload side effect makes
  **any** importer of `MapView` start downloading Leaflet. B needs a server-side tile compositor. C has a larger bundle and a WebGL
  requirement.
- **Failure modes:** a regression where some other route imports the map barrel. LCP numbers that flatter the real "map ready" time.
- **Tested/monitored by:** smoke "markers within 2 s", `scripts/performance.mjs`, DECISIONS #43. **Revisit when:** users judge
  "ready" by tiles. Measure a custom "first tile" mark and don't rely on LCP alone.

## 3. Deferred markers (`useDeferredValue`) + memoized `StopMarker` + a cached `divIcon`
- **Problem:** 45 markers + polylines in one commit gave a ~400 ms long task on a throttled phone (the `MapViewInner.tsx` comment).
- **Options:** A) time-slice with `useDeferredValue`, memo per marker, and an icon cache keyed by visual state (chosen) · B) canvas
  markers (`preferCanvas`) · C) clustering.
- **Trade-offs:** A keeps DOM markers, which stay keyboard-focusable and get `alt` text, but it scales linearly and depends on every prop
  staying referentially stable. One inline object or array upstream silently defeats `memo`. B and C are fast but cost accessibility.
- **Failure modes:** a prop-identity regression becomes a re-render storm (incident 004). Unbounded icon cache keys.
- **Revisit when:** N ≫ 45 (ladder S1).

## 4. A placeholder optimizer behind a stable HTTP contract, with a client-side fallback
- **Problem:** the real routing algorithm doesn't exist yet. The UI must not care.
- **Options:** A) `POST /api/optimize` with a Zod schema + shape-check on the client + fallback to a local solver (chosen,
  `docs/ALGORITHM_INTEGRATION.md`) · B) client-only solver · C) async job API (submit → poll).
- **Trade-offs:** A lets the algorithm team swap implementations with no UI change, but the fallback runs a CPU-heavy solver **on the
  main thread** (INP), and the 8 s client timeout must stay below the function's `maxDuration = 30`. C is right for real VRP solvers
  that take minutes, but it's more moving parts.
- **Failure modes:** a slow real solver pushes clients into the fallback. A wall-clock repair budget makes the output load-dependent.
- **Tested by:** `tests/api-optimize.test.ts`, the store's `optimize()` tests (bad shape, bad ETA, 400 → fallback). **Revisit when:**
  solve time passes about 5 s, or when you have more than 1,000 stops.
