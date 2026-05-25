import type { ReasonLabel } from './reasons.js';

/**
 * Opt-in, keyword-based reason suggestion. This is a transparent heuristic, NOT an AI
 * classifier and NOT an enforcement recommendation: it only proposes a starting reason
 * label for the precedent picker, which the moderator always confirms or changes. It is
 * off by default so ModCase's "the moderator chooses the reason" posture stays the norm.
 *
 * Order matters: on a tie the earlier entry wins, so the more specific/risky reasons are
 * listed first.
 */
const REASON_HINTS: { reason: ReasonLabel; hints: string[] }[] = [
  {
    reason: 'spam_promotional',
    hints: ['http://', 'https://', 'www.', '.com', '.net', 'discount', 'promo', 'coupon', 'buy now', 'for sale', 'subscribe', 'sign up', 'referral', 'crypto', 'giveaway', 'limited offer'],
  },
  {
    reason: 'harassment_abuse',
    hints: ['idiot', 'stupid', 'moron', 'loser', 'shut up', 'hate you', 'kill yourself', 'kys', 'pathetic', 'trash', 'scum', 'dumbass'],
  },
  {
    reason: 'explicit_content',
    hints: ['nsfw', 'porn', 'nude', 'onlyfans', 'explicit', 'xxx'],
  },
  {
    reason: 'legal_policy',
    hints: ['illegal', 'dox', 'doxx', 'personal info', 'home address', 'copyright', 'dmca', 'pirated', 'leaked'],
  },
  {
    reason: 'off_topic',
    hints: ['off topic', 'off-topic', 'unrelated', 'wrong sub', 'belongs in', 'not relevant', 'no politics'],
  },
  {
    reason: 'low_effort',
    hints: ['low effort', 'low-effort', 'repost', 'shitpost', 'no context', 'title only'],
  },
];

export function suggestReasonFromText(text: string | undefined): ReasonLabel | null {
  if (!text || !text.trim()) return null;
  const haystack = text.toLowerCase();
  let best: { reason: ReasonLabel; score: number } | null = null;
  for (const { reason, hints } of REASON_HINTS) {
    const score = hints.reduce((sum, hint) => (haystack.includes(hint) ? sum + 1 : sum), 0);
    if (score > 0 && (!best || score > best.score)) best = { reason, score };
  }
  return best?.reason ?? null;
}
