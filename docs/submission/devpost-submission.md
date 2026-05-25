# ModCase - Devpost Submission Draft

**Category:** Best New Mod Tool
**Tagline:** A consistency layer for Reddit moderation. Most mod tools remember users; ModCase remembers decisions.

> Fill in the bracketed `[...]` items before submitting. Deadline: May 27, 2026, 6:00pm PDT.

## Required submission fields

- **App listing:** https://developers.reddit.com/apps/modcase-v1 (uploaded; latest version live on r/modcase_v1_dev)
- **Live test post:** `[link to a Reddit post in a public subreddit running ModCase]`
- **Team Reddit usernames:** `[u/your-username, ...]`

---

## Tool Overview

ModCase is a consistency layer for Reddit moderation. Most moderation tools remember users; ModCase remembers decisions. It turns a team's own moderation history into institutional memory, so a moderator can see how the team has handled similar cases before deciding - and so the team can see where its rules are settled, contested, or drifting.

**How it builds memory (automatically, no extra work):**
- A Devvit `onModAction` trigger captures human approve/remove actions on posts and comments.
- Automoderator, bots, and the app account are filtered out - only human team decisions count.
- Each decision is stored as a privacy-conscious record: subreddit, content type, a salted hash of the target, the action, a controlled reason label, and a short snippet. No moderator names, no author names, no user dossiers.

**What a moderator sees:**
- **Check precedent** (post/comment menu): pick the rule/reason; ModCase shows the team's precedent for that reason and content type - a settled / leaning / contested verdict up front, the removed/approved counts, a recent-trend line, and the most recent examples (keyword-assisted ordering when the item has text).
- **Team insights** (one subreddit menu) opens an aggregate report picker: consistency digest (with a trended team consistency index), rule health, rule trends, contested rules, second-review suggestions, rule drift, community constitution, transparency summary, audit snapshot, export report, export community profile, and a mod-facing removal message guide.
- **Closest past case**: when the item has text, the precedent panel highlights the single most similar prior decision and what the team did.
- **Publish to wiki / calibration mode**: keep a living "how we moderate" wiki page current, and let new mods calibrate against team precedent with an ephemeral, non-stored score.
- **Consistency digest** highlights how often recent decisions went against the team's own settled or leaning precedent - the institutional-memory signal that no user-centric tool surfaces. Team-level only.
- **Compare community** lets a team export an anonymized, k-anonymous aggregate profile and paste another community's profile to compare norms - cross-community insight with no shared backend and no raw data.
- **Opt-in reason suggestion** (off by default) can pre-select a likely reason in the picker from the item's text; the moderator always confirms or changes it.
- Supporting tools: manual correction (records precedent without acting on Reddit), subreddit rule sync into controlled labels, bounded retention/lookup settings, unknown-reason cleanup, training mode, and a one-click demo seeder for evaluation.

**What it deliberately does not do:** no AI auto-moderation, no automatic enforcement, no user risk scores, no per-moderator tracking or leaderboards. Every report is aggregate and team-level. The moderator always makes the call; ModCase only surfaces precedent.

**Built on:** Reddit's Developer Platform (Devvit Web), Hono, Redis, TypeScript. Covered by 68 automated tests (`npm run check`).

## Project Impact

ModCase helps moderation teams make more consistent decisions, onboard new moderators faster, and preserve institutional memory without adding manual logging work. It is most valuable to communities with high report volume, subjective rules, or rotating mod teams. Three communities that would benefit:

1. `[r/<large general-interest community>]` - high report volume and many moderators make consistent handling of borderline cases hard; the settled/contested signal and consistency digest keep the team aligned.
2. `[r/<advice or discussion community with subjective rules>]` - rules like "harassment vs heated disagreement" are judgment calls; precedent lookup gives new and veteran mods the same reference point.
3. `[r/<community with rotating or growing mod team>]` - the community constitution and training mode turn accumulated decisions into onboarding material so new mods inherit the team's norms.

## Demo script (under one minute)

1. Open a test subreddit with ModCase installed.
2. Subreddit menu -> **ModCase: Seed demo data** (creates realistic history).
3. Open a reported comment -> **ModCase: Check precedent** -> choose **Harassment / Abuse**.
4. Show the panel: it leads with the verdict ("settled - usually removed"), then counts and recent examples.
5. Subreddit menu -> **ModCase: Team insights** -> **Consistency digest**: shows the one recent decision that went against settled precedent.
6. Mention **Compare community** (export/paste anonymized profiles) as the cross-community angle.
7. Close: the moderator decides normally in Reddit; ModCase captured the decision automatically for next time.

## Pre-submission checklist

- [x] `captureRawPayloadsForDebug` set to `false` in `src/index.ts`.
- [ ] Confirm `DEFAULT_APP_ACCOUNT_NAMES` in `src/modcase/payload.ts` includes the published app's account name.
- [x] `npm run check` passes (config + typecheck + 68 tests).
- [ ] `devvit upload` and capture the app listing link.
- [ ] Install on a public test subreddit and capture a live post link.
- [ ] List team Reddit usernames.
