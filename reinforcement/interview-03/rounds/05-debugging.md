# RouteIQ / lucasrouter: Debugging and test-design interview

Work one case at a time in approximately 35 minutes. These are six distinct scenarios viewed through this interview round. Select a case you have not recently rehearsed. The [source map](../README.md), [scorecard](../SCORECARD.md), and [project defense](../PROJECT-DEFENSE.md) support your attempt. Afterward use the [separate interviewer notes](../_interviewer/rounds/05-debugging.md).

## How to run this round

Treat this case as a bug report whose mechanism has not yet been confirmed. Write two competing hypotheses and one observation that distinguishes them. Identify the first boundary you would inspect in the supplied source map. Avoid beginning with a broad rewrite or assuming the case describes a current production defect.

Build a minimal reproduction from the fixture. Preserve the exact input and the ordering of events. Record expected and observed behavior separately. If a necessary dependency is unavailable, specify the smallest integration setup and mark its runtime result pending; a proposed test is not a completed investigation.

The interviewer will offer a patch that makes the visible symptom disappear while leaving the invariant broken. Explain which assertion would reject that patch. Choose between a pure test, adapter test, component test, or database test based on the boundary under investigation, and identify one mock that would make the test uninformative.

Deliver a concise incident note: symptom, hypotheses, distinguishing observation, confirmed or unconfirmed cause, focused change, tests, and remaining risk. Include a before/after example and avoid claiming all adjacent behavior was verified by one focused check.

## 01.5.1 — A list changes underneath a selection

**Scenario.** A dispatcher filters the list while a driver updates one stop. The selected row disappears from the visible list. The UI must keep entity identity distinct from its displayed position.

**Starting fixture.** A(id=S1,pending), B(id=S2,delivered); filter=pending; selected=S1; update S1 to delivered.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.5.2 — Two records share a nested address

**Scenario.** A practice fixture gives two stop records the same address object. Editing a draft street unexpectedly changes the other record. Trace aliasing instead of treating every copied object as independent.

**Starting fixture.** S1.address and S2.address refer to X; next={...S1}; next.address.street changes.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.5.3 — Undo arrives after newer work

**Scenario.** A stop is marked delivered, later marked failed, and then an older undo action arrives. This interview uses a synthetic revision contract, not an assertion that the current store has revisions.

**Starting fixture.** S1 revision7 pending; delivered at8; failed at9; undo token expects8.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.5.4 — Proof and status disagree

**Scenario.** A report says a stop is delivered while its required proof field is absent. The candidate must distinguish UI form validation from the domain transition and historical-data policy.

**Starting fixture.** Synthetic rule: delivered requires proofId; input {status:delivered,proofId:null}.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.5.5 — Keyboard focus loses its owner

**Scenario.** A driver opens a dialog, its opener is removed by a list update, and the dialog closes. The exercise concerns a sensible fallback and observable keyboard behavior.

**Starting fixture.** Opener S1 disappears while dialog is open; user presses Escape.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.5.6 — A restored draft has yesterday’s shape

**Scenario.** A local draft saved by an older version lacks a newly introduced optional note field. A startup cast hides the missing value until a control reads it.

**Starting fixture.** Saved {id:S1,status:pending}; new form expects note to be a string.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.
