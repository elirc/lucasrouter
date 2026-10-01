# Trace lab: malformed delivery proof

The trace uses [`src/components/driver/DeliverySheet.tsx`](../src/components/driver/DeliverySheet.tsx) as the form source, [`src/store/useAppStore.ts`](../src/store/useAppStore.ts) as the mutation boundary, and [`src/components/driver/report.ts`](../src/components/driver/report.ts) as the audit consumer.

## Trace worksheet

Record five rows: form payload, sanitizer output, store state before/after, persisted JSON slice, and report row. For each row write the exact fields, not a screenshot description. The expected key is that proof and event share user fields but differ on media representation: proof carries the photo, event carries `hasPhoto`. This is the audit design that keeps the append-only log small.

Use this lab to observe one payload. Start with the JavaScript-shaped value below, even though TypeScript would normally reject it:

```ts
const payload = {
  method: 'door',
  recipientName: '  Pat  ',
  note: 'N'.repeat(700),
  photo: 'https://example.invalid/photo.jpg',
};
```

Call `sanitizeDeliveryProof(payload)` in a focused test. The method survives because it is in the delivery vocabulary. The name becomes `Pat`. The note is trimmed and cut to 500 characters. The URL is removed because it is not an image data URL. Next call `recordDelivery` for a known stop with the same payload. The action creates one ISO timestamp and uses the sanitized candidate for the proof and event. The existing photo budget sees no retained photo, so `photoDropped` is false. The stop becomes delivered and the event has no `hasPhoto` flag.

Now change the method to `'teleport'`. The sanitizer drops it; the delivery can still be recorded with the remaining optional fields. Change the stop ID to `'missing'`. The action returns `{ ok: false, photoDropped: false }` before sanitizing or writing state. Finally call `recordFailure` with `'made up'` through an unknown cast. It returns `false` before `setStopStatus`, leaving both stop status and event count unchanged.

Record observations as a table with input, helper output, store result, stop status, and log length. This makes side effects visible and teaches a useful debugging habit: inspect state at each boundary instead of staring only at the final screen. Repeat the lab after a reload to see which fields are durable. Then explain why the validator cannot prove that the person submitting the delivery is an authorized driver. That answer should mention the missing server and identity boundary, not claim that localStorage validation is security.
