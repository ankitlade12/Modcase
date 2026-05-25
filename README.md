# ModCase

ModCase is a Devvit Web app for moderator precedent lookup. It watches real moderator actions, stores privacy-conscious decision records in Redis, and lets a moderator check how similar cases were handled before deciding on a fresh post or comment.

This repo starts from `modcase_devvit_starter.zip` and is structured as a product repo: root workflow files, focused app source, docs, plans, status notes, scripts, tests, and assistant guidance.

## Quick Local Test

```bash
npm install
npm run check
npm run build
```

Then use the standard Devvit quickstart flow:

```bash
npm run dev
```

In a test subreddit:

1. Open subreddit menu -> `ModCase: Seed demo data`.
2. Open a post or comment -> `ModCase: Check precedent`.
3. Pick a reason and verify the precedent summary. If the menu payload includes current text, examples are keyword-assisted within the same deterministic bucket.
4. Perform a real approve/remove action and inspect Devvit logs for the raw payload shape.
5. Optional: use subreddit menu -> `ModCase: Audit snapshot`, `Rule health`, `Rule trends`, `Contested rules`, `Second review`, `Rule drift`, `Constitution`, `Export report`, `Transparency summary`, `Unknown cleanup`, `Training mode`, `Settings`, or `Sync rules`.

## Read First

- [docs/starter/modcase_devvit_starter.md](docs/starter/modcase_devvit_starter.md) - original starter notes
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - architecture and module map
- [docs/LOCAL_DEV.md](docs/LOCAL_DEV.md) - local setup and playtest workflow
- [docs/DECISIONS.md](docs/DECISIONS.md) - engineering decisions log
- [HANDOFF.md](HANDOFF.md) - current checkpoint and next work

## Tech Stack

Devvit Web, Hono, Redis, TypeScript, Vite, and Vitest. The app is intentionally logger-first: it records raw mod action payloads during early verification, filters out automated actors, stores hashed target identifiers, and derives precedent summaries from stored decision records.

## Directory Structure

```text
modcase/
├── src/                 # Devvit Web server implementation
├── tests/               # Vitest checks for config and contracts
├── scripts/             # Local verification and support scripts
├── docs/                # Architecture, product, plans, status, research
├── devvit.json          # Devvit app config: menus, forms, trigger, permissions
├── package.json         # Node scripts and dependencies
├── Makefile             # Developer ergonomics
└── modcase_devvit_starter.zip
```

## Current Scope

The first implementation slice is the moderation precedent loop:

- Capture human approve/remove decisions for posts and comments.
- Ignore Automoderator, bots, and the app account itself.
- Avoid storing raw moderator names or author names.
- Index decisions by subreddit, content type, and controlled reason label.
- Show settled, leaning, contested, or limited-history summaries from recent matching decisions.
- Provide bounded V1/V2 utilities: manual correction with optional internal notes, rule sync, retention/lookup settings, audit snapshot, rule health, rule trends, contested-rule review, second-review suggestions, rule drift, living constitution, training mode, unknown-reason cleanup, transparency summary, and copyable aggregate export reports.
- Keep semantic matching as keyword-assisted ordering only after subreddit/type/reason matching; no AI classification, user scoring, mod scoring, appeals workflow, or automatic enforcement is included.

Before submission, turn off raw payload storage in `src/index.ts` after the real Devvit payload shape is verified.
