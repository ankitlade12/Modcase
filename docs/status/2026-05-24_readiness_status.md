# 2026-05-24 Readiness Status

## Current State

ModCase has a runnable Devvit starter scaffolded into a product-style repo. The core flow exists in `src/index.ts`: trigger logging, decision capture, precedent lookup, demo seeding, debug count reporting, and bounded V1/V2 moderator utilities.

## Ready

- Repo structure and developer workflow.
- Devvit menu/form/trigger config.
- Redis-backed decision persistence design.
- Demo data seeding for judging and smoke tests.
- Core behavior modules and tests for payload normalization, reason mapping, and precedent summaries.
- Route-level tests with an in-memory Redis mock.
- Registered Devvit app slug `modcase-v1` and live playtest subreddit `r/modcase_v1_dev`.
- Real Devvit install/update ModAction payloads are reaching the trigger endpoint and being skipped correctly.
- Safe V1/V2 utilities are implemented: manual correction with notes, rule sync, retention/lookup settings, keyword-assisted example ordering, rule health, trend and contested-rule reports, second-review suggestions, drift detection, community constitution, unknown cleanup, training mode, transparency summary, and copyable aggregate export reports.

## Needs Verification

- Real `onModAction` payload field names in the target Devvit environment.
- `zRange(..., { by: 'rank' })` ordering in Redis.
- Final app account name for automated actor filtering.
- Submission setting for `CAPTURE_RAW_PAYLOADS_FOR_DEBUG`.
- npm audit currently reports production dependency findings through Devvit's `@devvit/protos -> protobufjs` chain with no fix available from the installed Devvit packages.
- Real approve/remove payloads still need to be captured from manual moderation actions.

## Main Risk

The payload extraction module is intentionally permissive because real Devvit payloads still need to be observed. Keep this as the first playtest task.
