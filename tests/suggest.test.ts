import { describe, expect, it } from 'vitest';
import { suggestReasonFromText } from '../src/modcase/suggest.js';

describe('reason suggestion (opt-in keyword heuristic)', () => {
  it('suggests spam for promotional text', () => {
    expect(suggestReasonFromText('Buy now! Huge discount, promo code at https://mysite.com')).toBe('spam_promotional');
  });

  it('suggests harassment for abusive text', () => {
    expect(suggestReasonFromText('you are an idiot and a moron, shut up')).toBe('harassment_abuse');
  });

  it('returns null when no hints match', () => {
    expect(suggestReasonFromText('A thoughtful question about gardening tips')).toBeNull();
  });

  it('returns null for empty or missing text', () => {
    expect(suggestReasonFromText(undefined)).toBeNull();
    expect(suggestReasonFromText('   ')).toBeNull();
  });

  it('is a heuristic: a benign crypto question is still flagged as spam (acknowledged limitation)', () => {
    // Documents a known false positive. Acceptable because the feature is opt-in, suggestion-only,
    // and the moderator confirms or changes the reason; all options stay available.
    expect(suggestReasonFromText('What is the best crypto exchange for beginners?')).toBe('spam_promotional');
  });
});
