import { stableHash } from './hash.js';

export function normalizeFingerprintText(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function contentFingerprint(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const normalized = normalizeFingerprintText(input);
  if (!normalized) return undefined;
  return stableHash(`content:${normalized}`);
}
