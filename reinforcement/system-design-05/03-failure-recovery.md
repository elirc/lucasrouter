# Failure and recovery: RouteIQ / lucasrouter

This is a tabletop and integration-planning lab. It introduces no deliberate application defects and does not run infrastructure.

## Worked timeline

| Event or failure point | Authoritative/durable state | User or worker consequence |
|---|---|---|
| Driver queues K while offline | Only local pending intent exists | Show pending, not delivered-confirmed |
| Server accepts K at revision8 | Stop and receipt commit together | Response may still be in transit |
| Response is lost | Accepted state remains at8 | Client outcome is uncertain |
| Client retries K unchanged | Receipt supplies the saved result | Clear the pending marker without a second effect |
| Another old command expects7 | Conditional write rejects | Preserve its draft and show a conflict |

The invariant across the timeline is **One accepted delivery command changes one authorized stop once, and an older offline command cannot silently overwrite a newer accepted stop state.**. Mark which transitions are atomic, which are observations, and which can be delivered again. A repeated message and a repeated effect are not the same thing. Selection, claiming, execution, committing, and acknowledging should remain separate words until the actual implementation proves they share a boundary.

## Focused proof plan

Test the crash window after the stop/receipt commit and before response delivery. Then retry the same identity and inspect both the stop revision and event count. A browser-only test of the pending badge cannot establish durable deduplication. Separately test unauthorized proof references and an offline revision conflict.

Preserve the fixture and initial state. Inject one failure at a named point, inspect all relevant effects, then recover using the same logical identity when the contract requires it. A test that only checks an exception can miss leaked durable changes. A test that mocks the critical repository may assume the property it was intended to establish.

## Three additional disturbances

**Dependency unavailable:** choose the dependency this design actually needs. Specify whether the operation fails, queues durably, serves a permitted stale read, or continues in a reduced mode. Define a bound on fallback work so recovery does not overload the next dependency.

**Duplicate or reordered input:** reuse an operation/event identity and vary delivery order. Explain which replays are harmless, which conflicting payloads must be rejected, and which outcomes require reconciliation. Do not promise exactly-once transport when the guarantee is really one durable effect per accepted identity.

**Old worker or client resumes:** let an earlier owner finish after scope, revision, session, or lease ownership changes. Identify the check at application/commit time that prevents obsolete work from taking ownership. Cancellation at launch is not enough to explain this case.

## Recovery and observability

Track oldest pending client command age when observable, accepted/replayed/conflicted command counts, proof orphan age, and dispatcher snapshot freshness. Avoid logging proof contents or treating a local pending counter as proof of server failure.

Set a hypothetical recovery objective for the authoritative dataset and a separate one for rebuildable projections. State the allowable data-loss window (RPO) and time to useful restored service (RTO), then describe a restore rehearsal that could measure them. Do not claim those objectives are achieved merely because a backup command exists.

After a restore, decide how outstanding receipts, delayed events, and external effects reconcile with the restored state. A database restored to an earlier point can forget a previously accepted operation while an external effect still exists. The recovery plan needs that case, not only row counts after restoring a file.

## Handoff artifact

Write one page containing the failure trigger, expected durable state, exact identity used on retry, distinguishing observation, recovery action, and remaining uncertainty. A teammate should be able to tell whether your evidence comes from source reading, a pure model, a database exercise, or an external integration. Human learning and runtime guarantees remain separate assessments.
