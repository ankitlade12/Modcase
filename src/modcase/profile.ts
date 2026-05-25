import type { ReasonLabel } from './reasons.js';
import type { DecisionAction, DecisionSummary, SignalKind, TargetType } from './types.js';

/**
 * Cross-community comparison without a shared backend: a subreddit exports an aggregate,
 * anonymized "community profile" (counts and majority action per reason/content-type bucket)
 * that another moderator pastes in to compare norms. Profiles are aggregate-only - no
 * usernames, no moderator identities, no raw content, no target ids - and only buckets with
 * at least PROFILE_MIN_SAMPLE decisions are included (k-anonymity on bucket size).
 */
export const PROFILE_MIN_SAMPLE = 5;

export type ProfileBucket = {
  targetType: TargetType;
  reasonLabel: ReasonLabel;
  total: number;
  removed: number;
  approved: number;
  signal: SignalKind;
  majorityAction?: DecisionAction;
};

export type CommunityProfile = {
  v: 1;
  subreddit: string;
  generatedAt: number;
  buckets: ProfileBucket[];
};

type BucketInput = { targetType: TargetType; reasonLabel: ReasonLabel; summary: DecisionSummary };

export function buildCommunityProfile(subreddit: string, buckets: BucketInput[], generatedAt = Date.now(), minSample = PROFILE_MIN_SAMPLE): CommunityProfile {
  const profileBuckets: ProfileBucket[] = buckets
    .filter((bucket) => bucket.summary.total >= minSample)
    .map((bucket) => ({
      targetType: bucket.targetType,
      reasonLabel: bucket.reasonLabel,
      total: bucket.summary.total,
      removed: bucket.summary.removed,
      approved: bucket.summary.approved,
      signal: bucket.summary.signal,
      ...(bucket.summary.majorityAction ? { majorityAction: bucket.summary.majorityAction } : {}),
    }));
  return { v: 1, subreddit, generatedAt, buckets: profileBuckets };
}

export function encodeCommunityProfile(profile: CommunityProfile): string {
  return JSON.stringify(profile);
}

export function parseCommunityProfile(input: string | undefined): CommunityProfile | null {
  if (!input || !input.trim()) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(input.trim());
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<CommunityProfile>;
  if (candidate.v !== 1 || typeof candidate.subreddit !== 'string' || !Array.isArray(candidate.buckets)) return null;

  const buckets: ProfileBucket[] = [];
  for (const entry of candidate.buckets) {
    if (!entry || typeof entry !== 'object') continue;
    const bucket = entry as Partial<ProfileBucket>;
    if (bucket.targetType !== 'post' && bucket.targetType !== 'comment') continue;
    if (typeof bucket.reasonLabel !== 'string') continue;
    if (typeof bucket.total !== 'number' || typeof bucket.removed !== 'number' || typeof bucket.approved !== 'number') continue;
    buckets.push({
      targetType: bucket.targetType,
      reasonLabel: bucket.reasonLabel as ReasonLabel,
      total: bucket.total,
      removed: bucket.removed,
      approved: bucket.approved,
      signal: (bucket.signal as SignalKind) ?? 'limited_history',
      ...(bucket.majorityAction === 'removed' || bucket.majorityAction === 'approved' ? { majorityAction: bucket.majorityAction } : {}),
    });
  }
  return { v: 1, subreddit: candidate.subreddit, generatedAt: typeof candidate.generatedAt === 'number' ? candidate.generatedAt : 0, buckets };
}

export type ProfileComparisonRow = {
  targetType: TargetType;
  reasonLabel: ReasonLabel;
  localMajority?: DecisionAction;
  localShare: number;
  otherMajority?: DecisionAction;
  otherShare: number;
  agree: boolean;
};

function majorityShare(bucket: ProfileBucket): number {
  if (!bucket.total) return 0;
  return Math.max(bucket.removed, bucket.approved) / bucket.total;
}

export function compareProfiles(local: CommunityProfile, other: CommunityProfile, minSample = PROFILE_MIN_SAMPLE): ProfileComparisonRow[] {
  const bucketKey = (bucket: ProfileBucket) => `${bucket.targetType}:${bucket.reasonLabel}`;
  const otherByKey = new Map(other.buckets.map((bucket) => [bucketKey(bucket), bucket] as const));

  const rows: ProfileComparisonRow[] = [];
  for (const localBucket of local.buckets) {
    if (localBucket.total < minSample) continue;
    const otherBucket = otherByKey.get(bucketKey(localBucket));
    if (!otherBucket || otherBucket.total < minSample) continue;
    rows.push({
      targetType: localBucket.targetType,
      reasonLabel: localBucket.reasonLabel,
      localMajority: localBucket.majorityAction,
      localShare: majorityShare(localBucket),
      otherMajority: otherBucket.majorityAction,
      otherShare: majorityShare(otherBucket),
      agree: Boolean(localBucket.majorityAction) && localBucket.majorityAction === otherBucket.majorityAction,
    });
  }
  return rows;
}
