# RouteIQ / lucasrouter: Junior system-design and data-model interview

Work one case at a time in approximately 40 minutes. These are six distinct scenarios viewed through this interview round. Select a case you have not recently rehearsed. The [source map](../README.md), [scorecard](../SCORECARD.md), and [project defense](../PROJECT-DEFENSE.md) support your attempt. Afterward use the [separate interviewer notes](../_interviewer/rounds/06-design.md).

## How to run this round

Design the smallest vertical slice that supports this case. Begin with one user journey and two explicit non-goals. Identify the authoritative record, the command that changes it, and the read representation the user sees. Use the current repository architecture as a starting constraint rather than introducing a new service for every noun.

Draw a component diagram with trust and persistence boundaries. Define an API example, a minimal data model, and the consistency rule that matters for the fixture. Walk a successful request, a rejected request, and a failure after part of the work has begun. Separate logical operation identity from delivery or request identity.

The interviewer will increase request volume or introduce another process. Explain which existing assumption fails first. Estimate a bottleneck with declared hypothetical inputs; do not invent measured production traffic or latency. Add caching, batching, indexing, or a queue only when it addresses that stated bottleneck without weakening the invariant.

Deliver a diagram, three example outcomes, one failure-recovery path, and an observability plan. Explain what data you would inspect to distinguish availability from correct domain progress. State the integration evidence still needed before calling the design implemented.

## 01.6.1 — A list changes underneath a selection

**Scenario.** A dispatcher filters the list while a driver updates one stop. The selected row disappears from the visible list. The UI must keep entity identity distinct from its displayed position.

**Starting fixture.** A(id=S1,pending), B(id=S2,delivered); filter=pending; selected=S1; update S1 to delivered.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.6.2 — Two records share a nested address

**Scenario.** A practice fixture gives two stop records the same address object. Editing a draft street unexpectedly changes the other record. Trace aliasing instead of treating every copied object as independent.

**Starting fixture.** S1.address and S2.address refer to X; next={...S1}; next.address.street changes.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.6.3 — Undo arrives after newer work

**Scenario.** A stop is marked delivered, later marked failed, and then an older undo action arrives. This interview uses a synthetic revision contract, not an assertion that the current store has revisions.

**Starting fixture.** S1 revision7 pending; delivered at8; failed at9; undo token expects8.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.6.4 — Proof and status disagree

**Scenario.** A report says a stop is delivered while its required proof field is absent. The candidate must distinguish UI form validation from the domain transition and historical-data policy.

**Starting fixture.** Synthetic rule: delivered requires proofId; input {status:delivered,proofId:null}.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.6.5 — Keyboard focus loses its owner

**Scenario.** A driver opens a dialog, its opener is removed by a list update, and the dialog closes. The exercise concerns a sensible fallback and observable keyboard behavior.

**Starting fixture.** Opener S1 disappears while dialog is open; user presses Escape.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.6.6 — A restored draft has yesterday’s shape

**Scenario.** A local draft saved by an older version lacks a newly introduced optional note field. A startup cast hides the missing value until a control reads it.

**Starting fixture.** Saved {id:S1,status:pending}; new form expects note to be a string.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.
