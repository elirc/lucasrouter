# Decision record and worked design journal

## ADR: the boundary chosen for this case

**Status:** proposed teaching decision, not an approved application migration.

**Context:** A driver opens an assigned route, records a delivery outcome while disconnected, reconnects, and sees whether the command was accepted or needs reconciliation. The dispatcher sees accepted server state with a visible freshness indicator.

**Required invariant:** One accepted delivery command changes one authorized stop once, and an older offline command cannot silently overwrite a newer accepted stop state.

**Decision:** Keep a simple command API plus relational authority, while retaining a local pending queue for responsiveness.

**Alternative considered:** Require online-only commands against the same authoritative service. This removes offline replay and conflict-resolution work, but prevents updates during connectivity loss. It fits a workflow where continuous connectivity is acceptable; verify that requirement with drivers before choosing it.

**Pitfall to reject:** Use browser state synchronization as the shared source of truth or introduce a general event-sourced platform before the command contract is clear.

**Cost accepted:** The chosen design requires conflict UX, durable receipt retention, authenticated device requests, and a recovery policy for partial media workflows.

**Revisit trigger:** Reconsider the delivery mechanism when measured reconnect volume or notification latency makes polling unsuitable; retain the same command authority and identity rules.

An alternative can become appropriate under a different workload or requirement. The purpose of the record is to make that change legible. A trigger should refer to measured contention, an operating requirement, a query/evaluation result, or a clear product constraint—not a preference for a more fashionable architecture.

## Worked journal: a fictional design-learning entry

The following paragraph is a teaching narrative, not a claim about the user's work or a new production incident.

I first thought cross-tab synchronization was almost the same problem as cross-device synchronization. Drawing the owners changed that conclusion: the browser could preserve a draft, but it could not decide which actor was authorized or which competing revision should win. I kept the responsive local behavior and moved only accepted shared transitions behind a command boundary. The additional receipt looked like overhead until I traced a response lost after commit; without it, the user could not safely distinguish a retry from a new action.

My next step would be to turn the strongest claim into a falsifiable example. I would state the initial values, put the competing action or failure at a specific boundary, and identify what must remain unchanged. If the source already implements the desired mechanism, I would characterize that behavior and preserve its evidence rather than propose a replacement just to make the exercise look larger.

I would also separate three levels of confidence: the diagram appears coherent, the code contains a relevant mechanism, and an executed test demonstrates the claimed outcome. Each is useful, but they are not interchangeable. The capacity worksheet supplies another kind of evidence: arithmetic under explicit assumptions. It does not fill in a missing benchmark or prove a service meets a latency objective.

## Write your own decision journal

Record the first design you considered, the concrete counterexample that changed it, and the simpler boundary you can now explain. Include one downside of the chosen design. Then change a requirement—higher contention, stricter freshness, a second process, revoked access, or an unavailable dependency—and explain whether the decision still holds.

Keep the actual source observation next to any claim about existing behavior. Label proposed APIs and schemas as proposed. If you later discuss this in an interview, distinguish reading, modeling, implementation, and runtime verification, and identify the artifacts you personally produced.
