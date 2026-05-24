import { describe, expect, it } from 'vitest';
import { contentFingerprint } from '../src/modcase/fingerprint.js';
import { stableHash } from '../src/modcase/hash.js';
import {
  actorLooksAutomated,
  buildDecisionFromModAction,
  extractReasonLabel,
  extractSubreddit,
  normalizeDecisionAction,
  normalizeTargetType,
  targetContextFromMenu,
} from '../src/modcase/payload.js';

describe('payload normalization', () => {
  it('filters automated actors and known app accounts', () => {
    expect(actorLooksAutomated(null)).toBe(true);
    expect(actorLooksAutomated('AutoModerator')).toBe(true);
    expect(actorLooksAutomated('helpfulbot')).toBe(true);
    expect(actorLooksAutomated('u/modcase')).toBe(true);
    expect(actorLooksAutomated('u/modcase-v1')).toBe(true);
    expect(actorLooksAutomated('human_mod')).toBe(false);
  });

  it('normalizes supported decision actions and excludes non-precedent actions', () => {
    expect(normalizeDecisionAction({ type: 'approvecomment' })).toBe('approved');
    expect(normalizeDecisionAction({ type: 'ModAction', action: 'approvelink' })).toBe('approved');
    expect(normalizeDecisionAction({ action: { type: 'removelink' } })).toBe('removed');
    expect(normalizeDecisionAction({ action: 'banuser' })).toBeNull();
    expect(normalizeDecisionAction({ action: 'filtercomment' })).toBeNull();
  });

  it('normalizes target type and subreddit from varied payload shapes', () => {
    expect(normalizeTargetType({ targetType: 'link' })).toBe('post');
    expect(normalizeTargetType({ action: 'approvelink' })).toBe('post');
    expect(normalizeTargetType({ data: { target: { type: 'comment' } } })).toBe('comment');
    expect(normalizeTargetType({ targetComment: { id: 't1_real' } })).toBe('comment');
    expect(normalizeTargetType({ targetPost: { id: 't3_real' } })).toBe('post');
    expect(extractSubreddit({ subredditName: 'r/ExampleSub' })).toBe('examplesub');
    expect(extractSubreddit({}, 'FallbackSub')).toBe('fallbacksub');
  });

  it('uses controlled reason-like fields and ignores unknown text', () => {
    expect(extractReasonLabel({ removalReason: { title: 'Spam' } })).toBe('spam_promotional');
    expect(extractReasonLabel({ details: { reason: 'Rule 4 - Off Topic' } })).toBe('off_topic');
    expect(extractReasonLabel({ details: { description: 'This is not a controlled key' } })).toBe('unknown_reason');
  });

  it('builds a privacy-conscious decision record for a human mod action', () => {
    const payload = {
      id: 'ma_123',
      moderatorName: 'human_mod',
      subredditName: 'r/ModCaseTest',
      type: 'removecomment',
      target: {
        id: 't1_abc',
        type: 'comment',
        body: '  Personal attack\nwith extra whitespace.  ',
      },
      removalReason: { title: 'Harassment' },
      createdAt: '2026-05-24T12:00:00.000Z',
    };

    expect(buildDecisionFromModAction(payload)).toEqual({
      decisionId: 'modaction:ma_123',
      subreddit: 'modcasetest',
      targetType: 'comment',
      targetHash: stableHash('modcasetest:comment:t1_abc'),
      action: 'removed',
      reasonLabel: 'harassment_abuse',
      timestamp: Date.parse('2026-05-24T12:00:00.000Z'),
      source: 'mod_action_trigger',
      contentFingerprint: contentFingerprint('Personal attack with extra whitespace.'),
      snippet: 'Personal attack with extra whitespace.',
    });
  });

  it('builds a decision from Reddit Devvit ModAction envelope payloads', () => {
    const payload = {
      action: 'approvelink',
      actionedAt: '2026-05-24T21:41:00.000Z',
      id: 'ma_live_1',
      type: 'ModAction',
      moderator: { name: 'ChoiceThese6213' },
      subreddit: { name: 'modcase_v1_dev' },
      targetComment: { id: '' },
      targetPost: {
        id: 't3_1tmms2d',
        title: 'Test moderation case',
      },
    };

    expect(buildDecisionFromModAction(payload)).toEqual({
      decisionId: 'modaction:ma_live_1',
      subreddit: 'modcase_v1_dev',
      targetType: 'post',
      targetHash: stableHash('modcase_v1_dev:post:t3_1tmms2d'),
      action: 'approved',
      reasonLabel: 'unknown_reason',
      timestamp: Date.parse('2026-05-24T21:41:00.000Z'),
      source: 'mod_action_trigger',
      contentFingerprint: contentFingerprint('Test moderation case'),
      snippet: 'Test moderation case',
    });
  });

  it('skips automated, incomplete, and unsupported mod actions', () => {
    expect(buildDecisionFromModAction({ moderatorName: 'AutoModerator', type: 'removecomment', target: { id: 't1_a', type: 'comment' } })).toBeNull();
    expect(buildDecisionFromModAction({ moderatorName: 'human_mod', type: 'banuser', target: { id: 'u_a', type: 'user' } })).toBeNull();
    expect(buildDecisionFromModAction({ moderatorName: 'human_mod', type: 'removecomment', target: { type: 'comment' } })).toBeNull();
    expect(
      buildDecisionFromModAction({
        action: 'dev_platform_app_changed',
        actionedAt: '2026-05-24T19:57:12.616Z',
        type: 'ModAction',
        moderator: { name: 'ChoiceThese6213' },
        subreddit: { name: 'modcase_v1_dev' },
        targetComment: { id: '' },
        targetPost: { id: '' },
      }),
    ).toBeNull();
  });

  it('extracts menu target context for post and comment menu payloads', () => {
    expect(targetContextFromMenu({ postId: 't3_abc', subredditName: 'r/Example' })).toEqual({
      targetType: 'post',
      targetId: 't3_abc',
      subreddit: 'example',
    });

    expect(targetContextFromMenu({ location: 'comment', comment: { id: 't1_def' } }, 'fallback')).toEqual({
      targetType: 'comment',
      targetId: 't1_def',
      subreddit: 'fallback',
    });

    expect(targetContextFromMenu({ location: 'subreddit' }, 'fallback')).toBeNull();
  });
});
