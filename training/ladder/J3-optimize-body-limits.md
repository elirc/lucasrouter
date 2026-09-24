# J3 · `/api/optimize` parses any body you send it

**Rung:** junior · **Time:** 2 h · **Skills:** HTTP status codes, input limits before parsing, route-handler tests

## Context
`src/app/api/optimize/route.ts` does `await request.json()` and then Zod-validates (`MAX_STOPS = 1000`, `MAX_DRIVERS = 50`).
The caps apply only *after* the whole body is buffered and parsed. Any `Content-Type` is accepted. The route is `runtime = 'nodejs'`,
`maxDuration = 30`. Tests call `POST(new Request(...))` directly (`tests/api-optimize.test.ts`).

## Ticket
> **RIQ-131** Platform: "Someone posted a 40 MB JSON array to `/api/optimize` on the preview deployment. The function sat at max memory
> until it hit the timeout. Reject oversized or non-JSON requests before parsing, with proper status codes."

## Constraints
- 413 when the body exceeds 2 MB. Check `Content-Length` when it's present, and still enforce the limit while reading, because
  the header can lie or be absent (chunked).
- 415 when `Content-Type` isn't `application/json` (allow parameters such as `; charset=utf-8`).
- Keep the existing error shape `{ error, issues: [] }` and the existing 400 behaviour.
- The store's client call (`useAppStore.ts` → `fetch('/api/optimize', ...)`) must keep working unchanged.

## Definition of done
- New tests: 413 by header, 413 by actual size with no header, 415 for `text/plain`, and a charset variant accepted.
- The 500 branch stops echoing `err.message` to the client. It logs the message server-side instead.
- `pnpm verify` green. `docs/ALGORITHM_INTEGRATION.md` lists the new status codes.

## Explain before touching
1. Why is 2 MB a reasonable limit here? Estimate the body size of a 1,000-stop request from `src/data/stops.json`.
2. Why is checking `Content-Length` alone not enough? What does `request.body` (a `ReadableStream`) let you do instead?
3. 400 vs 413 vs 415 vs 422: which does each case get, and what does a client do differently for each?
4. What does the store do when the API returns non-2xx? (Read `optimize()` in `useAppStore.ts`.) Does a 413 degrade gracefully for the user?
5. What else in this route could be expensive even for a valid 1,000-stop body? (Consider `repair.ts`'s wall-clock budget.)

<details><summary>Hints</summary>

Read the stream with a reader, count bytes, and bail out at the limit. Then `JSON.parse(new TextDecoder().decode(concat(chunks)))`.
</details>

Sealed answer: `training/_answers/ladder-J3.md`
