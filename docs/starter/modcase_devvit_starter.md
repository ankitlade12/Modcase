# ModCase Devvit Web Starter

This starter is intentionally **logger-first**:

1. It logs real `onModAction` payloads.
2. It captures only human post/comment remove/approve decisions.
3. It filters Automoderator, bots, and app actors.
4. It stores no raw moderator name and no raw author name.
5. It uses a moderator reason picker for precedent lookup on fresh items.
6. It derives settled/leaning/contested stats from stored decision records instead of incrementing counters.

## Files

- `devvit.json` — menu items, forms, trigger, Redis permission.
- `src/index.ts` — Hono server routes for trigger logging, capture, lookup, summary, and demo seeding.

## First test session

Run your normal Devvit template build/playtest flow, then:

1. Install in your test subreddit.
2. Open subreddit menu → `ModCase: Seed demo data`.
3. Open a post/comment → `ModCase: Check precedent`.
4. Pick `Harassment / Abuse` to see a settled/leaning/contested summary.
5. Perform a real remove/approve action.
6. Check logs for `[ModCase] raw onModAction payload`.
7. Verify actor, target type, target id, action type, and reason fields.
8. Tighten the extraction helpers based on real payloads.

## Before submission

- Set `CAPTURE_RAW_PAYLOADS_FOR_DEBUG = false` or remove raw-payload Redis storage.
- Verify `onModAction` vs `onModActions` naming against your local Devvit config schema. The docs show both forms in different pages; use whatever your generated template accepts.
- Verify `zRange(..., { by: 'rank' })` ordering in playtest. The code reverses because the docs show ascending rank/score order.
- Replace the pure-TS hash with a proper salted hash if the verified runtime exposes a supported crypto API.
