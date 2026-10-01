# Contracts, data ownership, and consistency

The tables are **proposed design contracts** for the worked case. They are not migration files, verified production schemas, or a claim that these exact endpoint paths exist. Compare them with the [source map](README.md) before any implementation.

## Data model

| Entity | Identity / candidate key | Important fields | Owner or purpose |
|---|---|---|---|
| Stop | (organization_id, stop_id) | route_id, assigned_driver_id, revision, status, proof_ref | Authority for accepted stop state |
| CommandReceipt | (organization_id, command_id) | actor_id, payload_fingerprint, result, created_at | Same logical intent returns the recorded result |
| ProofUpload | (organization_id, upload_id) | owner, object_key, status, attached_stop_id | Tracks upload ownership and orphan cleanup |
| ClientPendingCommand | device-local command_id | expected_revision, draft, retry_state | Pending intent only; never server authority |

Distinguish entity identity from operation identity. A record can receive many commands; a retry of one command should not automatically become a new intent. Include scope where it changes meaning. A globally unique-looking ID still needs authorization, and an opaque identifier should not be normalized as if it were human search text.

## Public API examples

| Illustrative endpoint | Input boundary | Accepted outcome | Other outcomes |
|---|---|---|---|
| GET /routes/{id}/stops | Trusted actor plus route ID; optional complete cursor | 200 scoped current snapshot | 403/404 per access policy; no cross-route data |
| POST /stops/{id}/commands | commandId, expectedRevision, outcome, proofRef | 200 accepted/replayed result with revision | 409 stale revision or identity/payload conflict; 422 invalid outcome |
| GET /commands/{id} | Existing logical command identity | 200 known accepted outcome | 404 or pending according to explicit receipt lifecycle |

For one write, add literal examples of omitted, explicit null, zero, wrong-type, stale, and unauthorized input where meaningful. Do not collapse them with a truthiness default. Return an outcome that lets the UI distinguish rejection, accepted-but-not-yet-observed work, and an uncertain response. A timeout does not prove the effect rolled back.

## Query and constraint review

Propose an index on (organization_id, route_id, stop_id) for route reads and a uniqueness boundary on (organization_id, command_id). A proof reference must be checked for actor/organization ownership; guessing a valid upload ID must not authorize attachment.

Write the actual predicate and order before proposing an index. Compare the read improvement with write/storage cost and use representative data when examining a plan. A complete cursor must match the complete order; a cursor alone does not freeze a changing dataset across requests. An index improves access to data, while a constraint or conditional transition enforces a different kind of rule.

## Consistency worksheet

Fill four rows for the design: authoritative mutation, immediate read after that mutation, another user's projection, and asynchronous notification/progress. For each, state the source of truth, acceptable staleness, and recovery action. Do not label the entire system strongly or eventually consistent without naming which operation the statement concerns.

The invariant to protect is **One accepted delivery command changes one authorized stop once, and an older offline command cannot silently overwrite a newer accepted stop state.**. Identify the exact write predicate, transaction, or durable identity that enforces it. If the rule spans several records, explain why concurrent operations cannot each pass an earlier check and then commit an invalid combination. A transaction boundary and an isolation choice must be examined together.

## Compatibility, retention, and deletion

When adding a field or outcome, describe what an older client or stored object does. A safe proposal can expand readers first, backfill deliberately, and later require the new writer contract; the exact sequence depends on the repository. Do not call a schema sketch a completed migration.

Choose retention separately for authoritative records, command receipts, work intents, audit history, private source material, and cache entries. Expiring a receipt too early can change retry behavior. Keeping every private payload forever can create unnecessary exposure and operating cost. Record the product decision and recovery consequence rather than inventing a universal retention period.
