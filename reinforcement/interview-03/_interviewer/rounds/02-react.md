# Interviewer notes: RouteIQ / lucasrouter / React component and interaction interview

Keep this file closed during a first attempt. Accept behaviorally correct alternatives that satisfy the declared contract. Source-grounded explanations and honest limitations matter more than matching these words. Return to the [candidate round](../../rounds/02-react.md) to run a new attempt.

## How to evaluate this round

Evaluate the state model before styling or hook count. A good answer places authoritative facts at their real owner and keeps a draft distinguishable from a fetched record. Derived values can be calculated from their inputs rather than maintained as an additional independent copy. When the candidate proposes an effect, ask which external synchronization it performs and how cleanup mirrors setup.

Use this case's fixture to walk a complete render/event/response sequence. Ask what the handler captured when it was created and what identity is checked before applying a later result. A ref can retain mutable information, but using one is not a substitute for deciding whether the operation belongs to an earlier submission or the current selection.

Require an observable interaction: choose an item, submit, receive a controlled response, and inspect both the visible result and an unrelated value that must remain unchanged. Avoid a test that replaces the state owner with a mock whose return value already guarantees the expected behavior. A pure helper test and a component test support different claims.

For accessibility, prefer the existing semantic element and describe its native behavior before adding custom keyboard handling. Check a meaningful label, disabled/pending behavior, error association, and focus recovery. Do not award a claim of full accessibility from one role query. Junior success is a coherent small interaction with clear evidence limits; additional memoization or a new state library needs a demonstrated reason.

## 01.2.1 — A list changes underneath a selection

### Expected project reasoning

**Invariant:** Selection refers to a stable stop ID; visibility is a separate fact.

The pending view becomes empty. A detail policy may retain a clearly labeled selection or close it; choose one explicitly. Selecting the next array index without checking identity is not an acceptable accidental policy.

**Plausible wrong approach:** Use the row index as both the React key and selected entity ID.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.2.2 — Two records share a nested address

### Expected project reasoning

**Invariant:** An intended edit must not mutate unrelated records through shared references.

Copy the changed path or construct a separate draft, then assert both the edited result and untouched original address. Deep cloning every state object is not automatically the best production boundary.

**Plausible wrong approach:** Assume a top-level spread makes every nested reference independent.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.2.3 — Undo arrives after newer work

### Expected project reasoning

**Invariant:** An old undo must not overwrite a newer accepted change.

Reject or expose a conflict for the stale token. A successful reversal would itself be a new transition. Explain what evidence the existing store has before adding a field to its real contract.

**Plausible wrong approach:** Restore an entire old snapshot and erase every later change.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.2.4 — Proof and status disagree

### Expected project reasoning

**Invariant:** A transition must satisfy the chosen status-and-proof contract at its authority boundary.

Reject this synthetic transition with a useful field error. Inspect delivery validation to determine the actual application policy; do not infer that every delivery requires the same proof type.

**Plausible wrong approach:** Disable a button and assume all other callers are now validated.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.2.5 — Keyboard focus loses its owner

### Expected project reasoning

**Invariant:** Closing a dialog should leave focus at a meaningful available control.

Use the current native-dialog behavior as the starting point, then specify a surviving fallback. Verify keyboard order in a browser; a pure next-target function cannot prove actual focus movement.

**Plausible wrong approach:** Choose an arbitrary DOM node or assert focus behavior with only an array unit test.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.2.6 — A restored draft has yesterday’s shape

### Expected project reasoning

**Invariant:** Serialized input needs an explicit compatibility rule at restoration.

Default a truly optional note under a stated migration rule; reject unsupported required fields separately. Preserve the original payload in a reproducer and test both old and current fixture shapes.

**Plausible wrong approach:** Treat a TypeScript assertion as validation of browser storage.

Use the exact starting fixture from [the candidate round](../../rounds/02-react.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.
