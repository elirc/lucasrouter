# Practice exercises

## Three graded checkpoints

Checkpoint A is code reading: draw the call graph and identify the first setter. Checkpoint B is implementation: add a regression for valid `Other` plus an overlength note and prove proof/event parity. Checkpoint C is design: describe the authenticated server contract and explain which client checks remain useful. A complete solution must include an input, expected output, side-effect assertion, and limitation for each checkpoint.

## Running the pure exercises without installing anything

`src/lib/deliveryValidation.ts` imports only types, so Node can run it directly with type stripping. Create a scratch file **outside `tests/`** (Vitest only collects `tests/**/*.test.ts`, see `vitest.config.mts`), for example `practice.test.mjs` in the repo root, and start it with:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeDeliveryProof, sanitizeDeliveryNote, isFailureReason } from './src/lib/deliveryValidation.ts';
```

Run it with `node --experimental-strip-types --test practice.test.mjs` (Node 22.6+; the flag is unnecessary on Node 23.6+). Delete the file when you finish. Exercises 1 and 7 need the store, so they use `pnpm install --frozen-lockfile` and Vitest instead.

## Exercises

1. **Trace a delivery.** **Goal:** write the call chain from the button to localStorage. **Check:** your list goes `DeliveryForm` → `onConfirm` prop → `confirmDelivery` in `src/components/driver/DriverRouteScreen.tsx:193-210` → `recordDelivery` (`src/store/useAppStore.ts:898`) → `sanitizeDeliveryProof` (line 905) → one `set(...)` that updates the stop and appends the event (lines 931-936) → `persist` middleware. Running `grep -rn "recordDelivery(" src` should show that `DriverRouteScreen.tsx` is the only component caller.

2. **Predict sanitizer output.** **Goal:** predict `sanitizeDeliveryProof({ method: 'door', recipientName: '  Jo  ', note: ' ', photo: 'blob:camera' })` before running it. **Check:** `assert.deepEqual(result, { method: 'door', recipientName: 'Jo' })` passes. Then explain why a `blob:` URL is dropped even though it would display in the current tab.

3. **Reasons are exact strings.** **Goal:** test `isFailureReason` with `{}`, `'No one home'` and `'no one home'`. **Check:** the results are `false`, `true`, `false`. Explain why case-sensitivity is correct here (the value is stored in the event and matched by `report.ts`).

4. **Photo edges.** **Goal:** predict which of these photos survive: a base64 data URL with an embedded newline (`'data:image/png;base64,QUJD\nREVG'`), `'data:image/svg+xml;base64,PHN2Zz4='`, and `'data:text/html;base64,PGI+'`. **Check:** only the SVG survives. Read the regex at `deliveryValidation.ts:40` and say which part rejects each of the other two.

5. **Limit boundaries.** **Goal:** test `sanitizeDeliveryNote` at 500 characters, 501 characters, and whitespace only. **Check:** lengths 500 and 500, then `undefined`. If you change `MAX_NOTE_LENGTH` (line 6) to 50 locally, list every test, UI hint and export that must be reviewed before you would commit it (see Practice 4 in `06-SOLUTIONS-AND-REVIEW.md`), then revert.

6. **Cutting by code units.** **Goal:** sanitize a `recipientName` of 119 `A`s followed by one emoji (`'\u{1F600}'`). **Check:** the result has length 120 and `charCodeAt(119)` is `0xd83d`, a lone high surrogate. Explain why `.slice(0, max)` on a JavaScript string can split a character, and propose a fix (for example `Array.from(value).slice(0, max).join('')`) without editing the repo.

7. **Guard placement (Vitest).** **Goal:** prove the reason check in `recordFailure` (`useAppStore.ts:942`) runs before `setStopStatus` (line 946). **Check:** in a local experiment, move `!isFailureReason(reason)` to after the `setStopStatus` call and run `pnpm test tests/store.test.ts`; the test that calls `recordFailure(other, 'not-a-reason' as never, 42 as never)` (`tests/store.test.ts:517`) should fail. Revert with `git checkout -- src/store/useAppStore.ts` and confirm the suite is green again.

8. **Extend safely (search, no commit).** **Goal:** list every place a new delivery method (say `'locker'`) must be added. **Check:** `grep -rn "neighbour" src tests` finds the method in `src/lib/types.ts:8` (the union), `src/lib/deliveryValidation.ts:3` (runtime set), `src/components/driver/DeliverySheet.tsx:25,30` (options and icon), `src/components/driver/report.ts:12,20` (two label maps), and the store tests; the hits in `src/lib/optimizer/` are the unrelated "nearest-neighbour" algorithm. Then predict which omissions `pnpm typecheck` would catch: the two label maps are `Record<DeliveryMethod, string>`, so a missing key fails typecheck, but the validator `Set` and `DELIVERY_METHODS` array are not exhaustive. Forgetting the `Set` is the realistic silent failure: the form offers `'locker'` and the sanitizer drops it.

9. **Review the architecture (written).** **Goal:** sketch how the same contract would be enforced in a server route with a schema parser. **Check:** your answer names which client checks remain useful, which decisions must move server-side (identity, ownership, allowed transitions, transactional write), and states that localStorage validation is not security.
