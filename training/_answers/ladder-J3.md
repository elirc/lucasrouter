# J3 reference: optimize body limits

## Explain-before-touching: reference answers
1. `src/data/stops.json` is about 11 KB for 45 stops, so about 245 bytes per stop. 1,000 stops ≈ 250 KB, plus drivers and depot. 2 MB is
   about 8× headroom for longer addresses and notes, and far below the memory that hurts a serverless function.
2. `Content-Length` can be absent (chunked transfer) or wrong. The only reliable limit is counting bytes while reading
   `request.body` (a `ReadableStream<Uint8Array>`), cancelling once the count passes the limit.
3. Malformed JSON or a schema failure → **400** (existing). Too big → **413 Payload Too Large** (the client should shrink or split,
   and must not retry as-is). Wrong media type → **415 Unsupported Media Type** (the client must fix its header). 422 would fit
   "well-formed but semantically invalid" (the Zod failures), but the contract already uses 400, and changing it breaks clients
   (`docs/ALGORITHM_INTEGRATION.md`). Don't change it.
4. `optimize()` in the store treats any non-2xx as "optimize locally" (`console.warn` + lazy local solver). So a 413 still gives the user
   a plan, computed on their main thread. It degrades gracefully, but it's slow at large N.
5. For a valid 1,000-stop body: `assign`/`sequence` (NN + 2-opt, about O(n²) per route) and the repair stage, bounded by a **wall-clock**
   deadline (`repair.ts`). So one request can burn up to that budget on every call. Add rate limiting or auth before exposing it publicly.

## Reference implementation (sketch)
```ts
const MAX_BODY_BYTES = 2 * 1024 * 1024;
async function readJsonLimited(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  const ct = request.headers.get('content-type') ?? '';
  if (!/^application\/json\b/i.test(ct)) return { ok: false, res: err(415, 'Content-Type must be application/json') };
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (declared > MAX_BODY_BYTES) return { ok: false, res: err(413, 'Request body too large') };
  const reader = request.body?.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  while (reader) { const { done, value } = await reader.read(); if (done) break;
    total += value.byteLength; if (total > MAX_BODY_BYTES) { await reader.cancel(); return { ok: false, res: err(413, 'Request body too large') }; }
    chunks.push(value); }
  try { return { ok: true, body: JSON.parse(new TextDecoder().decode(concat(chunks))) }; }
  catch { return { ok: false, res: err(400, 'Request body must be valid JSON') }; }
}
```
500 branch: `console.error('[optimize] failed', err)` and return `{ error: 'Optimizer failed', issues: [] }`.

## Tests
`new Request(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })` → 415. The same with
`application/json; charset=utf-8` → passes through to 400/200. A header of `content-length: 99999999` → 413 without reading. A 2.1 MB body
from a `ReadableStream` with no length header → 413. An existing valid request → 200 (regression).

## Rubric
Streaming limit, not header-only (3) · correct codes and a stable error shape (2) · no message leak (1) · tests for all four cases (3) · docs updated (1).
