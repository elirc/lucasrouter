# On-ramp answers (sealed)

Line references are to committed `main` (`git show HEAD:<file>`). "In substance" means the mechanism matches. The wording doesn't have to.

## 1. Time formatting
| Call | Result | Why |
|---|---|---|
| `formatHHMM(1513)` | `"25:13"` | Doesn't wrap past midnight on purpose. Schedules that run into the next day keep increasing |
| `formatHHMM(-20)` | `"00:00"` | `Math.max(0, …)` clamps negatives |
| `formatDuration(75)` | `"1h 15m"` | |
| `formatDuration(60)` | `"1h"` | The `m === 0` branch drops the minutes |
| `to12h('00:30')` | `"12:30 AM"` | `h24 % 12 === 0` → 12 |
| `to12h('12:00')` | `"12:00 PM"` | `h24 >= 12` → PM |
| `to12h('25:13')` | `"1:13 AM +1"` | `days = floor(1513 / 1440) = 1` adds the suffix |
| `to12h('9:5')` | `"9:5"` | The regex needs two minute digits, `parseHHMM` throws, `to12h` returns the input unchanged |
| `parseHHMM('9:5')` | throws `Invalid HH:MM time: "9:5"` | |

Why `to12h` swallows the error: ETAs come from the optimizer, which is swappable (`docs/ALGORITHM_INTEGRATION.md`). A malformed ETA from a
new optimizer should degrade to raw text, not throw during render and blank the screen (its doc comment says this).

## 2. DispatchOverview
- `value` = **31**. `detail` = **"14 still to deliver"** (`stops.length - done` = 45 − 31, where `done` counts only `status === 'delivered'`).
- It's false for the ops lead: 2 of those 14 are failed attempts nobody is driving to. That's exactly ticket J1 (RIQ-112).
- The line: the `done` `useMemo` and the "Delivered" card's `detail` template in `DispatchOverview.tsx`.
- Hidden on phones by `@media (max-width:767px) { .dispatch-overview { display:none } }` in `src/components/dispatch/dispatch.css`.
  Note: it's hidden by CSS, so it still **renders** on phones (it costs render time but isn't visible).

## 3. Optimize trace
1. `src/components/dispatch/PanelHeader.tsx` → `useAppStore.optimize()`.
2. `POST /api/optimize` with `AbortSignal.timeout(8000)`.
3. `request.json()`, then `optimizeRequestSchema.safeParse(body)` (Zod) in `src/app/api/optimize/route.ts`.
4. `isOptimizeResponse(json)` in the store.
5. `get().showToast('Routes ready · N drivers · K km', 'success')`.

Failure cases:
- (a) 500 → the store logs `console.warn('... responded 500; optimizing locally')`, lazily `import('@/lib/optimizer')` and solves **on the
  main thread**. The user still gets a plan and the normal "Routes ready" toast. There's no visible error. (Graceful, but it hides a
  broken API from the user and costs main-thread time at large N.)
- (b) The second call returns immediately: `if (state.isOptimizing) return;` (in-flight guard).
- (c) At 8 s the fetch aborts, the `catch` logs "unreachable", and the local solver runs. Same as (a).

## 4. Persisted or ephemeral
| Field | Persisted? | Why it's right |
|---|---|---|
| `selectedStopId` | No | UI focus of *this* tab. Broadcasting it would make every tab jump to the other tab's selection |
| `toast` | No | A message for this moment and this screen. Persisted, it would re-show on reload and in other tabs |
| `isOptimizing` | No | A transient in-flight flag |
| `hiddenDriverIds` | Yes | A dispatcher's view preference that should survive a reload |
| `deliveryLog` | Yes | Business data (append-only, capped at `MAX_LOG_EVENTS = 2000`) |
| `lastOptimizedAt` | Yes | Part of the plan. It also feeds `fitKey` |

Bonus: if `isOptimizing` were persisted, a reload (or a crash) during an optimize would store `true`. On the next load `optimize()`
would hit `if (state.isOptimizing) return;` forever, so the Optimize button silently does nothing, in **every** tab (cross-tab sync).
Bonus 2: `PERSISTED_GUARDS` is typed `{ [K in PersistedKey]: (v: unknown) => v is PersistedSlice[K] }`, so a key without a guard is a
TypeScript error (`pnpm typecheck` fails).

## 5. Selectors
- (a) Fine. It returns the same array reference until `stops` changes.
- (b) **Breaks.** `selectStopsById` builds a new object on every call. `useSyncExternalStore` sees a "changed" snapshot every time, so you get
  React's "getSnapshot should be cached" warning and a render loop ("Maximum update depth exceeded"). Fix: select `stops` and
  `useMemo(() => selectStopsById(...))`, or wrap in `useShallow`.
- (c) **Breaks**, same reason: `filter` returns a new array each call. Same fixes.
- (d) Fine, and precise: a boolean primitive. The component re-renders only when *its* selection flips. (This is the shape of the M1 fix.)
- (e) Legal and stable, but **expensive**: `DispatchScreen` re-renders on every selection change, and so does everything it renders that isn't
  memoized: `DispatchTopBar`, `DispatchOverview`, `PanelHeader`, `DispatchPanel` → `StopSearch` → `DriverRoutes` → every rendered row,
  `LegendOverlay`, `Toast`. `MemoMapView` also re-renders, because `selectedStopId` is one of its props. (Reference: `training/_answers/ladder-M1.md` Q1.)

## 6. Server vs client
1. Server component: there's no `'use client'` directive at the top of `src/app/page.tsx`, and it has no hooks.
2. The store module and everything it imports: zustand + persist middleware, the bundled seed (`@/data`: stops/drivers/depot JSON),
   `@/lib/optimizer/baseline` and `schedule`, plus the store's **top-level side effects** (rehydrating from `localStorage`,
   `installCrossTabSync()`). The static landing page would download and run all of it.
3. Break: Leaflet touches `window` when it's imported, so server rendering would crash (that's what `ssr: false` avoids). Slower: Leaflet
   (and `MapViewInner`) would be in the route's initial JS instead of a lazily loaded chunk, so `/dispatch` and `/driver/[id]` hydrate later.
   (Also acceptable: any page that imports the map barrel would pay for Leaflet.)

## 7. API contract
| Body | Status | `error` |
|---|---|---|
| (a) stop `id: "DEPOT"` | 400 | `Invalid OptimizeRequest`, issue "Stop id 'DEPOT' is reserved" |
| (b) 1,001 stops | 400 | `Invalid OptimizeRequest`, issue "At most 1000 stops per request" |
| (c) window 10:00–09:00 | 400 | `Invalid OptimizeRequest`, issue at `…timeWindow.end` "Time window end must not be before its start" |
| (d) extra `"color"` on a stop | **200** | Zod objects strip unknown keys by default. The comment above the schema says so |
| (e) `shiftStart: "24:00"` | 400 | the `hhmm` refine: "Hour must be 0-23 and minute 0-59" |
| (f) text `hello` | 400 | `Request body must be valid JSON` |
| (g) valid JSON, `Content-Type: text/plain` | **200** | `request.json()` ignores the header. Nothing checks it (and nothing limits the size before parsing) |
(g) is the J3 finding: limits and media-type checks happen after the whole body is buffered, or not at all.

## 8. Characterization test
1. `formatWindow({ start: '24:30', end: '25:00' })`: `to12h` gives `"12:30 AM +1"` and `"1:00 AM +1"`. `split(' ')` takes only the first two parts,
   so both suffixes are `"AM"`, they're equal, and the result is **`"12:30–1:00 AM"`**. The `+1` is dropped.
2. Reference test:
   ```ts
   import { describe, expect, it } from 'vitest';
   import { formatWindow } from '@/lib/time';

   describe('formatWindow: current behaviour (characterization)', () => {
     it('drops the next-day suffix when both ends are past midnight (pinned as-is, see note)', () => {
       expect(formatWindow({ start: '24:30', end: '25:00' })).toBe('12:30–1:00 AM');
     });
     it('keeps both full strings when only the end is past midnight', () => {
       expect(formatWindow({ start: '23:00', end: '25:00' })).toBe('11:00 PM–1:00 AM +1');
     });
   });
   ```
3. Breaking it (for example, always returning `` `${s}–${e}` ``) makes the first test fail. If it doesn't, your test isn't testing anything.
4. **Not reachable through validated input today.** Time windows come from the seed and from requests validated by the `hhmm` refine
   (hours 0–23) in `route.ts`, so a window can't start at 24:xx. ETAs can pass midnight, but they go through `to12h`, not `formatWindow`.
   Verdict: a latent edge case. Record it and don't "fix" it without a ticket. The characterization test is what makes a later fix safe.
Grading: the test name says "current behaviour" (1), the value is what the code does, not what you wish (2), you proved it can fail (1),
and you checked reachability before calling it a bug (1).

## 9. Live region
1. The **outer** fixed container `<div role="status" aria-live="polite" aria-atomic="true" …>`, not the card.
2. Yes. It renders even when `shown` is `null` (it's empty then). Screen readers announce **changes inside a region they already track**. A
   region inserted already holding its text often isn't announced (curriculum 11, check 3). Incident 002 is what happens when this is broken.
3. `key={shown.id}` remounts the card for each new toast so the `animate-toast-in` keyframe replays. The old card node is removed and a
   new one inserted **inside the same persistent region**, and that's why the announcement still works.
4. Dismiss-first means the action can't run twice (a second press finds no toast), and a slow `onAction` doesn't leave a stale Undo on screen.

## 10. Two trees
1. Server: `false`. Hydration render: `false` (`getServerSnapshot`). Right after mount at 1366 px: `true`.
2. `useSyncExternalStore` switches to the client value in the same pass as the store's hydration flag, and follows `matchMedia` changes. So
   there's no one-frame flash of the phone layout on desktop, and no separate effect-driven re-render. With `useState` + `useEffect` you'd
   paint the phone layout once, then swap.
3. The map re-fits its bounds (`FitBounds` keyed by `fitKey`) with different padding (`mobilePadding`), because the visible map area
   changes when the sheet becomes a side panel. It's on purpose, so markers aren't hidden under the new layout.
4. Phones only: `BottomSheet` (`src/components/ui/BottomSheet.tsx`). Desktop only: the `<aside>` panel and the dnd-kit route list
   (`DriverRoutesDnd.tsx`). Different components mount, so a bug can exist in one tree only. A change tested at one width is half-tested.
