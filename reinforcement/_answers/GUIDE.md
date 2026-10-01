# Sealed reasoning: RouteIQ / lucasrouter

Read after writing your own attempt. This guide answers only the new reinforcement exercises; it does not disclose the existing incident solutions.

## Model reasoning

Normalize the search once, validate the status once, and combine two predicates inside `filter`. `filter` preserves order and element references while creating a new array. Sorting was never requested; mutating the source to sort is especially wrong because other views share it.

For the A/B/C prediction, all/empty gives A,B,C; pending/empty gives A; all/` B ` gives B when the fixture labels are A/B/C; delivered/`c` gives none. There is no OR between the conditions. An unsupported status is a contract error rather than a valid empty result.

## What to look for in the app transfer

The state owner should follow the intended lifetime of the filter. A filter used by one screen may be local state; a shareable URL filter has a different owner. A second stored visible count introduces synchronization work unless it represents a distinct server fact. Preserve the chosen selection behavior and label count scope clearly.

## How to make the test meaningful

Break AND into OR: the combined-filter test should fail. Replace `filter` with an in-place mutation: the frozen-input or unchanged-input assertion should fail. Return cloned rows: the reference assertion should fail. These are contract checks, not claims that cloning always harms React.

For the TS drill, a readonly array prevents ordinary mutating array methods through that type. It is not a runtime freeze and does not automatically make every nested object deeply immutable.

## Reference limits

`reference.mjs` implements the simplified contract in this pack. It is not a production patch or a recommendation to replace existing library behavior. The app transfer requires its own tests, source review, and runtime evidence.
