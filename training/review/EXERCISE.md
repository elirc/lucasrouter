# Blind code review: RouteIQ @ `main` (fafe0c7)

**Time box:** 60 minutes. **Output:** `training/_work/review-mine.md`. Don't open `training/_answers/` until you've finished `COMPARE.md`.

## Setup (5 min, not counted)
```powershell
pnpm install --frozen-lockfile
pnpm build; pnpm start --port 3111     # production build; leave running
pnpm exec vitest run --no-file-parallelism
```
Open `/dispatch` and `/driver/D1` in Chrome with DevTools, and turn on Performance → "Web Vitals" in the Performance panel.

## What to review
The whole app, but weight your time toward the frontend, which is where this project is strongest *and* where its bugs hide:
- `src/components/dispatch/*` (DispatchScreen, DriverRoutes, StopSearch, DispatchOverview, PanelHeader)
- `src/components/map/*` (MapView, MapViewInner, StopMarker, icons)
- `src/components/ui/Toast.tsx`, `src/components/ui/BottomSheet.tsx`, `src/components/driver/DriverDialog.tsx`
- `src/store/useAppStore.ts` (persistence, cross-tab sync, actions)
- `src/app/api/optimize/route.ts`, `src/lib/optimizer/repair.ts`
- `README.md`, `DECISIONS.md`, `docs/REBUILD.md`: check their claims against the code

## Rules
- Every finding gets **severity** (critical/high/medium/low), **category** (correctness, a11y, performance, security, data integrity,
  failure handling, operability, tests, maintainability), **evidence** (`file:line`, or a reproduction with numbers), and
  **why it matters in production**. A finding with no evidence doesn't count.
- At least 3 findings must come from **running** the app (DevTools Performance, keyboard only, or the probe), not from reading.
- Mark any finding you think is an **old-AI-generated smell** (docs that claim what code doesn't do, a reskinned rewrite, a test that can't fail).
- Rank the top 5 by production severity at the end.

## Useful probes
- `node training/tools/frontend-probe.mjs http://localhost:3111 mine` (copy it to the repo root if Node can't resolve puppeteer-core)
- Keyboard only: Tab through `/dispatch` from the address bar to the Export button. Count the stops.
- Watch the toast after you click **Optimize routes** on desktop.

When you're done, fill in `COMPARE.md`.
