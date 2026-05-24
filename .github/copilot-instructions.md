# ModCase Agent Instructions

ModCase is a Devvit Web app. Keep changes small, privacy-conscious, and aligned with the current logger-first plan.

## Product Guardrails

- Capture only human approve/remove decisions for posts and comments.
- Do not persist raw moderator names or raw author names.
- Use controlled reason labels for lookup keys.
- Treat raw payload capture as temporary debug behavior.
- Derive precedent summaries from stored records, not increment-only counters.

## Engineering Guardrails

- Keep `devvit.json` menu, form, trigger, and permission contracts stable unless the change is deliberate.
- Prefer tests for pure normalization and summarization helpers before broad refactors.
- Split `src/index.ts` after payload fields are verified, not before.
- Run `npm run check` before considering work complete.
