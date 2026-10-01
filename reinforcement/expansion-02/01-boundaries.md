# Boundary lessons: Undo ownership and keyboard interaction

## Undo is a new command, not time travel

Find `undoStop` and the delivery-event handling in `src/store/useAppStore.ts`. Record which fields it restores, what it logs, and what happens to delivery proof. Do not assume that restoring status restores every earlier field. Write a before/after record for delivered, failed, and already-pending stops, using the actual implementation to resolve uncertainty.

A useful product question is whether undo means “reverse my most recent action” or “set this record to an earlier value regardless of later work.” Those meanings diverge when another action has occurred. The synthetic versioned-edit lab intentionally chooses the first. Its per-record version is a teaching device, not a claim that the current stop model has this field.

## Identity carries obligations

An undo token should identify both the object and the change it is entitled to reverse. A timestamp alone can collide, and an array index can point to a different stop after sorting. Draw a sequence: edit A; edit B; undo A. Explain why a global snapshot of the entire array can overwrite B even when the UI only offered to undo A.

The reference lab updates one row and preserves unrelated object identities. That is an observable contract, not proof of render performance. If you claim fewer renders, measure the component tree separately. Consider the memory cost of retaining full photo-bearing records in a long-lived undo history.

## Focus has an owner and a lifetime

Read `DriverDialog.tsx`: open state, panel mounting, native dialog behavior, initial focus, and return focus on close. Explain why a list-navigation helper must not replace the native dialog's modality or its focus lifecycle. Selecting the next ID is only a policy decision; moving DOM focus is a separate browser action that can fail if the node no longer exists.

Now remove a focused list item while the dialog is open. Choose a documented fallback: next available item, previous item, or the list container. There is no universally correct choice independent of the interaction. Test the chosen behavior with the keyboard, and retain a visible focus indicator.

## Persisted state changes the problem

Inspect whether undo state survives reload in this store. Explain what can go wrong if an old undo token survives while the underlying plan is replaced. A token meaningful within one view lifetime is not automatically meaningful after importing or synchronizing another plan. Describe a generation identifier or invalidation event you would consider, and identify the migration boundary before adding it.

## Make the boundary visible

For each source trace, record the caller, input representation, validation, state owner, returned value, and visible user consequence. Put a question mark beside every arrow you inferred rather than located. Resolve one question by reading its caller and one by proposing a focused test. A diagram full of accurate filenames can still miss an unhandled outcome.

End with three sentences: the invariant, the failure that would violate it, and the smallest observation that would detect the violation. Use [the source map](README.md) to keep this exercise attached to the actual repository.
