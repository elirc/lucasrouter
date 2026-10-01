# Verification and limits

The final delivery passed **166 unit/store tests and 56 browser smoke checks**, plus TypeScript checking, zero-warning lint and the normal production build. These are observed results from the staged application, not expected counts copied from a plan. [Machine-readable evidence](evidence.json) records commands, exits, durations, image hashes and central raw-report locations.

## Decision: a dropped photo is reported, not hidden

`recordDelivery` returns `{ ok: true, photoDropped: true }` when the photo budget is spent. The delivery is real (the stop is `delivered`, the event is logged) and the driver is told about the missing picture by the caller's toast, so the result is *not* silent: the flag is the signal, and the store test asserts it. The alternative, refusing the delivery because a picture did not fit, would block the driver's actual job for a cosmetic limit. Photo data URLs are trimmed before the strict pattern is applied (fix pass); anything that is not `data:image/...;base64,...` is still dropped, and the delivery-validation test covers both.

## Reproduce the verified workflow

The package declares pnpm 9.12.3. From the project root, use its lockfile, then run:

```powershell
pnpm install --frozen-lockfile
pnpm test --maxWorkers=1 --testTimeout=30000
pnpm typecheck
pnpm lint
pnpm build
pnpm start --hostname 127.0.0.1 --port 3000
```

In a second terminal, `pnpm smoke http://127.0.0.1:3000` runs the existing browser script. It discovers a locally installed Chrome or Edge and uses a fresh automated browser profile. It requires access to public OpenStreetMap tiles. Stop your local server afterward.

The captured checks invoked the installed CLIs directly. Vitest passed 166/166 tests, with zero failures or pending cases, in 35.31 seconds. Type checking exited zero in 75 seconds; lint exited zero in 74.95 seconds. The final default Next build exited zero in 120.6 seconds, including successful compilation in 14.6 seconds. Browser smoke passed all 56 checks in 66.03 seconds and its owned server stopped. These timings describe this machine and run; they are not general performance guarantees. The final verification used the installed staged dependencies; it does not claim a separately captured clean pnpm install.

## What was exercised

The helper/store tests include malformed optional proof fields, bounded text, rejected unknown failure reasons, no mutation on rejection, retained photo-budget behavior and matching stop-proof/activity-event data. Existing route, storage, report and application tests remain enabled.

The original production-browser smoke covers dispatch markers, optimization, reassignment, delivery confirmation, failure notes, skip ordering, activity history, reload persistence, double-tap protection, cross-tab behavior, route completion, resets, API error responses, real 404 responses and network/console checks. The run reported no console errors and only the app origin plus OpenStreetMap tile requests. Desktop dispatch and mobile driver screenshots were visually reviewed and included in the course. This is a smoke suite, not a complete accessibility or cross-browser audit.

## Build correction and earlier failures

An earlier Turbopack run failed while interpreting an extended Windows dependency path in the PostCSS transform. A Webpack attempt compiled, then exposed a new validator TypeScript narrowing error. That error was corrected. Tailwind source discovery is now explicitly scoped to `src` by `source("../")` in `src/app/globals.css`, so learning snapshots and dependency artifacts do not supply application utility classes. The [official Tailwind source documentation](https://tailwindcss.com/docs/detecting-classes-in-source-files#setting-your-base-path) explains this option. The successful final run uses the normal `pnpm build`; the extra `build:webpack` command remains available as a documented bundler option, but is not the final successful build evidence.

## Boundaries for the learner

The exact original [store snapshot](snapshots/useAppStore.ts.txt) supports before-and-after comparison. The app remains a browser-local demo: no accounts, server authorization, tenant isolation or transactional backend were added. Browser persistence retains its existing cross-tab and quota limitations. Optional malformed fields are dropped; invalid domain choices are rejected. Image checks validate data URL structure and size policy, not decoded pixels, MIME truth or media safety. A production CRUD service must enforce those boundaries independently on an authenticated server.
