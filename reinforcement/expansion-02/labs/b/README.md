# Lab B: Keyboard target selection

Separate a small navigation policy from React rendering and real focus movement.

## Exact teaching contract

Export `nextTarget(items, currentId, command)`. Input items have unique string IDs and boolean disabled fields. Commands are `next`, `previous`, `first`, `last`; reject any other command with RangeError. Disabled items never qualify. Return null if no enabled items exist. First/last choose their endpoints. Next/previous wrap around enabled items; if currentId is absent or disabled, next chooses first and previous chooses last. Return an ID only; do not mutate inputs or access the DOM.

## Work the examples before the implementation

Use enabled A,C and disabled B. Predict next(A), previous(A), next(B), last(null), then disable A and C. Explain which results require a separate DOM-level check.

Read `check.mjs`, write expected results for two cases, and then run it. The starter deliberately throws `Not implemented`. Implement `exercise.mjs` yourself and keep the supplied assertions unchanged. Add one test for an edge that is not already asserted, then demonstrate a plausible wrong implementation fails it.

From this lab directory:

```powershell
node --test check.mjs
```

The file is explicitly named `check.mjs` rather than a test/spec filename so conventional app test discovery does not collect an unfinished teaching exercise. There is no npm install, database, network, paid model, or payment call. These are small JavaScript models; types and application integration are separate practice tasks.

## Connect the model to the application

Compare with the real dialog and list pattern. Keep native modal behavior intact. Test that a returned target is actually rendered before moving focus and define a fallback when it disappears.

Record what is simplified: input validation already assumed, event ordering promised by the caller, a missing persistence layer, or an injected clock. A passing model is useful only when you can name the guarantee the real app still needs.

After your own attempt, read [the reasoning guide](../../_answers/GUIDE.md). The separate reference is checked with:

```powershell
node check.mjs --reference
```

This second command verifies the author's answer, not your solution. If your solution differs but meets every stated contract, compare invariants and failure cases instead of matching lines. Save the failing output, corrected output, your extra assertion, and a short explanation of why the correction is sufficient for this model.
