# Practice exercises

## Three graded checkpoints

Checkpoint A is code reading: draw the call graph and identify the first setter. Checkpoint B is implementation: add a regression for valid `Other` plus an overlength note and prove proof/event parity. Checkpoint C is design: describe the authenticated server contract and explain which client checks remain useful. A complete solution must include an input, expected output, side-effect assertion, and limitation for each checkpoint.

These exercises progress from reading to design. Use the staged source and run a focused test after each change.

1. Trace a delivery. Starting from the driver component, write the function names in order until localStorage persistence. Mark where the stop status, proof, and event are each created. Compare your trace with the code map. Success means you can point to one shared mutation boundary rather than describing the screen vaguely.

2. Predict sanitizer output. For `{ method: 'door', recipientName: '  Jo  ', note: ' ', photo: 'blob:camera' }`, write the expected object before running a test. Explain why a blob URL is dropped even though it may display in the current tab. Then add the case to the validation test if your prediction is wrong.

3. Add a failure-path regression. Call `isFailureReason` with an object and with `'No one home'`. If you choose to test the store, seed a known stop, call `recordFailure` with an invalid reason through a cast to `unknown`, and assert the stop and log are unchanged. This demonstrates why runtime tests need values TypeScript would reject.

4. Debate limits. Change the note limit in a branch to 50 characters. List which UX copy, exports, and tests would need review. Decide whether the limit belongs in a shared constant, and explain the migration impact for already persisted notes.

5. Extend safely. Add a new delivery method only if you update the type, validator set, UI option, report labels, and tests. Use search to find every consumer. A partial update is a realistic mid-level failure: the form may accept a value while CSV labels and summaries do not.

6. Review the architecture. Sketch how the same contract would be enforced in a server route with a schema parser. Identify which client checks remain useful and which security decisions must move server-side. Keep the demo’s localStorage limitations explicit in your answer.
