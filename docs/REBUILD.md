# Workspace rebuild

The landing, dispatch workspace, and driver picker share a green and neutral visual style, system fonts, and clearer primary actions. Dispatch adds a fleet overview with delivery counts and estimated route distance, plus search by address, recipient, or stop ID and status filters. Search results open the stop on the map; existing route assignment, delivery proof, activity logs, exports, and cross-tab progress remain supported. The data remains a local demo.

## Performance changes

- Stylesheets are cached across pages instead of being inlined repeatedly into HTML and React Server Component payloads. System fonts remove a font download and the build's Google Fonts dependency.
- Road geometry loads when a route is drawn. A dispatcher with an unplanned day no longer downloads the full road-path dataset.
- Map markers create their detailed popups only when selected or clicked, including in driver mode.
- Delivery, failure, stop detail, and activity dialogs are separate chunks mounted on demand.
- Desktop drag-and-drop loads when a plan exists. Only the first driver route starts expanded; other routes remain available from their headers.
- The store compares persisted field references before serializing. Selection and toast changes avoid JSON serialization even when saved delivery photos are large. Real edits still persist immediately, and the existing cross-tab synchronization remains in place.
- A successful optimize API response no longer triggers a download of the full local optimizer. The inexpensive baseline scheduler is available directly; the local solver is reserved for API failures. API requests time out after eight seconds so an unavailable server does not leave the button indefinitely busy.

## Verification

Run `pnpm verify` and `pnpm build`, then start the production server with `pnpm start --port 3111`.

The optimizer has a real-time repair budget. On a busy machine, run its checks after the build has finished with `pnpm exec vitest run --no-file-parallelism`; running a build and multiple test workers together can exhaust that budget and change the partial repair result. No test thresholds are relaxed by this command.

```powershell
pnpm smoke http://localhost:3111
node scripts/workspace-e2e.mjs http://localhost:3111
node scripts/performance.mjs http://localhost:3111 current
```

The workspace browser check covers search, status filters, empty states, map popup creation, optimization, lazy delivery dialogs, Escape dismissal, mobile overflow, and runtime errors. The existing smoke suite covers complete delivery, failure, reassignment, progress, synchronization, reset, exports, and API behavior. A store regression test checks that repeated selections and feedback perform no serialization while a delivery update still saves.

The performance script records three isolated browser contexts per page at 390 × 844, with no CPU/network throttling, and saves JSON and screenshots under `e2e-screens/`. JavaScript counts are decoded response bytes, not compressed wire transfer. Timing depends on local machine load and should be read alongside the more stable byte counts.

## Measured results

Production builds on the same Windows machine, September 4, 2026. Values below are medians of three fresh browser contexts per page. The build and unit tests were finished before the final browser measurements; background machine activity, including lint, was not controlled. These are local samples, not Lighthouse scores or representative measurements from users' devices.

| Page | JavaScript KB, before → after | HTML KB, before → after | First paint ms, before → after | Blocking ms, before → after |
| --- | ---: | ---: | ---: | ---: |
| `/` | 600.9 → 608.6 | 166.1 → 33.7 | 620 → 472 | 144 → 154 |
| `/driver` | 679.1 → 675.5 | 152.0 → 13.1 | 672 → 284 | 169 → 187 |
| `/dispatch` | 891.8 → 801.8 | 155.6 → 17.6 | 408 → 260 | 410 → 413 |
| `/driver/D1` | 922.5 → 904.1 | 154.4 → 13.9 | 364 → 300 | 634 → 199 |

KB means 1,000 decoded bytes. HTML savings partly move CSS into separately cached stylesheets, so they are not equivalent to total transfer savings. First paint is First Contentful Paint; blocking is the sum of the portion above 50 ms of each long task observed during the script's loading interval. Driver-route blocking improved substantially in this sample, while the other pages' blocking times stayed similar or increased slightly. The richer landing adds 7.7 KB of JavaScript.

Raw samples: [before](performance-before.json) and [after](performance-after.json). In the successful smoke run, all 45 dispatcher markers appeared in 1,114 ms on a warmed server with empty storage. The final checks passed: production build with TypeScript, lint, 162 unit tests (serial execution), all 56 smoke checks, and the additional workspace browser checks.
