# Consistency Digest Implementation Plan (Sub-project B, first slice)

**Goal:** Surface, at the team level, how often recent decisions went *against* the team's own settled/leaning precedent — the novel "consistency layer" value, delivered as a privacy-safe aggregate report.

**Context:** This is the feasible-now core of roadmap Sub-project B (proactive precedent). A Devvit server trigger cannot synchronously show UI to the acting moderator, so the real-time nudge is not buildable; the design doc already designated an async **Consistency digest** as the guaranteed-feasible form.

## Key design decision: derive, don't store

Rather than flag divergences at capture time (a `DecisionRecord` schema change + a new index + a capture-path change, none of which would apply to already-seeded data), we **derive** divergences from the records already stored, at report time. This matches ModCase's existing principle (DECISIONS D-002: store decisions, derive at lookup) and means: no data-model change, no capture-path change, purely additive, and it works on demo/seeded data automatically.

A decision is "against precedent" when, ordering a bucket's records oldest→newest, the decisions *before* it already formed a leaning-or-settled majority (>= 60%, with >= `DEFAULT_MIN_SIGNAL_SAMPLE` prior samples) and it took the opposite action.

## Scope (in)

1. `countBucketDivergences(records, minSignalSample)` pure helper in `src/modcase/summary.ts` + unit tests.
2. `formatConsistencyDigest(subreddit, buckets)` in `src/app.ts`, wired into the existing **Team insights** picker as a new `consistency` report (added as the 2nd option so the existing `options[0] === rule-health` test stays valid) + route test.
3. Demo seeder tweak (`src/modcase/demo.ts`): reorder the harassment-comment block so the newest decision is an `approved` landing after a settled-removed majority — yields exactly one demoable divergence while preserving all bucket counts (the seed-demo test asserts counts only). + end-to-end test.
4. Docs: add "consistency digest" to the Team insights report list in `README.md` and `docs/LOCAL_DEV.md`.

## Scope (out / deferred)

- Opt-in team **modmail** digest: gated on Devvit modmail+scheduler capability and pushes the "no user-facing modmail" guardrail; defer.
- Capture-time divergence flags / `idx:divergence` index: unnecessary under the derive approach.
- Sub-projects **C** (AI reason suggestion) and **D** (cross-subreddit): deferred — high risk/complexity against the May 27 hackathon deadline; they work against the Polish/Reliable-UX judging criteria.

## Guardrails

Read-only and aggregate. No new storage, no per-moderator attribution (records carry no moderator name), no raw content in the digest. Fully within the "decisions not people" posture.

## Verification

Existing suite (41 tests) stays green; new tests added for the helper (2), the digest route (1), and the demo divergence end-to-end (1). `npm run check` must pass.
