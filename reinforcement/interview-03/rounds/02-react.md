# RouteIQ / lucasrouter: React component and interaction interview

Work one case at a time in approximately 35 minutes. These are six distinct scenarios viewed through this interview round. Select a case you have not recently rehearsed. The [source map](../README.md), [scorecard](../SCORECARD.md), and [project defense](../PROJECT-DEFENSE.md) support your attempt. Afterward use the [separate interviewer notes](../_interviewer/rounds/02-react.md).

## How to run this round

Sketch a small React view for this case using the project's existing component style. Start with state ownership: which values are server observations, local drafts, selection, request status, or derived display values? Draw the parent/child boundary and identify the user event that starts the operation. Do not import server-only domain code into the browser to reuse a convenient function.

Write a state table before JSX. Include initial, pending, success with data, empty success, failure, and stale/conflict behavior where relevant. Explain which states cannot occur together and how the component prevents an impossible combination. Keep changes tied to an explicit user event separate from synchronization with an external subscription or resource.

The interviewer will change the selected entity or unmount the view while work is pending. Show what happens to an old response and to any event listener or subscription. Explain the identity of list keys and controlled form values. Add a keyboard-only route through the primary action and describe where an error message should be discoverable.

Deliver a component outline, a transition table, and a user-level test plan. If you did not run a browser, label the focus, timing, and accessibility observations as proposed rather than verified.

## 01.2.1 — A list changes underneath a selection

**Scenario.** A dispatcher filters the list while a driver updates one stop. The selected row disappears from the visible list. The UI must keep entity identity distinct from its displayed position.

**Starting fixture.** A(id=S1,pending), B(id=S2,delivered); filter=pending; selected=S1; update S1 to delivered.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.2.2 — Two records share a nested address

**Scenario.** A practice fixture gives two stop records the same address object. Editing a draft street unexpectedly changes the other record. Trace aliasing instead of treating every copied object as independent.

**Starting fixture.** S1.address and S2.address refer to X; next={...S1}; next.address.street changes.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.2.3 — Undo arrives after newer work

**Scenario.** A stop is marked delivered, later marked failed, and then an older undo action arrives. This interview uses a synthetic revision contract, not an assertion that the current store has revisions.

**Starting fixture.** S1 revision7 pending; delivered at8; failed at9; undo token expects8.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.2.4 — Proof and status disagree

**Scenario.** A report says a stop is delivered while its required proof field is absent. The candidate must distinguish UI form validation from the domain transition and historical-data policy.

**Starting fixture.** Synthetic rule: delivered requires proofId; input {status:delivered,proofId:null}.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.2.5 — Keyboard focus loses its owner

**Scenario.** A driver opens a dialog, its opener is removed by a list update, and the dialog closes. The exercise concerns a sensible fallback and observable keyboard behavior.

**Starting fixture.** Opener S1 disappears while dialog is open; user presses Escape.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.


---

## 01.2.6 — A restored draft has yesterday’s shape

**Scenario.** A local draft saved by an older version lacks a newly introduced optional note field. A startup cast hides the missing value until a control reads it.

**Starting fixture.** Saved {id:S1,status:pending}; new form expects note to be a string.

Your user is a dispatcher or driver; the affected surface is the dispatch list and driver dialog. Keep route and driver identity visible in the model. The user-facing operation is to record a delivery outcome.

### Project-specific follow-through

Start at the [project source map](../README.md), then trace the store action and its persistence boundary. Locate one current symbol that supports your explanation and one assumption the fixture adds. If the application already handles the scenario, characterize that behavior instead of inventing a fix. Record the repository state you inspected so later changes do not silently invalidate your answer.

Before opening the interviewer notes, write a result for the supplied fixture and one counterexample of your own. Ask the interviewer to vary exactly one fact, then explain what changes and what stays invariant. Finish with one sentence naming the evidence that would be needed to move from this practice answer to an application claim.

**Evidence to keep:** your first prediction, the artifact requested in this round, the strongest follow-up question, your revised explanation, and any check that remains unrun. Repeating the same answer faster is not the goal; surviving a changed input is.
