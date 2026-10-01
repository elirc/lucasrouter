# Testing and debugging the boundary

## The boundary tests, in full

Run one file:

```powershell
pnpm test tests/delivery-validation.test.ts
pnpm test tests/store.test.ts -t "photo budget"
```

`tests/delivery-validation.test.ts` as it stands after the fix pass:

```typescript
import { describe, expect, it } from 'vitest';
import { isDeliveryMethod, isFailureReason, sanitizeDeliveryProof } from '@/lib/deliveryValidation';

describe('delivery input boundary', () => {
  it('accepts only the domain enum values', () => {
    expect(isDeliveryMethod('door')).toBe(true);
    expect(isDeliveryMethod('pickup')).toBe(false);
    expect(isFailureReason('Damaged')).toBe(true);
    expect(isFailureReason('')).toBe(false);
  });

  it('trims and bounds text while preserving a valid photo data URL', () => {
    const result = sanitizeDeliveryProof({
      method: 'handed',
      recipientName: `  ${'A'.repeat(150)}  `,
      note: ` ${'N'.repeat(600)} `,
      photo: 'data:image/jpeg;base64,abc',
    });
    expect(result.method).toBe('handed');
    expect(result.recipientName).toHaveLength(120);
    expect(result.note).toHaveLength(500);
    expect(result.photo).toBe('data:image/jpeg;base64,abc');
  });

  it('drops malformed values rather than persisting caller supplied objects', () => {
    expect(sanitizeDeliveryProof(null)).toEqual({});
    expect(sanitizeDeliveryProof({ method: 'script', photo: 'https://example.test/x', note: 42 })).toEqual({});
  });
  it('tolerates surrounding whitespace on a photo data URL but still rejects other schemes', () => {
    expect(sanitizeDeliveryProof({ photo: '  data:image/png;base64,QUJD  ' }).photo).toBe('data:image/png;base64,QUJD');
    expect(sanitizeDeliveryProof({ photo: ' https://example.test/x.png ' })).toEqual({});
  });
});
```

The store test for the budget builds its oversized photo from `PHOTO_BUDGET_BYTES - 40` so that changing the constant cannot silently make the test meaningless; before the fix pass it hard-coded `1_499_960`.

## A complete regression walkthrough

Begin with the pure helper. Pass `{ method: 'door', recipientName: '  Pat ', note: 'x'.repeat(700), photo: 'data:image/jpeg;base64,AAAA' }` and assert `Pat`, a 500-character note, and the retained method. Pass `{ method: 'script', note: 42, photo: 'https://example.invalid' }` through `unknown`; assert an empty result. Then use the store fixture: record a known stop with the malformed optional fields and assert the stop is delivered, the proof has no method or URL photo, and the event has no photo marker. Call `recordFailure` with an invalid reason and assert the stop remains pending and the log length is unchanged. Call it again with `Other` and a 700-character note; assert both proof and event contain exactly 500 characters.

Run the focused helper, focused store, and full suite commands documented below. Expected results are 3 helper tests, 52 store tests, and 166 full tests with 46 suites. If the store test fails at the photo budget, inspect the actual retained photo length and the `PHOTO_BUDGET_BYTES` comparison; do not weaken the validator to accommodate an invalid fixture. If a test fails only on Windows, preserve the command, exit code, and report file so the reviewer can distinguish environment contention from a product regression.

Start with pure tests because they are fast and isolate policy. The delivery validation suite checks the positive path (`door`, `Damaged`), invalid enum values, null input, non-string note input, text limits, and an accepted image data URL. These cases are meaningful because they correspond to the actual risks introduced by a runtime boundary: vocabulary drift, shape errors, storage growth, and accidental data loss. A test that only calls the helper with the same typed object the UI already sends would miss the reason for the change.

Then run the project checks in a stable order: `pnpm typecheck`, `pnpm lint`, `pnpm test --run`, and `pnpm build`. Typecheck catches mismatches between the sanitizer output and `DeliveryProof`; lint catches unsafe or unused code; Vitest catches behavior; build exercises the Next.js App Router bundling boundary. Keep source edits out of an active test run so evidence describes one exact tree. If a command fails, save the complete output and fix the first causal error rather than silencing it.

For debugging, add a temporary probe in the pure helper or use a focused test input. Compare `sanitizeDeliveryProof({ method: 'door', note: '  hi  ' })` with the object passed to `recordDelivery`. If the stop changes but no event appears, inspect the store setter and `appendEvent`. If the event appears but a report is wrong, inspect `report.ts` and the event type. If a build fails only in Next, check whether a server module imported a browser-only store. The validator itself has no DOM or storage dependency, which keeps this investigation local.

A good regression test asserts both the returned result and the absence of side effects for rejection. In a store test, snapshot the stop and log lengths before an invalid call and compare them afterward. Avoid asserting implementation details such as helper call counts. Exercise: write a failing test for an invalid reason, then place the guard before `setStopStatus` and rerun only that test before the full suite.
