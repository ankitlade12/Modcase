# ModCase Assistant Context

ModCase is a Reddit Developer Platform (Devvit Web) mod tool: it captures human approve/remove decisions via the `onModAction` trigger, stores privacy-conscious records in Redis, and surfaces team precedent (settled / leaning / contested) before a moderator acts.

Start with:

- `README.md` — product overview, architecture diagrams, demo flow
- `docs/ARCHITECTURE.md` — module map and runtime flow
- `docs/DECISIONS.md` — engineering decisions log
- `docs/LOCAL_DEV.md` — local setup and playtest workflow

Conventions:

- Keep the safety-relevant logic deterministic (`src/modcase/summary.ts`); keyword assists are opt-in and off by default.
- Never store moderator or author names; keep reports aggregate and team-level; no automatic enforcement.
- Run `npm run check` (config verify + strict `tsc` + Vitest) before considering work complete.
