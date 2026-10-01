# Interviewer notes: RouteIQ / lucasrouter / Project explanation and behavioral interview

Keep this file closed during a first attempt. Accept behaviorally correct alternatives that satisfy the declared contract. Source-grounded explanations and honest limitations matter more than matching these words. Return to the [candidate round](../../rounds/08-behavioral.md) to run a new attempt.

## How to evaluate this round

Evaluate ownership and reasoning, not polish alone. The candidate should distinguish reading existing code, completing a teaching lab, writing a proposed test, and verifying an application change. Those are all useful activities, but they support different claims. Ask which exact artifact demonstrates the candidate's own work.

A good explanation connects the technical choice to a user consequence. It names one invariant, one rejected alternative, and one observation that supports the decision. It does not spend most of the time listing libraries. When discussing a mistake, the candidate can describe an incorrect prediction from a real practice exercise and how a counterexample changed it; an invented production incident is unnecessary.

For disagreement, ask how the candidate would separate a product-policy question from a code-correctness question. The response should invite a concrete example or acceptance criterion rather than appeal to seniority or a tool's output. For uncertainty, a bounded verification plan is better than pretending an unrun integration check passed.

Score the answer on specificity, ownership accuracy, tradeoff reasoning, evidence, and reflection. Do not award a strong score merely for using a familiar story framework. Junior success is an honest, understandable explanation that survives two follow-up questions. End by asking what assumption would make the chosen approach wrong; the candidate should be able to revise the plan without abandoning the invariant or inflating the evidence.

## 01.8.1 — A list changes underneath a selection

### Expected project reasoning

**Invariant:** Selection refers to a stable stop ID; visibility is a separate fact.

The pending view becomes empty. A detail policy may retain a clearly labeled selection or close it; choose one explicitly. Selecting the next array index without checking identity is not an acceptable accidental policy.

**Plausible wrong approach:** Use the row index as both the React key and selected entity ID.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.8.2 — Two records share a nested address

### Expected project reasoning

**Invariant:** An intended edit must not mutate unrelated records through shared references.

Copy the changed path or construct a separate draft, then assert both the edited result and untouched original address. Deep cloning every state object is not automatically the best production boundary.

**Plausible wrong approach:** Assume a top-level spread makes every nested reference independent.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.8.3 — Undo arrives after newer work

### Expected project reasoning

**Invariant:** An old undo must not overwrite a newer accepted change.

Reject or expose a conflict for the stale token. A successful reversal would itself be a new transition. Explain what evidence the existing store has before adding a field to its real contract.

**Plausible wrong approach:** Restore an entire old snapshot and erase every later change.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.8.4 — Proof and status disagree

### Expected project reasoning

**Invariant:** A transition must satisfy the chosen status-and-proof contract at its authority boundary.

Reject this synthetic transition with a useful field error. Inspect delivery validation to determine the actual application policy; do not infer that every delivery requires the same proof type.

**Plausible wrong approach:** Disable a button and assume all other callers are now validated.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.8.5 — Keyboard focus loses its owner

### Expected project reasoning

**Invariant:** Closing a dialog should leave focus at a meaningful available control.

Use the current native-dialog behavior as the starting point, then specify a surviving fallback. Verify keyboard order in a browser; a pure next-target function cannot prove actual focus movement.

**Plausible wrong approach:** Choose an arbitrary DOM node or assert focus behavior with only an array unit test.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.


---

## 01.8.6 — A restored draft has yesterday’s shape

### Expected project reasoning

**Invariant:** Serialized input needs an explicit compatibility rule at restoration.

Default a truly optional note under a stated migration rule; reject unsupported required fields separately. Preserve the original payload in a reproducer and test both old and current fixture shapes.

**Plausible wrong approach:** Treat a TypeScript assertion as validation of browser storage.

Use the exact starting fixture from [the candidate round](../../rounds/08-behavioral.md). Require the candidate to predict its outcome before discussing an abstract pattern. If they propose a different product policy, ask them to state it explicitly and show how the acceptance examples change; do not confuse a policy disagreement with a JavaScript error.

### Follow-up and calibration

Ask which responsibility belongs to the store action and its persistence boundary and which belongs to the dispatch list and driver dialog. Then remove one assumption the candidate relied on: validated input, stable identity, one caller, one process, or unchanged scope. Require an updated example, not a new collection of buzzwords.

Award 0 for an unsupported or incorrect answer, 1 for a correct explanation without a discriminating example, and 2 for a correct mechanism plus a counterexample and an appropriately scoped observation. Record separate scores for mechanism, contract, verification, and communication. Do not score an unrun browser or database check as observed evidence. The notes provide a reasoning direction, not a memorization script or a substitute for inspecting the repository.
