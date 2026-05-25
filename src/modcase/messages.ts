import type { ReasonLabel } from './reasons.js';

/**
 * Mod-facing suggested removal-explanation wording per controlled reason. ModCase surfaces these as
 * copyable suggestions in the Removal message guide so a team can explain removals consistently. It
 * never sends them automatically and never messages users - the moderator copies wording if they want it.
 */
const REMOVAL_MESSAGES: Record<ReasonLabel, string> = {
  harassment_abuse: 'Removed for harassment or abuse. Please keep it civil - no personal attacks.',
  spam_promotional: 'Removed as spam or unsolicited promotion. Please review the self-promotion rules.',
  low_effort: 'Removed as low-effort. Please add context or substance that fits the community.',
  off_topic: 'Removed as off-topic for this community. Please check the rules for what belongs here.',
  explicit_content: 'Removed for explicit content that this community does not allow.',
  legal_policy: 'Removed for legal or site-policy reasons.',
  unknown_reason: 'Removed. Please review the community rules; reply via modmail with questions.',
};

export function removalMessageFor(reason: ReasonLabel): string {
  return REMOVAL_MESSAGES[reason];
}
