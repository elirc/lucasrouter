# RouteIQ Upskilling: Reading and Practice Path

Your central question: **what can a dispatcher honestly promise about a route
produced by a heuristic optimizer — and how do you verify an algorithm you
intend to replace?**

Every number RouteIQ shows a dispatcher is an estimate (road km = haversine ×
1.3), every route is a heuristic's best effort (nearest-neighbour + 2-opt +
time-window repair, not an optimum), and the whole algorithm is designed to be
thrown away (`POST /api/optimize` is "the seam"). The engineering question this
repo teaches is how to make promises that survive all three facts: a contract
enforced at the boundary, invariants pinned by tests, metrics that compare like
with like, and a UI that distrusts the solver on principle.

This pairs with the three-rebuild curriculum (GitJira / Stockade / Relay) in
the astrafinalorganize workspace, which teaches the same discipline against
CRUD, inventory and messaging systems.

## What already lives in this repo (don't duplicate it)

This repo has accumulated several learning trees, each with its own angle:

| Folder | Angle | Start at |
| --- | --- | --- |
| `learn/` | a junior's on-ramp: in what order to use everything, and how to direct coding agents while doing it | [learn/README.md](../learn/README.md) |
| `training/` | the frontend lab: rendering cost, Core Web Vitals, accessibility, incidents on branches, a J1–S2 ticket ladder | [training/README.md](../training/README.md) |
| `astraupskill/` | one real change (the delivery-proof runtime validation boundary) taught end to end | [astraupskill/README.md](../astraupskill/README.md) |
| `reinforcement/` | drills: arrays/state/derived views, labs, interview rounds, system-design practice | [reinforcement/README.md](../reinforcement/README.md) |
| `dfableandopus/` | the same material turned into interview answers and resume bullets | [dfableandopus/README.md](../dfableandopus/README.md) |

None of them walks the **optimizer and its replacement contract** — the thing
the README calls the point of the repo. That is what `upskill/` adds: a code
tour of the swappability promise, break-and-observe exercises against the
vitest suite, and one worked example with real captured output.

## Suggested sequence

1. **See it work.** [README.md](../README.md), then `pnpm install`,
   `pnpm dev`, press Optimize on `/dispatch`, walk a route on `/driver/D1`.
   Read [DECISIONS.md](../DECISIONS.md) #10–#18 (the optimizer entries) — they
   record two real bugs this design already survived: straight-line km reported
   as road km, and ETAs that wrapped at midnight.
2. **Learn the contract before the code.**
   [docs/ALGORITHM_INTEGRATION.md](../docs/ALGORITHM_INTEGRATION.md) — the
   field-by-field contract, the 11 invariants, the request limits and the 2 s
   budget. This document is the product; the TypeScript solver is scaffolding.
3. **Trace the promise.** [CODE-TOUR.md](CODE-TOUR.md) end to end with the
   files open: button → store → zod gate → pipeline → shared scheduler →
   metrics card → the tests. Then do exercise 1.5 (trace the manual-move
   promise yourself) before reading anything else.
4. **Break it on purpose.** [EXERCISES.md](EXERCISES.md) Tier 1. Do 1.1
   yourself first, then compare your run against the
   [worked example](worked-examples/break-the-2opt.md) — the model run is for
   calibrating how you observe and report, not for spoiling the prediction.
5. **Context from the other trees.** Now is the right time for
   `learn/00-onramp.md` (if the store or App Router is shaky),
   `astraupskill/` (the validation-boundary story — the same
   "boundary owns the promise" idea pointed at the driver's proof form), and
   `training/navigation/ARCHITECTURE.md`.
6. **Extend inside the boundaries.** Two Tier 2 exercises, tests first, in the
   style of the existing suites. 2.1 (the response-invariant guard) closes the
   gap the code tour names; 2.2 (a second algorithm) is the first time the
   swappability promise is *demonstrated* rather than documented.
7. **Move a boundary.** One Tier 3 exercise, one page of design first (two
   alternatives and what evidence would change your mind). 3.1 (real road
   distances) confronts you with tests that pin the placeholder rather than
   the contract — deciding which is which is the exercise.
8. **Turn it into interview material.** `dfableandopus/` and
   `reinforcement/interview-03/`, which assume you have done the work above.

## Journal artifacts to produce

Keep these in your own learning journal (outside the repo or on a branch):

- A one-page map of the optimize request's life: every file it passes through,
  and for each, the one thing that layer *refuses* to do (the UI doesn't
  compute, the gate doesn't plan, the scheduler doesn't assign…).
- Your own half-page tour of the manual-move promise (exercise 1.5).
- One break-the-guarantee report in the worked example's format: prediction,
  one-line diff, real captured output, which test spoke first, restore.
- A table of the contract's 11 invariants (`docs/ALGORITHM_INTEGRATION.md` §4)
  with the enforcing layer and test line for each — and an honest "none at
  runtime" where that is the answer.
- For the Tier 2/3 exercise you chose: the failing test you wrote first, and a
  three-sentence evidence statement ("proven on the seed", "proven for two
  algorithms", "unproven beyond…").

## Honesty rules this folder follows (and you should too)

- "Verified" means a command was run and its output captured —
  [astraupskill/VERIFICATION.md](../astraupskill/VERIFICATION.md) is this
  repo's standing example. Test counts in `upskill/` come from runs recorded
  in the worked example, dated.
- "Exercise" means the code does not contain it. Nothing in
  [EXERCISES.md](EXERCISES.md) is a feature.
- Evidence is stated at its strength: the placeholder's invariants are proven
  on the seed and synthetic instances by `tests/optimizer.test.ts`; the
  swappability promise is proven at the store boundary by
  `tests/store.test.ts` and *documented* — not yet demonstrated — for a real
  second algorithm.
