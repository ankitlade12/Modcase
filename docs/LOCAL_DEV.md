# Local Development

## Prerequisites

- Node 22.2+ for parity with the current Reddit Devvit quickstart
- npm 10+
- Devvit CLI auth for your Reddit developer account

## Setup

```bash
npm install
npm run check
npm run build
```

`npm run check` runs config verification, TypeScript type checking, and Vitest.

On this machine, Node is installed at `/opt/homebrew/bin/node`; if `node` or `npm` is not on PATH, run:

```bash
export PATH=/opt/homebrew/bin:$PATH
```

## Devvit Playtest

```bash
npm run dev
```

Use the playtest URL printed by the CLI. The current generated subreddit is `r/modcase_v1_dev`. After install, seed demo data from the subreddit menu and use the post/comment menu to check precedent. The subreddit menu also exposes settings, rule sync, audit snapshot, rule health, rule trends, contested-rule review, second-review suggestions, rule drift, community constitution, transparency summary, unknown cleanup, training mode, and aggregate export reports.

If playtest reports that the app does not exist yet:

```bash
npx devvit whoami
npx devvit list apps
npx devvit init --force
```

Complete the Reddit developer app creation page in the browser. When the CLI receives the callback, rerun `npm run devvit:playtest`.

The current app slug is `modcase-v1`; use that name if the browser asks you to name the app.

`npm run devvit:playtest` and `npm run dev:devvit` are kept as aliases for the same playtest command. Use `npm run watch` only when you want the lower-level Vite server bundle watcher.

## Payload Verification

During early testing, `CAPTURE_RAW_PAYLOADS_FOR_DEBUG` is set to `true` in `src/index.ts`.

Verify these fields from Devvit logs:

- actor/moderator name field
- subreddit field
- action type field
- target type field
- target id/fullname field
- controlled removal reason field
- timestamp field

Once verified, update the extraction helpers and set debug capture to `false` before submission.

## Useful Commands

```bash
make help
make check
make build
make playtest
```
