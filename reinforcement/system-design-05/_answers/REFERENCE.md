# Reference reasoning: RouteIQ / lucasrouter

Attempt the [design interview](../06-interview-lab.md) first. This is one defensible direction, not a unique correct architecture or a production patch.

## The core answer

Keep a simple command API plus relational authority, while retaining a local pending queue for responsiveness. The invariant remains: **One accepted delivery command changes one authorized stop once, and an older offline command cannot silently overwrite a newer accepted stop state.**

Start by preserving the current local interaction as a responsive draft surface. Add an explicit distinction between pending local intent and accepted shared state. A localStorage write cannot authorize a driver, settle conflicts across devices, or provide the shared history needed after a browser is cleared.

In the proposed service, the client sends a command identity, stop identity, expected stop revision, and desired outcome. The server derives driver/route access from trusted context, validates the outcome and proof policy, then commits the stop transition and command receipt together. The receipt lets a response-lost retry return the same accepted result. A reused command identity with a different payload is a conflict, not a second action.

An offline queue preserves the user's intent but does not promise eventual acceptance. If another actor changes the stop before reconnect, the expected revision can fail. Keep the draft and explain the conflict; do not silently replay until it overwrites newer work. Undo is a new authorized command against current state, not restoration of an entire old route snapshot.

Proof media has a separate lifecycle. Upload to a bounded, authorized location and pass a proof reference to the command. Define cleanup for uploaded-but-unattached media and behavior for an accepted outcome whose optional media becomes unavailable. A file upload and a database commit are not automatically one transaction.

## The failure answer must name the boundary

Test the crash window after the stop/receipt commit and before response delivery. Then retry the same identity and inspect both the stop revision and event count. A browser-only test of the pending badge cannot establish durable deduplication. Separately test unauthorized proof references and an offline revision conflict.

Reject an explanation that replaces this with a technology name. A queue does not by itself decide ownership, a transaction does not automatically include an external effect, and a cache key does not enforce authorization. Ask the learner to put the failure between two concrete steps and show the accepted, rejected, and unchanged state.

## Capacity and tradeoff answer

A 120 reads/s exercise does not justify sharding by itself. First bound route result size, examine the scoped query, and measure serialization and client polling costs. The 20.736 GB figure excludes indexes, media, replication, receipts beyond the assumed payload, and backups. Media can dominate storage; estimate it separately rather than using this number as a whole-system bill.

The accepted cost is: The chosen design requires conflict UX, durable receipt retention, authenticated device requests, and a recovery policy for partial media workflows. The revisit trigger is: Reconsider the delivery mechanism when measured reconnect volume or notification latency makes polling unsuitable; retain the same command authority and identity rules.

Accept alternatives that meet the same clarified contract and expose their costs. Do not reward unnecessary components or a fabricated production traffic number. The strongest follow-up asks what requirement would make this answer wrong and how the candidate would detect that change.

## What counts as completion

The learner can explain one happy path, one competing or failed path, the authoritative data identity, and one calculation with units. They can name the difference between inspected source and proposed design. An application guarantee still needs the corresponding runtime evidence. Historical tests remain historical; no new application verification is implied by reading these notes.
