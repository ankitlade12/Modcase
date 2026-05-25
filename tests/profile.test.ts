import { describe, expect, it } from 'vitest';
import { buildCommunityProfile, compareProfiles, encodeCommunityProfile, parseCommunityProfile } from '../src/modcase/profile.js';
import type { DecisionSummary } from '../src/modcase/types.js';

function summary(removed: number, approved: number): DecisionSummary {
  const total = removed + approved;
  const majorityAction = removed >= approved ? 'removed' : 'approved';
  return { total, removed, approved, signal: 'settled', majorityAction };
}

describe('community profiles', () => {
  it('includes only buckets with enough history (k-anonymity on bucket size)', () => {
    const profile = buildCommunityProfile(
      'ours',
      [
        { targetType: 'comment', reasonLabel: 'harassment_abuse', summary: summary(8, 1) },
        { targetType: 'post', reasonLabel: 'low_effort', summary: summary(2, 1) },
      ],
      1000,
    );

    expect(profile.buckets).toHaveLength(1);
    expect(profile.buckets[0]).toMatchObject({ targetType: 'comment', reasonLabel: 'harassment_abuse', total: 9, majorityAction: 'removed' });
  });

  it('round-trips through encode/parse and rejects malformed input', () => {
    const profile = buildCommunityProfile('ours', [{ targetType: 'comment', reasonLabel: 'spam_promotional', summary: summary(6, 0) }], 1000);
    const parsed = parseCommunityProfile(encodeCommunityProfile(profile));

    expect(parsed?.buckets[0]).toMatchObject({ reasonLabel: 'spam_promotional', total: 6 });
    expect(parseCommunityProfile('not json')).toBeNull();
    expect(parseCommunityProfile('{"v":2}')).toBeNull();
    expect(parseCommunityProfile(undefined)).toBeNull();
  });

  it('compares shared buckets and flags agreement vs divergence', () => {
    const local = buildCommunityProfile(
      'ours',
      [
        { targetType: 'comment', reasonLabel: 'harassment_abuse', summary: summary(9, 1) },
        { targetType: 'post', reasonLabel: 'spam_promotional', summary: summary(6, 0) },
      ],
      1000,
    );
    const other = buildCommunityProfile(
      'other',
      [
        { targetType: 'comment', reasonLabel: 'harassment_abuse', summary: summary(2, 7) },
        { targetType: 'post', reasonLabel: 'spam_promotional', summary: summary(6, 0) },
      ],
      1000,
    );

    const rows = compareProfiles(local, other);
    expect(rows).toHaveLength(2);

    const harassment = rows.find((row) => row.reasonLabel === 'harassment_abuse');
    expect(harassment?.agree).toBe(false);
    expect(harassment?.localMajority).toBe('removed');
    expect(harassment?.otherMajority).toBe('approved');

    const spam = rows.find((row) => row.reasonLabel === 'spam_promotional');
    expect(spam?.agree).toBe(true);
  });

  it('extracts the JSON object from a full multi-line export block', () => {
    const profile = buildCommunityProfile('ours', [{ targetType: 'comment', reasonLabel: 'harassment_abuse', summary: summary(7, 1) }], 1000);
    const exportBlock = `ModCase community profile\nSubreddit: r/ours\nAggregate only - no usernames.\n\n${encodeCommunityProfile(profile)}`;
    const parsed = parseCommunityProfile(exportBlock);
    expect(parsed?.subreddit).toBe('ours');
    expect(parsed?.buckets[0]).toMatchObject({ reasonLabel: 'harassment_abuse', total: 8 });
  });

  it('treats two buckets with no clear majority as aligned, not differing', () => {
    const noMajority = {
      v: 1 as const,
      subreddit: 's',
      generatedAt: 0,
      buckets: [{ targetType: 'comment' as const, reasonLabel: 'harassment_abuse' as const, total: 6, removed: 3, approved: 3, signal: 'contested' as const }],
    };
    const rows = compareProfiles(noMajority, noMajority);
    expect(rows[0].agree).toBe(true);
  });

  it('drops buckets with an unknown reason label or negative counts', () => {
    const crafted = JSON.stringify({
      v: 1,
      subreddit: 'x',
      generatedAt: 0,
      buckets: [
        { targetType: 'comment', reasonLabel: 'totally_made_up', total: 9, removed: 9, approved: 0, signal: 'settled', majorityAction: 'removed' },
        { targetType: 'post', reasonLabel: 'spam_promotional', total: -5, removed: -5, approved: 0, signal: 'settled' },
        { targetType: 'comment', reasonLabel: 'spam_promotional', total: 6, removed: 6, approved: 0, signal: 'settled', majorityAction: 'removed' },
      ],
    });
    const parsed = parseCommunityProfile(crafted);
    expect(parsed?.buckets).toHaveLength(1);
    expect(parsed?.buckets[0].reasonLabel).toBe('spam_promotional');
  });
});
