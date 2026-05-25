import { Hono } from 'hono';
import type { MenuItemRequest, TriggerResponse, UiResponse } from '@devvit/web/shared';
import { buildDemoRecords } from './modcase/demo.js';
import { makeId, stableHash } from './modcase/hash.js';
import { decisionKey, idxKey, lookupContextKey, rawLogKey, ruleMappingKey, settingsKey, trainingContextKey } from './modcase/keys.js';
import { buildDecisionFromModAction, extractSubreddit, targetContextFromMenu } from './modcase/payload.js';
import { suggestReasonFromText } from './modcase/suggest.js';
import {
  buildCommunityProfile,
  compareProfiles,
  encodeCommunityProfile,
  parseCommunityProfile,
  PROFILE_MIN_SAMPLE,
  type CommunityProfile,
  type ProfileComparisonRow,
} from './modcase/profile.js';
import { REASON_LABELS, labelFor, normalizeReasonValue, type ReasonLabel } from './modcase/reasons.js';
import { countBucketDivergences, DEFAULT_LOOKUP_LIMIT, DEFAULT_MIN_SIGNAL_SAMPLE, formatPrecedentSummary, formatSignal, summarize } from './modcase/summary.js';
import {
  DEFAULT_SETTINGS,
  LOOKUP_LIMIT_OPTIONS,
  RETENTION_DAY_OPTIONS,
  normalizeSettings,
  settingsExpiration,
} from './modcase/settings.js';
import type { DecisionAction, DecisionRecord, DecisionSummary, LookupContext, ModCaseSettings, TargetType } from './modcase/types.js';

type RedisLike = {
  set(key: string, value: string, options?: { expiration?: Date }): Promise<unknown>;
  get(key: string): Promise<string | null | undefined>;
  mGet(keys: string[]): Promise<(string | null | undefined)[]>;
  zAdd(key: string, item: { member: string; score: number }): Promise<unknown>;
  zCard(key: string): Promise<number>;
  zRange(key: string, start: number, stop: number, options?: unknown): Promise<{ member: string; score?: number }[]>;
  zRem?(key: string, members: string[]): Promise<unknown>;
  del?(key: string): Promise<unknown>;
};

type ModCaseAppOptions = {
  redis: RedisLike;
  reddit?: {
    getRules?(subredditName: string): Promise<RedditRule[]>;
  };
  getSubredditName?: () => string | null;
  captureRawPayloadsForDebug?: boolean;
  lookupLimit?: number;
};

type ReasonPickerForm = {
  lookupToken?: string;
  lookupTarget?: LookupContext;
  reasonLabel?: string | string[];
};

type ManualCorrectionForm = ReasonPickerForm & {
  decisionAction?: string | string[];
  internalNote?: string;
};

type SettingsForm = {
  subreddit?: string;
  decisionRetentionDays?: string | string[];
  lookupLimit?: string | string[];
  reasonSuggestion?: string | string[];
};

type UnknownCleanupForm = {
  subreddit?: string;
  targetType?: string | string[];
  reasonLabel?: string | string[];
};

type TrainingAnswerForm = {
  decisionAction?: string | string[];
};

type RedditRule = {
  shortName?: string;
  description?: string;
  violationReason?: string;
  kind?: string;
};

type ImportedRule = {
  shortName: string;
  kind: string;
  reasonLabel: ReasonLabel;
};

type BucketSummary = {
  targetType: TargetType;
  reasonLabel: ReasonLabel;
  records: DecisionRecord[];
  summary: DecisionSummary;
};

type TrainingContext = {
  decisionId: string;
  subreddit: string;
};

const LOOKUP_CONTEXT_TTL_SECONDS = 30 * 60;
const DEBUG_PAYLOAD_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const FORM_CONTEXT_SEPARATOR = '::modcasectx::';

function expirationFromNow(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

function isLookupContext(value: unknown): value is LookupContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LookupContext>;
  return (
    (candidate.targetType === 'post' || candidate.targetType === 'comment') &&
    typeof candidate.targetId === 'string' &&
    candidate.targetId.trim().length > 0 &&
    typeof candidate.subreddit === 'string' &&
    candidate.subreddit.trim().length > 0 &&
    (candidate.currentSnippet === undefined || typeof candidate.currentSnippet === 'string')
  );
}

function firstFormValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDecisionActionValue(value: unknown): DecisionAction | null {
  if (value === 'removed' || value === 'approved') return value;
  return null;
}

function normalizeTargetTypeValue(value: unknown): TargetType | null {
  if (value === 'post' || value === 'comment') return value;
  return null;
}

function cleanInternalNote(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 180);
  return cleaned || undefined;
}

function encodeFormContextValue(value: string, context: string): string {
  return `${value}${FORM_CONTEXT_SEPARATOR}${context}`;
}

function decodeFormContextValue(value: string | undefined): { value?: string; context?: string } {
  if (!value) return {};
  const [rawValue, ...contextParts] = value.split(FORM_CONTEXT_SEPARATOR);
  return {
    value: rawValue,
    context: contextParts.length ? contextParts.join(FORM_CONTEXT_SEPARATOR) : undefined,
  };
}

function parseJsonObject(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function firstNumberValue(value: string | string[] | undefined): number | undefined {
  const raw = decodeFormContextValue(firstFormValue(value)).value;
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function settingsFromForm(body: SettingsForm, now = Date.now()): ModCaseSettings {
  const suggestionValue = decodeFormContextValue(firstFormValue(body.reasonSuggestion)).value;
  return normalizeSettings(
    {
      decisionRetentionDays: firstNumberValue(body.decisionRetentionDays),
      lookupLimit: firstNumberValue(body.lookupLimit),
      reasonSuggestionEnabled: suggestionValue === 'on',
      updatedAt: now,
    },
    now,
  );
}

function formatSettings(settings: ModCaseSettings): string {
  return [
    `Decision retention: ${settings.decisionRetentionDays} days`,
    `Lookup history cap: ${settings.lookupLimit} matching decisions`,
    settings.updatedAt ? `Last updated: ${new Date(settings.updatedAt).toLocaleString('en-US')}` : 'Last updated: default settings',
  ].join('\n');
}

function formatAuditSnapshot(subreddit: string, rows: { targetType: TargetType; reasonLabel: ReasonLabel; count: number }[]): string {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const activeRows = rows.filter((row) => row.count > 0);

  return [
    'ModCase audit snapshot',
    `Subreddit: r/${subreddit}`,
    `Indexed decision buckets: ${activeRows.length}`,
    `Total indexed decisions: ${total}`,
    '',
    activeRows.length
      ? activeRows.map((row) => `${row.targetType} / ${row.reasonLabel}: ${row.count}`).join('\n')
      : 'No indexed decisions yet. Seed demo history or let automatic capture build history.',
  ].join('\n');
}

function mapRuleToReason(rule: RedditRule): ImportedRule {
  const candidates = [rule.violationReason, rule.shortName, rule.description, [rule.shortName, rule.violationReason, rule.description].filter(Boolean).join(' ')];
  return {
    shortName: rule.shortName || 'Untitled rule',
    kind: rule.kind || 'all',
    reasonLabel: candidates.map(normalizeReasonValue).find(Boolean) ?? 'unknown_reason',
  };
}

function normalizeImportedRules(input: unknown): ImportedRule[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((rule) => {
      if (!rule || typeof rule !== 'object') return null;
      const candidate = rule as Partial<ImportedRule>;
      const reasonLabel = normalizeReasonValue(candidate.reasonLabel);
      if (!reasonLabel) return null;
      return {
        shortName: typeof candidate.shortName === 'string' && candidate.shortName.trim() ? candidate.shortName.trim() : 'Untitled rule',
        kind: typeof candidate.kind === 'string' && candidate.kind.trim() ? candidate.kind.trim() : 'all',
        reasonLabel,
      };
    })
    .filter(Boolean) as ImportedRule[];
}

function normalizeTrainingContext(input: unknown): TrainingContext | null {
  if (!input || typeof input !== 'object') return null;
  const candidate = input as Partial<TrainingContext>;
  if (typeof candidate.decisionId !== 'string' || !candidate.decisionId.trim()) return null;
  if (typeof candidate.subreddit !== 'string' || !candidate.subreddit.trim()) return null;
  return {
    decisionId: candidate.decisionId,
    subreddit: candidate.subreddit,
  };
}

function formatRuleImport(subreddit: string, rules: ImportedRule[]): string {
  return [
    'ModCase rule import',
    `Subreddit: r/${subreddit}`,
    `Rules inspected: ${rules.length}`,
    '',
    rules.length ? rules.map((rule) => `${rule.shortName} (${rule.kind}) -> ${rule.reasonLabel}`).join('\n') : 'No subreddit rules returned by Reddit.',
  ].join('\n');
}

function formatBucketLine(bucket: BucketSummary): string {
  const s = bucket.summary;
  const signal = s.signal === 'limited_history' ? 'limited history' : `${s.signal}${s.majorityAction ? ` ${s.majorityAction}` : ''}`;
  return `${bucket.targetType} / ${labelFor(bucket.reasonLabel)}: ${s.removed} removed, ${s.approved} approved, ${s.total} total - ${signal}`;
}

function formatTrendReport(subreddit: string, settings: ModCaseSettings, buckets: BucketSummary[]): string {
  const activeBuckets = buckets.filter((bucket) => bucket.summary.total > 0).sort((a, b) => b.summary.total - a.summary.total);
  return [
    'ModCase rule trends',
    `Subreddit: r/${subreddit}`,
    formatSettings(settings),
    '',
    activeBuckets.length
      ? activeBuckets.map(formatBucketLine).join('\n')
      : 'No decision history yet. Seed demo history or let automatic capture build history.',
  ].join('\n');
}

function formatContestedReport(subreddit: string, settings: ModCaseSettings, buckets: BucketSummary[]): string {
  const reviewBuckets = buckets
    .filter(
      (bucket) =>
        bucket.summary.total >= DEFAULT_MIN_SIGNAL_SAMPLE &&
        (bucket.summary.signal === 'contested' || bucket.summary.signal === 'leaning'),
    )
    .sort((a, b) => {
      if (a.summary.signal !== b.summary.signal) return a.summary.signal === 'contested' ? -1 : 1;
      return b.summary.total - a.summary.total;
    });

  return [
    'ModCase contested-rule review',
    `Subreddit: r/${subreddit}`,
    formatSettings(settings),
    '',
    reviewBuckets.length
      ? reviewBuckets.map((bucket) => `${formatBucketLine(bucket)}\n${formatSignal(bucket.summary)}`).join('\n\n')
      : 'No contested or weakly leaning buckets with enough recent history.',
  ].join('\n');
}

function formatExportReport(
  subreddit: string,
  settings: ModCaseSettings,
  buckets: BucketSummary[],
  rules: ImportedRule[],
  generatedAt = Date.now(),
): string {
  const activeBuckets = buckets.filter((bucket) => bucket.summary.total > 0).sort((a, b) => b.summary.total - a.summary.total);
  const total = activeBuckets.reduce((sum, bucket) => sum + bucket.summary.total, 0);

  return [
    'ModCase aggregate export',
    `Generated: ${new Date(generatedAt).toISOString()}`,
    `Subreddit: r/${subreddit}`,
    formatSettings(settings),
    `Recent decisions represented: ${total}`,
    '',
    'Privacy posture:',
    'This report contains aggregate decision precedent only. It excludes moderator names, author names, raw target ids, and raw post/comment bodies.',
    '',
    'Rule mapping:',
    rules.length ? rules.map((rule) => `${rule.shortName} (${rule.kind}) -> ${labelFor(rule.reasonLabel)}`).join('\n') : 'No synced subreddit rule mapping.',
    '',
    'Buckets:',
    activeBuckets.length ? activeBuckets.map(formatBucketLine).join('\n') : 'No decision history yet.',
  ].join('\n');
}

function formatRuleHealthReport(subreddit: string, settings: ModCaseSettings, buckets: BucketSummary[]): string {
  const activeBuckets = buckets.filter((bucket) => bucket.summary.total > 0);
  const bySignal = {
    settled: activeBuckets.filter((bucket) => bucket.summary.signal === 'settled').length,
    leaning: activeBuckets.filter((bucket) => bucket.summary.signal === 'leaning').length,
    contested: activeBuckets.filter((bucket) => bucket.summary.signal === 'contested').length,
    limited: activeBuckets.filter((bucket) => bucket.summary.signal === 'limited_history').length,
  };
  const unknownTotal = activeBuckets
    .filter((bucket) => bucket.reasonLabel === 'unknown_reason')
    .reduce((sum, bucket) => sum + bucket.summary.total, 0);
  const topBuckets = activeBuckets.sort((a, b) => b.summary.total - a.summary.total).slice(0, 5);

  return [
    'ModCase rule health',
    `Subreddit: r/${subreddit}`,
    formatSettings(settings),
    '',
    `Active buckets: ${activeBuckets.length}`,
    `Settled: ${bySignal.settled}`,
    `Leaning: ${bySignal.leaning}`,
    `Contested: ${bySignal.contested}`,
    `Limited history: ${bySignal.limited}`,
    `Unknown-reason decisions: ${unknownTotal}`,
    '',
    'Top buckets:',
    topBuckets.length ? topBuckets.map(formatBucketLine).join('\n') : 'No decision history yet.',
    '',
    unknownTotal ? 'Suggestion: run Unknown cleanup to remap unknown-reason precedent into controlled labels.' : 'Suggestion: keep capturing decisions and review contested buckets weekly.',
  ].join('\n');
}

function formatCommunityConstitution(subreddit: string, buckets: BucketSummary[]): string {
  const activeBuckets = buckets
    .filter((bucket) => bucket.summary.total > 0)
    .sort((a, b) => {
      const signalRank = { settled: 0, leaning: 1, contested: 2, limited_history: 3 } as const;
      return signalRank[a.summary.signal] - signalRank[b.summary.signal] || b.summary.total - a.summary.total;
    });

  const lines = activeBuckets.slice(0, 8).map((bucket) => {
    const summary = bucket.summary;
    const rule = `${labelFor(bucket.reasonLabel)} ${bucket.targetType}s`;
    if (summary.signal === 'settled') return `- ${rule}: usually ${summary.majorityAction}.`;
    if (summary.signal === 'leaning') return `- ${rule}: currently leans ${summary.majorityAction}.`;
    if (summary.signal === 'contested') return `- ${rule}: contested, ask for second review when unsure.`;
    return `- ${rule}: limited history so far.`;
  });

  return [
    `r/${subreddit} moderation constitution`,
    'A living, privacy-conscious summary of recent team precedent.',
    '',
    lines.length ? lines.join('\n') : 'No decision history yet. Seed demo data or let ModCase capture live human decisions.',
  ].join('\n');
}

function formatTransparencyReport(subreddit: string, buckets: BucketSummary[], generatedAt = Date.now()): string {
  const activeBuckets = buckets.filter((bucket) => bucket.summary.total > 0).sort((a, b) => b.summary.total - a.summary.total);
  const total = activeBuckets.reduce((sum, bucket) => sum + bucket.summary.total, 0);
  const removed = activeBuckets.reduce((sum, bucket) => sum + bucket.summary.removed, 0);
  const approved = activeBuckets.reduce((sum, bucket) => sum + bucket.summary.approved, 0);

  return [
    `r/${subreddit} moderation transparency summary`,
    `Generated: ${new Date(generatedAt).toISOString()}`,
    '',
    `Recent reviewed decisions: ${total}`,
    `Removed: ${removed}`,
    `Approved: ${approved}`,
    '',
    'By rule area:',
    activeBuckets.length
      ? activeBuckets.slice(0, 8).map((bucket) => `${labelFor(bucket.reasonLabel)} ${bucket.targetType}s: ${bucket.summary.removed} removed, ${bucket.summary.approved} approved`).join('\n')
      : 'No decision history yet.',
    '',
    'This summary is aggregate-only and does not include usernames, moderator identities, raw target ids, or raw post/comment bodies.',
  ].join('\n');
}

function actionShare(records: DecisionRecord[]): number | null {
  const total = records.length;
  if (!total) return null;
  return records.filter((record) => record.action === 'removed').length / total;
}

function formatRuleDriftReport(subreddit: string, settings: ModCaseSettings, buckets: BucketSummary[]): string {
  const driftRows = buckets
    .filter((bucket) => bucket.records.length >= 4)
    .map((bucket) => {
      const midpoint = Math.ceil(bucket.records.length / 2);
      const recent = bucket.records.slice(0, midpoint);
      const older = bucket.records.slice(midpoint);
      const recentRemoved = actionShare(recent);
      const olderRemoved = actionShare(older);
      const delta = recentRemoved === null || olderRemoved === null ? 0 : recentRemoved - olderRemoved;
      return { bucket, recent, older, delta };
    })
    .filter((row) => Math.abs(row.delta) >= 0.25)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return [
    'ModCase rule drift',
    `Subreddit: r/${subreddit}`,
    formatSettings(settings),
    '',
    driftRows.length
      ? driftRows
          .map((row) => {
            const direction = row.delta > 0 ? 'more removals recently' : 'more approvals recently';
            return `${row.bucket.targetType} / ${labelFor(row.bucket.reasonLabel)}: ${direction} (${Math.round(Math.abs(row.delta) * 100)} point shift).`;
          })
          .join('\n')
      : 'No strong drift detected in buckets with enough recent history.',
  ].join('\n');
}

function formatSecondReviewReport(subreddit: string, settings: ModCaseSettings, buckets: BucketSummary[]): string {
  const reviewBuckets = buckets
    .filter((bucket) => bucket.summary.total >= DEFAULT_MIN_SIGNAL_SAMPLE && bucket.summary.signal !== 'settled')
    .sort((a, b) => {
      if (a.summary.signal !== b.summary.signal) return a.summary.signal === 'contested' ? -1 : 1;
      return b.summary.total - a.summary.total;
    });

  return [
    'ModCase second-review suggestions',
    `Subreddit: r/${subreddit}`,
    formatSettings(settings),
    '',
    reviewBuckets.length
      ? reviewBuckets
          .map((bucket) => {
            const example = bucket.records.find((record) => record.snippet)?.snippet;
            return [
              `${bucket.targetType} / ${labelFor(bucket.reasonLabel)} needs care: ${formatBucketLine(bucket)}`,
              'Suggestion: ask for a second moderator read before treating this as settled precedent.',
              example ? `Recent example: "${example}"` : undefined,
            ]
              .filter(Boolean)
              .join('\n');
          })
          .join('\n\n')
      : 'No aggregate buckets currently need second-review attention.',
  ].join('\n');
}

function formatConsistencyDigest(subreddit: string, buckets: BucketSummary[]): string {
  const rows = buckets
    .map((bucket) => ({ bucket, divergence: countBucketDivergences(bucket.records) }))
    .filter((row) => row.divergence.divergent > 0)
    .sort((a, b) => b.divergence.divergent - a.divergence.divergent);
  const totalDivergent = rows.reduce((sum, row) => sum + row.divergence.divergent, 0);
  const totalDecisions = buckets.reduce((sum, bucket) => sum + bucket.records.length, 0);

  return [
    'ModCase consistency digest',
    `Subreddit: r/${subreddit}`,
    '',
    `Recent decisions that went against settled or leaning precedent: ${totalDivergent} of ${totalDecisions} across all reason and content-type buckets.`,
    'A decision is counted when, at the time it was made, the team already leaned the other way for that reason and content type.',
    '',
    rows.length
      ? rows.map((row) => `${row.bucket.targetType} / ${labelFor(row.bucket.reasonLabel)}: ${row.divergence.divergent} against-precedent of ${row.divergence.total}`).join('\n')
      : 'No recent decisions went against settled or leaning precedent. The team is either consistent or still building history.',
    '',
    'This digest is team-level and excludes usernames, moderator identities, and raw content.',
  ].join('\n');
}

function formatProfileExport(profile: CommunityProfile): string {
  return [
    'ModCase community profile',
    `Subreddit: r/${profile.subreddit}`,
    `Buckets shared (>= ${PROFILE_MIN_SAMPLE} decisions each): ${profile.buckets.length}`,
    'Aggregate only - no usernames, moderator identities, or raw content. Copy everything below and share it with another community to compare norms.',
    '',
    encodeCommunityProfile(profile),
  ].join('\n');
}

function formatProfileComparison(localSubreddit: string, other: CommunityProfile, rows: ProfileComparisonRow[]): string {
  const differ = rows.filter((row) => !row.agree);
  const sideText = (action: ProfileComparisonRow['localMajority'], share: number) => (action ? `${action} ${Math.round(share * 100)}%` : 'no clear majority');

  return [
    'ModCase community comparison',
    `r/${localSubreddit} vs r/${other.subreddit}`,
    `Shared reason/content-type buckets compared: ${rows.length}`,
    `Where norms differ: ${differ.length}`,
    '',
    rows.length
      ? rows
          .map((row) => `${row.targetType} / ${labelFor(row.reasonLabel)}: you ${sideText(row.localMajority, row.localShare)}, r/${other.subreddit} ${sideText(row.otherMajority, row.otherShare)} - ${row.agree ? 'aligned' : 'differ'}`)
          .join('\n')
      : 'No reason/content-type buckets had enough history on both sides to compare.',
    '',
    'Comparison is aggregate-only and based on shared profile signals, not raw content.',
  ].join('\n');
}

export function createModCaseApp({
  redis,
  reddit,
  getSubredditName = () => null,
  captureRawPayloadsForDebug = true,
  lookupLimit = DEFAULT_LOOKUP_LIMIT,
}: ModCaseAppOptions): Hono {
  const app = new Hono();

  async function loadSettings(subreddit: string): Promise<ModCaseSettings> {
    const raw = await redis.get(settingsKey(subreddit));
    return normalizeSettings(parseJsonObject(raw) ?? DEFAULT_SETTINGS);
  }

  async function saveSettings(subreddit: string, settings: ModCaseSettings): Promise<void> {
    await redis.set(settingsKey(subreddit), JSON.stringify(settings));
  }

  async function saveDecision(record: DecisionRecord): Promise<void> {
    const settings = await loadSettings(record.subreddit);
    await redis.set(decisionKey(record.decisionId), JSON.stringify(record), { expiration: settingsExpiration(settings) });
    await redis.zAdd(idxKey(record.subreddit, record.targetType, record.reasonLabel), {
      member: record.decisionId,
      score: record.timestamp,
    });
  }

  function buildManualCorrection(target: LookupContext, action: DecisionAction, reasonLabel: ReasonLabel, internalNote?: string, now = Date.now()): DecisionRecord {
    return {
      decisionId: makeId(`manual_correction:${action}`),
      subreddit: target.subreddit,
      targetType: target.targetType,
      targetHash: stableHash(`${target.subreddit}:${target.targetType}:${target.targetId}`),
      action,
      reasonLabel,
      timestamp: now,
      source: 'manual_correction',
      ...(internalNote ? { internalNote } : {}),
    };
  }

  async function recentDecisionIds(subreddit: string, targetType: TargetType, reasonLabel: DecisionRecord['reasonLabel'], limit = lookupLimit): Promise<string[]> {
    const key = idxKey(subreddit, targetType, reasonLabel);
    const count = await redis.zCard(key);
    if (!count || count <= 0) return [];

    const start = Math.max(0, count - limit);
    const stop = Math.max(0, count - 1);

    const items = await redis.zRange(key, start, stop, { by: 'rank' });
    const ids = items.map((item) => String(item.member));

    // zRange by rank is expected to return ascending score. Verify in playtest.
    return ids.reverse();
  }

  async function loadDecisionRecords(ids: string[]): Promise<DecisionRecord[]> {
    if (!ids.length) return [];
    const values = await redis.mGet(ids.map(decisionKey));
    return values
      .map((raw) => {
        const parsed = parseJsonObject(raw);
        return parsed ? (parsed as DecisionRecord) : null;
      })
      .filter(Boolean) as DecisionRecord[];
  }

  async function recentRecordsForBucket(
    subreddit: string,
    targetType: TargetType,
    reasonLabel: ReasonLabel,
    settings: ModCaseSettings,
  ): Promise<DecisionRecord[]> {
    const ids = await recentDecisionIds(subreddit, targetType, reasonLabel, settings.lookupLimit);
    return loadDecisionRecords(ids);
  }

  async function collectBucketSummaries(subreddit: string, settings: ModCaseSettings): Promise<BucketSummary[]> {
    const buckets: BucketSummary[] = [];

    for (const targetType of ['post', 'comment'] as const) {
      for (const reason of REASON_LABELS) {
        const records = await recentRecordsForBucket(subreddit, targetType, reason.value, settings);
        buckets.push({
          targetType,
          reasonLabel: reason.value,
          records,
          summary: summarize(records),
        });
      }
    }

    return buckets;
  }

  async function remapUnknownReasonBucket(subreddit: string, targetType: TargetType, newReasonLabel: ReasonLabel, settings: ModCaseSettings): Promise<number> {
    const ids = await recentDecisionIds(subreddit, targetType, 'unknown_reason', settings.lookupLimit);
    const records = (await loadDecisionRecords(ids)).filter((record) => record.reasonLabel === 'unknown_reason');
    if (!records.length) return 0;

    for (const record of records) {
      const remapped: DecisionRecord = {
        ...record,
        reasonLabel: newReasonLabel,
        remappedFromReason: 'unknown_reason',
        internalNote: record.internalNote ?? `Remapped from Unknown / Unmapped Reason on ${new Date().toLocaleDateString('en-US')}.`,
      };
      await saveDecision(remapped);
    }

    if (redis.zRem) {
      await redis.zRem(idxKey(subreddit, targetType, 'unknown_reason'), records.map((record) => record.decisionId));
    }

    return records.length;
  }

  async function loadLookupContext(token?: string, fallback?: unknown): Promise<LookupContext | null> {
    if (token) {
      const rawContext = await redis.get(lookupContextKey(token));
      if (rawContext) {
        try {
          const parsed = JSON.parse(rawContext);
          if (isLookupContext(parsed)) return parsed;
        } catch {
          // Fall back to signed-in form data below.
        }
      }
    }

    return isLookupContext(fallback) ? fallback : null;
  }

  app.get('/api/health', (c) => c.json({ ok: true, app: 'modcase' }));

  app.post('/internal/triggers/on-mod-action', async (c) => {
    const input = await c.req.json<any>();
    console.log('[ModCase] raw onModAction payload:', JSON.stringify(input, null, 2));

    if (captureRawPayloadsForDebug) {
      try {
        const logId = makeId('rawlog');
        await redis.set(`debug:raw:${logId}`, JSON.stringify(input), { expiration: expirationFromNow(DEBUG_PAYLOAD_RETENTION_SECONDS) });
        await redis.zAdd(rawLogKey(), { member: logId, score: Date.now() });
      } catch (error) {
        console.error('[ModCase] failed to store raw debug payload:', error);
      }
    }

    const record = buildDecisionFromModAction(input, { fallbackSubreddit: getSubredditName() });
    if (!record) {
      console.log('[ModCase] skipped mod action after normalization/filtering');
      return c.json<TriggerResponse>({ status: 'ok' });
    }

    try {
      await saveDecision(record);
      console.log('[ModCase] captured decision:', JSON.stringify(record, null, 2));
    } catch (error) {
      console.error('[ModCase] failed to save decision:', error);
    }

    return c.json<TriggerResponse>({ status: 'ok' });
  });

  app.post('/internal/menu/check-precedent', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>();
    const target = targetContextFromMenu(input, getSubredditName());
    if (!target) {
      return c.json<UiResponse>({ showToast: 'ModCase could not identify the post/comment context. Check the menu payload logs.' });
    }

    const token = makeId('lookup');
    await redis.set(lookupContextKey(token), JSON.stringify(target), { expiration: expirationFromNow(LOOKUP_CONTEXT_TTL_SECONDS) });

    const settings = await loadSettings(target.subreddit);
    const suggestedReason = settings.reasonSuggestionEnabled ? suggestReasonFromText(target.currentSnippet) : null;
    const defaultReason = suggestedReason ?? 'harassment_abuse';
    const description = suggestedReason
      ? `Pick the rule/reason you are considering. From the text, ModCase suggests "${labelFor(suggestedReason)}" as a starting point - confirm or change it.`
      : 'Pick the rule/reason you are considering. ModCase will show how the team handled similar past decisions.';

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseReasonPicker',
        form: {
          title: 'Check ModCase precedent',
          description,
          acceptLabel: 'Show precedent',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'select',
              name: 'reasonLabel',
              label: 'Reason / rule',
              required: true,
              options: REASON_LABELS.map((r) => ({ label: r.label, value: encodeFormContextValue(r.value, token) })),
              defaultValue: [encodeFormContextValue(defaultReason, token)],
            },
          ],
        },
        data: { lookupToken: token, lookupTarget: target },
      },
    });
  });

  app.post('/internal/menu/record-correction', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>();
    const target = targetContextFromMenu(input, getSubredditName());
    if (!target) {
      return c.json<UiResponse>({ showToast: 'ModCase could not identify the post/comment context.' });
    }

    const token = makeId('manual');
    await redis.set(lookupContextKey(token), JSON.stringify(target), { expiration: expirationFromNow(LOOKUP_CONTEXT_TTL_SECONDS) });

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseManualCorrectionForm',
        form: {
          title: 'Record ModCase correction',
          description: 'Store a manual decision record without taking action on Reddit.',
          acceptLabel: 'Record decision',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'select',
              name: 'decisionAction',
              label: 'Decision',
              required: true,
              options: [
                { label: 'Removed', value: encodeFormContextValue('removed', token) },
                { label: 'Approved', value: encodeFormContextValue('approved', token) },
              ],
              defaultValue: [encodeFormContextValue('removed', token)],
            },
            {
              type: 'select',
              name: 'reasonLabel',
              label: 'Reason / rule',
              required: true,
              options: REASON_LABELS.map((r) => ({ label: r.label, value: r.value })),
              defaultValue: ['spam_promotional'],
            },
            {
              type: 'paragraph',
              name: 'internalNote',
              label: 'Internal precedent note',
              placeholder: 'Optional short note, e.g. allowed because satire.',
              required: false,
              lineHeight: 3,
            },
          ],
        },
        data: { lookupToken: token, lookupTarget: target },
      },
    });
  });

  app.post('/internal/form/reason-picker-submit', async (c) => {
    const body = await c.req.json<ReasonPickerForm>();
    const rawReason = Array.isArray(body.reasonLabel) ? body.reasonLabel[0] : body.reasonLabel;
    const decodedReason = decodeFormContextValue(rawReason);
    const token = body.lookupToken ?? decodedReason.context;
    const reasonLabel = normalizeReasonValue(decodedReason.value ?? rawReason) ?? 'unknown_reason';

    const lookup = await loadLookupContext(token, body.lookupTarget);
    if (!lookup) return c.json<UiResponse>({ showToast: 'ModCase lookup context expired. Re-open the menu action.' });

    const settings = await loadSettings(lookup.subreddit);
    const ids = await recentDecisionIds(lookup.subreddit, lookup.targetType, reasonLabel, settings.lookupLimit);
    const records = await loadDecisionRecords(ids);
    const summaryText = formatPrecedentSummary(reasonLabel, lookup.targetType, records, {
      lookupLimit: settings.lookupLimit,
      lookupText: lookup.currentSnippet,
    });

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase precedent',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'summary',
              label: 'Team precedent',
              defaultValue: summaryText,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { summary: summaryText },
      },
    });
  });

  app.post('/internal/form/manual-correction-submit', async (c) => {
    const body = await c.req.json<ManualCorrectionForm>();
    const decodedAction = decodeFormContextValue(firstFormValue(body.decisionAction));
    const token = body.lookupToken ?? decodedAction.context;
    const action = normalizeDecisionActionValue(decodedAction.value);
    const decodedReason = decodeFormContextValue(firstFormValue(body.reasonLabel));
    const reasonLabel = normalizeReasonValue(decodedReason.value) ?? 'unknown_reason';
    const internalNote = cleanInternalNote(body.internalNote);

    const target = await loadLookupContext(token, body.lookupTarget);
    if (!target) return c.json<UiResponse>({ showToast: 'ModCase correction context expired. Re-open the menu action.' });
    if (!action) return c.json<UiResponse>({ showToast: 'ModCase could not identify the correction action.' });

    try {
      await saveDecision(buildManualCorrection(target, action, reasonLabel, internalNote));
    } catch (error) {
      console.error('[ModCase] manual correction failed:', error);
      return c.json<UiResponse>({ showToast: 'ModCase could not save this correction. Check Devvit logs.' });
    }

    return c.json<UiResponse>({ showToast: `ModCase recorded ${action} precedent for this ${target.targetType}.` });
  });

  app.post('/internal/form/summary-ack', async (c) => {
    await c.req.json().catch(() => ({}));
    return c.json<UiResponse>({});
  });

  app.post('/internal/menu/settings', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSettingsForm',
        form: {
          title: 'ModCase settings',
          description: 'Tune bounded history for this subreddit install.',
          acceptLabel: 'Save settings',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'select',
              name: 'decisionRetentionDays',
              label: 'Decision retention',
              required: true,
              options: RETENTION_DAY_OPTIONS.map((days) => ({ label: `${days} days`, value: encodeFormContextValue(String(days), subreddit) })),
              defaultValue: [encodeFormContextValue(String(settings.decisionRetentionDays), subreddit)],
            },
            {
              type: 'select',
              name: 'lookupLimit',
              label: 'Lookup history cap',
              required: true,
              options: LOOKUP_LIMIT_OPTIONS.map((limit) => ({ label: `${limit} recent matches`, value: encodeFormContextValue(String(limit), subreddit) })),
              defaultValue: [encodeFormContextValue(String(settings.lookupLimit), subreddit)],
            },
            {
              type: 'select',
              name: 'reasonSuggestion',
              label: 'Reason suggestion (opt-in)',
              required: true,
              options: [
                { label: 'Off - moderator picks the reason', value: encodeFormContextValue('off', subreddit) },
                { label: 'On - suggest a starting reason from the text', value: encodeFormContextValue('on', subreddit) },
              ],
              defaultValue: [encodeFormContextValue(settings.reasonSuggestionEnabled ? 'on' : 'off', subreddit)],
            },
          ],
        },
        data: { subreddit },
      },
    });
  });

  app.post('/internal/form/settings-submit', async (c) => {
    const body = await c.req.json<SettingsForm>();
    const retentionContext = decodeFormContextValue(firstFormValue(body.decisionRetentionDays)).context;
    const lookupContext = decodeFormContextValue(firstFormValue(body.lookupLimit)).context;
    const subreddit = extractSubreddit({ subredditName: body.subreddit ?? retentionContext ?? lookupContext }, getSubredditName());
    const settings = settingsFromForm(body);

    try {
      await saveSettings(subreddit, settings);
    } catch (error) {
      console.error('[ModCase] settings save failed:', error);
      return c.json<UiResponse>({ showToast: 'ModCase could not save settings. Check Devvit logs.' });
    }

    return c.json<UiResponse>({ showToast: `ModCase settings saved: ${settings.decisionRetentionDays}d retention, ${settings.lookupLimit} lookup cap, reason suggestions ${settings.reasonSuggestionEnabled ? 'on' : 'off'}.` });
  });

  app.post('/internal/menu/audit-snapshot', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const rows: { targetType: TargetType; reasonLabel: ReasonLabel; count: number }[] = [];

    for (const targetType of ['post', 'comment'] as const) {
      for (const reason of REASON_LABELS) {
        rows.push({
          targetType,
          reasonLabel: reason.value,
          count: await redis.zCard(idxKey(subreddit, targetType, reason.value)),
        });
      }
    }

    const snapshot = formatAuditSnapshot(subreddit, rows);
    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase audit snapshot',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'snapshot',
              label: 'Recent indexed decision buckets',
              defaultValue: snapshot,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { snapshot },
      },
    });
  });

  app.post('/internal/menu/rule-trends', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const report = formatTrendReport(subreddit, settings, buckets);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase rule trends',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'trends',
              label: 'Per-rule recent trends',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { trends: report },
      },
    });
  });

  app.post('/internal/menu/rule-health', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const report = formatRuleHealthReport(subreddit, settings, buckets);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase rule health',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'ruleHealth',
              label: 'Community rule health',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { ruleHealth: report },
      },
    });
  });

  app.post('/internal/menu/contested-rules', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const report = formatContestedReport(subreddit, settings, buckets);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase contested rules',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'contestedRules',
              label: 'Aggregate review queue',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { contestedRules: report },
      },
    });
  });

  app.post('/internal/menu/second-review', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const report = formatSecondReviewReport(subreddit, settings, buckets);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase second review',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'secondReview',
              label: 'Ambiguous-case queue',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { secondReview: report },
      },
    });
  });

  app.post('/internal/menu/rule-drift', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const report = formatRuleDriftReport(subreddit, settings, buckets);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase rule drift',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'ruleDrift',
              label: 'Recent pattern shifts',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { ruleDrift: report },
      },
    });
  });

  app.post('/internal/menu/community-constitution', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const report = formatCommunityConstitution(subreddit, buckets);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase constitution',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'constitution',
              label: 'Living moderation memory',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { constitution: report },
      },
    });
  });

  app.post('/internal/menu/export-report', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const rules = normalizeImportedRules(parseJsonObject(await redis.get(ruleMappingKey(subreddit))));
    const report = formatExportReport(subreddit, settings, buckets, rules);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase export report',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'exportReport',
              label: 'Copyable aggregate report',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { exportReport: report },
      },
    });
  });

  app.post('/internal/menu/transparency-report', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const report = formatTransparencyReport(subreddit, buckets);

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase transparency',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'transparencyReport',
              label: 'Shareable aggregate summary',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { transparencyReport: report },
      },
    });
  });

  app.post('/internal/menu/unknown-cleanup', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseUnknownCleanupForm',
        form: {
          title: 'ModCase unknown cleanup',
          description: 'Move recent Unknown / Unmapped precedent into a controlled reason bucket.',
          acceptLabel: 'Remap records',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'select',
              name: 'targetType',
              label: 'Content type',
              required: true,
              options: [
                { label: 'Posts', value: encodeFormContextValue('post', subreddit) },
                { label: 'Comments', value: encodeFormContextValue('comment', subreddit) },
              ],
              defaultValue: [encodeFormContextValue('comment', subreddit)],
            },
            {
              type: 'select',
              name: 'reasonLabel',
              label: 'New reason bucket',
              required: true,
              options: REASON_LABELS.filter((reason) => reason.value !== 'unknown_reason').map((reason) => ({
                label: reason.label,
                value: reason.value,
              })),
              defaultValue: ['harassment_abuse'],
            },
          ],
        },
        data: { subreddit },
      },
    });
  });

  app.post('/internal/form/unknown-cleanup-submit', async (c) => {
    const body = await c.req.json<UnknownCleanupForm>();
    const decodedTargetType = decodeFormContextValue(firstFormValue(body.targetType));
    const subreddit = extractSubreddit({ subredditName: body.subreddit ?? decodedTargetType.context }, getSubredditName());
    const targetType = normalizeTargetTypeValue(decodedTargetType.value);
    const reasonLabel = normalizeReasonValue(firstFormValue(body.reasonLabel));
    if (!targetType || !reasonLabel || reasonLabel === 'unknown_reason') {
      return c.json<UiResponse>({ showToast: 'ModCase could not identify a valid cleanup target.' });
    }

    try {
      const remapped = await remapUnknownReasonBucket(subreddit, targetType, reasonLabel, await loadSettings(subreddit));
      return c.json<UiResponse>({ showToast: `ModCase remapped ${remapped} ${targetType} records to ${labelFor(reasonLabel)}.` });
    } catch (error) {
      console.error('[ModCase] unknown cleanup failed:', error);
      return c.json<UiResponse>({ showToast: 'ModCase could not remap unknown records. Check Devvit logs.' });
    }
  });

  app.post('/internal/menu/training', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const record = buckets
      .flatMap((bucket) => bucket.records)
      .filter((candidate) => candidate.snippet)
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!record) {
      return c.json<UiResponse>({ showToast: 'ModCase needs at least one precedent example with a snippet before training mode can start.' });
    }

    const token = makeId('training');
    await redis.set(trainingContextKey(token), JSON.stringify({ decisionId: record.decisionId, subreddit }), { expiration: expirationFromNow(LOOKUP_CONTEXT_TTL_SECONDS) });

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseTrainingForm',
        form: {
          title: 'ModCase training',
          description: `Reason: ${labelFor(record.reasonLabel)} / ${record.targetType}\nExample: "${record.snippet}"`,
          acceptLabel: 'Check answer',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'select',
              name: 'decisionAction',
              label: 'What did the team do?',
              required: true,
              options: [
                { label: 'Removed', value: encodeFormContextValue('removed', token) },
                { label: 'Approved', value: encodeFormContextValue('approved', token) },
              ],
              defaultValue: [encodeFormContextValue('removed', token)],
            },
          ],
        },
        data: { decisionAction: encodeFormContextValue('removed', token) },
      },
    });
  });

  app.post('/internal/form/training-submit', async (c) => {
    const body = await c.req.json<TrainingAnswerForm>();
    const decodedAction = decodeFormContextValue(firstFormValue(body.decisionAction));
    const answer = normalizeDecisionActionValue(decodedAction.value);
    const rawContext = decodedAction.context ? await redis.get(trainingContextKey(decodedAction.context)) : null;
    const trainingContext = normalizeTrainingContext(parseJsonObject(rawContext));
    if (!answer || !trainingContext) return c.json<UiResponse>({ showToast: 'ModCase training context expired. Re-open training mode.' });

    const record = parseJsonObject(await redis.get(decisionKey(trainingContext.decisionId))) as DecisionRecord | null;
    if (!record) return c.json<UiResponse>({ showToast: 'ModCase could not load that training example.' });

    const correct = answer === record.action;
    const result = [
      correct ? 'Correct.' : 'Different from team precedent.',
      `Team action: ${record.action}`,
      `Reason: ${labelFor(record.reasonLabel)}`,
      record.internalNote ? `Note: ${record.internalNote}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase training result',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'trainingResult',
              label: 'Team precedent',
              defaultValue: result,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { trainingResult: result },
      },
    });
  });

  app.post('/internal/menu/sync-rules', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());

    if (!reddit?.getRules) {
      return c.json<UiResponse>({ showToast: 'ModCase cannot sync rules because the Reddit rules API is not configured.' });
    }

    let importedRules: ImportedRule[];
    try {
      const rules = await reddit.getRules(subreddit);
      importedRules = rules.map(mapRuleToReason);
      await redis.set(ruleMappingKey(subreddit), JSON.stringify(importedRules), { expiration: settingsExpiration(await loadSettings(subreddit)) });
    } catch (error) {
      console.error('[ModCase] rule sync failed:', error);
      return c.json<UiResponse>({ showToast: 'ModCase could not sync subreddit rules. Check Devvit logs.' });
    }

    const report = formatRuleImport(subreddit, importedRules);
    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase rule sync',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'rules',
              label: 'Controlled label mapping',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { rules: report },
      },
    });
  });

  app.post('/internal/menu/team-insights', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseInsightsPicker',
        form: {
          title: 'ModCase team insights',
          description: 'Pick an aggregate report. Every report is team-level and excludes usernames, moderator identities, and raw content.',
          acceptLabel: 'Show report',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'select',
              name: 'report',
              label: 'Report',
              required: true,
              options: [
                { label: 'Rule health', value: encodeFormContextValue('rule-health', subreddit) },
                { label: 'Consistency digest', value: encodeFormContextValue('consistency', subreddit) },
                { label: 'Rule trends', value: encodeFormContextValue('rule-trends', subreddit) },
                { label: 'Contested rules', value: encodeFormContextValue('contested-rules', subreddit) },
                { label: 'Second review', value: encodeFormContextValue('second-review', subreddit) },
                { label: 'Rule drift', value: encodeFormContextValue('rule-drift', subreddit) },
                { label: 'Community constitution', value: encodeFormContextValue('community-constitution', subreddit) },
                { label: 'Transparency summary', value: encodeFormContextValue('transparency', subreddit) },
                { label: 'Audit snapshot', value: encodeFormContextValue('audit', subreddit) },
                { label: 'Export report', value: encodeFormContextValue('export', subreddit) },
                { label: 'Export community profile', value: encodeFormContextValue('profile', subreddit) },
              ],
              defaultValue: [encodeFormContextValue('rule-health', subreddit)],
            },
          ],
        },
        data: { subreddit },
      },
    });
  });

  app.post('/internal/form/insights-submit', async (c) => {
    const body = await c.req.json<{ report?: string | string[]; subreddit?: string }>();
    const decoded = decodeFormContextValue(firstFormValue(body.report));
    const reportKey = decoded.value ?? '';
    const subreddit = extractSubreddit({ subredditName: body.subreddit ?? decoded.context }, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);

    let title = 'ModCase team insights';
    let report: string;
    switch (reportKey) {
      case 'consistency':
        title = 'ModCase consistency digest';
        report = formatConsistencyDigest(subreddit, buckets);
        break;
      case 'rule-health':
        title = 'ModCase rule health';
        report = formatRuleHealthReport(subreddit, settings, buckets);
        break;
      case 'rule-trends':
        title = 'ModCase rule trends';
        report = formatTrendReport(subreddit, settings, buckets);
        break;
      case 'contested-rules':
        title = 'ModCase contested rules';
        report = formatContestedReport(subreddit, settings, buckets);
        break;
      case 'second-review':
        title = 'ModCase second review';
        report = formatSecondReviewReport(subreddit, settings, buckets);
        break;
      case 'rule-drift':
        title = 'ModCase rule drift';
        report = formatRuleDriftReport(subreddit, settings, buckets);
        break;
      case 'community-constitution':
        title = 'ModCase constitution';
        report = formatCommunityConstitution(subreddit, buckets);
        break;
      case 'transparency':
        title = 'ModCase transparency';
        report = formatTransparencyReport(subreddit, buckets);
        break;
      case 'audit': {
        title = 'ModCase audit snapshot';
        const rows: { targetType: TargetType; reasonLabel: ReasonLabel; count: number }[] = [];
        for (const targetType of ['post', 'comment'] as const) {
          for (const reason of REASON_LABELS) {
            rows.push({ targetType, reasonLabel: reason.value, count: await redis.zCard(idxKey(subreddit, targetType, reason.value)) });
          }
        }
        report = formatAuditSnapshot(subreddit, rows);
        break;
      }
      case 'export': {
        title = 'ModCase export report';
        const rules = normalizeImportedRules(parseJsonObject(await redis.get(ruleMappingKey(subreddit))));
        report = formatExportReport(subreddit, settings, buckets, rules);
        break;
      }
      case 'profile':
        title = 'ModCase community profile';
        report = formatProfileExport(buildCommunityProfile(subreddit, buckets));
        break;
      default:
        return c.json<UiResponse>({ showToast: 'ModCase could not identify that report.' });
    }

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title,
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'insightsReport',
              label: 'Team insight',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { insightsReport: report },
      },
    });
  });

  app.post('/internal/menu/compare-community', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseCompareForm',
        form: {
          title: 'Compare community precedent',
          description: 'Paste another community\'s exported ModCase profile to compare aggregate norms. Create one with Team insights -> Export community profile.',
          acceptLabel: 'Compare',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'paragraph',
              name: 'profileText',
              label: 'Pasted community profile',
              placeholder: 'Paste the full ModCase community profile text here.',
              required: true,
              lineHeight: 8,
            },
          ],
        },
        data: { subreddit },
      },
    });
  });

  app.post('/internal/form/compare-submit', async (c) => {
    const body = await c.req.json<{ profileText?: string; subreddit?: string }>();
    const subreddit = extractSubreddit({ subredditName: body.subreddit }, getSubredditName());
    const other = parseCommunityProfile(body.profileText);
    if (!other) {
      return c.json<UiResponse>({ showToast: 'ModCase could not read that profile. Copy the full exported text and try again.' });
    }

    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);
    const local = buildCommunityProfile(subreddit, buckets);
    const report = formatProfileComparison(subreddit, other, compareProfiles(local, other));

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title: 'ModCase community comparison',
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'comparison',
              label: 'Aggregate comparison',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { comparison: report },
      },
    });
  });

  app.post('/internal/menu/seed-demo', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>();
    const subreddit = extractSubreddit(input, getSubredditName());
    const seedRecords = buildDemoRecords(subreddit);

    for (const record of seedRecords) await saveDecision(record);
    return c.json<UiResponse>({ showToast: `Seeded ${seedRecords.length} ModCase demo decisions for r/${subreddit}.` });
  });

  app.post('/internal/menu/clear-demo', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());
    const demoRecords = buildDemoRecords(subreddit);

    let cleared = 0;
    for (const record of demoRecords) {
      const existing = await redis.get(decisionKey(record.decisionId));
      if (!existing) continue;
      if (redis.zRem) await redis.zRem(idxKey(record.subreddit, record.targetType, record.reasonLabel), [record.decisionId]);
      if (redis.del) await redis.del(decisionKey(record.decisionId));
      cleared += 1;
    }

    return c.json<UiResponse>({ showToast: `ModCase cleared ${cleared} demo record${cleared === 1 ? '' : 's'} from r/${subreddit}. Real captured decisions are untouched.` });
  });

  app.post('/internal/menu/show-debug-log-count', async (c) => {
    await c.req.json<MenuItemRequest>().catch(() => ({}));
    const count = await redis.zCard(rawLogKey());
    return c.json<UiResponse>({ showToast: `ModCase raw onModAction payloads logged: ${count}. Check Devvit logs for full payloads.` });
  });

  return app;
}
