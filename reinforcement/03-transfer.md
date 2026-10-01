# Transfer the idea into RouteIQ / lucasrouter

## A focused UI story

Propose a status filter for an existing stop list, or characterize its behavior if one already exists. First inspect `DispatchScreen.tsx` and the store: choose the actual list owner rather than adding another global state field by habit.

Write acceptance examples for all/pending/delivered/failed, whitespace search, no results, and a selected stop becoming hidden. Decide whether selection remains available in a detail panel or clears; make that product decision explicit before coding. Counts must be labeled as all stops or visible stops, not switch meaning accidentally.

## Evidence to collect

| Boundary | Evidence |
|---|---|
| Projection | Pure tests for predicate combinations and non-mutation |
| Component | A test that changes the filter and asserts user-visible rows and empty text |
| Accessibility | Keyboard operation and an understandable filter label |
| Selection | A test for the agreed hidden-selected-stop behavior |

Use the existing J2 component-test foundation if the app lacks the required test setup. The model's reference identity assertion is not evidence that React renders fewer times. If you make a performance claim, capture a before/after trace in the same environment.

## Review a proposed change

An agent proposes `const visible = stops.sort(byLabel).filter(matches)` and stores `visibleCount` separately in Zustand. Identify the mutation, the unrequested order change, and the second source of truth. Ask for a smaller diff. Then explain when a stored count might be justified, such as a server-provided total for a partial page.

## Evidence boundary

Work in your own practice branch or isolated workspace and inspect existing changes first. Do not switch or reset the owner's working tree. Describe any uncommitted source your exercise depends on; a worktree from HEAD does not include it. Use the existing package scripts after reading their targets. Run one repository at a time, with disposable fixtures for data tests. The authoring pass supplied exercises, not these application changes.

For a TS repository, sketch the input/output types and one discriminated union before implementation. Name which invalid input still needs runtime validation. For GitJira's JS code, use its existing JSDoc/shared-schema conventions instead of converting the app to TypeScript.
