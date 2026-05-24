# ModCase v0 Feature Freeze: What to Build and What NOT to Build

**Project:** ModCase  
**Tagline:** A consistency layer for Reddit moderation.  
**Hackathon:** Reddit Mod Tools and Migrated Apps Hackathon  
**Category:** Best New Mod Tool  
**Core thesis:** Most mod tools remember users. ModCase remembers decisions.

---

## 1. The v0 product in one sentence

ModCase automatically captures human moderator decisions, stores them as privacy-conscious decision records, and lets a moderator choose a rule/reason on a fresh post or comment to see how the team handled similar cases before.

The v0 should feel like:

> “Before I decide, show me how our team usually handles this kind of case.”

It should **not** feel like:

> “The app is judging me, replacing me, or tracking individual moderators.”

---

## 2. Final v0 scope

Build only the smallest version that proves the product loop.

### Must build

| Feature | Why it matters |
|---|---|
| Automatic capture of human mod actions | The memory should build itself with no extra mod work. |
| Bot/Automod/app filtering | The product is about human team precedent, not automation noise. |
| Remove/approve only for posts/comments | Keeps the data model coherent and demoable. |
| Controlled reason labels | Prevents Redis index fragmentation from free-text reasons. |
| Reason picker before lookup | Fresh items do not have a removal reason yet, so the mod must choose the rule context. |
| Redis decision store | Fast, Devvit-native storage for the hackathon build. |
| Recent precedent lookup | Shows the last few similar decisions. |
| Counts derived from stored records | Avoids retry/double-count bugs from increment-only stats. |
| Minimum sample guard | Avoids calling a rule “contested” with only 1–3 examples. |
| Settled / leaning / contested signal | Turns raw counts into useful institutional insight. |
| Mod-only demo seeder | Lets judges see value immediately on a fresh install. |
| Privacy-conscious records | Store decisions, not moderator/user profiles. |

---

## 3. Final v0 user flow

### Flow A — Memory builds automatically

1. A human moderator removes or approves a post/comment.
2. Devvit trigger receives a mod action payload.
3. ModCase filters out Automod, known bots, and the app itself.
4. ModCase normalizes the action into:
   - `removed`
   - `approved`
5. ModCase normalizes the target into:
   - `post`
   - `comment`
6. ModCase normalizes the reason into a controlled label:
   - `harassment_abuse`
   - `spam_promotional`
   - `low_effort`
   - `off_topic`
   - `explicit_content`
   - `legal_policy`
   - `unknown_reason`
7. ModCase stores a privacy-conscious decision record.

### Flow B — Moderator checks precedent before deciding

1. Moderator opens a fresh post/comment.
2. Moderator clicks **ModCase: Check precedent**.
3. ModCase asks the moderator to choose the likely rule/reason.
4. ModCase looks up past decisions for:
   - same subreddit
   - same content type
   - same controlled reason label
5. ModCase shows:
   - total recent examples
   - removed vs approved counts
   - settled / leaning / contested / limited-history signal
   - 3 most recent precedent examples
6. Moderator decides normally in Reddit.

### Flow C — Demo seeding

1. Moderator clicks **ModCase: Seed demo history**.
2. App creates 8–12 fake but realistic decision records in that subreddit installation.
3. Judge can immediately test the precedent view.

---

## 4. Decision record: what to store

Store only what the product needs.

```ts
type ModCaseDecision = {
  decisionId: string;
  subreddit: string;
  targetType: "post" | "comment";
  action: "removed" | "approved";
  reasonLabel: ReasonLabel;
  timestamp: number;
  targetHash: string;
  contentFingerprint?: string;
  snippet?: string;
  source: "mod_action_trigger" | "demo_seed" | "manual_correction";
};
```

### Do not store in v0

```ts
moderatorName: string;
authorName: string;
rawTargetId: string;
rawPostBody: string;
rawCommentBody: string;
freeTextRemovalReason: string;
```

### Why

ModCase should be easy to defend:

> ModCase stores moderation precedent, not moderator profiles or user dossiers.

---

## 5. Redis key design

Use controlled labels only in keys.

```text
decision:{decisionId}
idx:reason:{subreddit}:{targetType}:{reasonLabel}
```

Example:

```text
decision:mc_abc123
idx:reason:AskExample:comment:harassment_abuse
```

### Do not use free text in Redis keys

Bad:

```text
idx:reason:AskExample:comment:removed_because_this_guy_was_being_rude_again
```

Good:

```text
idx:reason:AskExample:comment:harassment_abuse
```

Free-text keys fragment the store and make lookup look broken.

---

## 6. Settled / leaning / contested signal

Do not show a confidence-style signal until there is enough history.

### Recommended logic

| Condition | Signal | UI wording |
|---|---|---|
| `n < 5` | `limited_history` | “Limited history — showing raw counts only.” |
| majority share `>= 0.80` | `settled` | “Your team is usually consistent here.” |
| majority share `>= 0.60` and `< 0.80` | `leaning` | “Your team leans one way, but not strongly.” |
| majority share `< 0.60` | `contested` | “This rule appears contested across the team.” |

### Example

```text
Harassment / Abuse precedent
Removed: 7
Approved: 2

Signal: Your team is usually consistent here.
Most common action: Removed
```

### Why this matters

The strongest product insight is not just “what happened before.” It is:

> “Is this rule settled or contested in this community?”

That is institutional memory.

---

## 7. Features we should NOT do in v0

This is the most important scope-control section. These features are tempting, but they either weaken the pitch, create privacy risk, or add too much build complexity for the hackathon.

### 7.1 Do NOT build an AI classifier

**Do not do:**

- “AI predicts whether this should be removed.”
- “LLM classifies the rule violation.”
- “AI recommends final action.”
- “AI explains why this violates the rule.”

**Why not:**

This changes the product from decision memory to AI moderation. That creates trust, safety, explainability, and review risk. It also makes the app harder to demo reliably.

**Better v0:**

Let the moderator choose the reason label. ModCase only surfaces precedent.

---

### 7.2 Do NOT auto-remove or auto-approve content

**Do not do:**

- automatic removal
- automatic approval
- automatic banning
- automatic locking
- automatic user messaging

**Why not:**

The pitch is “support human judgment,” not “replace moderators.” Auto-actions create higher safety risk and make the app feel like another Automod.

**Better v0:**

Show precedent only. The moderator takes action manually.

---

### 7.3 Do NOT capture Automod/bot/app actions as precedent

**Do not do:**

- store Automod removals as team precedent
- store spam-filter actions as team precedent
- store actions taken by ModCase itself
- store actions by known moderation bots

**Why not:**

The product is about how humans on the team decide. Automation will drown out human decisions and pollute the signal.

**Better v0:**

Capture human `remove` / `approve` actions only.

---

### 7.4 Do NOT include bans in v0

**Do not do:**

- ban precedent
- user-level moderation history
- “this user was banned before”
- ban-count dashboards

**Why not:**

Bans target users, while the v0 lookup is post/comment based. Mixing them breaks the data model and moves the product toward user surveillance.

**Better v0:**

Only post/comment removal and approval precedent.

---

### 7.5 Do NOT track individual moderators

**Do not do:**

- “Mod A removes more than Mod B”
- per-mod accuracy
- per-mod disagreement rate
- moderator leaderboards
- raw `moderatorName` in decision records

**Why not:**

This makes the app feel like workplace surveillance. It also contradicts the “decisions, not people” posture.

**Better v0:**

Aggregate at team level only.

---

### 7.6 Do NOT track individual users/authors

**Do not do:**

- per-user case history
- “this user has 7 previous removals”
- author risk scores
- raw author names
- durable user dossiers

**Why not:**

Many moderation tools already remember users. ModCase’s differentiation is remembering decisions. User tracking creates privacy and trust risk.

**Better v0:**

Store target hashes only for dedup/debugging. Do not expose user history.

---

### 7.7 Do NOT use free-text reason labels as lookup keys

**Do not do:**

- key Redis by raw mod-log description
- key Redis by custom free-text notes
- key Redis by raw removal reason text unless normalized

**Why not:**

Every slightly different phrase becomes a different bucket. The app will show “no precedent” even when relevant history exists.

**Better v0:**

Use one shared `ReasonLabel` enum for capture, picker, lookup, seed data, and UI.

---

### 7.8 Do NOT make semantic similarity the headline

**Do not do:**

- embeddings
- vector search
- fuzzy semantic matching
- LLM similarity scoring
- invented weighted formulas like `0.45 rule + 0.25 tokens + ...`

**Why not:**

The demo can be challenged easily. Token overlap is noisy, especially on short comments. Embeddings add complexity and may require external infrastructure.

**Better v0:**

Match deterministically on:

1. subreddit
2. content type
3. controlled reason label

Token overlap can be a future ranking bonus, not the core v0.

---

### 7.9 Do NOT treat hashes as similarity

**Do not do:**

- “SHA-256 finds similar content”
- “hash matching finds related decisions”
- “fingerprint equals semantic similarity”

**Why not:**

Hashing destroys similarity. A hash can detect exact/near-exact duplicate content only if the fingerprinting scheme supports it.

**Better v0:**

Say clearly:

> Hashes are used for deduplication and privacy-safe references, not semantic similarity.

---

### 7.10 Do NOT build a complex settings dashboard

**Do not do:**

- multi-tab admin UI
- per-rule configuration
- role-based settings
- custom thresholds
- retention sliders
- advanced analytics settings

**Why not:**

Settings are not the demo. They eat build time and add bugs.

**Better v0:**

Hardcode sane defaults:

```text
minimum sample size: 5
lookup history cap: 50 recent records
display examples: 3
snippet length: 140 chars
```

---

### 7.11 Do NOT build a large WebView UI unless already working

**Do not do:**

- complex frontend
- charts
- dashboards
- multi-page web app
- heavy visual analytics

**Why not:**

The hackathon values polish, but polish means reliable and understandable — not large.

**Better v0:**

Use a simple menu action + form + compact response panel/modal.

---

### 7.12 Do NOT add external backend infrastructure

**Do not do:**

- Postgres
- Supabase
- Pinecone
- LangChain service
- custom API server outside Devvit
- external cron jobs

**Why not:**

External infra creates deployment, privacy, and reliability risk.

**Better v0:**

Use Devvit + Redis only.

---

### 7.13 Do NOT build modmail, appeals, or user-facing workflows

**Do not do:**

- send modmail
- notify users
- generate appeal responses
- generate removal messages
- expose precedent to regular users

**Why not:**

This expands the product into a different domain and creates tone/safety issues.

**Better v0:**

Keep ModCase moderator-only.

---

### 7.14 Do NOT claim all-time analytics if using a bounded lookup

**Do not do:**

- “all historical team decisions”
- “entire moderation history”
- “all-time consistency score”

**Why not:**

The v0 derives counts from a bounded recent index, usually the latest 50 records per bucket.

**Better v0 wording:**

> “Based on the most recent 50 matching decisions.”

---

### 7.15 Do NOT rely on unverified trigger field names

**Do not do:**

- assume exact `ModAction` payload shape
- assume removal reason is always present
- assume actor field name before logging real payloads

**Why not:**

The mapping is the riskiest implementation detail.

**Better v0:**

Run a trigger logger first and adapt field mapping based on real payloads.

---

## 8. v0 feature priority

### Build in this order

| Priority | Feature | Status |
|---|---|---|
| P0 | Trigger logger | Must do first |
| P0 | Bot/app filtering | Must do |
| P0 | Human remove/approve capture | Must do |
| P0 | Controlled reason labels | Must do |
| P0 | Reason picker lookup | Must do |
| P0 | Redis record/index storage | Must do |
| P0 | Precedent panel | Must do |
| P0 | Mod-only demo seeder | Must do |
| P1 | Settled/leaning/contested signal | Strongly recommended |
| P1 | Limited-history guard | Strongly recommended |
| P1 | Retry-safe derived counts | Strongly recommended |
| P2 | Optional manual correction | Only if time remains |
| P2 | Helpful empty states | If time remains |
| P2 | Lightweight README/demo polish | If time remains |

---

## 9. What can move to v1/v2 after the hackathon

These are good ideas, but not for the hackathon v0.

| Later feature | Why later |
|---|---|
| Custom subreddit rule import | Useful, but field/API mapping may take time. |
| Semantic similarity | Needs validation and probably more infra. |
| Keyword ranking | Useful only after deterministic matching works. |
| Per-rule trend over time | Nice analytics, not core loop. |
| Manual decision correction workflow | Helpful, but not needed for first demo. |
| Retention settings | Good privacy feature, but can be hardcoded initially. |
| Export/audit report | Useful for mature teams, not v0. |
| Multi-subreddit dashboard | Too broad for 3-day build. |
| Mod disagreement review workflow | Strong v2, too sensitive for v0. |
| Appeals support | Different product surface. |

---

## 10. Demo script

Keep the demo under one minute.

### Suggested video flow

1. Show test subreddit with ModCase installed.
2. Click **Seed demo history**.
3. Open a reported comment.
4. Click **ModCase: Check precedent**.
5. Choose **Harassment / Abuse**.
6. Show panel:

```text
Harassment / Abuse precedent

Based on the most recent 9 matching decisions:
Removed: 7
Approved: 2

Signal: Your team is usually consistent here.
Most common action: Removed

Recent examples:
• Removed comment — 2 days ago
• Removed comment — 4 days ago
• Approved comment — 6 days ago
```

7. Moderator removes the comment normally.
8. Mention that ModCase captures the decision automatically for future precedent.

### Do not demo

- AI classification
- auto-removal
- user risk scoring
- mod scoring
- long settings screens
- complex dashboards

---

## 11. Devpost positioning

### Tool Overview

ModCase is a consistency layer for Reddit moderation. Most moderation tools remember users; ModCase remembers decisions. It automatically captures human moderator remove/approve actions, filters out Automod and bot actions, and stores privacy-conscious decision records. When a moderator reviews a new post or comment, they choose the relevant rule/reason and ModCase shows how the team handled similar cases before.

The key insight is not only what action was common, but whether the rule appears settled or contested in that community.

### Project Impact

ModCase helps moderation teams reduce inconsistent decisions, onboard new moderators faster, and preserve institutional memory without adding manual logging work. It is especially useful for communities with high report volume, subjective rules, or rotating mod teams.

### What makes it different

ModCase is not another user-risk tool and not another AI moderator. It does not score users, replace moderators, or take automatic enforcement actions. It helps human moderators see team precedent before making a decision.

---

## 12. Final feature freeze

For hackathon v0, the product should stop here:

```text
Automatic human decision capture
+ conservative reason-based precedent lookup
+ settled/contested signal
+ privacy-conscious storage
+ mod-only demo seeder
```

Everything else is a distraction until this loop works.

---

## 13. References

- Reddit Mod Tools and Migrated Apps Hackathon: https://mod-tools-migration.devpost.com/
- Hackathon schedule: https://mod-tools-migration.devpost.com/details/dates
- Devvit Mod Tool Quickstart: https://developers.reddit.com/docs/quickstart/quickstart-mod-tool
- Devvit Web Configuration: https://developers.reddit.com/docs/capabilities/devvit-web/devvit_web_configuration
- Devvit Server Triggers: https://developers.reddit.com/docs/capabilities/server/triggers
