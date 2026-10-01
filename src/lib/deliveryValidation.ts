import type { DeliveryMethod, DeliveryProof, FailureReason } from './types';

const METHODS = new Set<DeliveryMethod>(['handed', 'door', 'neighbour', 'desk']);
const REASONS = new Set<FailureReason>(['No one home', 'Wrong address', 'Damaged', 'Other']);
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;

/** Runtime guard for values crossing the browser/UI boundary into the store. */
export function isDeliveryMethod(value: unknown): value is DeliveryMethod {
  return typeof value === 'string' && METHODS.has(value as DeliveryMethod);
}

export function isFailureReason(value: unknown): value is FailureReason {
  return typeof value === 'string' && REASONS.has(value as FailureReason);
}

function cleanText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.trim();
  return cleaned ? cleaned.slice(0, maxLength) : undefined;
}

/**
 * Keep persisted proof data bounded and structurally safe even when a caller
 * is JavaScript, a stale form, or a browser extension rather than TypeScript.
 * Photos are accepted only as data URLs; the store applies its separate byte
 * budget before retaining them.
 */
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

/** Same bounded text policy for failure notes that are stored separately. */
export function sanitizeDeliveryNote(value: unknown): string | undefined {
  return cleanText(value, MAX_NOTE_LENGTH);
}
