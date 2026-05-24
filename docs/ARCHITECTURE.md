# ModCase Architecture

## Entry Point

`src/index.ts` contains the Devvit Web route layer. Moderation normalization, reason mapping, summaries, demo records, key construction, and HTTP adapter code live in focused modules under `src/modcase/` and `src/devvit/`.

## Runtime Flow

1. Reddit sends `onModAction` to `/internal/triggers/on-mod-action`.
2. ModCase logs the raw payload while debug capture is enabled.
3. The normalizer extracts actor, subreddit, action, target type, target id, reason, timestamp, and snippet.
4. Automated actors and non-post/comment actions are filtered out.
5. A privacy-conscious `DecisionRecord` is stored in Redis and indexed by reason.
6. A moderator opens `ModCase: Check precedent` from a post/comment menu.
7. ModCase stores short-lived lookup context, shows a controlled reason picker, loads recent matching decisions, and returns a summary form.
8. Optional later-version utilities let moderators record a manual correction, sync subreddit rules into controlled labels, tune bounded retention/lookup settings, clean unknown-reason buckets, practice with training mode, view health/trend/contested/drift/second-review reports, generate a community constitution, and export aggregate audit/transparency text without changing Reddit content state.

## Data Model

`DecisionRecord` is the core record:

- `decisionId`: idempotent key, preferably from the ModAction id.
- `subreddit`: normalized subreddit name.
- `targetType`: `post` or `comment`.
- `targetHash`: salted stable hash of subreddit, type, and target id.
- `action`: `removed` or `approved`.
- `reasonLabel`: controlled reason label.
- `timestamp`: milliseconds since epoch.
- `source`: trigger, demo seed, or manual correction.
- `contentFingerprint`: optional privacy-safe exact/near-exact reference derived from normalized snippet text; not semantic similarity.
- `snippet`: short target text preview when available.
- `internalNote`: optional short moderator-written precedent note on manual/corrected records.
- `remappedFromReason`: optional original controlled label when unknown cleanup remaps a record.

Settings are stored per subreddit under `settings:{subreddit}` and currently include only decision retention days and lookup history cap. Reports are derived from recent decision records instead of separate counters.

## Module Map

```text
src/
├── index.ts             # Hono routes, Redis persistence, Devvit server export
├── modcase/
│   ├── demo.ts          # Demo decision seed generation
│   ├── fingerprint.ts   # Privacy-safe content fingerprint helpers
│   ├── hash.ts          # Stable hash and id helpers
│   ├── keywords.ts      # Keyword-assisted ordering for already-matching precedent
│   ├── keys.ts          # Redis key builders
│   ├── payload.ts       # Devvit payload extraction and decision construction
│   ├── reasons.ts       # Controlled reason labels and aliases
│   ├── settings.ts      # Bounded retention and lookup settings
│   ├── summary.ts       # Precedent signal classification and formatting
│   └── types.ts         # Shared ModCase domain types
└── devvit/
    └── http.ts          # Hono fetch adapter for Devvit's Node-style server
```

Real payload verification is still required before tightening the extraction candidates in `payload.ts`.
