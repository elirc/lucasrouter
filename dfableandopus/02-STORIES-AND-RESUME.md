# Stories and resume material: RouteIQ

## Story 1: the trust boundary that was not there

**Situation.** RouteIQ's driver screen collects proof of delivery (method, recipient name, free-text note, downscaled photo) and the Zustand store writes it into a localStorage blob. The TypeScript types in `src/lib/types.ts` described the shape precisely, and everyone treated that as validation.

**Task.** Decide whether the app actually had an input boundary, and if not, put one somewhere that covers every caller rather than one form.

**Action.** I wrote a store test that calls `recordDelivery` with values TypeScript would refuse, using `as never` casts: an unknown `method`, a numeric `recipientName`, a 700-character note and an `https://` URL as the photo. All four persisted. I added `src/lib/deliveryValidation.ts` with `sanitizeDeliveryProof`, `isDeliveryMethod`, `isFailureReason` and a shared `cleanText`, and called it from `recordDelivery` at `src/store/useAppStore.ts:905` and from `recordFailure` at line 942-943, so the guard sits at the single mutation boundary instead of in the component.

**Result.** The regression at `tests/store.test.ts:502` now asserts the note is bounded to 500 characters while the bad method and photo are gone, and that an invalid failure reason leaves the stop `pending` with the log still at length 1. The suite runs 167 tests across 7 files with zero failures, `tsc --noEmit` exits 0 and `eslint --max-warnings=0` exits 0.

## Story 2: the dropped photo that had to be visible

**Situation.** Photos are base64 data URLs inside the same localStorage blob as the plan, against a 1.5 MB budget (`PHOTO_BUDGET_BYTES`, `src/store/useAppStore.ts:520`). Once the budget is spent, something has to give.

**Task.** Choose between refusing the delivery and losing the picture, and make the choice observable rather than silent.

**Action.** I kept the delivery: the stop still flips to `delivered`, the event is still appended, and only `stored.photo` is skipped (`src/store/useAppStore.ts:917`). I changed the action's return type to `{ ok, photoDropped }` so the caller can raise a toast, and wrote the reasoning into `astraupskill/VERIFICATION.md` so a later reader would not "correct" it into a hard failure.

**Result.** `tests/store.test.ts:486` asserts the second delivery returns exactly `{ ok: true, photoDropped: true }`, that the stop is `delivered`, that `proof.photo` is undefined and that the log entry has no `hasPhoto`. Blocking a driver's real job for a cosmetic limit was avoided, and the signal is asserted rather than assumed.

## Story 3: the test that was lying about the constant

**Situation.** Review of the delivery pass flagged two things: the photo-budget test constructed its oversized payload from a hard-coded byte count, and the photo pattern rejected data URLs that arrived with surrounding whitespace from a camera or a paste.

**Task.** Make the test track the real constant, and stop dropping legitimate photos, without loosening the scheme check.

**Action.** The test now imports `PHOTO_BUDGET_BYTES` from the store module and builds the payload as `'A'.repeat(PHOTO_BUDGET_BYTES - 40)` (`tests/store.test.ts:490-491`). In the validator I trim the photo before the strict match (`src/lib/deliveryValidation.ts:39`) and added a case asserting `'  data:image/png;base64,QUJD  '` survives while `' https://example.test/x.png '` is still dropped (`tests/delivery-validation.test.ts:29-31`).

**Result.** The constant and its test cannot drift, and the false rejection is covered in both directions. The post-review verification run reported 7 files and 167 tests passing, up from the 166 delivered.

## Resume bullets

- Added a runtime validation boundary to a Next.js delivery app, placing `sanitizeDeliveryProof` at the single Zustand mutation point so all four driver actions were covered by one guard instead of per-form checks; 167 unit tests, typecheck and zero-warning lint green.
- Closed a persistence hole where unbounded free text and non-image URLs reached browser storage, bounding names to 120 and notes to 500 characters and restricting photos to base64 image data URLs.
- Designed a partial-failure contract for a storage-budgeted photo upload: the delivery is recorded and a `photoDropped` flag is returned to the UI, verified by a store test that derives the budget from the production constant.
- Validated a public optimizer endpoint with Zod including cross-field duplicate-id rejection and request size caps of 1000 stops and 50 drivers, returning 400 with a compact path/message issue list.
- Diagnosed a bundler-specific build failure on an extended Windows dependency path, fixed the TypeScript narrowing error it exposed and scoped Tailwind source discovery to `src`, restoring a clean production build and 56 browser smoke checks with no console errors.

## 60-second spoken summary

RouteIQ is a delivery dispatch demo I worked on: a Next.js App Router app with a dispatcher map and a driver screen, backed by a single Zustand store that persists to localStorage. My change was about trust. Delivery proof went from a form straight into the store and then into browser storage, and the only thing stopping garbage was the TypeScript types, which do nothing at runtime. I put a sanitizer in front of the store mutation rather than in the form, so every caller gets it: unknown delivery methods are dropped, names and notes are trimmed and bounded, and a photo is only kept if it is a base64 image data URL. One interesting decision fell out of it. Photos live in the same localStorage blob, and there is a byte budget, so I had to pick between refusing the delivery and losing the picture. I kept the delivery and returned a `photoDropped` flag so the driver gets told, because blocking someone's actual job over a cosmetic limit is the wrong trade. It is covered by 167 tests plus a 56-check browser smoke run. And I would say clearly that this is defense in depth, not security: there is no server and no auth, so a real version has to redo all of it behind an authenticated endpoint.

## What I would do next

- Re-sanitize on hydration. The validator runs on writes; a blob written by an older build can still carry an overlong note, so the practice exercise's "which client checks remain useful" question is not yet answered in code.
- Build the authenticated server route the astraupskill solutions sketch: a Zod schema mirroring `sanitizeDeliveryProof`, a 401/400/404/409 response shape and an ownership check that the stop belongs to the calling driver. That is the piece that turns the client guard from the only check into the second one.
