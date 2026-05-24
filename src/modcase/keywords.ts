import type { DecisionRecord } from './types.js';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'i',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'this',
  'to',
  'was',
  'were',
  'with',
  'you',
  'your',
]);

export type RankedDecisionRecord = DecisionRecord & {
  keywordScore?: number;
  sharedKeywords?: string[];
};

export function extractKeywords(input: string | undefined, limit = 12): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const tokens = input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  for (const token of tokens) {
    seen.add(token);
    if (seen.size >= limit) break;
  }

  return [...seen];
}

export function keywordOverlap(queryText: string | undefined, candidateText: string | undefined): { score: number; sharedKeywords: string[] } {
  const queryKeywords = extractKeywords(queryText);
  const candidateKeywords = new Set(extractKeywords(candidateText, 30));
  const sharedKeywords = queryKeywords.filter((keyword) => candidateKeywords.has(keyword));
  return {
    score: queryKeywords.length ? sharedKeywords.length / queryKeywords.length : 0,
    sharedKeywords,
  };
}

export function rankRecordsForLookup(queryText: string | undefined, records: DecisionRecord[]): RankedDecisionRecord[] {
  if (!queryText) return records;
  return records
    .map((record) => {
      const overlap = keywordOverlap(queryText, record.snippet);
      return { ...record, keywordScore: overlap.score, sharedKeywords: overlap.sharedKeywords };
    })
    .sort((a, b) => {
      const scoreDelta = (b.keywordScore ?? 0) - (a.keywordScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      return b.timestamp - a.timestamp;
    });
}

export function formatKeywordAssist(queryText: string | undefined, records: RankedDecisionRecord[]): string {
  if (!queryText) return 'Keyword assist: no current text available, so examples stay newest-first.';
  const queryKeywords = extractKeywords(queryText);
  if (!queryKeywords.length) return 'Keyword assist: no useful keywords found in the current text.';

  const matched = records.filter((record) => (record.sharedKeywords?.length ?? 0) > 0);
  if (!matched.length) return `Keyword assist: checked ${queryKeywords.length} keyword${queryKeywords.length === 1 ? '' : 's'}, no overlap in this bucket.`;

  const topKeywords = matched
    .flatMap((record) => record.sharedKeywords ?? [])
    .filter((keyword, index, values) => values.indexOf(keyword) === index)
    .slice(0, 5);

  return `Keyword assist: ${matched.length} matching example${matched.length === 1 ? '' : 's'} ${matched.length === 1 ? 'shares' : 'share'} ${topKeywords.join(', ')}.`;
}
