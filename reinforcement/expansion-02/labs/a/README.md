# Lab A: Guarded edit and undo

Practice immutable updates and command ownership with a tiny record collection before considering the real delivery log.

## Exact teaching contract

Export `edit(rows, {id, expectedVersion, value})` and `undo(rows, token)`. Rows are validated unique `{id, version, value}` records; versions are nonnegative integers and values are strings. Edit returns `{status:'missing', rows}` if absent, `{status:'conflict', rows}` if the revision differs, otherwise `{status:'applied', rows:newRows, token:{id,version:newVersion,value:oldValue}}`. Every accepted edit increments the version, even when the string is unchanged. Undo requires the token's version to equal the current row version; it restores token.value, increments again, and returns `{status:'undone',rows:newRows}`. Missing/conflict return the original array. Never mutate rows or unrelated record identities. This model has no database or multi-tab locking.

## Work the examples before the implementation

Start A at version 4/Alpha and B at 2/Beta. Predict edit A to Depot, edit B to Shop, and undo A. Then repeat with the second edit targeting A. Write every intermediate revision before running a check.

Read `check.mjs`, write expected results for two cases, and then run it. The starter deliberately throws `Not implemented`. Implement `exercise.mjs` yourself and keep the supplied assertions unchanged. Add one test for an edge that is not already asserted, then demonstrate a plausible wrong implementation fails it.

From this lab directory:

```powershell
node --test check.mjs
```

The file is explicitly named `check.mjs` rather than a test/spec filename so conventional app test discovery does not collect an unfinished teaching exercise. There is no npm install, database, network, paid model, or payment call. These are small JavaScript models; types and application integration are separate practice tasks.

## Connect the model to the application

Read the real undoStop action and compare its fields and lifetime with the token model. Identify how plan replacement or another tab could invalidate an offer. Propose one component assertion for stale-undo feedback.

Record what is simplified: input validation already assumed, event ordering promised by the caller, a missing persistence layer, or an injected clock. A passing model is useful only when you can name the guarantee the real app still needs.

After your own attempt, read [the reasoning guide](../../_answers/GUIDE.md). The separate reference is checked with:

```powershell
node check.mjs --reference
```

This second command verifies the author's answer, not your solution. If your solution differs but meets every stated contract, compare invariants and failure cases instead of matching lines. Save the failing output, corrected output, your extra assertion, and a short explanation of why the correction is sufficient for this model.
