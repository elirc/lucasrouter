# Types, runtime values, and compatibility

Design `EditResult` with applied, conflict, and missing variants. Only applied may expose an undo token. A consumer must not be able to display “Undone” after a conflict by reading a loosely typed optional boolean.

Sketch distinct types for StopId, a collection position, and a revision. Branded string types can prevent accidental interchange in TypeScript, but a value from storage still needs validation. Identify which real delivery fields are nullable and which are omitted. Do not use a non-null assertion to avoid deciding what a missing selected stop means.

For keyboard policy, define a union of four commands and a return type that explicitly permits no focus target. The actual DOM consumer must check that the selected element is still connected and focusable. Show the difference between a type saying an ID exists in a past array and a runtime guarantee about today's DOM.

## Contract worksheet

Write five concrete examples before coding: valid input, missing input, explicitly empty input, wrong primitive type, and a value valid yesterday but stale now. Record whether each is rejected, normalized, ignored, or accepted with a distinct outcome. “TypeScript catches it” is insufficient for JSON, browser storage, events, or a database row returned through an unchecked cast.

Use a discriminated union for outcomes that require different UI behavior. In a TypeScript practice file, make a consumer switch exhaustive and demonstrate which new variant should force a review. In GitJira, use its JSDoc and schema conventions rather than converting the project. Keep proposed type snippets in your practice work until you have verified the actual application contract.

Choose one backwards-compatibility risk: an old caller omits a new field, a saved object has an older shape, or an older client interprets a new outcome as success. Describe a migration or fallback and a test using an old fixture. A renamed property is a contract change even when all currently compiled callers are updated.
