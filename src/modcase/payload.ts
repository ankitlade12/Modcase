import { stableHash } from './hash.js';
import { contentFingerprint } from './fingerprint.js';
import { normalizeReasonValue, type ReasonLabel } from './reasons.js';
import type { DecisionAction, DecisionRecord, LookupContext, TargetType } from './types.js';

export const DEFAULT_APP_ACCOUNT_NAMES = new Set(['modcase', 'modcaseapp', 'modcase-bot', 'modcase-v1']);

export function actorLooksAutomated(actor: string | null, appAccountNames = DEFAULT_APP_ACCOUNT_NAMES): boolean {
  if (!actor) return true;
  const normalized = actor.trim().toLowerCase().replace(/^u\//, '');
  if (!normalized) return true;
  if (normalized === 'automoderator') return true;
  if (appAccountNames.has(normalized)) return true;
  if (normalized.endsWith('bot')) return true;
  return false;
}

export function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export function extractActor(payload: any): string | null {
  return pickFirstString(
    payload?.moderatorName,
    payload?.moderator?.name,
    payload?.mod?.name,
    payload?.actor?.name,
    payload?.data?.moderatorName,
    payload?.data?.moderator?.name,
    payload?.action?.moderatorName,
    payload?.action?.moderator?.name,
  );
}

export function extractSubreddit(payload: any, fallbackSubreddit?: string | null): string {
  return (
    pickFirstString(
      payload?.subredditName,
      payload?.subreddit?.name,
      payload?.subreddit?.displayName,
      payload?.data?.subredditName,
      payload?.action?.subredditName,
      fallbackSubreddit,
    ) ?? 'unknown_subreddit'
  )
    .replace(/^r\//, '')
    .toLowerCase();
}

export function extractActionType(payload: any): string | null {
  return pickFirstString(
    payload?.action,
    payload?.action?.type,
    payload?.actionType,
    payload?.modAction?.type,
    payload?.data?.action,
    payload?.data?.action?.type,
    payload?.data?.actionType,
    payload?.data?.type,
    payload?.details?.type,
    payload?.type,
  );
}

export function normalizeDecisionAction(payload: any): DecisionAction | null {
  const raw = extractActionType(payload)?.toLowerCase() ?? '';

  if (raw.includes('ban') || raw.includes('filter') || raw.includes('escalat')) return null;
  if (raw.includes('approve')) return 'approved';
  if (raw.includes('remove') || raw.includes('spam')) return 'removed';
  return null;
}

export function normalizeTargetType(payload: any): TargetType | null {
  const targetCommentId = pickFirstString(payload?.targetComment?.id);
  const targetPostId = pickFirstString(payload?.targetPost?.id);
  if (targetCommentId) return 'comment';
  if (targetPostId) return 'post';

  const raw = pickFirstString(
    payload?.target?.type,
    payload?.targetType,
    payload?.thingType,
    payload?.data?.target?.type,
    payload?.data?.targetType,
    payload?.action?.target?.type,
    payload?.action?.targetType,
    extractActionType(payload),
  )?.toLowerCase();

  if (!raw) return null;
  if (raw.includes('comment')) return 'comment';
  if (raw.includes('post') || raw.includes('link')) return 'post';
  return null;
}

export function extractTargetId(payload: any): string | null {
  return pickFirstString(
    payload?.target?.id,
    payload?.target?.fullname,
    payload?.targetComment?.id,
    payload?.targetPost?.id,
    payload?.targetId,
    payload?.thingId,
    payload?.post?.id,
    payload?.comment?.id,
    payload?.data?.target?.id,
    payload?.data?.targetId,
    payload?.action?.target?.id,
    payload?.action?.targetId,
  );
}

export function extractReasonLabel(payload: any): ReasonLabel {
  const controlledCandidates = [
    payload?.removalReason,
    payload?.removalReason?.title,
    payload?.removalReason?.id,
    payload?.reason,
    payload?.genericReason,
    payload?.details?.reason,
    payload?.details?.removalReason,
    payload?.data?.reason,
    payload?.data?.removalReason,
    payload?.action?.reason,
    payload?.action?.details?.reason,
  ];

  for (const candidate of controlledCandidates) {
    const mapped = normalizeReasonValue(candidate);
    if (mapped) return mapped;
  }
  return 'unknown_reason';
}

export function extractTimestamp(payload: any, now = Date.now()): number {
  const raw = payload?.createdAt ?? payload?.timestamp ?? payload?.actionedAt ?? payload?.data?.createdAt ?? payload?.action?.createdAt;
  if (typeof raw === 'number') return raw > 10_000_000_000 ? raw : raw * 1000;
  if (typeof raw === 'string') {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return now;
}

export function extractModActionId(payload: any): string | null {
  return pickFirstString(payload?.id, payload?.modActionId, payload?.data?.id, payload?.action?.id);
}

export function extractSnippet(payload: any): string | undefined {
  const text = pickFirstString(
    payload?.target?.body,
    payload?.target?.title,
    payload?.targetComment?.body,
    payload?.targetPost?.title,
    payload?.targetPost?.selftext,
    payload?.post?.title,
    payload?.comment?.body,
    payload?.data?.target?.body,
    payload?.data?.target?.title,
  );
  if (!text) return undefined;
  return text.replace(/\s+/g, ' ').trim().slice(0, 140);
}

export function buildDecisionFromModAction(
  payload: any,
  options: {
    appAccountNames?: Set<string>;
    fallbackSubreddit?: string | null;
    now?: number;
  } = {},
): DecisionRecord | null {
  const actor = extractActor(payload);
  if (actorLooksAutomated(actor, options.appAccountNames)) return null;

  const action = normalizeDecisionAction(payload);
  const targetType = normalizeTargetType(payload);
  const targetId = extractTargetId(payload);
  if (!action || !targetType || !targetId) return null;

  const subreddit = extractSubreddit(payload, options.fallbackSubreddit);
  const reasonLabel = extractReasonLabel(payload);
  const modActionId = extractModActionId(payload);
  const timestamp = extractTimestamp(payload, options.now);
  const snippet = extractSnippet(payload);
  const fallbackBasis = `${subreddit}:${targetType}:${targetId}:${action}:${reasonLabel}:${timestamp}`;
  const decisionId = modActionId ? `modaction:${modActionId}` : `fallback:${stableHash(fallbackBasis)}`;

  return {
    decisionId,
    subreddit,
    targetType,
    targetHash: stableHash(`${subreddit}:${targetType}:${targetId}`),
    action,
    reasonLabel,
    timestamp,
    source: 'mod_action_trigger',
    contentFingerprint: contentFingerprint(snippet),
    snippet,
  };
}

export function targetContextFromMenu(input: any, fallbackSubreddit?: string | null): LookupContext | null {
  const targetId = pickFirstString(input?.postId, input?.commentId, input?.targetId, input?.thingId, input?.post?.id, input?.comment?.id);
  if (!targetId) return null;

  const raw = pickFirstString(input?.location, input?.targetType, input?.thingType, input?.postId ? 'post' : null, input?.commentId ? 'comment' : null)?.toLowerCase();
  const targetType: TargetType | null = raw?.includes('comment') ? 'comment' : raw?.includes('post') ? 'post' : null;
  if (!targetType) return null;

  const currentSnippet = extractSnippet(input);
  return {
    targetType,
    targetId,
    subreddit: extractSubreddit(input, fallbackSubreddit),
    ...(currentSnippet ? { currentSnippet } : {}),
  };
}
