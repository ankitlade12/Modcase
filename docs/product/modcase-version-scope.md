# ModCase Version Scope

## V0 Hackathon Loop

- Automatic capture of human approve/remove actions for posts and comments.
- Automod, bot, app-account, ban, filter, and non-content actions are filtered out.
- Controlled reason labels are used for capture, lookup, seed data, and UI.
- Redis stores privacy-conscious decision records and reason indexes.
- Precedent lookup matches subreddit, content type, and controlled reason.
- Summaries show recent counts, limited-history guard, settled/leaning/contested signal, recent trend, and up to three examples.
- Demo seeding creates realistic records for a fresh install.

## V1 Utilities

- Manual correction records a decision without taking action on Reddit.
- Manual correction can include a short internal precedent note.
- Subreddit rule sync maps rule text into controlled labels and stores the mapping.
- Retention and lookup-history settings are subreddit-scoped and intentionally small: decision retention can be 30, 90, 180, or 365 days; lookup history can be 25, 50, or 100 matching decisions.
- Audit snapshot shows indexed decision bucket counts for the current install.
- Unknown-reason cleanup lets moderators remap recent unknown buckets into controlled labels.
- Training mode lets moderators practice against team precedent without storing per-moderator scores.

## V2 Utilities

- Keyword ranking is available only after deterministic matching by subreddit, content type, and controlled reason label. It reorders examples; it does not choose a rule or action.
- Rule health summarizes settled, leaning, contested, limited-history, and unknown-reason areas.
- Per-rule trend reports show recent remove/approve patterns by reason bucket.
- Contested-rule review surfaces aggregate buckets where the team is split or only weakly leaning. It does not identify individual moderators.
- Second-review suggestions turn contested/leaning buckets into a lightweight human workflow nudge.
- Rule drift detects strong recent pattern shifts inside a bucket.
- Community constitution generates a living aggregate summary of how the community tends to moderate.
- Community transparency summary generates shareable aggregate language without raw bodies, usernames, or moderator identities.
- Export reports expand the audit snapshot into a copyable, privacy-conscious aggregate report.
- Consistency digest reports how often recent decisions went against the team's own settled or leaning precedent, derived from stored records and kept team-level only.
- Opt-in reason suggestion can pre-select a likely reason label in the picker from the item text (keyword-based, off by default, suggestion-only).
- Cross-community comparison exports an aggregate, anonymized community profile that another moderator can paste in to compare norms (opt-in, no shared backend, minimum five decisions per shared bucket).
- Closest-past-case lookup surfaces the single most similar prior decision (by keyword/fingerprint) alongside the precedent stats.
- Trended team consistency index reports the share of recent decisions that followed established precedent, this week vs last.
- Publish to wiki posts a living "how we moderate" page (constitution + transparency) to the subreddit wiki on demand.
- Calibration mode runs a multi-case quiz that scores a moderator against team precedent ephemerally (no per-moderator storage).
- Removal message guide suggests consistent, mod-facing removal wording per reason (never auto-sent, never shown to users).

## Still Out Of Scope

- Semantic similarity with embeddings or LLMs remains a future validation item, not a headline feature.
- Multi-subreddit dashboards need separate privacy and installation-boundary review.
- Appeals, modmail, user-risk scoring, mod scoring, and automatic enforcement remain outside the current product surface.
