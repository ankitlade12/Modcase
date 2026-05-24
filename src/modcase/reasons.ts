export const REASON_LABELS = [
  { value: 'harassment_abuse', label: 'Harassment / Abuse' },
  { value: 'spam_promotional', label: 'Spam / Promotional' },
  { value: 'low_effort', label: 'Low Effort' },
  { value: 'off_topic', label: 'Off Topic' },
  { value: 'explicit_content', label: 'Explicit Content' },
  { value: 'legal_policy', label: 'Legal / Policy' },
  { value: 'unknown_reason', label: 'Unknown / Unmapped Reason' },
] as const;

export type ReasonLabel = (typeof REASON_LABELS)[number]['value'];

const REASON_VALUE_SET = new Set(REASON_LABELS.map((r) => r.value));

const REASON_ALIASES: Record<string, ReasonLabel> = {
  harassment: 'harassment_abuse',
  abuse: 'harassment_abuse',
  harassment_abuse: 'harassment_abuse',
  personal_attack: 'harassment_abuse',
  personal_attacks: 'harassment_abuse',

  spam: 'spam_promotional',
  promotional: 'spam_promotional',
  self_promotion: 'spam_promotional',
  spam_promotional: 'spam_promotional',

  low_effort: 'low_effort',
  loweffort: 'low_effort',
  duplicate: 'low_effort',

  off_topic: 'off_topic',
  offtopic: 'off_topic',
  not_relevant: 'off_topic',

  explicit_content: 'explicit_content',
  explicit: 'explicit_content',
  nsfw: 'explicit_content',

  legal: 'legal_policy',
  legal_policy: 'legal_policy',
  legal_safety: 'legal_policy',
  policy: 'legal_policy',
  safety: 'legal_policy',
};

export function normalizeReasonValue(input: unknown): ReasonLabel | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^rule\s*\d+\s*[:\-]\s*/i, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!cleaned) return null;
  if (REASON_VALUE_SET.has(cleaned as ReasonLabel)) return cleaned as ReasonLabel;
  return REASON_ALIASES[cleaned] ?? null;
}

export function labelFor(reason: ReasonLabel): string {
  return REASON_LABELS.find((r) => r.value === reason)?.label ?? reason;
}
