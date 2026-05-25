# 2026-05-24 ModCase Devvit Starter Plan

## Goal

Create a product-ready repository structure around the provided ModCase Devvit starter and keep the starter runnable from the repo root.

## Completed Scaffold

- Root Devvit app config at `devvit.json`.
- Devvit Web server entry at `src/index.ts`.
- Original starter README preserved at `docs/starter/modcase_devvit_starter.md`.
- Node, Vite, TypeScript, Vitest, Makefile, and config verification scripts.
- Docs structure covering architecture, decisions, local dev, plans, product, research, status, and handoff.
- Core ModCase behavior extracted into focused modules under `src/modcase/`.
- Behavior tests added for reason normalization, payload extraction, decision capture, and summary classification.
- Route-level tests added for menu/form/trigger behavior with mocked Redis.

## Next Build Slices

1. Run Devvit playtest and capture real `onModAction` payloads.
2. Tighten payload extraction helpers from observed payloads.
3. Turn off raw debug payload storage before submission.
4. Complete Devvit app creation in the browser for the authenticated CLI account.
5. Run playtest, capture real payloads, and tighten payload extraction.
