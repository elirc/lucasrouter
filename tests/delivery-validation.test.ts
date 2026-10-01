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
