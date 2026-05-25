import { stableHash } from './hash.js';
import { contentFingerprint } from './fingerprint.js';
import type { DecisionAction, DecisionRecord, TargetType } from './types.js';
import type { ReasonLabel } from './reasons.js';

export const DEMO_SEED_PREFIX = 'demo';

const DEMO_ITEMS = [
  // Newest harassment decision is an approval that lands after a settled "removed" majority,
  // so the consistency digest has one real against-precedent case to surface in demos.
  // Action counts are unchanged (6 removed, 2 approved), so seeded bucket totals stay the same.
  ['harassment_abuse', 'comment', 'approved', 'Sharp disagreement, but not personal abuse.'],
  ['harassment_abuse', 'comment', 'removed', 'Personal attack against another user.'],
  ['harassment_abuse', 'comment', 'removed', 'Insult-heavy reply in a heated thread.'],
  ['harassment_abuse', 'comment', 'removed', 'Direct abuse with no substantive argument.'],
  ['harassment_abuse', 'comment', 'removed', 'Hostile comment targeting a person.'],
  ['harassment_abuse', 'comment', 'removed', 'Repeated name-calling.'],
  ['harassment_abuse', 'comment', 'removed', 'Threatening or intimidating language.'],
  ['harassment_abuse', 'comment', 'approved', 'Borderline but within heated discussion norms.'],
  ['low_effort', 'post', 'removed', 'Title-only post with no context.'],
  ['low_effort', 'post', 'removed', 'Duplicate/basic question already answered.'],
  ['off_topic', 'post', 'removed', 'Unrelated to the community focus.'],
  ['spam_promotional', 'post', 'removed', 'Promotional link with no community value.'],
] as const;

export function buildDemoRecords(subreddit: string, now = Date.now()): DecisionRecord[] {
  return DEMO_ITEMS.map(([reasonLabel, targetType, action, snippet], i) => ({
    decisionId: `${DEMO_SEED_PREFIX}:${subreddit}:${i}`,
    subreddit,
    targetType: targetType as TargetType,
    targetHash: stableHash(`${subreddit}:${targetType}:demo-${i}`),
    action: action as DecisionAction,
    reasonLabel: reasonLabel as ReasonLabel,
    timestamp: now - (i + 1) * 86_400_000,
    source: 'demo_seed',
    contentFingerprint: contentFingerprint(snippet),
    snippet,
  }));
}
