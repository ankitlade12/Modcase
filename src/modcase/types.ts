import type { ReasonLabel } from './reasons.js';

export type TargetType = 'post' | 'comment';
export type DecisionAction = 'removed' | 'approved';
export type SignalKind = 'limited_history' | 'settled' | 'leaning' | 'contested';

export type DecisionRecord = {
  decisionId: string;
  subreddit: string;
  targetType: TargetType;
  targetHash: string;
  action: DecisionAction;
  reasonLabel: ReasonLabel;
  timestamp: number;
  source: 'mod_action_trigger' | 'demo_seed' | 'manual_correction';
  contentFingerprint?: string;
  snippet?: string;
  internalNote?: string;
  remappedFromReason?: ReasonLabel;
};

export type LookupContext = {
  targetType: TargetType;
  targetId: string;
  subreddit: string;
  currentSnippet?: string;
};

export type DecisionSummary = {
  total: number;
  removed: number;
  approved: number;
  signal: SignalKind;
  majorityAction?: DecisionAction;
  majorityPct?: number;
};

export type ModCaseSettings = {
  decisionRetentionDays: number;
  lookupLimit: number;
  updatedAt: number;
};
