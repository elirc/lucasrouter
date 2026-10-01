# Tests that reject a plausible wrong implementation

## Scenario: an undo clears somebody else's work

Synthetic timeline: row A revision 4 has label Alpha; edit A to Depot makes revision 5; another change edits A to Dock at revision 6; the first action's Undo button is still visible. A proposed fix restores a cached whole-array snapshot. Predict what happens to A and to unrelated row B, which was also edited in the meantime.

Hypothesis one is an overly broad snapshot restore. Hypothesis two is that the token identifies only the row, not the specific revision. Create a test that separates them: edit B only, then try undo A; separately edit A again, then try undo A. The first should not prohibit a valid row-specific undo; the second should report the conflict under the lab's policy.

## Scenario: keyboard tests pass but focus is lost

The pure helper returns the correct next ID, but the component renders its target a frame later. A test that checks only the helper cannot detect the missing browser focus. Specify an assertion using the actual focused element after the render, plus a case where the target disappears. Inspect the real modal lifecycle instead of adding a delay guessed from one machine.

## Investigation method

Start with two competing hypotheses. For each, predict an observation that would be different if it were true. Inspect the smallest relevant boundary before editing. Preserve the original failing input and record whether you observed a symptom, reproduced a mechanism, or merely reasoned about it.

Build three layers of evidence: a pure contract case; the real module or adapter with controlled dependencies; and one user-visible or database-visible outcome. State explicitly which layers you ran. Avoid replacing the boundary under investigation with a mock that already assumes the desired answer.

For timing cases, control a clock or promise rather than sleeping. For data cases, include at least two organizations or two independent entities where relevant. For mutation cases, assert both the returned outcome and unchanged unrelated state. Include a negative test that would reject the tempting shortcut named in the scenario.

After the first passing fix, introduce one small wrong variation in your own lab solution, run the relevant check, and revert only that variation. Keep the failing assertion as evidence that the test can detect the mechanism. Do not seed defects in the application's main working tree.

Write a short handoff: symptom; reproduction input; confirmed cause or remaining hypotheses; smallest change; tests actually run; remaining integration risk. A reviewer should be able to resume without reading your entire chat history.
