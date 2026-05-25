import { describe, expect, it } from 'vitest';
import { removalMessageFor } from '../src/modcase/messages.js';
import { REASON_LABELS } from '../src/modcase/reasons.js';

describe('removal message helper', () => {
  it('suggests reason-specific mod-facing wording', () => {
    expect(removalMessageFor('harassment_abuse').toLowerCase()).toContain('harassment');
    expect(removalMessageFor('spam_promotional').toLowerCase()).toContain('spam');
  });

  it('has non-empty wording for every controlled reason', () => {
    for (const reason of REASON_LABELS) {
      expect(removalMessageFor(reason.value).length).toBeGreaterThan(0);
    }
  });
});
