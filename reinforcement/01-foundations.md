# Foundations: Derived state, identity, and immutable transformations

## One collection, several views

Read the Stop type in `src/lib/types.ts`, the store in `src/store/useAppStore.ts`, and `DispatchOverview.tsx`. Make a three-column table: canonical data, selection/UI state, and derived values. Place the stop collection, selected stop ID, visible stops, and delivered count. Explain what could become inconsistent if both the collection and a second copied count were independently updated.

The new lab uses a smaller Stop shape: `{id, label, status}`. It deliberately does not use the app's full domain type. Label that boundary in your notes.

## Predict before running

Use stops A pending, B delivered, and C failed. Write the visible IDs for: all statuses with empty search; pending with empty search; all statuses with search ` B `; and delivered with search `c`. Are the status and search predicates combined with AND or OR? What should happen when no stop matches?

Now compare these expressions without running them: `stops.sort(...)`, `[...stops].sort(...)`, `stops.filter(...)`, and `stops.map(s => ({...s}))`. Which changes the original array? Which preserves the identities of the stop objects? A new array alone does not imply new element objects. Explain why this matters to a selected-stop lookup and a memoized row.

## Read the actual component boundary

Trace which store fields `DispatchScreen` and `DispatchOverview` subscribe to. List a change that should update the counts but not the selected ID, and one that should update selection but not counts. Do not claim a render optimization from this source reading alone: a render trace is separate evidence.

## Small TS drill

Write a `StopStatus` union from the real type and a typed filter input with an explicit `all` variant. Explain why an unknown string from a URL or persisted storage still needs checking at runtime. Sketch a function that accepts a readonly collection; explain what readonly does and does not do to nested objects.

## Before you code

Write one prediction you are least sure of and name the smallest observation that would settle it. Distinguish a fact you read in source from behavior you actually ran. Use the source map in [README](README.md) to check the exact files.
