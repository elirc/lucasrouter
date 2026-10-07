# Solutions and review guidance

## Exercise 9: the same contract on a server

The demo enforces the proof contract in the store because there is no server. On the CRUD stack you are training for, the same rules move into a route handler, and three things change: rejection replaces silent dropping, the response has a 400 shape, and ownership is checked from the session rather than trusted from the client.

```typescript
// app/api/deliveries/route.ts: a hypothetical route handler. RouteIQ has no such route,
// no session and no database; `@/lib/session` and `@/lib/db` do not exist in this repo.
// The method list and limits are copied from src/lib/deliveryValidation.ts.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/session';
import { db } from '@/lib/db';

const deliveryProof = z.object({
  stopId: z.string().min(1),
  method: z.enum(['handed', 'door', 'neighbour', 'desk']),
  recipientName: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  photo: z.string().trim().regex(/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+=*$/i).max(1_500_000).optional(),
}).strict();

export async function POST(request: Request) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const parsed = deliveryProof.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_proof', issues: parsed.error.issues }, { status: 400 });
  }
  const stop = await db.stop.findFirst({ where: { id: parsed.data.stopId, route: { driverId: session.userId } } });
  if (!stop) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (stop.status !== 'pending') return NextResponse.json({ error: 'already_recorded' }, { status: 409 });
  const [updated] = await db.$transaction([
    db.stop.update({ where: { id: stop.id }, data: { status: 'delivered', proof: parsed.data } }),
    db.deliveryEvent.create({ data: { stopId: stop.id, driverId: session.userId, type: 'delivered' } }),
  ]);
  return NextResponse.json({ stop: updated }, { status: 201 });
}
```

What stays on the client: trimming, enum narrowing and the size hint are still useful for fast feedback. What must be server-side: the ownership check (`driverId` comes from the session, never the body), the `pending` state check, the proof and the event in one transaction, and the size limit (a client can bypass any store). Compare the 400 here with the demo's `sanitizeDeliveryProof` returning `{}`: a server must tell the caller what it refused.

## Executable solutions

```ts
it('checkpoint B keeps proof and event notes equal', async () => {
  const { store } = await optimizedStore();
  const id = store.getState().routes![0].stopIds[0];
  expect(store.getState().recordFailure(id, 'Other', 'n'.repeat(700))).toBe(true);
  const stop = store.getState().stops.find((s) => s.id === id)!;
  const event = store.getState().deliveryLog[0];
  expect(stop.proof?.note).toHaveLength(500);
  expect(event).toMatchObject({ type: 'failed', reason: 'Other', note: stop.proof?.note });
});

it('exercise 7 rejects an invalid reason without mutation', async () => {
  const { store } = await optimizedStore();
  const id = store.getState().routes![0].stopIds[0];
  const before = store.getState().deliveryLog.length;
  expect(store.getState().recordFailure(id, 'forged' as never, 'note')).toBe(false);
  expect(store.getState().stops.find((s) => s.id === id)?.status).toBe('pending');
  expect(store.getState().deliveryLog).toHaveLength(before);
});
```

The first test proves the bounded note is copied consistently into both read models. The second proves the guard runs before the setter. Together they test behavior and side effects rather than merely testing that a helper returns a value. For checkpoint B, use a valid reason when testing note bounds: an invalid reason short-circuits and cannot prove note sanitization.

## Worked reviewer conversation

Junior comment: “The form already has TypeScript types, so this helper is unnecessary.” Mid-level response: “Types disappear at runtime and localStorage or JavaScript callers can provide unknown values. The store is the shared write boundary, so a pure guard protects every caller.” Junior comment: “Reject every malformed proof.” Response: “Method, note, and photo are optional fields; dropping a malformed optional field preserves a usable delivery. A failure reason defines event meaning; reject it before mutation.” Junior comment: “The photo is under the budget, so any string is fine.” Response: “Capacity and format differ. A short URL cannot survive reload, while a syntactically valid data URL can still exceed the byte budget.”

The complete state solution is: delivery input enters the action; sanitizer returns only known method, trimmed bounded strings, and valid image data URL; the store stamps one `at`; proof receives the retained fields; event receives the audit copies; persist serializes durable state; report derives rows from events. Failure follows the same path but rejects unknown reason before `setStopStatus`. Reviewers should ask for these assertions explicitly and link comments to the relevant source file.

Exercise 1 should land on `DeliveryForm`'s `onConfirm`, `confirmDelivery` in `DriverRouteScreen.tsx`, the store's `recordDelivery`, `sanitizeDeliveryProof`, timestamp construction, the Zustand setter, and persist middleware. The proof is attached to the stop; the event is appended to `deliveryLog`; the partialized store is serialized. If a learner starts at the page and cannot name the action, ask them to search for `recordDelivery` and follow the symbol.

Exercise 2 returns `{ method: 'door', recipientName: 'Jo' }`. The whitespace-only note disappears and a `blob:` photo disappears because the persisted contract accepts data URLs only. This is a deliberate conservative policy. A blob URL can be tab-local and cannot be reconstructed after reload; retaining it would create a proof that looks present but cannot be exported or displayed later.

Exercise 7 (and the existing assertion at `tests/store.test.ts:517`) should show `false` for an invalid reason and no stop or log mutation. The important review point is guard placement: it must happen before `setStopStatus`, because that helper mutates synchronously. A guard after the call is too late. For proof, dropping malformed optional fields is acceptable because delivery remains meaningful; for outcome semantics, rejecting an unknown reason is preferable because the event would otherwise lie.

For Exercise 8, a complete addition updates `DeliveryMethod`, the runtime set, `DELIVERY_METHODS` and its icon map in the delivery sheet, both label maps in `report.ts`, and tests. Reviewers should request a search-backed checklist rather than trusting one changed file. For Exercise 9, a server schema would validate and authorize at the route, then the client helper would still improve feedback and protect local drafts. No client validator can establish identity, tenant access, or trustworthiness of a photo.

Use review comments that name an invariant and evidence: “This guard is before the first setter, so invalid reasons are side-effect free.” Ask for tests when a comment predicts a bug. Reject filler tests that restate a literal constant without exercising a boundary. A strong learner can explain the tradeoff, show the command that verifies it, and state what remains outside scope.


## Exercise 5: changing the note limit to 50

Change the single note-limit policy used by both delivery proofs and failure notes, then run boundary cases at 49, 50 and 51 characters. Review the driver form guidance so a person knows the limit before submitting. Verify that both the stored proof and the event contain the same retained note; inspect CSV and JSON exports for consistent text rather than silently applying a second truncation rule in reporting. A shared exported constant is useful if UI copy and validation must agree, but avoid copying the number into multiple components.

This change governs new writes. Existing persisted 500-character notes are not rewritten by the new-write sanitizer during hydration. Decide explicitly whether the product wants to keep historical notes intact or introduce a separately tested migration. For this exercise, keep historical notes intact and document that choice. Test one hydrated old note and one newly recorded 51-character note to demonstrate the difference.

Checkpoint C is the server-design exercise: describe an authenticated request containing the stop ID and proposed outcome, check ownership and allowed transitions on the server, validate optional proof fields and failure reason, and commit the stop change and event in one transaction. The client sanitizer remains useful for immediate feedback and local draft hygiene; it cannot establish identity or authorization. This is an architectural exercise, not a server feature implemented by this patch.

## Short answers for Exercises 3, 4 and 6

These were run with `node --experimental-strip-types --test` against the current `src/lib/deliveryValidation.ts` on 2026-10-06 (5/5 passing, together with Exercises 2 and 5).

- **Exercise 3:** `false`, `true`, `false`. `REASONS` is a `Set` of exact strings (`deliveryValidation.ts:4`), and the stored reason is what the activity log and report display.
- **Exercise 4:** only the SVG data URL survives. The `[a-z0-9+/]+=*$` tail rejects the newline, and the `^data:image\/` prefix rejects `text/html`. Accepting `image/svg+xml` is safe for `<img src>` rendering (images do not run scripts), but a reviewer should ask whether SVG is a real camera output at all.
- **Exercise 6:** `cleanText` uses `value.slice(0, maxLength)` (`deliveryValidation.ts:20`), which counts UTF-16 code units, so the emoji is cut in half and a lone surrogate is persisted. `Array.from(value).slice(0, max).join('')` cuts by code point instead.

## Senior review notes (verified by reading the code)

- **`recordDelivery` does not check the stop's status.** It returns early only when the stop id is unknown (`useAppStore.ts:900-901`). Calling it on a stop that is already `delivered` or `failed` appends another `delivered` event. The UI avoids this by closing the sheet first (`DriverRouteScreen.tsx:196-197`), but the store boundary that this course hardens does not enforce the transition. No test covers it.
- **The failure toast ignores the guard's result.** `markFailed` calls `recordFailure(stopId, reason, note)` and then shows "Marked failed" unconditionally (`DriverRouteScreen.tsx:217-218`), while `confirmDelivery` checks `result.ok` (line 200). If the reason guard ever rejects, the driver is told the opposite of what happened.
- **Length limits are in code units, not characters** (Exercise 6).
