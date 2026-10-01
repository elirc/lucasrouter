# Code reading drill: RouteIQ

Six rounds that mimic a live screen share. Read each excerpt out loud, answer, then open the `<details>`.

## Drill 1: explain this function

`src/lib/deliveryValidation.ts:29-45`

```ts
export function sanitizeDeliveryProof(input: unknown): Omit<DeliveryProof, 'at'> {
  if (!input || typeof input !== 'object') return {};
  const value = input as Record<string, unknown>;
  const output: Omit<DeliveryProof, 'at'> = {};
  if (isDeliveryMethod(value.method)) output.method = value.method;
  const recipientName = cleanText(value.recipientName, MAX_NAME_LENGTH);
  const note = cleanText(value.note, MAX_NOTE_LENGTH);
  if (recipientName) output.recipientName = recipientName;
  if (note) output.note = note;
  // Camera inputs and copy-paste can add surrounding whitespace; strip it before the strict match.
  const photo = typeof value.photo === 'string' ? value.photo.trim() : value.photo;
  const isDataUrl = typeof photo === 'string' && /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/]+=*$/i.test(photo);
  if (isDataUrl) {
    output.photo = photo;
  }
  return output;
}
```

Talk through: what is the return type doing, why is the parameter `unknown`, and what happens to a field the function does not recognise.

<details><summary>What a strong answer says</summary>

The parameter is `unknown` because the whole point is that the caller may not be TypeScript. The function never trusts the shape: a null or non-object returns `{}` rather than throwing, so the store's happy path is unchanged for a missing proof. The return type is `Omit<DeliveryProof, 'at'>` because the timestamp is the store's to stamp, not the caller's, which is why `recordDelivery` builds `const stored: DeliveryProof = { at }` at `src/store/useAppStore.ts:911`.

It is an allowlist, not a scrubber. An unrecognised key is never copied to `output`, so extension-injected properties cannot ride along into localStorage. Each known field is separately gated: `method` through a `Set` membership test, text through `cleanText`, which returns `undefined` for non-strings and for strings that are empty after trimming (`src/lib/deliveryValidation.ts:17-21`), and the photo through a scheme-and-base64 regex. The `if (recipientName)` guards mean an empty string is omitted rather than stored as `''`, so downstream code can use plain truthiness.

The weak answer says "it validates the proof". The strong answer names the two policies: optional decoration is dropped, and the store keeps ownership of `at` and of the byte budget.
</details>

## Drill 2: spot the bug

The excerpt below is a mutated copy of `src/store/useAppStore.ts:898-937`. Find the defect.

```ts
recordDelivery(stopId, proof): RecordDeliveryResult {
  const state = get();
  const stop = state.stops.find((s) => s.id === stopId);
  if (!stop) return { ok: false, photoDropped: false };

  const now = new Date();
  const at = now.toISOString();
  const safeProof = sanitizeDeliveryProof(proof);
  const photo = trimmed(safeProof.photo);
  const photoDropped =
    photo !== undefined && photoBytesInUse(state.stops) + photo.length > PHOTO_BUDGET_BYTES;
  const stored: DeliveryProof = { at };
  if (safeProof.method) stored.method = safeProof.method;
  const recipientName = trimmed(safeProof.recipientName);
  if (recipientName) stored.recipientName = recipientName;
  const note = trimmed(safeProof.note);
  if (note) stored.note = note;
  if (photo) stored.photo = photo;

  const event: DeliveryEvent = {
    id: newEventId(now.getTime()),
    at,
    driverId: driverIdForStop(state.routes, stopId),
    stopId,
    type: 'delivered',
  };
  if (stored.method) event.method = stored.method;
  if (recipientName) event.recipientName = recipientName;
  if (note) event.note = note;
  if (stored.photo) event.hasPhoto = true;

  set((s) => ({
    stops: s.stops.map((x) =>
      x.id === stopId ? { ...x, status: 'delivered', deliveredAt: at, proof: stored } : x,
    ),
    deliveryLog: appendEvent(s.deliveryLog, event),
  }));
  return { ok: true, photoDropped };
}
```

<details><summary>Answer</summary>

The mutation is on the photo assignment. The real line is `if (photo && !photoDropped) stored.photo = photo;` (`src/store/useAppStore.ts:917`); the copy drops the `&& !photoDropped`.

The result is the worst kind of bug: `photoDropped` is still computed and still returned as `true`, so the UI toasts "photo not saved" while the photo is saved anyway, and `event.hasPhoto` is set because `stored.photo` is truthy. The byte budget stops being enforced at all, so the localStorage blob grows past 1.5 MB and eventually the quota write throws.

`tests/store.test.ts:486` catches it on the `expect(stopOf(store, b).proof?.photo).toBeUndefined()` assertion at line 497 and again on `expect(log(store)[1].hasPhoto).toBeUndefined()` at line 498. Note that the first assertion at line 492, which expects `photoDropped` to be `false` for the under-budget delivery, still passes: a test that only checked the flag would not have caught this.
</details>

## Drill 3: predict the output

Predict the exact return value of each call before reading on.

```ts
sanitizeDeliveryProof({ method: 'door', recipientName: '  Jo  ', note: ' ', photo: 'blob:camera' })
sanitizeDeliveryProof({ method: 'script', photo: 'https://example.test/x', note: 42 })
sanitizeDeliveryProof(null)
isDeliveryMethod('pickup')
isFailureReason('')
```

<details><summary>Answer with reasoning</summary>

1. `{ method: 'door', recipientName: 'Jo' }`. `'door'` is in `METHODS` (`src/lib/deliveryValidation.ts:3`). `'  Jo  '` trims to `'Jo'`, which is truthy so it is kept. `' '` trims to `''`, which is falsy, so `cleanText` returns `undefined` and the `if (note)` guard omits it. `'blob:camera'` fails the `^data:image/` anchor, so no photo. A blob URL would display in the current tab, which is exactly why people expect it to survive: it is a handle into this document's memory and means nothing once the page reloads or another tab reads the blob.
2. `{}`. `'script'` is not a member of the four-value union, `https://` fails the scheme anchor, and `42` is not a string so `cleanText` returns `undefined` at `src/lib/deliveryValidation.ts:18`. Asserted at `tests/delivery-validation.test.ts:27`.
3. `{}`, from the early return at `src/lib/deliveryValidation.ts:30`.
4. `false`. Asserted at `tests/delivery-validation.test.ts:7`.
5. `false`, because the empty string is not in `REASONS`. Asserted at `tests/delivery-validation.test.ts:9`. Note that this is a `Set.has` check, not a truthiness check, so `isFailureReason` would also reject `'no one home'` in lowercase: the union values are display strings such as `'No one home'` (`src/lib/deliveryValidation.ts:4`).
</details>

## Drill 4: predict the status code

Three requests against `POST /api/optimize`. Give the status and the body shape.

1. Body is the string `not json`.
2. A well-formed `OptimizeRequest` whose `stops` array contains two entries with `id: "S001"`.
3. A well-formed request with 1200 stops.
4. A valid request where a driver's `color` is `"blue"`.

<details><summary>Answer</summary>

1. **400**, body `{ error: 'Request body must be valid JSON', issues: [] }`. `await request.json()` throws and the `catch` at `src/app/api/optimize/route.ts:171` converts it, so a client bug never surfaces as a 500.
2. **400**, `{ error: 'Invalid OptimizeRequest', issues: [{ path: 'stops', message: 'Duplicate stop ids: S001' }] }`. Per-field validation passes; the `superRefine` at line 135 catches it because the optimizer's "every stop exactly once" invariant and the UI's id-keyed lookups both assume uniqueness.
3. **400**, with the message `At most 1000 stops per request` at path `stops`, from the `.max(MAX_STOPS, ...)` at line 129.
4. **400**, path `drivers.0.color`, message `Expected a hex colour like #2563eb` from `hexColor` at line 54. The `path` string is produced by `toIssues` joining the Zod issue path with dots (`src/app/api/optimize/route.ts:162`).

There is no 401 or 403 in this handler at all. The endpoint is unauthenticated, which is the honest thing to say when an interviewer asks what is missing.
</details>

## Drill 5: review this diff

A teammate proposes this change to `recordFailure`. Find the defects.

```diff
   recordFailure(stopId, reason, note): boolean {
     const state = get();
-    if (!state.stops.some((s) => s.id === stopId) || !isFailureReason(reason)) return false;
-    const trimmedNote = sanitizeDeliveryNote(note);
+    if (!state.stops.some((s) => s.id === stopId)) return false;
+    const trimmedNote = typeof note === 'string' ? note.trim() : undefined;
     state.setStopStatus(stopId, 'failed', reason);
     const at = new Date().toISOString();
     set((s) => ({
-      stops: trimmedNote
-        ? s.stops.map((x) => (x.id === stopId ? { ...x, proof: { at, note: trimmedNote } } : x))
-        : s.stops,
+      stops: s.stops.map((x) => (x.id === stopId ? { ...x, proof: { ...x.proof, at, note: trimmedNote } } : x)),
       deliveryLog: appendEvent(s.deliveryLog, {
         id: newEventId(Date.now()),
         at,
         driverId: driverIdForStop(s.routes, stopId),
         stopId,
         type: 'failed',
         reason,
       }),
     }));
     return true;
   }
```

<details><summary>Three defects</summary>

**Defect 1: the domain precondition is gone.** Removing `!isFailureReason(reason)` from the guard means any string reaches `setStopStatus`, which prefixes it into `Stop.notes`, and reaches the event's `reason` field. `tests/store.test.ts:517` fails immediately: it asserts `recordFailure(other, 'not-a-reason' as never, 42 as never)` returns `false` and leaves the stop `pending` with the log at length 1. This is the precondition-versus-decoration distinction from D2 in the question set, reversed.

**Defect 2: the note is no longer bounded.** `sanitizeDeliveryNote` (`src/lib/deliveryValidation.ts:48`) applies `MAX_NOTE_LENGTH`; a bare `.trim()` does not. `tests/store.test.ts:522` asserts a 700-character note is stored at length 500, and line 523 asserts the same for the event, so both fail. The diff also loses the non-string coercion, though the local `typeof` check happens to cover that one case.

**Defect 3: spreading the old proof resurrects a delivery.** The original deliberately replaces the proof with `{ at, note }` only when there is a note. Spreading `...x.proof` carries the previous delivery's `method`, `recipientName` and `photo` onto a failed stop, so the CSV export and activity sheet show a delivery method for an attempt that failed. `tests/store.test.ts:611` is exactly this regression: "recordFailure() clears the proof a previous delivery left on the stop". It also writes a proof object with `note: undefined` on every failure, replacing the previous cheap `s.stops` identity return with a new array on every call.
</details>

## Drill 6: explain the invariant

`src/lib/types.ts:26-44` documents `DeliveryEvent` as deliberately denormalised. `src/store/useAppStore.ts:890-896` says every driver action appends exactly one event. State the invariant and say what enforces it.

<details><summary>Answer</summary>

The invariant is: one driver action produces exactly one `DeliveryEvent`, and the event records the outcome as it was at that moment rather than pointing at the stop's current status.

Nothing in the type system enforces it. What enforces it is that components never construct log entries: all four actions build the event inline and append it in the same `set()` call that changes the stop, so the status flip and the log append cannot diverge. `recordDelivery` at `src/store/useAppStore.ts:931-936` is the clearest example, and `undoStop` (`:970`) appends a `type: 'undo'` event rather than deleting the earlier `delivered` one.

Why it matters: the dispatcher re-optimizes routes constantly, and `undoStop` sets a stop back to `pending`. If the activity sheet read from `Stop.status` it would lose history on every undo. Because the log copies the outcome, `eventsForDriver` and `summarizeDay` in `src/components/driver/report.ts:61` and `:91` can be trusted as the single source for the end-of-day report and the CSV.

The cost, which a good answer names: the log can contradict the stop. A delivered-then-undone stop reads `pending` while the log shows a delivery and an undo, and the log is capped at `MAX_LOG_EVENTS`, dropping the oldest (`tests/store.test.ts:643`), so it is not a complete audit trail.
</details>
