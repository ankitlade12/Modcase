# ModCase — A Consistency Layer for Reddit Moderation

**Built with:** TypeScript · Reddit Developer Platform (Devvit Web) · Hono · Redis · Vite · Vitest · MIT licensed

> **Most moderation tools remember users. ModCase remembers decisions.**

ModCase is a Devvit Web mod tool that automatically captures a team's human approve/remove decisions, stores them as privacy-conscious records in Redis, and surfaces them at the moment a moderator is about to act — answering one question: *"How has our team handled this kind of case before?"*

It shows a **settled / leaning / contested** verdict before a moderator decides, flags when recent decisions drift from the team's own norm, and never stores a moderator name, an author name, or a user dossier. ModCase doesn't judge content, score users, or take enforcement actions — it gives a team its own institutional memory.

## Highlights

- **Builds itself with zero extra work** — an `onModAction` trigger captures every human approve/remove; the precedent fills in automatically as the team moderates.
- **Verdict-first lookup** — pick a reason on a fresh post/comment and ModCase leads with settled / leaning / contested, backed by counts, the recent trend, the closest past case, and example snippets.
- **Deterministic where it matters** — every verdict is a transparent function of stored decisions. The only "smart" assist is an opt-in, off-by-default keyword reason suggestion. No black-box model ever decides whether a rule is settled.
- **Decisions, not people** — hashed target ids, controlled reason labels, aggregate team-level reports. No moderator names, no author names, no per-moderator tracking, no automatic enforcement.
- **12 moderator actions + 12 team-insight reports** — one consolidated Team insights picker keeps the surface clean while exposing the full depth.
- **68 tests, strict TypeScript, config-verified** — `npm run check` gates config + types + tests.

## Live

- **App listing:** https://developers.reddit.com/apps/modcase-v1
- **Source:** https://github.com/ankitlade12/Modcase
- **Live test subreddit:** r/modcase_v1_dev — install, run *Seed demo data*, and explore.

All moderator-facing actions are gated to moderators; raw debug-payload capture is off for the published build.

## The Problem

The most common source of moderator–community friction on Reddit isn't a single bad call — it's **inconsistency**:

- Different moderators judge the same borderline cases differently ("harassment" vs "heated debate," "low-effort" vs "fine").
- "Why was my comment removed when an identical one is still up?" is almost always a consistency gap, not a rules gap.
- Mod teams rotate — when a veteran leaves, their judgment leaves with them, because the unwritten norms were never written down.
- AI will soon generate moderation recommendations at far higher volume while human capacity to keep them consistent stays flat.

Most tooling remembers **users** (ban history, risk scores). Almost nothing remembers **how the team decides** — so every moderator re-derives the norm from scratch, and the norm silently drifts.

## The Solution

ModCase is the layer that sits between a report and a decision:

- **Captures** every human approve/remove automatically as a privacy-conscious `DecisionRecord` (subreddit, content type, controlled reason, hashed target, timestamp, optional snippet).
- **Surfaces** precedent at decision time — the team's verdict, the closest past case, and recent examples, with a minimum-sample guard so it never overclaims on thin history.
- **Makes drift visible** — the consistency digest and trended index show how often recent decisions went against the team's own settled norm, turning silent disagreement into a prompt for a policy conversation.
- **Keeps knowledge through turnover** — a living community constitution, a calibration mode for onboarding, and an opt-in wiki page encode "how we moderate here."

The moderator always makes the call. ModCase only ensures they can see the team's memory first.

## Architecture

### High-level workflow

```text
STEP 1 — A HUMAN DECIDES
  Moderator approves or removes a post / comment
        |  onModAction trigger
        v
STEP 2 — CAPTURE  (privacy-conscious)
  filter Automod / bots / app account
  -> normalize: action, target type, reason label, salted target hash
  -> store DecisionRecord + reason index in Redis
        |
        v
STEP 3 — LOOKUP BEFORE DECIDING
  moderator picks a reason on a fresh item
  -> summarize recent matching decisions
  -> VERDICT: settled / leaning / contested  (+ closest past case)
        |
        v
STEP 4 — KEEP THE TEAM HONEST
  consistency digest + trended index
  drift / contested / second-review queues
  cross-community compare (anonymized profiles)
```

### System

```text
                        REDDIT
      subreddit / post / comment menus  +  onModAction
                   (moderator-only)
                         |  Streamable HTTP
                         v
  +---------------------------------------------------+
  | DEVVIT WEB SERVER                                 |
  |   devvit/http.ts  - Hono <-> Devvit adapter       |
  |   app.ts          - trigger, 12 menu actions,     |
  |                     8 forms, report formatters    |
  +----------------------------+----------------------+
                               v
  +---------------------------------------------------+
  | CORE MODULES  (src/modcase)                       |
  |   payload, reasons, summary (verdict /            |
  |   divergence / consistency index), keywords,      |
  |   suggest, profile, messages, demo, settings      |
  +-----------------+---------------------+-----------+
                    v                     v  (opt-in)
           REDIS (Devvit)           Subreddit wiki
   decision records, reason        "how we moderate"
   indexes, settings, rules         page
```

**Stack:** Reddit Developer Platform (Devvit Web) for menus / forms / the `onModAction` trigger; TypeScript (Node 22+) with Hono routing the trigger, 12 menu actions, and 8 forms behind one server; deterministic decision rules in `summary.ts` (no model in the safety path); Redis for decision records, reason indexes, settings, and rule mappings; Vite to build; Vitest (68 tests) for verification.

## The Core Logic (transparent rules, no black-box model)

**Signal classification** — derived from recent matching decisions only, never a model:

- fewer than 5 matching decisions → **limited history** (show counts, infer no norm)
- majority share ≥ 80% → **settled** ("usually \<action\>")
- 60–80% → **leaning** ("leans \<action\>, not fully settled")
- under 60% → **contested** ("the team is split")

**Divergence (the consistency digest)** — walking a bucket's decisions oldest → newest, a decision counts as *against precedent* when, at the time it was made, the prior decisions already formed a leaning-or-settled majority (≥ 60%, with at least 5 prior samples) and it took the opposite action. Derived from stored records — so it works on demo data too.

**Trended consistency index** — the share of recent decisions that followed the established norm, reported as *this week vs previous week*, so a team can see consistency improving or slipping.

**Cross-community comparison (k-anonymous, no backend)** — a subreddit exports an aggregate community profile (per reason/content-type bucket counts and majority action, only for buckets with ≥ 5 decisions) that another moderator pastes in to compare norms. No usernames, no content, no shared database; the minimum-sample floor is k-anonymity on bucket size.

## Features

**12 moderator actions**

- **Check precedent** (post/comment) — pick a reason → verdict-first precedent panel + closest past case
- **Record correction** (post/comment) — log a decision (with an optional internal note) without acting on Reddit
- **Team insights** (subreddit) — one picker → the 12 reports below
- **Compare community** (subreddit) — paste another community's anonymized profile to compare norms
- **Sync rules** (subreddit) — import the subreddit's rules into controlled reason labels
- **Unknown cleanup** (subreddit) — remap "unknown reason" records into a real label
- **Training mode** (subreddit) — multi-case calibration quiz with an ephemeral score (never stored per-mod)
- **Settings** (subreddit) — retention (30/90/180/365d), lookup cap (25/50/100), opt-in reason suggestion
- **Seed demo data** / **Clear demo data** (subreddit) — populate or wipe demo history; real captured decisions are never touched
- **Publish to wiki** (subreddit) — post a living "how we moderate" page to the subreddit wiki
- **Debug log count** (subreddit) — verification helper (raw capture off in production)

**12 team-insight reports (one picker)**

Consistency digest (with trended index) · Rule health · Rule trends · Contested rules · Second review · Rule drift · Community constitution · Transparency summary · Audit snapshot · Export report · Export community profile · Removal message guide

## Privacy Posture

**ModCase does:** store decisions (hashed target, reason label) · report at the team level, in aggregate · surface precedent for a human to weigh · use deterministic rules for every verdict.

**ModCase never:** stores moderator or author names · tracks or scores individual moderators · auto-removes, auto-approves, or messages users · lets a model decide whether a rule is settled.

## Demo Flow

Install on a test subreddit, then run the loop from the menus:

```text
1. Subreddit menu -> ModCase: Seed demo data        -> "Seeded 12 demo decisions"
2. A comment menu -> ModCase: Check precedent
     -> pick "Harassment / Abuse"                    -> "Leaning pattern: 75% removed" + examples
3. Subreddit menu -> ModCase: Team insights
     -> Consistency digest                           -> "1 decision went against settled precedent"
4. Subreddit menu -> ModCase: Team insights
     -> Export community profile                     -> copyable anonymized profile
5. Subreddit menu -> ModCase: Compare community
     -> paste another profile                        -> "you removed 75%, r/other approved 78% - differ"
6. Subreddit menu -> ModCase: Clear demo data        -> back to a clean, real-only slate
```

The money shot is step 2 → step 3: the panel proves the team leans remove, and the digest catches the single decision that broke from that norm — institutional memory working, on screen.

## Project Structure

```text
reddit/
├── src/
│   ├── index.ts            # Devvit server entry
│   ├── app.ts              # Hono routes: trigger, 12 menu actions, 8 forms, report formatters
│   ├── devvit/http.ts      # Hono <-> Devvit adapter
│   └── modcase/
│       ├── payload.ts      # onModAction extraction, bot/app filtering, decision construction
│       ├── reasons.ts      # 7 controlled reason labels + alias normalization
│       ├── summary.ts      # verdict, divergence, consistency index, precedent panel
│       ├── keywords.ts     # keyword overlap + example ranking
│       ├── suggest.ts      # opt-in keyword reason suggestion (off by default)
│       ├── profile.ts      # community profile build / encode / parse / compare (k-anonymous)
│       ├── messages.ts     # mod-facing removal-message wording
│       ├── fingerprint.ts  # privacy-safe content fingerprint
│       ├── hash.ts         # stable hash + id helpers
│       ├── keys.ts         # Redis key builders
│       ├── settings.ts     # bounded retention/lookup + opt-in toggle
│       ├── demo.ts         # demo seed records
│       └── types.ts        # shared domain types
├── tests/                  # 68 Vitest tests
├── devvit.json             # menus (12), forms (8), onModAction trigger, permissions
└── docs/                   # DECISIONS, submission
```

## Quick Start

Prerequisites: Node 22+, npm 10+, and Devvit CLI auth for a Reddit developer account.

```bash
git clone https://github.com/ankitlade12/Modcase.git
cd Modcase
npm install
npm run check        # config verify + tsc (strict) + 68 Vitest tests
npm run build        # bundle the Devvit server

npm run dev                      # devvit playtest (uses a dev subreddit)
npx devvit upload                # publish to developer.reddit.com
npx devvit install r/<your_sub>  # install on a subreddit you moderate
```

In the subreddit, seed demo data and run the demo flow above.

## Why ModCase Stands Out

- **Consistency, not generation.** Most tools produce something — summaries, triage, auto-replies. ModCase remembers how a team decides and surfaces it at the decision. It's the horizontal primitive a community keeps, not a one-shot output.
- **Deterministic where it matters, AI only where it's safe.** Every verdict is a transparent function of stored decisions; the one keyword assist is opt-in and off by default, so the default product makes no classification claim it can't defend.
- **Privacy as the product, not a disclaimer.** Decisions, not people — hashed targets, controlled labels, aggregate reports, k-anonymous cross-community profiles. No surface scores or tracks an individual.
- **Derive, don't store.** Divergence and the consistency index are computed from the same decision records at read time, so the demo seeder lights them up instantly and retries can't corrupt them.
- **Honest about the platform.** Cross-community comparison ships as exportable profiles because Devvit storage is per-install; the wiki publish is a mod action because the scheduler is unverified. Each is the real, shippable form of the idea — clearly labeled, never faked.

## License

MIT — see [LICENSE](./LICENSE).

---

*"Before I decide, show me how our team usually handles this."* — ModCase remembers decisions, so the team stays consistent without remembering people.
