import { describe, expect, it } from 'vitest';
import { labelFor, normalizeReasonValue } from '../src/modcase/reasons.js';

describe('reason normalization', () => {
  it('normalizes configured reason values and common aliases', () => {
    expect(normalizeReasonValue('Harassment / Abuse')).toBe('harassment_abuse');
    expect(normalizeReasonValue('Rule 2: Personal Attacks')).toBe('harassment_abuse');
    expect(normalizeReasonValue('self promotion')).toBe('spam_promotional');
    expect(normalizeReasonValue('NSFW')).toBe('explicit_content');
    expect(normalizeReasonValue('Legal / policy')).toBe('legal_policy');
    expect(normalizeReasonValue('legal_safety')).toBe('legal_policy');
  });

  it('returns null for freeform unmapped values', () => {
    expect(normalizeReasonValue('be nicer please')).toBeNull();
    expect(normalizeReasonValue('')).toBeNull();
    expect(normalizeReasonValue(undefined)).toBeNull();
  });

  it('returns the display label for a controlled value', () => {
    expect(labelFor('legal_policy')).toBe('Legal / Policy');
  });
});
