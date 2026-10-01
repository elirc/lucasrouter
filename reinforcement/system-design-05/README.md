# 01. RouteIQ / lucasrouter: system design

**Design case:** Design reliable delivery updates across devices and intermittent connectivity.

This track adds a focused system-design route to the [existing reinforcement pack](../README.md), [interview practice](../interview-03/README.md), and [worked learning material](../guided-04/README.md). It preserves them all. Start with one user journey, one hard invariant, and one failure timeline; then justify each component you add.

## Study route

| Step | Material | Artifact to produce |
|---|---|---|
| 1 | [Worked architecture](01-worked-design.md) | Explain authority and every arrow |
| 2 | [API and data contracts](02-contracts-data.md) | Request examples, keys, consistency rules |
| 3 | [Failure and recovery lab](03-failure-recovery.md) | Crash/race trace and proof plan |
| 4 | [Capacity and scaling](04-capacity.md) | Reproduce arithmetic and challenge assumptions |
| 5 | [Decision record and journal](05-design-decisions.md) | Defend one choice and a revisit trigger |
| 6 | [Timed interview](06-interview-lab.md) | A coherent forty-five-minute design |
| Review | [Separate reference notes](_answers/REFERENCE.md) | Compare guarantees, not diagram size |

The [shared design guide](<../../../opusorganize/junior-reinforcement/system-design-05/DESIGN-METHOD.md>) covers requirements, consistency, ownership, caches, queues, storage, recovery, and communication. The [all-project route](<../../../opusorganize/junior-reinforcement/system-design-05/README.md>) gives the progression across all ten cases.

## What the inspected source establishes

The store declares localStorage persistence under routeiq-v1, separates persisted from ephemeral fields, and installs cross-tab storage synchronization. Its header explicitly discusses a remaining cross-tab lost-update window. Delivery logs and undoStop are visible store concepts. These are browser-state mechanisms; they are not evidence of a durable multi-device command service.

- [src/store/useAppStore.ts](<../../src/store/useAppStore.ts>)
- [src/lib/deliveryValidation.ts](<../../src/lib/deliveryValidation.ts>)
- [src/components/driver/DriverDialog.tsx](<../../src/components/driver/DriverDialog.tsx>)

Everything labeled proposed, design contract, target architecture, exercise load, or journal is teaching material. Diagrams show a worked design, not an assertion that every depicted component is deployed. API paths, fields, and storage keys below are illustrative contracts unless the source observation explicitly says otherwise. No migration or application implementation is performed by this track.

**Invariant to defend:** One accepted delivery command changes one authorized stop once, and an older offline command cannot silently overwrite a newer accepted stop state.

Human mastery remains unassessed. A correct capacity calculation or a source trace does not establish production throughput or complete a learner's design defense.
