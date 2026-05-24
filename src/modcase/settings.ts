import type { ModCaseSettings } from './types.js';

export const DEFAULT_DECISION_RETENTION_DAYS = 180;
export const DEFAULT_SETTINGS: ModCaseSettings = {
  decisionRetentionDays: DEFAULT_DECISION_RETENTION_DAYS,
  lookupLimit: 50,
  updatedAt: 0,
};

export const RETENTION_DAY_OPTIONS = [30, 90, 180, 365] as const;
export const LOOKUP_LIMIT_OPTIONS = [25, 50, 100] as const;

function normalizeNumber(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    const parsed = Number(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function coerceAllowed(value: unknown, allowed: readonly number[], fallback: number): number {
  const normalized = normalizeNumber(value);
  return normalized && allowed.includes(normalized) ? normalized : fallback;
}

export function normalizeSettings(input: unknown, now = Date.now()): ModCaseSettings {
  const candidate = input && typeof input === 'object' ? (input as Partial<ModCaseSettings>) : {};
  return {
    decisionRetentionDays: coerceAllowed(candidate.decisionRetentionDays, RETENTION_DAY_OPTIONS, DEFAULT_SETTINGS.decisionRetentionDays),
    lookupLimit: coerceAllowed(candidate.lookupLimit, LOOKUP_LIMIT_OPTIONS, DEFAULT_SETTINGS.lookupLimit),
    updatedAt: normalizeNumber(candidate.updatedAt) ?? now,
  };
}

export function settingsExpiration(settings: ModCaseSettings, now = Date.now()): Date {
  return new Date(now + settings.decisionRetentionDays * 24 * 60 * 60 * 1000);
}

