# Worked change: harden the delivery write path

## Precision correction

Sanitization drops optional fields while allowing the delivery transition: an invalid optional method or photo is dropped while the known stop still becomes delivered. Rejection is reserved for an invalid failure reason and occurs before `setStopStatus`. The photo format check is a structured base64 data URL check, followed by the store’s `PHOTO_BUDGET_BYTES` capacity check. The exact pre-change action excerpt, including its budget comparison, is preserved in [`astraupskill/snapshots/useAppStore.ts.txt`](snapshots/useAppStore.ts.txt).

## Edge-case table

Empty strings become absent; padded strings are trimmed; 700-character notes become 500; unknown methods disappear; unknown reasons reject; malformed URL photos disappear; valid photos can still be dropped by capacity; unknown stop IDs return `ok: false`; undo remains a separate event. The table is useful during review because each row maps to one assertion and one user-visible consequence.

Before the change, the action trusted its TypeScript input. It copied `proof.method`, `recipientName`, `note`, and `photo` after a small trim helper, then persisted the resulting stop. That worked for the typed UI but left a gap: runtime callers could store an arbitrary method, non-string values could reach trim logic, and a huge note could consume the browser storage budget. The bug was at the boundary, so the fix stays there rather than scattering checks across components.

First, define small domain guards: `isDeliveryMethod` and `isFailureReason` compare unknown values against explicit sets. Next, define `sanitizeDeliveryProof(input: unknown)`. It returns an empty object for null or non-objects, keeps only known methods, trims names and notes, bounds names to 120 characters and notes to 500, and retains photos matching the implemented image MIME/base64 data-URL pattern. This is a structural filter, not an image decoder or a complete base64 validity check. It does not assign the required timestamp; the store owns time so all events and proofs receive one consistent action timestamp. It also does not decide whether the photo fits the existing byte budget.

The following excerpt is from `recordDelivery`, after the action has found the stop and captured its timestamp `at`. The capacity check runs before a photo is attached to the persisted proof:

```ts
const safeProof = sanitizeDeliveryProof(proof);
const photo = trimmed(safeProof.photo);
// Keep the persisted blob inside its budget: the delivery is recorded
// either way, only the picture is sacrificed (the caller toasts).
const photoDropped =
  photo !== undefined && photoBytesInUse(state.stops) + photo.length > PHOTO_BUDGET_BYTES;
const stored: DeliveryProof = { at };
if (safeProof.method) stored.method = safeProof.method;
const recipientName = trimmed(safeProof.recipientName);
if (recipientName) stored.recipientName = recipientName;
const note = trimmed(safeProof.note);
if (note) stored.note = note;
if (photo && !photoDropped) stored.photo = photo;
```

The action copies only the retained proof fields into the event. In particular, `event.hasPhoto` is set only when `stored.photo` exists. An over-budget candidate therefore records delivery while omitting the photo from both the retained proof and the event marker. The later setter updates the stop and appends the event together.
For a payload `{ method: 'door', recipientName: ' Ana ', note: 'x'.repeat(700), photo: 'https://bad' }`, the persisted proof is `{ method: 'door', recipientName: 'Ana', note: 'x'.repeat(500), at }`; the event copies the method and note but has no photo marker. The stop transition is `{ status: 'delivered', deliveredAt: at, proof: stored }`, and the log grows by exactly one entry. For `{ method: 'script' }`, the proof has no method but the optional field does not make the delivery fail. For `recordFailure('S1', 'made up')`, the result is `false`, the stop remains pending, and the log length does not change.

The store now sanitizes before calculating photo usage and before building both the proof and event. This ordering matters: the budget sees the retained candidate, and the event mirrors the proof fields that actually survived. `recordFailure` rejects an unknown reason before calling `setStopStatus`, so no partial mutation can occur. The new tests cover valid enum values, trimming and bounds, data URL retention, and malformed values becoming an empty object.

Review the two input policies separately. A malformed optional proof field is omitted while a known stop can still become delivered. An unknown failure reason returns `false` before any setter runs. A structurally accepted photo can still be omitted by the capacity policy. These outcomes should be tested independently so a helper test cannot accidentally stand in for a store side-effect assertion.

The write boundary accepts only structured base64 image data URLs. Existing persisted records are merged unchanged by the store migration path; this sanitizer governs new proof writes and does not rewrite old records during hydration.
