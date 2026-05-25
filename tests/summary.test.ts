import { describe, expect, it } from 'vitest';
import { countBucketDivergences, formatPrecedentSummary, summarize } from '../src/modcase/summary.js';
import type { DecisionAction, DecisionRecord } from '../src/modcase/types.js';

function record(action: DecisionAction, i: number): DecisionRecord {
  return {
    decisionId: `d${i}`,
    subreddit: 'example',
    targetType: 'comment',
    targetHash: `h${i}`,
    action,
    reasonLabel: 'harassment_abuse',
    timestamp: Date.UTC(2026, 4, 24) - i * 1000,
    source: 'demo_seed',
    snippet: `snippet ${i}`,
  };
}

describe('precedent summaries', () => {
  it('requires enough history before inferring a pattern', () => {
    expect(summarize([record('removed', 1), record('approved', 2)])).toMatchObject({
      total: 2,
      removed: 1,
      approved: 1,
      signal: 'limited_history',
    });
  });

  it('classifies settled, leaning, and contested patterns', () => {
    expect(summarize([0, 1, 2, 3, 4].map((i) => record('removed', i)))).toMatchObject({
      signal: 'settled',
      majorityAction: 'removed',
      majorityPct: 1,
    });

    expect(summarize(['removed', 'removed', 'removed', 'approved', 'approved'].map((action, i) => record(action as DecisionAction, i)))).toMatchObject({
      signal: 'leaning',
      majorityAction: 'removed',
      majorityPct: 0.6,
    });

    expect(summarize(['removed', 'removed', 'approved', 'approved', 'approved', 'removed'].map((action, i) => record(action as DecisionAction, i)))).toMatchObject({
      signal: 'contested',
      majorityPct: 0.5,
    });
  });

  it('formats examples using the display limit', () => {
    const text = formatPrecedentSummary(
      'harassment_abuse',
      'comment',
      [record('removed', 1), record('removed', 2), record('approved', 3)],
      { lookupLimit: 50, displayLimit: 2, minSignalSample: 5 },
    );

    expect(text).toContain('Reason: Harassment / Abuse');
    expect(text).toContain('Counts from last 50 matching decisions:');
    expect(text).toContain('Limited history: 3 matching decisions');
    expect(text).toContain('Recent trend: last 3 matching decisions include 2 removed and 1 approved.');
    expect(text).toContain('1. removed comment');
    expect(text).toContain('2. removed comment');
    expect(text).not.toContain('3. approved comment');
  });

  it('leads with the verdict before the raw counts', () => {
    const text = formatPrecedentSummary(
      'harassment_abuse',
      'comment',
      [0, 1, 2, 3, 4].map((i) => record('removed', i)),
      { lookupLimit: 50, minSignalSample: 5 },
    );

    expect(text).toContain('Settled team pattern: 100% removed.');
    expect(text.indexOf('Settled team pattern')).toBeLessThan(text.indexOf('Counts from last'));
  });

  it('shows a teaching empty state when there is no history', () => {
    const text = formatPrecedentSummary('low_effort', 'post', [], { lookupLimit: 50 });

    expect(text).toContain('No team precedent yet for Low Effort posts.');
    expect(text).toContain('ModCase: Seed demo data');
    expect(text).not.toContain('Counts from last');
  });
});

describe('consistency divergences', () => {
  it('counts a decision that went against the established majority', () => {
    const records = [record('approved', 0), ...[1, 2, 3, 4, 5].map((i) => record('removed', i))];
    expect(countBucketDivergences(records)).toEqual({ total: 6, divergent: 1 });
  });

  it('counts no divergence when the minority action predates the majority', () => {
    const records = [...[0, 1, 2, 3, 4].map((i) => record('removed', i)), record('approved', 5)];
    expect(countBucketDivergences(records)).toEqual({ total: 6, divergent: 0 });
  });
});
