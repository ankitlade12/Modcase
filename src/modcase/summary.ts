import { labelFor, type ReasonLabel } from './reasons.js';
import { contentFingerprint } from './fingerprint.js';
import { formatKeywordAssist, rankRecordsForLookup } from './keywords.js';
import type { DecisionRecord, DecisionSummary, TargetType } from './types.js';

export const DEFAULT_LOOKUP_LIMIT = 50;
export const DEFAULT_DISPLAY_LIMIT = 3;
export const DEFAULT_MIN_SIGNAL_SAMPLE = 5;

export function summarize(records: DecisionRecord[], minSignalSample = DEFAULT_MIN_SIGNAL_SAMPLE): DecisionSummary {
  const removed = records.filter((r) => r.action === 'removed').length;
  const approved = records.filter((r) => r.action === 'approved').length;
  const total = removed + approved;

  if (total < minSignalSample) return { total, removed, approved, signal: 'limited_history' };

  const majorityAction = removed >= approved ? 'removed' : 'approved';
  const majorityCount = Math.max(removed, approved);
  const majorityPct = majorityCount / total;

  if (majorityPct >= 0.8) return { total, removed, approved, signal: 'settled', majorityAction, majorityPct };
  if (majorityPct >= 0.6) return { total, removed, approved, signal: 'leaning', majorityAction, majorityPct };
  return { total, removed, approved, signal: 'contested', majorityAction, majorityPct };
}

export function formatSignal(summary: DecisionSummary): string {
  if (summary.signal === 'limited_history') {
    return `Limited history: ${summary.total} matching decision${summary.total === 1 ? '' : 's'} so far. Show counts, but do not infer a norm yet.`;
  }
  if (summary.signal === 'settled') {
    return `Settled team pattern: ${Math.round((summary.majorityPct ?? 0) * 100)}% ${summary.majorityAction}.`;
  }
  if (summary.signal === 'leaning') {
    return `Leaning pattern: ${Math.round((summary.majorityPct ?? 0) * 100)}% ${summary.majorityAction}, but not fully settled.`;
  }
  return 'Contested rule: the team is split on this reason.';
}

export function formatRecentTrend(records: DecisionRecord[], windowSize = 3): string {
  if (!records.length) return 'Recent trend: no matching decisions yet.';
  const recent = records.slice(0, windowSize);
  const removed = recent.filter((r) => r.action === 'removed').length;
  const approved = recent.filter((r) => r.action === 'approved').length;
  return `Recent trend: last ${recent.length} matching decision${recent.length === 1 ? '' : 's'} include ${removed} removed and ${approved} approved.`;
}

export function formatPrecedentSummary(
  reasonLabel: ReasonLabel,
  targetType: TargetType,
  records: DecisionRecord[],
  options: {
    lookupLimit?: number;
    displayLimit?: number;
    minSignalSample?: number;
    lookupText?: string;
  } = {},
): string {
  const lookupLimit = options.lookupLimit ?? DEFAULT_LOOKUP_LIMIT;
  const displayLimit = options.displayLimit ?? DEFAULT_DISPLAY_LIMIT;

  if (records.length === 0) {
    return [
      'ModCase precedent',
      `Reason: ${labelFor(reasonLabel)}`,
      `Content type: ${targetType}`,
      '',
      `No team precedent yet for ${labelFor(reasonLabel)} ${targetType}s.`,
      `This panel fills in automatically as moderators approve or remove ${targetType}s for this reason.`,
      'To see it working now, run "ModCase: Seed demo data" from the subreddit menu.',
    ].join('\n');
  }

  const s = summarize(records, options.minSignalSample);
  const rankedRecords = rankRecordsForLookup(options.lookupText, records);
  const exactFingerprint = contentFingerprint(options.lookupText);
  const exactMatches = exactFingerprint ? records.filter((record) => record.contentFingerprint === exactFingerprint).length : 0;
  const examples = rankedRecords.slice(0, displayLimit).map((r, i) => {
    const age = new Date(r.timestamp).toLocaleDateString('en-US');
    const keywordNote = r.sharedKeywords?.length ? ` [keywords: ${r.sharedKeywords.slice(0, 3).join(', ')}]` : '';
    const snippet = r.snippet ? ` - "${r.snippet}"` : '';
    const note = r.internalNote ? ` Note: ${r.internalNote}` : '';
    return `${i + 1}. ${r.action} ${r.targetType} - ${age}${keywordNote}${snippet}${note}`;
  });

  return [
    'ModCase precedent',
    `Reason: ${labelFor(reasonLabel)}`,
    `Content type: ${targetType}`,
    '',
    formatSignal(s),
    formatRecentTrend(records),
    '',
    `Counts from last ${lookupLimit} matching decisions:`,
    `Removed: ${s.removed}`,
    `Approved: ${s.approved}`,
    `Total: ${s.total}`,
    '',
    formatKeywordAssist(options.lookupText, rankedRecords),
    exactFingerprint ? `Fingerprint matches: ${exactMatches} exact normalized text match${exactMatches === 1 ? '' : 'es'} in this bucket.` : 'Fingerprint matches: no current text available.',
    '',
    examples.length ? `Recent examples:\n${examples.join('\n')}` : 'No prior examples yet. Use the demo seeder or let automatic capture build history.',
  ].join('\n');
}
