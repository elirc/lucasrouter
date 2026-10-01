# Take-home: driver-reported parcel damage on RouteIQ

Time budget: 3 to 4 hours. Work in the existing repository. Do not add dependencies.

## Context we give you

RouteIQ records a delivery outcome through the Zustand store in `src/store/useAppStore.ts`. Driver-supplied proof crosses a runtime boundary in `src/lib/deliveryValidation.ts` before any state changes, and each action appends exactly one `DeliveryEvent` to the append-only `deliveryLog`. `POST /api/optimize` (`src/app/api/optimize/route.ts`) shows the house style for an HTTP boundary: a Zod schema, `safeParse`, and a 400 carrying a compact `{ path, message }` issue list.

Operations has asked for one new thing. A driver who delivers a parcel that arrives visibly damaged must be able to record the delivery **and** flag the damage with a short description, because today the only way to note damage is to fail the stop with reason `'Damaged'`, which wrongly marks the parcel as undelivered.

## What to build

**1. Domain.** Add an optional `damage` field to `DeliveryProof` (`src/lib/types.ts:18`) carrying a severity from a closed set of `'minor' | 'major'` and a free-text `description`. Add whatever is needed on `DeliveryEvent` (`src/lib/types.ts:33`) so the activity log shows that a delivery was flagged, following the existing `hasPhoto` precedent: the log stays small and does not duplicate the payload.

**2. Validation.** Extend `sanitizeDeliveryProof` so the new field obeys the module's existing policy. An unknown severity is dropped, not accepted. The description uses the same trim-and-bound treatment as `note` via `cleanText`, bounded at 200 characters by a new module constant. A `damage` object with a valid description but no valid severity must not be persisted: severity is what makes the flag meaningful.

**3. Persistence.** Thread the field through `recordDelivery` (`src/store/useAppStore.ts:898`) so the sanitized damage lands on `Stop.proof` and the event carries the flag, inside the single existing `set()` call. Do not add a second `set()`. Leave the photo budget logic at lines 909-917 untouched.

**4. HTTP boundary.** Add `POST /api/deliveries/validate` as `src/app/api/deliveries/validate/route.ts`, in the style of the optimize route: `runtime = 'nodejs'`, a Zod schema mirroring the sanitizer's rules, 400 on malformed JSON with `issues: []`, 400 on a schema failure with the mapped issue list, and 200 with the accepted proof echoed back. This is the seam where a real server-side check would live, so the schema must *reject* what the client sanitizer merely *drops*, and your README note must explain that difference.

## Acceptance criteria

- A delivery with `{ damage: { severity: 'minor', description: '  scuffed corner  ' } }` is recorded as `delivered` with `proof.damage.description === 'scuffed corner'`.
- A delivery with `{ damage: { severity: 'catastrophic', description: 'x' } }` is recorded as `delivered` with `proof.damage` undefined, and the store still returns `{ ok: true, photoDropped: false }`.
- A 250-character description is stored at 200 characters.
- The existing photo-budget behaviour is unchanged: `tests/store.test.ts:486` still passes without edits.
- `POST /api/deliveries/validate` returns 400 with path `damage.severity` for an unknown severity, and 400 with `issues: []` for a non-JSON body.
- Existing report tests (`tests/driver-report.test.ts`) still pass unchanged.
- `pnpm typecheck` and `pnpm lint` exit 0. Lint runs with `--max-warnings=0`, so a warning is a failure.

## What to submit

A branch with your commits, plus a `NOTES.md` of at most one page covering: where you put the severity allowlist and why; the difference between dropping and rejecting, and which one each boundary uses; what you did not do and what it would cost.

## Tests and commands

Extend the existing suites; add one new file only for the route:

- `tests/delivery-validation.test.ts` for the sanitizer rules, in the `describe('delivery input boundary')` block.
- `tests/store.test.ts` in the `describe('delivery records')` block that starts at line 419, using the existing `optimizedStore()` and `stopOf()` helpers.
- A new `tests/api-deliveries.test.ts` modelled on `tests/api-optimize.test.ts` for the route handler.

Run:

```
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm lint
```

`pnpm verify` runs all three in sequence. To iterate on one suite: `pnpm test tests/delivery-validation.test.ts`. The project declares pnpm 9.12.3. Do not run the browser smoke script; it needs a running server and network access to OpenStreetMap tiles.

## Grading rubric

| Criterion | Strong | Weak |
|---|---|---|
| Boundary placement | Severity allowlist lives in `deliveryValidation.ts` next to `METHODS` and `REASONS`; the store calls the sanitizer and does not re-check | Validation inlined into the store action, or done in the form component so other callers are unprotected |
| Drop versus reject | Invalid severity dropped client-side, rejected with 400 server-side, and `NOTES.md` explains why the two differ | Both boundaries behave the same, or the store starts returning `ok: false` for a cosmetic field |
| Persistence discipline | One `set()`, event carries only the flag, photo-budget branch untouched | A second `set()` added, the description duplicated into the event, or `photoDropped` logic disturbed |
| Tests | Cases for valid, unknown-severity, overlength, and damage-without-severity; assertions on both `proof` and the log entry | One happy-path test, or assertions only on the return value |
| HTTP shape | Matches the optimize route: 400/400/200, `{ path, message }` issues, `Cache-Control: no-store` on the success | Throws on bad JSON producing a 500, or returns 200 with an error body |
| Migration safety | Optional access everywhere `proof.damage` is read, because older persisted blobs lack the field | Assumes `proof.damage.severity` exists and crashes on hydration for existing users |
| Communication | `NOTES.md` names the unfixed limits (no auth, last-writer-wins cross-tab, no re-sanitization on hydration) | `NOTES.md` claims the data is now validated |

## Reviewer's notes

The first thing read is the diff of `src/store/useAppStore.ts`. A second `set()` call, or a mutation before the sanitizer runs, ends the review early: this codebase's whole thesis is one mutation boundary.

Second is the test diff, before the implementation. We look for the negative cases. Anyone can store a valid severity; we want the assertion that an unknown one leaves `proof.damage` undefined while the delivery still succeeds, because that is the drop-versus-reject judgement we are actually hiring for.

Third is the route handler's error paths. We check that a non-JSON body produces a 400 rather than an unhandled throw, and that the issue mapping uses a path string rather than a raw Zod error dump.

Fourth is migration safety. `Stop.proof` is read out of a persisted localStorage blob written by an older build, where `damage` is absent. Code that assumes `proof.damage.severity` exists will crash on hydration for every existing user. We expect optional access, and we expect `NOTES.md` to mention it.

Last, we read `NOTES.md` for honesty. A candidate who writes "this is defense in depth; the client checks keep the state model and the storage blob sane, but there is no authenticated server yet so none of it is a security control" scores above one who claims the input is now safe.
