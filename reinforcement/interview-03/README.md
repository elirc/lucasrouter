# 01. RouteIQ / lucasrouter: interview preparation

A dispatch interface lets a dispatcher inspect routes and a driver report stop outcomes. Explain how a user action becomes stored state, how list views are derived, and what an undo operation actually restores.

This is an additive third block. Keep the [original foundations](../README.md) and [second practice block](../expansion-02/README.md). This block focuses on explaining, implementing, testing, and defending decisions under interview conditions. The scenarios are synthetic practice cases anchored to the source map, not claims of newly discovered application bugs.

## Start with one interview round

| Round | Practice | Timebox |
|---|---|---|
| 1 | [JavaScript reasoning and live coding](rounds/01-javascript.md) | 30 min per case |
| 2 | [React component and interaction interview](rounds/02-react.md) | 35 min per case |
| 3 | [TypeScript, schemas, and public contracts](rounds/03-typescript.md) | 25 min per case |
| 4 | [Asynchronous JavaScript and API boundaries](rounds/04-async-api.md) | 30 min per case |
| 5 | [Debugging and test-design interview](rounds/05-debugging.md) | 35 min per case |
| 6 | [Junior system-design and data-model interview](rounds/06-design.md) | 40 min per case |
| 7 | [Code-review and take-home defense](rounds/07-review.md) | 30 min per case |
| 8 | [Project explanation and behavioral interview](rounds/08-behavioral.md) | 25 min per case |

Each round has six project scenarios. That makes **48 scenario/round combinations**, not 48 unrelated production incidents. Revisit the same situation from different engineering roles: an algorithm can be correct while its UI ownership, API scope, or verification claim is wrong. Interviewer guidance is kept in a separate folder; close it until after your attempt.

Use the [coding challenge](coding/README.md), [study plan](STUDY-PLAN.md), [project defense](PROJECT-DEFENSE.md), and [scorecard](SCORECARD.md). The three complete mocks are [frontend](mocks/frontend.md), [full stack](mocks/full-stack.md), and [project defense](mocks/project-defense.md). The [all-project interview route](<../../../opusorganize/junior-reinforcement/interview-03/README.md>) explains how to choose projects without trying to finish everything in one sitting.

## Six scenarios

1. **A list changes underneath a selection:** A dispatcher filters the list while a driver updates one stop. The selected row disappears from the visible list. The UI must keep entity identity distinct from its displayed position.
2. **Two records share a nested address:** A practice fixture gives two stop records the same address object. Editing a draft street unexpectedly changes the other record. Trace aliasing instead of treating every copied object as independent.
3. **Undo arrives after newer work:** A stop is marked delivered, later marked failed, and then an older undo action arrives. This interview uses a synthetic revision contract, not an assertion that the current store has revisions.
4. **Proof and status disagree:** A report says a stop is delivered while its required proof field is absent. The candidate must distinguish UI form validation from the domain transition and historical-data policy.
5. **Keyboard focus loses its owner:** A driver opens a dialog, its opener is removed by a list update, and the dialog closes. The exercise concerns a sensible fallback and observable keyboard behavior.
6. **A restored draft has yesterday’s shape:** A local draft saved by an older version lacks a newly introduced optional note field. A startup cast hides the missing value until a control reads it.

## Actual source to inspect

- [src/lib/types.ts](<../../src/lib/types.ts>)
- [src/store/useAppStore.ts](<../../src/store/useAppStore.ts>)
- [src/components/dispatch/DispatchOverview.tsx](<../../src/components/dispatch/DispatchOverview.tsx>)
- [src/components/dispatch/DispatchScreen.tsx](<../../src/components/dispatch/DispatchScreen.tsx>)
- [learn/00-onramp.md](<../../learn/00-onramp.md>)
- [training/ladder/J2-component-test-foundation.md](<../../training/ladder/J2-component-test-foundation.md>)

Read current symbols and callers before attributing a guarantee to the application. A lab fixture may introduce an explicit version, policy, or field that the app does not have. The local Node challenge verifies its written teaching contract only. React sketches, TypeScript/JSDoc sketches, database plans, and browser claims require their own checks.

The intended audience is a junior software engineer practicing fundamentals and project explanations. Scoring is educational and is not an employer's hiring rubric or a guarantee of interview outcomes. Personal mastery starts **not assessed**.
