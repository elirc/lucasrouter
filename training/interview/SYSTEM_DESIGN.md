# System design: RouteIQ at 50× scale, across devices, for enterprise fleets

**Prompt (interviewer reads aloud):** "RouteIQ today is one Next.js app. State lives in the dispatcher's browser, synced to driver tabs on the
*same device* through `localStorage` events. A placeholder optimizer runs in a serverless function. A national carrier wants it for
200 depots, 60k stops a day, 3,000 drivers on their own phones, dispatchers on shared office PCs, and SSO. Take it there."

## Expected shape of a strong answer (the candidate drives, 35 min)
1. **What must change first:** the storage model. Today it's single-device and whole-slice last-writer-wins
   (`useAppStore.ts` header). Stops, routes and deliveries become server data with per-entity writes and versions.
2. **Data model:** tenant → depot → plan(day) → route(driver) → stop. Deliveries are an append-only event log (it already exists client-side:
   `DeliveryEvent`, `MAX_LOG_EVENTS`). Photos go to object storage, not JSON blobs.
3. **Sync to phones:** offline-first queue on the device, idempotent delivery events (client-generated ids, which already look like
   `newEventId`), server as source of truth, SSE/WS or push for plan changes. See curriculum 02 (idempotency) and 08 (realtime fan-out).
4. **Optimizer:** real VRP solves take minutes, so move to an async job API (`POST /plans/:id/optimize` → 202 + job id → progress events).
   Keep the synchronous `/api/optimize` contract (`docs/ALGORITHM_INTEGRATION.md`) for small fleets. Replace the wall-clock repair
   budget with a deterministic iteration cap plus a job timeout.
5. **Dispatcher frontend at 1,500 stops per depot view:** canvas/clustered markers with an accessible list as the primary keyboard path,
   a virtualized panel, fine-grained selectors (ladder S1).
6. **Multi-tenancy + SSO:** tenant scoping on every query, role = dispatcher/driver/admin, drivers see only their route.
7. **Operations:** RUM for INP/LCP/CLS per route and device class, API SLOs (optimize p95, delivery-event ingest lag), per-tenant
   rollout flags (ladder S2).

## Pressure points (interviewer, pick 4 and push on the mechanism)
- "A driver marks S017 delivered offline, then the dispatcher reassigns S017 to another driver before the phone reconnects. What does
  each screen show after sync? Who wins, and where is that rule enforced?"
- "The solver job dies at minute 3 of 4. What does the dispatcher see? What if it finishes after the dispatcher has already hand-edited
  the plan?" (Hint: today's `editedSinceOptimize` flag.)
- "Your dispatcher view re-renders the whole panel on every selection today (ladder M1). At 1,500 stops, what's your per-interaction
  budget and how do you enforce it in CI?"
- "Photos: 3,000 drivers × 60 deliveries × 40 KB. Where do they go, who can read them, and how long do you keep them?"
- "A tenant's depot is in another region. Where does its data live, and what happens to optimize latency?"
- "How do you migrate existing demo users' `routeiq-v1` localStorage into accounts, and do you need to at all?"

## Red flags
Keeping localStorage as the source of truth "with sync". Synchronous 4-minute HTTP optimize calls. Canvas markers with no keyboard path.
"We'll add caching" with no named invalidation event (curriculum 06).
