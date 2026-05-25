# 2026-05-25 ModCase Feature Roadmap Design

## Purpose

Decide what to change/add feature-wise so ModCase is both genuinely useful to moderator
teams and clearly novel for the "Best New Mod Tool" category, without abandoning the
posture that makes it defensible: **it remembers decisions, not people.**

This is a roadmap-level design. It decomposes the work into four independent
sub-projects, each of which gets its own implementation plan later.

## Core insight

ModCase's risk is not too few features — it already exposes **16 menu items**. The risk is
that the one novel idea (settled-vs-contested team precedent) is **buried** under utilities
and is **passive**: precedent only appears when a moderator manually opens *Check precedent*
and picks a reason. The decisive moment — when a mod is actually approving or removing — has
no ModCase in it.

Two moves follow: **make the core insight proactive, and make everything else get out of its way.**

## Guardrails that stay fixed (from `modcase_v0_feature_freeze.md`)

These remain non-negotiable across every sub-project below:

- No per-moderator tracking, scoring, or leaderboards. Aggregate at team level only.
- No user/author dossiers. Target ids stay hashed; no raw author names.
- No automatic enforcement (no auto-remove/approve/ban/lock).
- Controlled reason labels remain the index keys.
- Counts derive from stored records, not increment-only counters.

Any sub-project that pushes a stated boundary (AI, cross-subreddit) must be **opt-in,
off by default, and clearly labeled**, and is called out as such below.

---

## Sub-project A — Sharpen the core (Tier 0, no guardrail risk)

### Problem
16 flat menu items overwhelm real mods and dilute the pitch. The hero verdict
(settled/leaning/contested) is buried beneath raw counts.

### Design
- **Menu diet.** Keep the two heroes prominent: *Check precedent* (post/comment) and
  *Seed demo data* (subreddit). Replace the ~14 analytics items with **one** subreddit menu
  item, *ModCase: Team insights*, whose endpoint returns a form with a `select` of report
  types (rule health, trends, contested, drift, second review, constitution, transparency,
  export, audit). On submit, route to the existing report formatter. No report logic changes —
  only the entry surface collapses from 14 items to 1.
- **Hero panel.** Reorder `formatPrecedentSummary` in [src/modcase/summary.ts](../../src/modcase/summary.ts)
  so the first line is the plain-language verdict ("Your team is usually consistent here —
  removed") followed by counts, then examples.
- **Teaching empty states.** When a bucket has no history, the panel explains what will appear
  and points to *Seed demo data* instead of looking broken.

### Data model
No change.

### Trade-off
One extra click to reach a specific report, in exchange for a tool that reads as one clear
idea. Accept it.

### Build note
Devvit menus are flat (no native submenus), so the "index" is a form with a select field —
the same pattern already used by every report endpoint in [src/app.ts](../../src/app.ts).

---

## Sub-project B — Proactive precedent / divergence (Tier 1, the headline)

### Problem
The consistency layer never speaks at the moment it matters. A mod can remove something the
team usually approves and never know.

### Design
At capture time in the `onModAction` handler, after building the `DecisionRecord`:
1. Read the precedent signal for that `(subreddit, targetType, reasonLabel)` bucket **as it
   stood before this decision**.
2. If that prior bucket was `settled` or `leaning` and the new action is against the majority,
   record a **divergence event**.

Surfaces, in order of certainty:
- **(Guaranteed feasible) Consistency digest report.** A new entry under *Team insights*:
  "5 of the last 40 decisions went against settled precedent" with aggregate, de-identified
  bucket lines. Uses the existing report/form pattern.
- **(Needs capability check) Opt-in modmail digest.** A scheduled weekly team modmail summary
  of divergences, behind a setting that is **off by default**. Requires verifying the target
  Devvit version exposes modmail + scheduler from a trigger/scheduled context. This pushes the
  freeze's "no modmail" line, which was written for *user-facing* messaging; a team-only digest
  is a deliberate, opt-in exception and must be labeled as such.
- **(Rejected) Real-time toast to the acting mod.** A server trigger cannot synchronously
  render UI to the actor. Do not promise this.

### Data model
- Add optional fields to `DecisionRecord`: `divergedFromPrecedent?: boolean` and
  `precedentSignalAtDecision?: 'settled' | 'leaning' | 'contested' | 'limited_history'`.
- Add a per-subreddit divergence index `idx:divergence:{subreddit}` (sorted set by timestamp)
  for the digest. Bounded by the existing retention/lookup settings.

### Privacy
Inherently de-identified: `DecisionRecord` already carries no moderator name, so a divergence
event cannot name who diverged. Reports stay team-level.

### Caveat
Approvals frequently arrive with no reason, landing in `unknown_reason`; divergence detection
is strongest where the reason is known. The digest must state it covers reason-labeled buckets.

---

## Sub-project C — Opt-in AI reason suggestion (Tier 2, bounded)

### Problem
Choosing the reason label is the one manual step in the lookup. Judges also reward a visible
"smart" touch.

### Design
- New setting `aiReasonSuggestionEnabled` (default **false**).
- When enabled, *Check precedent* pre-computes a **suggested** reason label from the current
  snippet and pre-selects it in the picker, labeled "suggested — confirm or change."
- The moderator still chooses. ModCase still only surfaces precedent. This is assistance for a
  text field, **not** classification or enforcement.

### Boundary management
This deliberately relaxes the freeze's "no AI classifier" rule, so it is opt-in, off by
default, suggestion-only, and never auto-submits or auto-acts.

### Feasibility gate
Depends on a **Devvit-native** LLM capability. If the target Devvit version has none, the only
path is an external API, which breaks the "no external infrastructure" guardrail — in that case
this sub-project is **deferred**, not built. Verify before planning.

### Privacy
Sending the snippet to an LLM is a new data flow and must be disclosed in the settings copy.

---

## Sub-project D — Cross-subreddit precedent (Tier 2, network-effect bet)

### Problem
Each install is an island. "How do communities *like ours* handle this?" is unanswerable.

### Design (exploratory)
- Opt-in only. A subreddit must explicitly publish anonymized, aggregate bucket signals to a
  shared pool, and only then can it read the pool.
- Reads are **k-anonymous**: show cross-community stats only when at least N communities
  contribute to a bucket; never identify a contributing subreddit.

### Feasibility gate
Requires a cross-install store. Devvit Redis is install-scoped, so this needs either a Devvit
global/shared-store capability or an external aggregation service (the latter breaks the
"no external infrastructure" guardrail). This is the **most speculative** sub-project and
must clear a platform-capability check and a dedicated privacy review before planning.

### Status
Roadmap candidate, lowest priority. Do not plan until A and B ship and the capability question
is answered.

---

## Build sequence and dependencies

1. **A — Sharpen the core.** Independent. Do first; it improves the real tool and the demo and
   makes room for everything else.
2. **B — Proactive precedent.** Independent of A but benefits from A's cleaner surfaces. The
   novelty headline. Build the guaranteed-feasible digest first, then evaluate the opt-in
   modmail surface.
3. **C — AI reason suggestion.** Independent; gated on Devvit-native LLM availability.
4. **D — Cross-subreddit precedent.** Most work; gated on platform capability + privacy review.

## Explicitly out of scope (unchanged)

Per-moderator analytics, user dossiers/author history, automatic enforcement, appeals/modmail
to users, and semantic similarity as a headline feature all remain out of scope.

## Open questions to resolve before each plan

- B: Does the target Devvit version allow modmail + scheduler from the relevant context?
- C: Is there a Devvit-native LLM, or would this require external infra (and thus defer)?
- D: Is there a Devvit cross-install/global store, or is external infra unavoidable?

Each sub-project proceeds to its own implementation plan only after its gate is answered.
