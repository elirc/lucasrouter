# System design follow-ups: RouteIQ

Each answer starts from what the code does today, cites it, and names the trade-off. Saying "today it is browser-local" first is not a weakness; it is what makes the rest credible.

## Where the app is now

```
  Browser tab A                              Browser tab B
  +----------------------------+             +--------------------+
  | driver UI  dispatcher UI   |             |  same bundle       |
  |        |          |        |             |        |           |
  |        v          v        |             |        v           |
  |  sanitizeDeliveryProof     |             |  sanitizeDelivery.. |
  |  (lib/deliveryValidation)  |             |        |           |
  |        |                   |             |        v           |
  |        v                   |             |   useAppStore      |
  |   useAppStore (zustand)    |             |        |           |
  |    stops / routes / log    |             |        |           |
  +--------|-------------------+             +--------|-----------+
           |  write blob                              |  write blob
           v                                          v
        +--------------------------------------------------+
        |  localStorage: one versioned JSON blob            |
        |  last writer wins; `storage` event re-applies     |
        +--------------------------------------------------+

  POST /api/optimize  (nodejs runtime, unauthenticated, stateless)
        zod safeParse -> optimize() -> OptimizeResponse
        400 bad JSON | 400 invalid | 500 optimizer threw
```

The only server code is the optimize, health and seed routes under `src/app/api`. No database, no session, no tenant.

## 1. Make it multi-tenant. What changes first?

Today there is no tenant at all: `driverIdForStop` (used at `src/store/useAppStore.ts:922`) resolves a driver from the in-memory routes, and `/api/optimize` will plan any body it is handed (`src/app/api/optimize/route.ts:167`). The first change is not the schema, it is the identity: every write needs a depot or org id derived from the session, never from the request body, because a body-supplied tenant id is the classic horizontal-escalation bug. Then `Stop`, `Driver`, `Route` and `DeliveryEvent` all gain that column and every query filters on it.

Trade-off: a single shared table with a tenant column is cheap to operate and easy to get wrong once, catastrophically. Schema-per-tenant is safer by construction but multiplies migration cost by the tenant count. For a depot-scale product the shared table plus row-level security in the database is the right first bet, because it puts the filter below the application code that will eventually forget it.

## 2. Two drivers record the same stop at the same time. What happens?

Today: last writer wins. The store re-applies another tab's persisted slice from the `storage` event without echoing it back (`tests/store.test.ts:240`) and rejects blobs from a different build (`tests/store.test.ts:274`), but it never merges; whoever writes second overwrites `Stop.proof` wholesale in the `set()` at `src/store/useAppStore.ts:931`.

Server-side the fix is to stop treating a delivery as an update. The `DeliveryEvent` already has a client-generated `id` (`src/store/useAppStore.ts:920`), so `POST /deliveries` becomes an append with that id as an idempotency key: a retry inserts nothing and returns the original result. `Stop.status` then becomes a projection of the latest event rather than an independently written column, which removes the conflict instead of resolving it.

Trade-off: projections mean the status is eventually consistent with the log, and a read that arrives between the insert and the projection update shows the old status. The alternative, an optimistic-concurrency `version` column on `Stop` with a 409 on mismatch, keeps the read simple but pushes retry handling into the driver UI, which is offline half the time. For a delivery app the append wins, because the driver's phone must be able to queue writes.

## 3. Background jobs: where does the first one appear?

Route optimization. `maxDuration = 30` at `src/app/api/optimize/route.ts:21` is a serverless backstop, and the comment at lines 57-62 explains the optimizer builds a dense n x n matrix and runs O(n^2)-O(n^3) local search per driver, bounded to 1000 stops and 50 drivers. That is a synchronous request today because the demo plans 45 stops for 3 drivers.

At real depot scale it becomes `POST /plans` returning 202 with a plan id, a worker running the solver, and the UI polling or subscribing. The existing `OptimizeResponse` shape is preserved as the job result, which is the point of the seam comment at lines 1-6.

Trade-off: async planning removes the timeout cliff but adds a state machine (queued, running, failed, superseded) and the question of what the dispatcher sees while a plan is in flight. The honest cost is that "re-optimize" stops being a button that either works or errors and becomes a thing that can be stale.

## 4. The activity log at 1M rows. How do you paginate it?

Today the log is a bounded array in memory, capped by `MAX_LOG_EVENTS` and dropping the oldest (`tests/store.test.ts:643`), and `eventsForDriver` (`src/components/driver/report.ts:61`) filters it in JavaScript. That is fine for a day; it is not a log.

At scale: keyset pagination on `(at, id)` descending, not `OFFSET`. `DeliveryEvent.at` is an ISO timestamp and `id` is generated from `now.getTime()` (`src/store/useAppStore.ts:920`), so the pair is a stable, unique sort key. `OFFSET 999000` makes the database walk a million rows per page and, worse, shifts rows under the reader while new deliveries are appended, so items are skipped or repeated.

Trade-off: keyset cannot jump to page 500 and cannot show a total count cheaply. For an append-only activity feed that is the right sacrifice; for a dispatcher's filtered search over a date range, an indexed range scan plus an approximate count is the compromise.

## 5. Add authentication. Which of the existing checks survive?

None of them become security controls; all of them stay useful. `sanitizeDeliveryProof` keeps the state model and the storage blob sane on the client, and the Zod schema at `src/app/api/optimize/route.ts:125` keeps the optimizer from being handed garbage. What is missing is authorization, and it is a different question from validation: a well-formed request from an authenticated driver to record a delivery for someone else's stop is schema-valid and wrong.

So the server route needs three layers in order: 401 if there is no session, 400 if the body fails the schema, 404 if the stop is not visible to this driver, and 409 if the stop is already in a terminal state. Returning 403 rather than 404 for a stop that exists but belongs to another driver leaks the id space, which is why 404 is the default here.

Trade-off: the 404-for-forbidden choice makes debugging harder for support, so pair it with a server-side log line that records the real reason and a correlation id.

## 6. Observability: what would you instrument first?

There is almost nothing today. The 500 branch at `src/app/api/optimize/route.ts:192-196` returns `err.message` and deliberately does not leak a stack, and the smoke run's evidence is a one-off capture (no console errors, only app-origin and OpenStreetMap tile requests) rather than continuous telemetry.

First instrument: a counter on `photoDropped === true` from `recordDelivery` (`src/store/useAppStore.ts:937`). It is the one place the app knowingly gives the user less than they asked for, and nobody currently knows how often it happens. Second: optimizer duration and stop count as a histogram, because that is the metric that tells you when the 30-second backstop is about to start firing. Third: a structured error with a correlation id replacing the message passthrough.

Trade-off: driver photos and recipient names are personal data, so the delivery telemetry must carry counts and ids, never proof payloads. That constraint is easy to state and easy to violate by logging the whole action argument.

## 7. Move this to the target stack. What actually ports?

The domain types in `src/lib/types.ts` port almost unchanged: `StopStatus` and `DeliveryMethod` are closed unions that become database enums or C# enums, and `DeliveryProof` becomes an owned value object because it has no identity of its own. The store actions port as service methods one for one: `recordDelivery`, `recordFailure`, `undoStop`, `deferStop`.

What does not port is the boundary style. `sanitizeDeliveryProof` returns a narrowed object and never throws, which suits a UI; a server wants a parse that fails loudly so the handler can map it to a 400, which is why the optimize route already uses `safeParse` rather than a sanitizer. The `Omit<DeliveryProof, 'at'>` return type (`src/lib/deliveryValidation.ts:29`) is the seam: it exists precisely because the store, not the caller, owns the timestamp, and a server owns it even more strongly.

Trade-off: keeping the client sanitizer after the server exists means two encodings of the same rules, and they will drift. Either generate one from the other, or accept the drift and make the server's rules the only ones with tests that gate deploys.
