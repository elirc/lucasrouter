# Flashcards: RouteIQ

Cover the right column. Aim for the exact symbol, number or status code.

| Question | Answer |
|---|---|
| Which module is the runtime input boundary for driver proof? | `src/lib/deliveryValidation.ts` |
| Signature of the main sanitizer? | `sanitizeDeliveryProof(input: unknown): Omit<DeliveryProof, 'at'>` |
| Why is the return type `Omit<..., 'at'>`? | The store stamps the timestamp; the caller never supplies it |
| The four `DeliveryMethod` values? | `handed`, `door`, `neighbour`, `desk` |
| The four `FailureReason` values? | `No one home`, `Wrong address`, `Damaged`, `Other` |
| `MAX_NAME_LENGTH` and `MAX_NOTE_LENGTH`? | 120 and 500 |
| What does `cleanText` return for a non-string? | `undefined` |
| What does `cleanText` return for `'   '`? | `undefined`, because the trimmed string is falsy |
| The photo regex, in words? | `data:image/<subtype>;base64,<base64>` with optional `=` padding, case-insensitive |
| Why is the photo trimmed before the match? | Camera inputs and copy-paste add surrounding whitespace |
| Which test asserts the whitespace tolerance? | `tests/delivery-validation.test.ts:29` |
| `sanitizeDeliveryProof(null)` returns? | `{}` |
| `sanitizeDeliveryProof({ photo: 'blob:camera' })` returns? | `{}`, a blob URL fails the `data:` anchor |
| Which store action is the single delivery mutation point? | `recordDelivery` at `src/store/useAppStore.ts:898` |
| `PHOTO_BUDGET_BYTES` value and location? | `1_500_000` at `src/store/useAppStore.ts:520` |
| Return type of `recordDelivery`? | `RecordDeliveryResult`, `{ ok: boolean; photoDropped: boolean }` |
| What is returned for an unknown stop id? | `{ ok: false, photoDropped: false }` |
| What is returned when the photo will not fit? | `{ ok: true, photoDropped: true }`, the delivery still counts |
| Exact line that gates the stored photo? | `if (photo && !photoDropped) stored.photo = photo;` |
| What happens to `event.hasPhoto` on a dropped photo? | It stays absent, because it is only set when `stored.photo` is truthy |
| Why does the log store `hasPhoto` instead of the photo? | Keeps the log small; the image lives once on `Stop.proof` |
| What makes `recordFailure` return `false`? | Unknown stop id, or `isFailureReason(reason)` false |
| Which field does `recordFailure` still write the reason into? | `Stop.notes`, via `setStopStatus(stopId, 'failed', reason)` |
| What does `recordFailure` do to a prior delivery's proof? | Replaces it; the previous method, name and photo are cleared |
| Why does `deferStop` not set `editedSinceOptimize`? | A driver skipping their own stop is not the dispatcher hand-editing the plan |
| When does `deferStop` return `false`? | Stop missing, not `pending`, not on any route, or already last |
| How many events does one driver action append? | Exactly one |
| The four `DeliveryEvent.type` values? | `delivered`, `failed`, `undo`, `deferred` |
| Which reserved id cannot be a stop id? | `'DEPOT'` |
| Status for a non-JSON body on `/api/optimize`? | 400, with `issues: []` |
| Status for duplicate stop ids? | 400, from the `superRefine` cross-field check |
| Why must stop ids be unique? | The optimizer's "every stop exactly once" invariant and the UI's id-keyed lookups |
| `MAX_STOPS` and `MAX_DRIVERS`? | 1000 and 50 |
| Why cap `MAX_PACKAGES_PER_STOP` and friends? | A schema-valid request could otherwise produce `NaN:NaN` ETAs or `totalMinutes: 1e308` |
| Shape of a 400 issue? | `{ path: string; message: string }`, path joined with dots or `(root)` |
| What does the optimize success response set? | `Cache-Control: no-store` |
| `maxDuration` on the optimize route? | 30 seconds, a backstop, not the optimizer's budget |
| Test counts at delivery and after review? | 166 unit plus 56 smoke checks; 167 unit across 7 files afterwards |
| Command that runs typecheck, lint and tests? | `pnpm verify` |
| Lint strictness? | `eslint . --max-warnings=0`, so a warning fails |
| Cross-tab write behaviour? | Last writer wins; the `storage` event re-applies without echoing |
| What is explicitly not a security control here? | Every client check, because there is no auth and no server-side authorization |
