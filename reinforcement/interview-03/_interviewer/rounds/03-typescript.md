# Interviewer notes: RouteIQ / lucasrouter / TypeScript, schemas, and public contracts

Keep this file closed during a first attempt. Accept behaviorally correct alternatives that satisfy the declared contract. Source-grounded explanations and honest limitations matter more than matching these words. Return to the [candidate round](../../rounds/03-typescript.md) to run a new attempt.

## How to evaluate this round

Look for a clear distinction between compile-time reasoning and runtime trust. A cast changes what the checker assumes; it does not inspect a payload. The candidate should name the validator or construction boundary and explain why downstream functions may rely on its output. Not every internal helper needs to validate the same data again if the ownership and preconditions are explicit.

Ask the candidate to enumerate the legal outcome combinations. A discriminant should let the consumer handle the variant's required data without a chain of unrelated optional checks. In a TypeScript sketch, an exhaustive branch can expose a newly added variant during compilation; the candidate should still explain how an older deployed client handles an unfamiliar server value at runtime.

For optional values, insist on concrete examples rather than slogans. A missing patch field can mean preserve, null can mean clear, and zero can be a valid number, but the actual endpoint decides those meanings. Reject accidental policies introduced by truthiness or a generic object spread. Ask whether validation should reject unknown keys or strip them, and require that choice to be visible in tests.

Finish with a migration question: can a stored record or an older client still cross this boundary? Accept a narrowly scoped fallback with an old fixture. Do not reward a schema rewrite that silently changes behavior for existing callers. Junior success is an explainable contract with representative runtime examples, not the most elaborate generic type.

## 01.3.1 — A list changes underneath a selection

### Expected project reasoning

**Invariant:** Selection refers to a stable stop ID; visibility is a separate fact.

The pending view becomes empty. A detail policy may retain a clearly labeled selection or close it; choose one explicitly. Selecting the next array index without checking identity is not an acceptable accidental policy.

**Plausible wrong approach:** Use the row index as both the React key and selected entity ID.

Use the exact starting fixture from [the candidate round](../../rounds/03-typescript.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.3.2 — Two records share a nested address

### Expected project reasoning

**Invariant:** An intended edit must not mutate unrelated records through shared references.

Copy the changed path or construct a separate draft, then assert both the edited result and untouched original address. Deep cloning every state object is not automatically the best production boundary.

**Plausible wrong approach:** Assume a top-level spread makes every nested reference independent.

Use the exact starting fixture from [the candidate round](../../rounds/03-typescript.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.3.3 — Undo arrives after newer work

### Expected project reasoning

**Invariant:** An old undo must not overwrite a newer accepted change.

Reject or expose a conflict for the stale token. A successful reversal would itself be a new transition. Explain what evidence the existing store has before adding a field to its real contract.

**Plausible wrong approach:** Restore an entire old snapshot and erase every later change.

Use the exact starting fixture from [the candidate round](../../rounds/03-typescript.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.3.4 — Proof and status disagree

### Expected project reasoning

**Invariant:** A transition must satisfy the chosen status-and-proof contract at its authority boundary.

Reject this synthetic transition with a useful field error. Inspect delivery validation to determine the actual application policy; do not infer that every delivery requires the same proof type.

**Plausible wrong approach:** Disable a button and assume all other callers are now validated.

Use the exact starting fixture from [the candidate round](../../rounds/03-typescript.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.3.5 — Keyboard focus loses its owner

### Expected project reasoning

**Invariant:** Closing a dialog should leave focus at a meaningful available control.

Use the current native-dialog behavior as the starting point, then specify a surviving fallback. Verify keyboard order in a browser; a pure next-target function cannot prove actual focus movement.

**Plausible wrong approach:** Choose an arbitrary DOM node or assert focus behavior with only an array unit test.

Use the exact starting fixture from [the candidate round](../../rounds/03-typescript.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.3.6 — A restored draft has yesterday’s shape

### Expected project reasoning

**Invariant:** Serialized input needs an explicit compatibility rule at restoration.

Default a truly optional note under a stated migration rule; reject unsupported required fields separately. Preserve the original payload in a reproducer and test both old and current fixture shapes.

**Plausible wrong approach:** Treat a TypeScript assertion as validation of browser storage.

Use the exact starting fixture from [the candidate round](../../rounds/03-typescript.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.
