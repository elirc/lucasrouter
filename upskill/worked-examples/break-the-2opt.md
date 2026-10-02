# Worked example: break 2-opt's improvement condition (Exercise 1.1)

This is [EXERCISES.md](../EXERCISES.md) exercise 1.1 performed once, for real,
with the actual output captured (Node 22.16, vitest 4.1.10, Windows,
2026-10-01) — a model of the loop every Tier 1 exercise follows:
**predict → break → observe → revert**. It is not a substitute for doing it.
Read "Predict first", write your own answers down, do your own run, and only
then read past the spoiler break to compare.

## Predict first

From exercise 1.1: in `src/lib/optimizer/sequence.ts:87`, flip
`if (delta < -EPSILON)` to `if (delta > EPSILON)`. Before touching anything,
write down:

1. Which tests fail — the direct unit tests on `twoOptImprove`, the aggregate
   seed assertions in `optimize() on the seed dataset`, both?
2. Do `tests/api-optimize.test.ts` or `tests/store.test.ts` notice at all?
3. Does "beats the round-robin baseline on distance" fail? (Think about how
   much of the seed's −51 % comes from *clustering* versus *sequencing*.)
4. Is the broken suite deterministic — same failures, same numbers, every run?

---

**Spoiler break.** Everything below is the answer key. Do your own run first.

---

## The one-line break

In `twoOptImprove()` (`src/lib/optimizer/sequence.ts`), the acceptance test
inverts: the local search now keeps every segment reversal that makes the tour
**longer**, and stops only when no reversal can make it any worse.

```diff
         const delta = matrix[prev][b] + matrix[a][next] - matrix[prev][a] - matrix[b][next];
-        if (delta < -EPSILON) {
+        if (delta > EPSILON) {
           reverseInPlace(tour, i, j);
           improved = true;
         }
```

Everything else survives: the function still terminates (the pass cap and the
monotone objective both still hold — just pointed the wrong way), still
returns a permutation of its input, still never crashes. `pnpm typecheck` and
`pnpm lint` have no opinion. Only the *meaning* changed: "improve" now means
"pessimize".

## What actually happened

`pnpm exec vitest run --no-file-parallelism` with the break in place:

```
     × never increases route distance versus nearest-neighbour input 200ms
     × substantially improves deliberately bad orders 6ms
     × handles a single driver (gets everything, sequenced) 975ms
     × pulls a late stop earlier and reduces violations 84ms
     × pushes a stop that would idle at a closed window to the tail (later pass) 11ms

 Test Files  1 failed | 6 passed (7)
      Tests  5 failed | 162 passed (167)
```

All five failures are in `tests/optimizer.test.ts`. The two direct unit tests
speak plainest:

```
 FAIL  tests/optimizer.test.ts > 2-opt > never increases route distance versus nearest-neighbour input
AssertionError: expected 47.22293159984456 to be less than or equal to 24.347629963227913
```

The 10-stop subtour that nearest-neighbour built at 24.35 km came back from
"improvement" at 47.22 km — nearly doubled. And at whole-route scale
(`handles a single driver`, 45 stops on one van):

```
AssertionError: expected 253.69 to be less than 182.48
```

182.48 km is the *file-order* schedule of the same stops. The sabotaged
optimizer is 39 % worse than not optimizing at all.

**The two surprises worth sitting with:**

- **"beats the round-robin baseline on distance" PASSED.** So did
  "meets every window on the seed" and both `totalMinutes` ceilings. On the
  3-driver seed, the angle-seeded k-means assignment does so much of the work
  that even an actively pessimizing sequencer stays under the test's
  0.8 × baseline bar. The aggregate seed assertions are a coarse net; the
  per-function property tests (`:150`, `:163`) are the fine one. If the suite
  had only the aggregate test, this bug ships.
- **Two `repairTimeWindows()` tests failed without any repair bug.** Their
  arrange-step asserts what `sequenceRoute` hands the repair pass
  (`expect(distanceOnly).toEqual([1, 2, 3])` — actual: `[2, 1, 3]`), so they
  fail on arrangement, not on the behavior they exist to pin. A failing test
  names a *file*, not a *cause*; read the assertion before blaming the unit
  under test.

**Who did NOT notice:** `tests/api-optimize.test.ts` (26 tests) and
`tests/store.test.ts` — all green. The zod gate validates requests, and
`isOptimizeResponse()` validates response *shape*; a contract-perfect,
deterministic, dramatically worse plan passes both and renders beautifully,
ETAs and all. The dispatcher would see "Routes ready" with a bigger km figure
in the toast and nothing to compare it against except the round-robin baseline
the broken plan still beats (the passing `:292` test proves exactly that).
Plan *quality* has exactly one guardian in this system: the assertions in
`tests/optimizer.test.ts`.

**Determinism.** A second run (`pnpm exec vitest run tests/optimizer.test.ts`)
failed the same 5 tests with bit-identical numbers (47.22293159984456 again).
This break's signature is deterministic: the matrix is fixed, the scan order
is fixed, and nothing here is timing-dependent — so CI would catch it every
time. Contrast exercise 1.2, where losing "strictly decreases" risks
non-termination that only the wall-clock budget masks, at whatever rate the
input decides.

## Restore and confirm

```
git checkout -- src/lib/optimizer/sequence.ts
pnpm exec vitest run tests/optimizer.test.ts
```

```
 Tests  51 passed (51)
```

`git status --short src/` prints nothing — the tree is clean. (The full
7-file suite was green — 167/167 — before the break; that baseline run is
what makes the 162/167 above meaningful.)

## Doing this yourself

```powershell
pnpm exec vitest run --no-file-parallelism   # confirm 167/167 before breaking anything
# edit src/lib/optimizer/sequence.ts:87: flip "delta < -EPSILON" to "delta > EPSILON"
pnpm exec vitest run --no-file-parallelism   # observe; run the optimizer file twice, note what is stable
git checkout -- src/lib/optimizer/sequence.ts
pnpm exec vitest run tests/optimizer.test.ts # confirm green again
```

The rule: **never leave the break in place.** The suite is the teaching
instrument, not the victim — every exercise ends with a green run and a clean
`git status`, or you have not finished it.
