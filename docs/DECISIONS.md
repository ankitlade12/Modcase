# ModCase Decisions

## D-001: Logger-first capture

Status: active

ModCase logs raw `onModAction` payloads during the first playtest slice because Devvit payload field names have varied across examples. The app should not harden extraction helpers until payloads are observed in the target subreddit.

## D-002: Store decisions, derive counts

Status: active

The app stores decision records and derives counts at lookup time instead of incrementing counters. This makes trigger retries less dangerous because an idempotent decision id can overwrite a record without inflating summary counts.

## D-003: No raw moderator or author names in storage

Status: active

Moderator identity is only used transiently to filter automated actors. Target ids are hashed before storage. Raw moderator names and raw author names are not persisted.

## D-004: Controlled reason labels

Status: active

Lookup uses a controlled reason picker. Free-text removal descriptions are not used as index keys because they fragment precedent history and can carry sensitive context.

## D-005: Demo seed is product behavior, not a test fixture

Status: active

The demo seeder is included as a moderator-only subreddit menu item so judges and testers can see the full precedent loop before enough live moderation history exists.

## D-006: V0 does not take enforcement actions

Status: active

The feature-freeze doc positions ModCase as precedent support, not automation. Menu actions that approve or remove content directly are excluded from the V0 surface. Manual correction stores a record only; the moderator still takes any Reddit action through normal Reddit controls.

## D-007: Later-version utilities stay bounded

Status: active

V1/V2 utilities are implemented only where they preserve the core posture: controlled subreddit rule mapping, audit snapshots from indexed records, bounded retention/lookup settings, and manual correction. Semantic similarity, appeals, user scoring, mod scoring, and broad dashboards remain out of scope until they have a safer product spec.

## D-008: V2 ranking is keyword assist, not semantic judgment

Status: active

Keyword ranking only reorders records that already match the deterministic lookup bucket: subreddit, content type, and controlled reason label. It does not classify content, infer a violation, or recommend an enforcement action.

## D-009: Reports stay aggregate-only

Status: active

Trend, contested-rule, and export reports derive from recent decision records and exclude moderator names, author names, raw target ids, and raw post/comment bodies. Disagreement review is allowed only as aggregate bucket review, not per-moderator surveillance.

## D-010: Community tools must remain human-centered

Status: active

Rule health, second-review suggestions, rule drift, training mode, unknown cleanup, transparency summaries, and the community constitution are allowed because they help moderators understand team precedent. They do not classify fresh content, score users, score moderators, or take enforcement actions.

## D-011: Consistency digest derives, it does not store

Status: active

The consistency digest reports how often recent decisions went against the team's own settled or leaning precedent. It is derived from the already-stored decision records at report time (consistent with D-002), so it needs no capture-time flag, no new index, and no schema change, and it works on demo-seeded data. It is aggregate and team-level: it never names a moderator or shows raw content.

## D-012: Reason suggestion is opt-in and keyword-based

Status: active

ModCase can optionally pre-select a likely reason label in the precedent picker from the current item's text. This is off by default, keyword-based (a transparent heuristic, not an AI classifier), and suggestion-only: the moderator always confirms or changes the reason, and ModCase still takes no enforcement action. Keeping it opt-in preserves the default posture that the moderator chooses the reason and ModCase only surfaces precedent.

## D-013: Cross-community comparison uses exported profiles, not a shared backend

Status: active

Devvit storage is per-install, so ModCase has no shared cross-subreddit database. Cross-community comparison is therefore opt-in and transport-free: a subreddit exports an aggregate, anonymized "community profile" (per reason/content-type bucket counts and majority action, only for buckets with at least five decisions) that another moderator pastes in to compare norms. Profiles carry no usernames, moderator identities, raw content, or target ids, and the minimum-sample floor keeps tiny buckets out (k-anonymity on bucket size).

## D-014: Removal-message guide is mod-facing only

Status: active

The removal message guide suggests consistent, copyable wording a moderator can use when removing content, and surfaces internal notes the team has already used for that reason. ModCase never sends these messages and never contacts users - it is a mod-facing reference that promotes consistent explanations. This deliberately offers wording (which the v0 freeze cautioned against) but stays within posture by never auto-messaging and never exposing anything to users.
