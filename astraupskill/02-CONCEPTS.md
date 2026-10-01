# Concepts: types, validation, and state transitions

## Boundary vocabulary

Think of a sanitizer as a projection from a large unknown space into a small accepted space. It cannot add a required timestamp or decide authorization. A command guard is different: it decides whether a state transition is allowed. This vocabulary makes code review precise: “sanitize optional fields” and “reject invalid outcomes” are policies with different user impact and test shapes.

A TypeScript type is erased at runtime. `proof?: DeliveryProofInput` helps a developer pass the right fields, but it cannot stop a plain JavaScript caller or a value restored from old localStorage. Runtime validation answers a different question: does this value have a shape and vocabulary the application is willing to persist? Treat the store action as an API boundary even when the API is an in-memory function.

Sanitization and rejection are separate policies. Proof fields are optional, so `sanitizeDeliveryProof` removes unknown or malformed optional values and returns a safe partial proof. A failure reason controls the meaning of an event, so `recordFailure` rejects an unknown reason with `false`. This distinction avoids inventing a fake reason while keeping a delivery usable when an optional note is malformed. Trimming is normalization: it makes whitespace-only values absent. Length bounds are a storage policy: they protect a localStorage-backed demo from accidental unbounded writes. The image data URL check is a format check, while `PHOTO_BUDGET_BYTES` remains a capacity check.

The mutation preserves a state invariant: a successful delivery updates exactly one known stop and appends exactly one delivered event. An invalid stop or reason must leave state unchanged. `undoStop` is a separate transition that clears proof and appends an undo event; reports interpret the latest outcome. Do not “fix” an invalid payload by writing a partially meaningful event, because downstream summaries would count it.

Mid-level design means naming the invariant, placing the guard where all callers share it, keeping the helper pure, and testing both accepted and rejected paths. It also means documenting limits. This validator does not prove authorization, decode image bytes, or make two tabs transactional. Those require server or coordination design beyond this browser demo. Exercise: choose whether an invalid `photo` should reject the whole delivery or be dropped, and defend the answer using optionality and user impact.

Here is the useful distinction in code:

```ts
const safe = sanitizeDeliveryProof(input); // optional fields may disappear
if (!isFailureReason(reason)) return false; // outcome vocabulary is required
setStopStatus(stopId, 'failed', reason);    // only after the guard
```

The first line is tolerant normalization. The second is a command precondition. Keeping those policies separate makes callers predictable and prevents a malformed optional field from blocking a driver while still preventing a fabricated business outcome.

## Glossary

*Runtime guard*: a check that runs on real data (`isDeliveryMethod`), as opposed to a compile-time type that is erased. *Boundary*: the place where untrusted data enters (a form, a store action, a route). *Narrowing*: TypeScript accepting a value as a more specific type after a guard returns true. *Data URL*: `data:image/jpeg;base64,...`, the encoded picture stored inline. *Proof/event parity*: the proof on the stop and the event in the log describe the same delivery and must agree. *`as unknown` cast in tests*: how a test passes deliberately wrong input past the compiler to exercise the runtime guard.

