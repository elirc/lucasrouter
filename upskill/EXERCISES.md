# Exercises: from reading this optimizer to replacing it

Reading finished code teaches less than changing it and watching what breaks.
These exercises are ordered by tier; each has a **done when** so you can check
yourself. Work on a branch, and before every exercise write down your
prediction first — the learning is in comparing it with what happened.

Everything here is labelled what it is: an exercise. None of it exists in the
code yet unless the text says so.

Baseline for everything below:

```powershell
pnpm verify          # typecheck + lint + vitest — must be green before and after
```

(`pnpm test` alone runs the vitest suite; `pnpm smoke` needs a production
build + a local Chrome/Edge and is optional for Tier 1.) If the machine is
busy, run the suite with `pnpm exec vitest run --no-file-parallelism` — the
repair stage has a real 1.5 s wall-clock budget and parallel workers can eat
it (docs/REBUILD.md says so; believe it).

---

## Tier 1 — Trace and break (half a day each)

The vitest suite is a teaching instrument: break one guarantee on purpose and
watch which test catches it. Revert with `git checkout -- <file>` afterward and
finish with a green run and a clean `git status`.

**1.1 Break 2-opt's improvement condition.** In
`src/lib/optimizer/sequence.ts:87`, flip `if (delta < -EPSILON)` to
`if (delta > EPSILON)` — the local search now keeps every change that makes
the tour *longer*.
*Predict first:* which tests in `tests/optimizer.test.ts` fail? Does
"never increases route distance versus nearest-neighbour input" (`:150`) fail,
or does the damage only show in the aggregate seed assertions ("beats the
round-robin baseline on distance", `:292`)? Does the suite still pass
`is deterministic` (`:332`)? Does any `tests/api-optimize.test.ts` test notice?
*Done when:* you can name the failing assertions without re-reading the test
file, and explain why a *valid-but-worse* plan is the kind of bug the zod gate
and the store's `isOptimizeResponse()` check can never catch — only a quality
assertion can.

A completed run of this exercise, with real captured output, is in
[worked-examples/break-the-2opt.md](worked-examples/break-the-2opt.md) — do
your own run first, then compare how you observed and reported against it.

**1.2 Break the time-window repair.** In `src/lib/optimizer/repair.ts:181`,
change the late pass's acceptance test
`if (ev.violations >= violations) continue;` to
`if (ev.violations > violations) continue;` — it now also accepts moves that
leave the violation count unchanged.
*Predict first:* does `repairTimeWindows()` still terminate? (Read the file
header's monotonicity argument at `repair.ts:28-30` before you answer — the
strictly-decreasing chain is the termination proof, and you are about to
remove "strictly".) Which guards in the code limit the blast radius
(`MAX_*` caps at `:64`/`:73`, the deadline at `:83`), and which of the
`repairTimeWindows()` tests (`tests/optimizer.test.ts:683` onward) or seed
assertions (`:303`) fail or hang?
*Done when:* you can explain in your own words why "strictly decreases" is
doing load-bearing work in a local search's acceptance condition, and what the
wall-clock budget turns an infinite loop into (a silently less-repaired plan —
which tests at `:755` tolerate by design).

**1.3 Break the metrics aggregation.** In `src/lib/optimizer/schedule.ts`,
inside `computeMetrics()` (`:229`), change
`longestRouteMinutes = Math.max(longestRouteMinutes, route.totalMinutes)` to
`Math.min(...)`.
*Predict first:* which of the three suites notices — `tests/optimizer.test.ts`
("metrics.totalDistanceKm equals the sum of route totals", `:284`),
`tests/api-optimize.test.ts` ("keeps the response consistent with the
OptimizeResponse contract on the seed", `:242`), or `tests/store.test.ts`
(which re-runs `schedule()` after every move)? All metrics flow through this
one function — the store, the API and the solver share it — so count the
failures before you run.
*Done when:* the predicted tests fail, and you can say why a UI-side metrics
bug is impossible by construction here (`MetricsCompare` renders; it never
computes — CODE-TOUR §5).

**1.4 Break the request gate.** In `src/app/api/optimize/route.ts`, delete the
duplicate-stop-id branch of the `superRefine` (`:136-143`).
*Predict first:* which `tests/api-optimize.test.ts` test fails (`:62`)? Then
the deeper question: with the gate gone, what does the *optimizer* do with a
duplicated id — plan it twice, drop it, or crash? Read
`src/lib/optimizer/index.ts:68-69` (`matrixIndexOf` is a `Map`) and
`schedule.ts:159-165` (the `seen` set) and predict before testing it by hand
with a crafted `fetch`.
*Done when:* you can name which layer *would* have silently absorbed the
duplicate, and why the contract still rejects it loudly at the boundary
instead of relying on that tolerance ("every stop exactly once" must stay
checkable by clients).

**1.5 Trace a different promise.** Repeat the CODE-TOUR walk for **"manual
reassignment never re-sequences and works with any algorithm"**: the dnd/⋯
menu → `moveStop()` → `planAfterMove()` (`src/store/useAppStore.ts:651`) →
`schedule()` → the tests in `tests/store.test.ts:1027` onward ("moves a stop
across drivers, re-schedules ETAs/metrics and leaves the baseline alone";
"refuses to move a delivered or failed stop"; the `editedSinceOptimize` flag).
*Done when:* you have written a half-page tour in the CODE-TOUR format,
including why `deferStop()` (a driver's "Skip for now") takes the same path
but must **not** set `editedSinceOptimize` — the comment at
`useAppStore.ts:644-649` is the design argument; restate it, don't paste it.

## Tier 2 — Extend inside the existing boundaries (1–3 days each)

Write the failing test *first*, in the style the repo already uses:
`tests/api-optimize.test.ts` calls the route handler as a plain function with
a `Request`; `tests/optimizer.test.ts` builds tiny synthetic instances with
`makeStop`/`makeDriver`; `tests/store.test.ts` runs the store against a fake
`window`. Note what already exists so you extend rather than re-invent:
capacity (`capacityPackages`) is already a hard constraint, and
proof-of-delivery already persists to `localStorage` — these exercises go
*beyond* those, not around them.

**2.1 A response-invariant guard.** CODE-TOUR §7 names the gap: the store's
`isOptimizeResponse()` accepts a structurally valid response that silently
drops a stop or routes one twice. Add an invariant check (every requested stop
id appears exactly once across `routes[].stopIds` + `unassignedStopIds`;
`routes` matches `drivers` in order) on the API response path, falling back to
the local optimizer when it fails — exactly how malformed ETAs are handled
today (`tests/store.test.ts:872` is your model).
*Done when:* a new `tests/store.test.ts` case feeds a stop-dropping response
through a mocked `fetch` and proves the local optimizer's plan (algorithm
`nn-2opt-v1`) wins; the existing "uses the API response when it is
well-formed" test (`:828`) still passes; `pnpm verify` green.

**2.2 A second algorithm behind the same endpoint, with an honest A/B.** Add
`sweep-v1` — assignment by polar-angle sweep around the depot, reusing
`sequenceRoute()`, `repairTimeWindows()` and `schedule()` — selected by an
optional `options.algorithm` field (zod: `z.enum(['nn-2opt-v1','sweep-v1'])`,
optional, default unchanged). Then extend `scripts/` or a test to run both on
the seed and print the metrics side by side.
*Done when:* every invariant block in `tests/optimizer.test.ts` (stop
conservation `:222`, closed chains `:252`, capacity `:234`, determinism
`:332`) passes for `sweep-v1` too — parameterize, don't copy; an
`api-optimize` test proves an unknown algorithm name is a 400 while a missing
one still runs `nn-2opt-v1`; and your comparison states which algorithm won
on the seed *with the numbers you measured*, not the numbers you hoped for.

**2.3 Export the day: proof-of-delivery beyond the browser.** Today a driver's
proof lives only in `localStorage` and the end-of-day report download
(`src/components/driver/report.ts`). Add `POST /api/reports` that accepts a
zod-validated end-of-day report (reuse the shapes in `src/lib/types.ts` /
`deliveryValidation.ts`), bounds its size the way `/api/optimize` bounds its
(`MAX_STOPS` is the model), and — since the demo has no database, say so —
echoes a normalized, stamped copy back for download.
*Done when:* a new `tests/api-reports.test.ts` in the `api-optimize.test.ts`
style covers: a valid report round-trips; an over-limit photo payload is a
400 with the issue path; malformed JSON is a 400; and the README gains one
honest sentence ("accepted and echoed, not stored — there is no database").

## Tier 3 — Move a boundary (1–2 weeks each)

Do **one at a time**, one page of design first: two alternatives, the chosen
tradeoffs, and what measurement would make you revisit. The acceptance suite
you must keep green is the one that exists: `pnpm verify`, and `pnpm smoke`
against a production build when the UI is touched.

**3.1 Real road distances.** Replace haversine × 1.3 with a real road network
(self-hosted OSRM or precomputed matrices — `scripts/precompute-paths.ts`
already fetches OSRM *geometry* once; distances would be the same idea). The
hard part is not the fetch: it is that `distance.ts` is currently the single
source every stage shares (its header says so), and `tests/optimizer.test.ts:267`
*pins the ×1.3 model* — so this exercise forces you to decide which tests
encode the contract and which encode the placeholder. Budget: the matrix for
45 stops is one OSRM `table` call; at the 1000-stop cap it is not.
*Done when:* every km the UI reports is a real road km, the before/after card
compares like with like (both sides priced by the new model — see
docs/ALGORITHM_INTEGRATION.md §6), the ×1.3 tests are deliberately rewritten
(not deleted in passing), and your design note says what happens when the
road-data source is down.

**3.2 The optimizer as a job.** At demo scale the solver answers in ~25–90 ms;
a real CVRPTW solver at 1000 stops will not fit a 2 s request. Move the solve
behind a job: `POST /api/optimize` returns `202 { jobId }`, a worker (or a
queue on the deployment platform) computes, the client polls or subscribes.
The store's whole suspicion layer (§2 of the tour) has to be rethought: what
does the 8 s `AbortSignal.timeout` mean now? What does the dispatcher see for
30 seconds? What happens when they press Optimize twice?
*Done when:* the synchronous path still works for small requests (the tests at
`tests/api-optimize.test.ts:45` keep passing unchanged or your design note
defends changing them), a two-request test proves a second Optimize while one
is in flight is either queued or refused — never interleaved into a torn plan —
and the driver's auto-prepare flow (`DriverRouteScreen.tsx:112`) survives.

**3.3 Multi-depot.** Promote `depot` to `depots: Depot[]` with a per-driver
home depot. This moves the one boundary everything assumes: the distance
matrix's index 0, the reserved `"DEPOT"` id, closed-chain legs, `baseline()`,
and the map's `FitBounds`. The zod schema, the integration doc's invariants
3 and the chain-checking test helper (`expectClosedChain`,
`tests/optimizer.test.ts:40`) all change together — enumerate them in the
design note *before* touching code.
*Done when:* a two-depot seed variant passes stop conservation, per-depot
closed chains and capacity; a single-depot request still produces byte-identical
output to today (back-compat is the test); and docs/ALGORITHM_INTEGRATION.md
is updated as if the next solver author inherits your version.

---

## Calibration: what "senior" looks like against this repo

You are operating at the level this repo teaches toward when you can:

1. Name the contract's invariants unprompted and say which layer enforces each
   one — zod gate, solver construction, shared scheduler, store guard, test —
   and which invariant is enforced *nowhere* at runtime (stop conservation on
   the response path, until you did 2.1).
2. State evidence at its true strength: "zero violations **on the seed**",
   "deterministic **when the repair budget is not hit**", "swappable —
   **demonstrated by the store-level fallback tests, never yet by a real
   second algorithm**" (until you did 2.2).
3. Review a change by supplying a concrete counterexample (an input, an
   observed result, a violated invariant), and accept a review by turning it
   into a test.
4. Say when the current design stops being right and what measurement would
   tell you — the 2 s serverless budget versus solver quality is this repo's
   version of that question, and 3.2 is its exercise.
