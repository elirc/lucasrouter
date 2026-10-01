# A bounded application change

## Story: undo one delivery without overwriting a newer action

Write a product contract for an undo offered from a delivery confirmation. State its lifetime, the fields it restores, the effect on the audit/delivery log, and the feedback when it is no longer applicable. Inspect the existing `undoStop` behavior before proposing changes; the right deliverable may be a regression test documenting that behavior rather than introducing per-stop revisions.

Acceptance cases: one delivery then undo; another stop edited before undo; the same stop edited again; the stop removed by a new plan; reload during the offer; and keyboard activation of the offer. Decide how stale undo is explained without silently overwriting newer information. Keep proof-image retention and serialization in scope only to the extent the chosen fields require it.

Second constraint: the product owner asks for keyboard-friendly selection among visible stops. Integrate the lab's policy with the actual list semantics, not with a custom replacement for DriverDialog. Confirm whether the intended pattern uses ordinary Tab navigation or arrow navigation before adding key interception. Include empty-list and disappearing-target behavior.

Exclude route optimization changes and performance rewrites. Deliver a focused UI/state change with separate unit and component evidence. For browser-only behavior, record the exact keyboard sequence and actual focus target.

## Delivery contract

Produce a one-page proposal, an acceptance table, a focused practice diff, and a verification note. If the relevant code already behaves correctly, deliver the missing regression or characterization evidence instead of rewriting it. If setup is blocked, deliver the proposed diff and precise reproduction plan with runtime status pending; do not mark the capstone implemented.

Before accepting an agent's patch, explain the smallest failing example yourself. Limit its allowed files, name an excluded adjacent feature, and ask it to list assumptions. Review the whole diff, including removed assertions and changed defaults. Your final explanation must distinguish the application's existing guarantees from the new teaching model's choices.

Completion requires a before/after example visible at the right boundary, one unrelated behavior preserved, and one limitation stated plainly. “All tests pass” is not sufficient if the relevant case was never in the suite. End with a 90-second explanation aimed at a teammate who did not see these exercises.
