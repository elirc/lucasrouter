# Sealed reasoning guide

Attempt both labs and write the investigation hypotheses before reading. These answers concern only this expansion, not the existing Opus incidents.

## Lab A: ownership of reversal

An edit token names the row and the revision produced by that edit. Undo succeeds only while that revision is still current. A successful undo restores the old value but advances the revision again; rewinding a version would allow stale commands to appear current later. Another row's edit does not invalidate this row-specific token.

In the Alpha→Depot→Dock sequence, the first token must conflict. If B alone changes, undo A may succeed while preserving B's newer state. Missing and conflict outcomes return the original collection reference because nothing changed. Successful paths create a new array and a new changed row while preserving other rows.

The real app may implement undo with different invariants and without per-record versions. Compare its event log and plan lifetime instead of pasting the lab into Zustand. A valid transfer can be a test that makes an existing product decision explicit.

## Lab B: selection policy is not DOM focus

Filter disabled items, then navigate among the remaining IDs. Next from the last wraps to the first; previous from the first wraps to the last. A missing current target uses first for next and last for previous. No enabled targets returns null. Unknown commands are contract errors even for an empty list.

This helper never calls focus, checks accessibility roles, opens a modal, or waits for React to render. Those are separate integration obligations. A correct helper can coexist with an inaccessible component if the event is not wired, the element is unmounted, or the native modal contract is replaced incorrectly.

## Compare mechanisms, not spelling

For each difference from the reference, classify it as another valid implementation, a violated contract, or an assumption absent from the exercise. Show a concrete input for the second category. If you cannot produce one, do not call a stylistic preference a correctness defect.

Return to the application source before adopting a model. The reference deliberately omits infrastructure guarantees that would require browser, database, or provider evidence. It is an executable explanation, not a production patch.
