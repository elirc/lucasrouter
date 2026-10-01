# 01. RouteIQ / lucasrouter: second practice block

The first block derived a filtered stop view. This block asks what happens after the user changes a stop, tries to undo it, or navigates a changing set of controls without a mouse.

This expansion follows the [original reinforcement pack](../README.md). Keep both: the first pack establishes a small mental model; this block asks you to combine boundaries, reject plausible mistakes, and explain evidence. All new contracts below are teaching contracts unless a paragraph explicitly describes inspected application source. They are not pre-approved production changes.

## Route through the new material

| Session | Work | Result |
|---|---|---|
| 1 · 60 min | [Boundary lessons](01-boundaries.md) | Annotated source trace and three predictions |
| 2 · 75–90 min | [Lab A](labs/a/README.md) | Own solution, edge test, caught mistake |
| 3 · 75–90 min | [Lab B](labs/b/README.md) | Second solution and comparison with A |
| 4 · 60 min | [Types and contracts](02-types-and-contracts.md) | Type sketch, runtime rules, compatibility examples |
| 5 · 75 min | [Testing and debugging](03-testing-and-debugging.md) | Hypotheses, minimal reproducer, evidence limits |
| 6–7 · 2–4 h | [Change capstone](04-capstone.md) | A reviewable practice change or explicit blocked plan |
| 8 · 60 min | [Workbook](WORKBOOK.md) | Six transfer answers and a short oral defense |

The estimate is 9–12 additional hours per project, excluding dependency setup and repeated attempts. Work on one project at a time. Reading a reference answer counts as study, not independent completion.

## Sources to inspect

- [src/lib/types.ts](<../../src/lib/types.ts>)
- [src/store/useAppStore.ts](<../../src/store/useAppStore.ts>)
- [src/components/dispatch/DispatchOverview.tsx](<../../src/components/dispatch/DispatchOverview.tsx>)
- [src/components/dispatch/DispatchScreen.tsx](<../../src/components/dispatch/DispatchScreen.tsx>)
- [learn/00-onramp.md](<../../learn/00-onramp.md>)
- [training/ladder/J2-component-test-foundation.md](<../../training/ladder/J2-component-test-foundation.md>)
- [src/components/driver/DriverDialog.tsx](<../../src/components/driver/DriverDialog.tsx>)
- [src/lib/deliveryValidation.ts](<../../src/lib/deliveryValidation.ts>)

Use current symbols, not old line numbers. Record the commit and any relevant uncommitted source before application work. A new worktree from HEAD does not contain those uncommitted changes. The [shared expansion route](<../../../opusorganize/junior-reinforcement/expansion-02/README.md>) connects all ten projects.

## Two separate levels of proof

The Node labs need no packages or services. Their passing tests establish only the small contract written beside them. Application tests, browser observations, PostgreSQL checks, or a live service drill must be recorded separately. The original application's build was not rerun merely because a teaching model passed. Your learning status begins **not assessed**.
