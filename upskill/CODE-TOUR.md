# Code tour: one promise, end to end

This tour follows a single promise through every layer of RouteIQ:

> **The optimizer is swappable: the same contract, the same request limits, the
> same time-window rules and the same before/after metrics hold regardless of
> which algorithm sits behind `POST /api/optimize` — and the UI never trusts
> that algorithm's output blindly.**

That is the repo's headline claim (README: "the production algorithm drops into
`POST /api/optimize` with zero UI changes"). This walk shows where each piece of
the claim is enforced, and — just as important — where it is merely *promised*
to a future implementer rather than enforced by code.

Read it with the files open. Line numbers refer to the current source; if they
drift, search for the quoted identifier instead. The contract itself is
documented field-by-field in
[docs/ALGORITHM_INTEGRATION.md](../docs/ALGORITHM_INTEGRATION.md); this tour is
the *code* behind that document.

## 0. Set the scene

Run `pnpm dev`, open `/dispatch`, and press **Optimize routes**. A toast
reports "Routes ready · 3 drivers · 175 km" and the before/after card appears.
Now predict: how many distinct layers did that click cross, and which of them
would have to change if you replaced `nn-2opt-v1` with OR-Tools? The honest
answer by the end of this tour: one file changes (`src/lib/optimizer/index.ts`
or the route handler's `optimize(req)` call), and five layers verify it.

## 1. The trigger: two callers, one store action

- `src/components/dispatch/PanelHeader.tsx:80` — the **Optimize routes**
  button's `onClick={() => void optimize()}`. The component knows nothing about
  algorithms; it reads `isOptimizing`, `lastOptimizedAt` and `optimizeError`
  from the store and renders accordingly.
- `src/components/driver/DriverRouteScreen.tsx:112` — the only other caller:
  `await optimize({ toast: 'driver' })` when a driver opens their route and no
  plan exists yet. Same action, different toast.
- Nothing else calls the algorithm. Manual drag-and-drop reassignment and a
  driver's "Skip for now" re-run only `schedule()` (legs/ETAs/metrics), never
  the solver — that is why they keep working with *any* algorithm
  (`src/store/useAppStore.ts:686`, inside `planAfterMove()`).

## 2. The store action: request out, suspicion in

`src/store/useAppStore.ts:734` — `optimize()`:

- `:747` builds the `OptimizeRequest` from store state — note the comment:
  delivery status rides along but **must not** affect planning (invariant 9 of
  the contract; pinned by a test in §6).
- `:756` — `fetch('/api/optimize', …)` with an 8-second
  `AbortSignal.timeout`. A hung serverless function cannot leave the button
  spinning forever.
- `:764` — `if (isOptimizeResponse(json)) result = json;` — the store
  **structurally validates the response** before trusting it.
  `isOptimizeResponse()` (`src/store/useAppStore.ts:578`) checks `routes` is an
  array, each route has `stopIds`/`legs` arrays and a `etaByStopId` record, and
  **every ETA matches `/^\d{1,2}:\d{2}$/`**. The doc comment says why: "a
  swapped-in algorithm (the whole point of the endpoint) is the most likely
  source of surprises."
- `:774` — only when the API supplied nothing does the store dynamically import
  `@/lib/optimizer` and run the same algorithm **in the browser**. The seam has
  a fallback on both sides of the network.
- `:782` — `const base = baseline(req);` — the "before" numbers are computed
  **locally**, round-robin in file order with the same haversine×1.3 distance
  model. Your replacement algorithm never has to provide a baseline; it also
  cannot fake one.
- `:784-794` — one `set()` commits routes, both metrics objects, `algorithm`,
  `computeMs` and clears `editedSinceOptimize`.

Before moving on, predict: what happens if a swapped-in Python solver returns
`"etaByStopId": { "S001": "9:05 AM" }`? (Answer: `:765` — the response is
rejected, the console warns "unexpected shape", and the local optimizer
silently takes over. The demo keeps working and the only trace is the
`algorithm` string in the toast. The integration doc calls this graceful *and*
dangerous: a timeout "silently swaps algorithms".)

## 3. The API gate: zod before any algorithm runs

`src/app/api/optimize/route.ts`:

- `:167` — `POST()` parses JSON (malformed → 400) and `:178` runs
  `optimizeRequestSchema.safeParse(body)`. **No algorithm code runs on an
  invalid request**, whichever algorithm is installed.
- `:64-65` — `MAX_STOPS = 1000`, `MAX_DRIVERS = 50`. The comment is the
  reasoning: the endpoint is public and the placeholder is O(n²)–O(n³), so a
  request must not be able to allocate gigabytes or run for minutes.
- `:135-152` — the `superRefine` that rejects duplicate stop/driver ids. This
  is contract enforcement, not pedantry: "every stop exactly once" and every
  id-keyed lookup in the UI assume uniqueness.
- `:77` — the stop id `"DEPOT"` is refused because `RouteLeg.fromId`/`toId`
  reserve it for the depot endpoints.
- `:190` — `const result = optimize(req);` — **this single line is the seam.**
  Replace it with a `fetch()` to a Python function (the integration doc §3.2
  shows how) and nothing above or below this file changes.
- `:195` — an optimizer exception becomes a 500 with no stack trace.

## 4. The algorithm: a pipeline that ends at a shared scheduler

`src/lib/optimizer/index.ts:61` — `optimize()` runs the five stages:

1. `:67` — `buildDistanceMatrix([depot, ...stops])`. Every km in this system
   is **estimated road km = haversine × 1.3** (`ROAD_FACTOR`,
   `src/lib/optimizer/distance.ts:24`). The file header states the honesty
   rule: everything downstream goes through these functions "so the numbers
   the UI shows always agree with the numbers the optimizer used."
2. `:72` — `assignStops()`: angle-seeded k-means, capacity hard, balance soft.
3. `:84` — `sequenceRoute()`: nearest-neighbour + 2-opt. The improvement
   condition is one line — `src/lib/optimizer/sequence.ts:87`:
   `if (delta < -EPSILON)` — and Exercise 1.1 breaks exactly it.
4. `:94` — `repairTimeWindows()` under a shared wall-clock deadline
   (`REPAIR_TIME_BUDGET_MS = 1500`, `src/lib/optimizer/repair.ts:83`): a late
   pass that only accepts strictly-fewer-violations moves, and an idle pass
   that pushes waiting to the route tail without adding violations.
5. `:101` — `schedule()` turns ordered assignments into legs, ETAs and metrics.

The crucial design fact for swappability: **`schedule()` and
`computeMetrics()` are exported for the replacement algorithm to reuse**
(`src/lib/optimizer/index.ts:41`), and `schedule()` is also what the store
re-runs after every manual move — so "late", "wait" and "violation" mean the
same thing to the solver, the dispatcher's drag-and-drop and the metrics card.
There is exactly one definition of the ETA rules: `simulateTimings()` in
`src/lib/optimizer/schedule.ts:108` — arrival before `window.start` waits
(`:125-127`, clamped, not a violation); rounded arrival strictly after
`window.end` is late (`:130`). `computeMetrics()` (`schedule.ts:229`)
re-derives violations from the ETA *strings* (`:248`), which is why ETAs must
keep counting past midnight (`"25:13"`) instead of wrapping — a wrapped
next-day `"09:05"` would look on time (DECISIONS.md #14 records that this was
a real bug once).

## 5. The display: metrics are consumed, never recomputed by the UI

- `src/components/dispatch/DispatchPanel.tsx:31` —
  `{optimizedMetrics && <MetricsCompare baseline={baselineMetrics} optimized={optimizedMetrics} />}`.
  The before/after card (`src/components/ui/MetricsCompare.tsx`) renders the
  two `RouteMetrics` objects and percentage deltas; it contains no distance or
  time logic of its own.
- `src/components/dispatch/DispatchOverview.tsx:10-11` reads the same two
  store fields for the fleet overview. If a swapped-in algorithm reports real
  road km, the card compares them against the ×1.3-haversine baseline —
  roughly like-for-like, not exact; the integration doc §6 says so plainly
  rather than pretending otherwise.

## 6. The tests that pin the contract

For each, say first *which layer* it guards:

- `tests/optimizer.test.ts:222` — every one of the 45 seed stops appears
  exactly once across routes + unassigned (invariant 1).
- `tests/optimizer.test.ts:150` — 2-opt never returns a longer tour than its
  input, on four different subsets (the improvement condition of §4).
- `tests/optimizer.test.ts:267` — reported `distanceKm` is haversine × 1.3 per
  leg, and *never shorter than the crow flies* — the distance-model honesty
  rule as an assertion.
- `tests/optimizer.test.ts:303` — zero violations on the seed, **and** no
  un-windowed stop is scheduled after a >60-minute wait: the test encodes what
  "repair" must mean, not just that some repair ran.
- `tests/optimizer.test.ts:332` and `:339` — determinism, and independence
  from delivery status (re-optimizing mid-day must not shuffle stops because
  some are delivered).
- `tests/optimizer.test.ts:461` — the midnight test: a 22:00 shift produces
  `"24:xx"`/`"25:xx"` ETAs, metrics and the ETA simulation agree, and the
  after-midnight stop correctly counts as late for its morning window.
- `tests/api-optimize.test.ts:45-233` — the gate of §3, exercised as plain
  function calls on the route handler: malformed JSON, duplicate ids, the
  reserved `DEPOT` id, the 1000/50 caps (and that exactly 1000 is still
  accepted), inverted windows, numeric bounds, unknown-key stripping.
- `tests/api-optimize.test.ts:113` — a cap-sized request *with* time windows
  returns within seconds: the repair budget is a tested property, not a hope.
- `tests/store.test.ts:828`, `:848`, `:872` — the suspicion layer of §2: a
  well-formed API response is used (its `algorithm` string passes through); a
  non-2xx or wrong-shaped body falls back locally; **malformed ETAs from a
  swapped-in algorithm are rejected** — the strongest direct test of this
  tour's promise.

## 7. Where the promise stops

State the evidence at its actual strength:

- The invariants are enforced on the **placeholder, on the seed**. A
  replacement algorithm inherits the *request* gate (§3) and the store's
  *structural* response check (§2) automatically — but invariants 1–9 of
  `docs/ALGORITHM_INTEGRATION.md` §4 (every stop exactly once, closed leg
  chains, capacity, balance…) are checked for the replacement **only if its
  author keeps `pnpm verify` green or reuses `schedule()`**. The store would
  accept a structurally valid response that drops a stop. Making that
  impossible is Exercise 2.2 (a response-invariant guard), which is an
  exercise, not a shipped feature.
- The before/after card compares the replacement's reported km against a
  baseline priced with the ×1.3 estimate — honest only while both sides use
  the same model (§5).
- Everything here is demo-scale: 45 stops, one depot, `localStorage`, no
  authentication. [DECISIONS.md](../DECISIONS.md) records every such boundary.

When you can explain why the zod schema alone cannot protect the UI (the
response side), why the store's shape-check alone cannot guarantee a sane plan
(it never checks "every stop exactly once"), and why the tests alone cannot
vouch for an algorithm that hasn't been written yet — you understand what this
seam does and does not promise.
