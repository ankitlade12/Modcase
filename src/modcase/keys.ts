import type { ReasonLabel } from './reasons.js';
import type { TargetType } from './types.js';

export function idxKey(subreddit: string, targetType: TargetType, reasonLabel: ReasonLabel): string {
  return `idx:reason:${subreddit}:${targetType}:${reasonLabel}`;
}

export function decisionKey(decisionId: string): string {
  return `decision:${decisionId}`;
}

export function lookupContextKey(token: string): string {
  return `lookupctx:${token}`;
}

export function rawLogKey(): string {
  return 'debug:raw-modaction-log';
}

export function ruleMappingKey(subreddit: string): string {
  return `rules:${subreddit}`;
}

export function settingsKey(subreddit: string): string {
  return `settings:${subreddit}`;
}

export function trainingContextKey(token: string): string {
  return `trainingctx:${token}`;
}
