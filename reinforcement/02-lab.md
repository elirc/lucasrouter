# Isolated lab: A stop-list projection that does not mutate its source

This is a small executable model, deliberately separate from the application. It uses Node's built-in test runner and has no package install, service, database, network call, or paid API dependency. It is JavaScript so you can focus on behavior first; the transfer task connects it back to this repository's JS/TS code.

## Contract

Implement `selectStops(stops, filters = {})`.

- Each synthetic stop has a unique string `id`, a string `label`, and status `pending`, `delivered`, or `failed`. These input records are already validated for this lab.
- `filters.status` defaults to `all`. Other accepted values are the three statuses. Reject an unsupported status with `RangeError`.
- `filters.search` defaults to the empty string. Trim it and compare case-insensitively with the label; an empty search matches everything.
- Status and search must both match. Preserve source order and return a new array containing the original matching object references.
- Never mutate the input array, input records, or filters. Empty input or no match returns `[]`.

This is a projection exercise, not the implementation of the app's map search or a performance optimization.

## Work sequence

1. Read `lab/contract-check.mjs`. Predict the output of two cases on paper before editing anything.
2. Run the command below. The checked-in starter throws `Not implemented`; this first failure is intentional.
3. Implement only `lab/exercise.mjs`. Keep the tests unchanged until the supplied contract passes.
4. Add one test from your own boundary case. Explain which plausible wrong implementation it rejects.
5. Change one line of your implementation to a plausible mistake and show a test turns red. Undo only that experimental change.
6. Write down the distinction between this pure model and the real app boundary. Continue to [transfer](03-transfer.md).

From this pack's directory:

```powershell
node --test lab/contract-check.mjs
```

Or from the repository root, use `reinforcement/lab/contract-check.mjs` in that command.
Node 22.16.0 was available during authoring; no dependencies are needed for these `.mjs` files.

## Debugging prompts

- If filtering fixes one card but breaks another, did you mutate the canonical array?
- If a whitespace-only search returns nothing, where does normalization belong?
- If object-reference assertions fail, did you copy records unnecessarily?
- If invalid statuses silently return an empty list, can the UI distinguish a bad filter from no results?

## Completion evidence

Record the input, expected result, actual result, and the first place they diverge. A passing test with an assertion deleted does not count. Leave the app's source untouched while solving this lab.

After your attempt, compare [the reasoning guide](_answers/GUIDE.md). The separate reference implementation is checked with:

```powershell
node lab/contract-check.mjs --reference
```

That command exercises the answer, not your solution. It is for comparison after the attempt and for validating the teaching material.
