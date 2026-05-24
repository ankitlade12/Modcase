# ModCase Handoff

## Checkpoint

The provided `modcase_devvit_starter.zip` has been scaffolded into a GoldMind-style repo. The app entry is `src/index.ts`, Devvit config is `devvit.json`, and the original starter README is preserved under `docs/starter/`. The current Devvit app slug is `modcase-v1`.

## What Works On Paper

- Devvit menu items for precedent lookup, demo seeding, and debug payload count.
- Later-version utility menu items for manual correction, subreddit rule sync, settings, audit snapshots, rule health, rule trends, contested-rule review, second-review suggestions, rule drift, community constitution, transparency summary, unknown cleanup, training mode, and aggregate export reports.
- `onModAction` trigger route.
- Redis decision storage and reason indexes.
- Moderator reason picker and precedent summary form.
- Demo seed path for judging.
- Local `npm run check` and `npm run build` pass with Devvit CLI/package `0.12.24`.
- Core logic is split into `src/modcase/` modules and covered by focused Vitest tests.
- Route-level Hono tests cover trigger capture, bot skip, precedent form flow, keyword-assisted ordering, manual correction with notes, settings, rule sync, audit snapshot, health/trend/contested/drift/second-review reports, constitution, transparency summary, unknown cleanup, training mode, aggregate export, summary response, and demo seeding.
- Live Devvit playtest has run successfully at `https://www.reddit.com/r/modcase_v1_dev/?playtest=modcase-v1`.
- The server entry now explicitly calls `server.listen(getServerPort())`, which is required for Devvit Web callbacks to reach `/internal/*` endpoints.

## Next Human-in-the-loop Step

Use the live playtest subreddit, seed demo data from the subreddit menu, and verify the precedent lookup on a post/comment. Then perform real approve/remove actions and use the logs to tighten the final action/reason mapping in `src/modcase/payload.ts`.

CLI status from this pass:

- `devvit whoami` reports `u/ChoiceThese6213`.
- `devvit list apps` shows `modcase-v1`.
- `npm run dev` starts playtest and created `r/modcase_v1_dev`.
- Observed non-capture install/update payloads use `actionedAt`, `subreddit.name`, `moderator.name`, `targetComment`, and `targetPost`; those field candidates are now reflected in `payload.ts`.

## Before Submission

- Set `CAPTURE_RAW_PAYLOADS_FOR_DEBUG = false`.
- Confirm Redis sorted-set ordering.
- Confirm app account names in `APP_ACCOUNT_NAMES`.
- Run `npm run check` and `npm run build`.
- Review npm audit findings from the Devvit dependency chain if security review is part of submission.
