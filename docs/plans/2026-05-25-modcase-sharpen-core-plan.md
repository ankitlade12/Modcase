# Sharpen the Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ModCase read as one clear idea — collapse the 17-item menu into the two heroes plus a single "Team insights" report picker, and lead the precedent panel with the settled/contested verdict (with a teaching empty state).

**Architecture:** Three independent edits. (1) `src/modcase/summary.ts` reorders `formatPrecedentSummary` so the verdict leads, and short-circuits to a teaching message when there is no history. (2) `src/app.ts` gains a `team-insights` menu endpoint and an `insights-submit` form endpoint that reuse the existing report formatters — no report logic changes, and the old per-report endpoints stay (they back the existing tests and remain reachable). (3) `devvit.json` drops the nine read-only report menu items and adds one `Team insights` item, with the config test updated to match.

**Tech Stack:** TypeScript, Hono, Devvit Web (`@devvit/web`), Vitest.

**Project commit convention:** This repo's commits are authored solely by the user — do **not** add a `Co-Authored-By: Claude` trailer or any Claude attribution to commit messages.

---

## File Structure

- `src/modcase/summary.ts` (modify) — `formatPrecedentSummary` verdict-first ordering + zero-history teaching state. No new exports.
- `tests/summary.test.ts` (modify) — add ordering test + empty-state test.
- `src/app.ts` (modify) — add `POST /internal/menu/team-insights` and `POST /internal/form/insights-submit`; reuse existing module-scope formatters and the `collectBucketSummaries`/`loadSettings` closures.
- `tests/routes.test.ts` (modify) — add a Team insights flow test.
- `devvit.json` (modify) — menu diet + new `modcaseInsightsPicker` form.
- `tests/devvit-config.test.ts` (modify) — menu length 17 → 9; register the new form.
- `README.md`, `docs/LOCAL_DEV.md` (modify) — describe the consolidated menu.

No data-model changes. Guardrails unchanged.

---

## Task 1: Reframe the precedent panel (verdict-first + teaching empty state)

**Files:**
- Modify: `src/modcase/summary.ts:47-89` (the `formatPrecedentSummary` function)
- Test: `tests/summary.test.ts`

- [ ] **Step 1: Add the two new tests**

Add these two `it` blocks inside the existing `describe('precedent summaries', ...)` in `tests/summary.test.ts`:

```ts
  it('leads with the verdict before the raw counts', () => {
    const text = formatPrecedentSummary(
      'harassment_abuse',
      'comment',
      [0, 1, 2, 3, 4].map((i) => record('removed', i)),
      { lookupLimit: 50, minSignalSample: 5 },
    );

    expect(text).toContain('Settled team pattern: 100% removed.');
    expect(text.indexOf('Settled team pattern')).toBeLessThan(text.indexOf('Counts from last'));
  });

  it('shows a teaching empty state when there is no history', () => {
    const text = formatPrecedentSummary('low_effort', 'post', [], { lookupLimit: 50 });

    expect(text).toContain('No team precedent yet for Low Effort posts.');
    expect(text).toContain('ModCase: Seed demo data');
    expect(text).not.toContain('Counts from last');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/summary.test.ts`
Expected: FAIL — the empty-state test fails (current code prints `Counts from last ...` for `[]`), and the ordering test fails (the verdict currently appears after the counts).

- [ ] **Step 3: Rewrite `formatPrecedentSummary`**

Replace the entire `formatPrecedentSummary` function (currently `src/modcase/summary.ts:47-89`) with:

```ts
export function formatPrecedentSummary(
  reasonLabel: ReasonLabel,
  targetType: TargetType,
  records: DecisionRecord[],
  options: {
    lookupLimit?: number;
    displayLimit?: number;
    minSignalSample?: number;
    lookupText?: string;
  } = {},
): string {
  const lookupLimit = options.lookupLimit ?? DEFAULT_LOOKUP_LIMIT;
  const displayLimit = options.displayLimit ?? DEFAULT_DISPLAY_LIMIT;

  if (records.length === 0) {
    return [
      'ModCase precedent',
      `Reason: ${labelFor(reasonLabel)}`,
      `Content type: ${targetType}`,
      '',
      `No team precedent yet for ${labelFor(reasonLabel)} ${targetType}s.`,
      `This panel fills in automatically as moderators approve or remove ${targetType}s for this reason.`,
      'To see it working now, run "ModCase: Seed demo data" from the subreddit menu.',
    ].join('\n');
  }

  const s = summarize(records, options.minSignalSample);
  const rankedRecords = rankRecordsForLookup(options.lookupText, records);
  const exactFingerprint = contentFingerprint(options.lookupText);
  const exactMatches = exactFingerprint ? records.filter((record) => record.contentFingerprint === exactFingerprint).length : 0;
  const examples = rankedRecords.slice(0, displayLimit).map((r, i) => {
    const age = new Date(r.timestamp).toLocaleDateString('en-US');
    const keywordNote = r.sharedKeywords?.length ? ` [keywords: ${r.sharedKeywords.slice(0, 3).join(', ')}]` : '';
    const snippet = r.snippet ? ` - "${r.snippet}"` : '';
    const note = r.internalNote ? ` Note: ${r.internalNote}` : '';
    return `${i + 1}. ${r.action} ${r.targetType} - ${age}${keywordNote}${snippet}${note}`;
  });

  return [
    'ModCase precedent',
    `Reason: ${labelFor(reasonLabel)}`,
    `Content type: ${targetType}`,
    '',
    formatSignal(s),
    formatRecentTrend(records),
    '',
    `Counts from last ${lookupLimit} matching decisions:`,
    `Removed: ${s.removed}`,
    `Approved: ${s.approved}`,
    `Total: ${s.total}`,
    '',
    formatKeywordAssist(options.lookupText, rankedRecords),
    exactFingerprint ? `Fingerprint matches: ${exactMatches} exact normalized text match${exactMatches === 1 ? '' : 'es'} in this bucket.` : 'Fingerprint matches: no current text available.',
    '',
    examples.length ? `Recent examples:\n${examples.join('\n')}` : 'No prior examples yet. Use the demo seeder or let automatic capture build history.',
  ].join('\n');
}
```

- [ ] **Step 4: Run the summary tests to verify they pass**

Run: `npx vitest run tests/summary.test.ts`
Expected: PASS (all tests, including the two new ones).

- [ ] **Step 5: Run the route tests to confirm no regression**

Run: `npx vitest run tests/routes.test.ts`
Expected: PASS — the existing assertions (`Settled team pattern: 100% removed.`, `1. removed comment`, the keyword-assist ordering, etc.) still hold because every substring is preserved; only the order changed.

- [ ] **Step 6: Commit**

```bash
git add src/modcase/summary.ts tests/summary.test.ts
git commit -m "Lead precedent panel with verdict and add teaching empty state"
```

---

## Task 2: Add the Team insights endpoints

**Files:**
- Modify: `src/app.ts` (add two routes; reuse existing formatters)
- Test: `tests/routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add this `it` block inside the existing `describe('Devvit route behavior', ...)` in `tests/routes.test.ts`:

```ts
  it('consolidates reports behind the Team insights picker', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    const actions = ['removed', 'removed', 'removed', 'approved', 'approved'] as const;
    actions.forEach((action, index) => {
      const id = `insights:${index}`;
      const record = {
        decisionId: id,
        subreddit: 'example',
        targetType: 'comment',
        targetHash: `insights-h-${index}`,
        action,
        reasonLabel: 'harassment_abuse',
        timestamp: now + index,
        source: 'demo_seed',
      };
      strings.set(decisionKey(id), JSON.stringify(record));
      sortedSets.set(idxKey('example', 'comment', 'harassment_abuse'), [
        ...sortedItems(idxKey('example', 'comment', 'harassment_abuse')),
        { member: id, score: now + index },
      ]);
    });

    const open = await postJson('/internal/menu/team-insights', { subredditName: 'r/Example' });
    expect(open.showForm.name).toBe('modcaseInsightsPicker');
    expect(open.showForm.form.fields[0].options[0].value).toContain('rule-health');

    const health = await postJson('/internal/form/insights-submit', { report: ['rule-health::modcasectx::example'] });
    expect(health.showForm.name).toBe('modcaseSummaryAck');
    expect(health.showForm.form.fields[0].defaultValue).toContain('ModCase rule health');
    expect(health.showForm.form.fields[0].defaultValue).toContain('Leaning: 1');

    const audit = await postJson('/internal/form/insights-submit', { report: ['audit::modcasectx::example'] });
    expect(audit.showForm.form.fields[0].defaultValue).toContain('Total indexed decisions: 5');

    const exportReport = await postJson('/internal/form/insights-submit', { report: ['export::modcasectx::example'] });
    expect(exportReport.showForm.form.fields[0].defaultValue).toContain('ModCase aggregate export');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/routes.test.ts -t "Team insights"`
Expected: FAIL — `/internal/menu/team-insights` does not exist yet, so `open.showForm` is undefined.

- [ ] **Step 3: Add the two routes**

In `src/app.ts`, insert the following two route handlers immediately **before** the `app.post('/internal/menu/seed-demo', ...)` handler (currently near `src/app.ts:1293`). They reuse the module-scope formatters (`formatRuleHealthReport`, `formatTrendReport`, `formatContestedReport`, `formatSecondReviewReport`, `formatRuleDriftReport`, `formatCommunityConstitution`, `formatTransparencyReport`, `formatAuditSnapshot`, `formatExportReport`) and the in-scope closures (`loadSettings`, `collectBucketSummaries`):

```ts
  app.post('/internal/menu/team-insights', async (c) => {
    const input = await c.req.json<MenuItemRequest & Record<string, any>>().catch(() => ({}));
    const subreddit = extractSubreddit(input, getSubredditName());

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseInsightsPicker',
        form: {
          title: 'ModCase team insights',
          description: 'Pick an aggregate report. Every report is team-level and excludes usernames, moderator identities, and raw content.',
          acceptLabel: 'Show report',
          cancelLabel: 'Cancel',
          fields: [
            {
              type: 'select',
              name: 'report',
              label: 'Report',
              required: true,
              options: [
                { label: 'Rule health', value: encodeFormContextValue('rule-health', subreddit) },
                { label: 'Rule trends', value: encodeFormContextValue('rule-trends', subreddit) },
                { label: 'Contested rules', value: encodeFormContextValue('contested-rules', subreddit) },
                { label: 'Second review', value: encodeFormContextValue('second-review', subreddit) },
                { label: 'Rule drift', value: encodeFormContextValue('rule-drift', subreddit) },
                { label: 'Community constitution', value: encodeFormContextValue('community-constitution', subreddit) },
                { label: 'Transparency summary', value: encodeFormContextValue('transparency', subreddit) },
                { label: 'Audit snapshot', value: encodeFormContextValue('audit', subreddit) },
                { label: 'Export report', value: encodeFormContextValue('export', subreddit) },
              ],
              defaultValue: [encodeFormContextValue('rule-health', subreddit)],
            },
          ],
        },
        data: { subreddit },
      },
    });
  });

  app.post('/internal/form/insights-submit', async (c) => {
    const body = await c.req.json<{ report?: string | string[]; subreddit?: string }>();
    const decoded = decodeFormContextValue(firstFormValue(body.report));
    const reportKey = decoded.value ?? '';
    const subreddit = extractSubreddit({ subredditName: body.subreddit ?? decoded.context }, getSubredditName());
    const settings = await loadSettings(subreddit);
    const buckets = await collectBucketSummaries(subreddit, settings);

    let title = 'ModCase team insights';
    let report: string;
    switch (reportKey) {
      case 'rule-health':
        title = 'ModCase rule health';
        report = formatRuleHealthReport(subreddit, settings, buckets);
        break;
      case 'rule-trends':
        title = 'ModCase rule trends';
        report = formatTrendReport(subreddit, settings, buckets);
        break;
      case 'contested-rules':
        title = 'ModCase contested rules';
        report = formatContestedReport(subreddit, settings, buckets);
        break;
      case 'second-review':
        title = 'ModCase second review';
        report = formatSecondReviewReport(subreddit, settings, buckets);
        break;
      case 'rule-drift':
        title = 'ModCase rule drift';
        report = formatRuleDriftReport(subreddit, settings, buckets);
        break;
      case 'community-constitution':
        title = 'ModCase constitution';
        report = formatCommunityConstitution(subreddit, buckets);
        break;
      case 'transparency':
        title = 'ModCase transparency';
        report = formatTransparencyReport(subreddit, buckets);
        break;
      case 'audit': {
        title = 'ModCase audit snapshot';
        const rows: { targetType: TargetType; reasonLabel: ReasonLabel; count: number }[] = [];
        for (const targetType of ['post', 'comment'] as const) {
          for (const reason of REASON_LABELS) {
            rows.push({ targetType, reasonLabel: reason.value, count: await redis.zCard(idxKey(subreddit, targetType, reason.value)) });
          }
        }
        report = formatAuditSnapshot(subreddit, rows);
        break;
      }
      case 'export': {
        title = 'ModCase export report';
        const rules = normalizeImportedRules(parseJsonObject(await redis.get(ruleMappingKey(subreddit))));
        report = formatExportReport(subreddit, settings, buckets, rules);
        break;
      }
      default:
        return c.json<UiResponse>({ showToast: 'ModCase could not identify that report.' });
    }

    return c.json<UiResponse>({
      showForm: {
        name: 'modcaseSummaryAck',
        form: {
          title,
          acceptLabel: 'Close',
          fields: [
            {
              type: 'paragraph',
              name: 'insightsReport',
              label: 'Team insight',
              defaultValue: report,
              disabled: true,
              lineHeight: 14,
            },
          ],
        },
        data: { insightsReport: report },
      },
    });
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/routes.test.ts -t "Team insights"`
Expected: PASS.

- [ ] **Step 5: Run the full route + summary suites**

Run: `npx vitest run tests/routes.test.ts tests/summary.test.ts`
Expected: PASS (no regressions to the existing per-report endpoints, which are untouched).

- [ ] **Step 6: Commit**

```bash
git add src/app.ts tests/routes.test.ts
git commit -m "Add Team insights picker that reuses existing report formatters"
```

---

## Task 3: Menu diet in devvit.json

**Files:**
- Modify: `devvit.json` (remove 9 report items, add `team-insights`, register `modcaseInsightsPicker`)
- Test: `tests/devvit-config.test.ts:17` and `tests/devvit-config.test.ts:24-33`

- [ ] **Step 1: Update the config test expectations first**

In `tests/devvit-config.test.ts`, change the menu length assertion (currently line 17) from:

```ts
    expect(devvitConfig.menu.items).toHaveLength(17);
```

to:

```ts
    expect(devvitConfig.menu.items).toHaveLength(9);
```

Then add the new form to the `toMatchObject` in the "registers form endpoints" test (currently lines 25-32) so it reads:

```ts
    expect(devvitConfig.forms).toMatchObject({
      modcaseReasonPicker: '/internal/form/reason-picker-submit',
      modcaseManualCorrectionForm: '/internal/form/manual-correction-submit',
      modcaseSettingsForm: '/internal/form/settings-submit',
      modcaseUnknownCleanupForm: '/internal/form/unknown-cleanup-submit',
      modcaseTrainingForm: '/internal/form/training-submit',
      modcaseInsightsPicker: '/internal/form/insights-submit',
      modcaseSummaryAck: '/internal/form/summary-ack',
    });
```

- [ ] **Step 2: Run the config test to verify it fails**

Run: `npx vitest run tests/devvit-config.test.ts`
Expected: FAIL — `devvit.json` still has 17 items and no `modcaseInsightsPicker` form.

- [ ] **Step 3: Rewrite `devvit.json`**

Replace the `"menu"` and `"forms"` blocks of `devvit.json` so the file reads exactly as below (server/triggers/scripts/permissions/dev blocks are unchanged):

```json
{
  "$schema": "https://developers.reddit.com/schema/config-file.v1.json",
  "name": "modcase-v1",
  "server": {
    "dir": "dist/server",
    "entry": "index.cjs"
  },
  "menu": {
    "items": [
      {
        "label": "ModCase: Check precedent",
        "description": "Pick a rule/reason and see how the team handled similar past decisions.",
        "location": [
          "post",
          "comment"
        ],
        "forUserType": "moderator",
        "endpoint": "/internal/menu/check-precedent"
      },
      {
        "label": "ModCase: Record correction",
        "description": "Manually store a privacy-conscious precedent record without taking action on Reddit.",
        "location": [
          "post",
          "comment"
        ],
        "forUserType": "moderator",
        "endpoint": "/internal/menu/record-correction"
      },
      {
        "label": "ModCase: Team insights",
        "description": "Open the aggregate report picker: rule health, trends, contested rules, drift, constitution, transparency, audit, and export.",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/team-insights"
      },
      {
        "label": "ModCase: Sync rules",
        "description": "Import subreddit rules into the controlled ModCase reason-label map.",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/sync-rules"
      },
      {
        "label": "ModCase: Unknown cleanup",
        "description": "Remap recent Unknown / Unmapped precedent into a controlled reason bucket.",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/unknown-cleanup"
      },
      {
        "label": "ModCase: Training mode",
        "description": "Practice against a past precedent example and reveal the team decision.",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/training"
      },
      {
        "label": "ModCase: Settings",
        "description": "Set retention and lookup-history limits for this subreddit install.",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/settings"
      },
      {
        "label": "ModCase: Seed demo data",
        "description": "Populate this install with demo history for testing and judging.",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/seed-demo"
      },
      {
        "label": "ModCase: Debug log count",
        "description": "Show how many raw ModAction payloads were captured for verification.",
        "location": "subreddit",
        "forUserType": "moderator",
        "endpoint": "/internal/menu/show-debug-log-count"
      }
    ]
  },
  "forms": {
    "modcaseReasonPicker": "/internal/form/reason-picker-submit",
    "modcaseManualCorrectionForm": "/internal/form/manual-correction-submit",
    "modcaseSettingsForm": "/internal/form/settings-submit",
    "modcaseUnknownCleanupForm": "/internal/form/unknown-cleanup-submit",
    "modcaseTrainingForm": "/internal/form/training-submit",
    "modcaseInsightsPicker": "/internal/form/insights-submit",
    "modcaseSummaryAck": "/internal/form/summary-ack"
  },
  "triggers": {
    "onModAction": "/internal/triggers/on-mod-action"
  },
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch"
  },
  "permissions": {
    "reddit": true,
    "redis": true
  },
  "dev": {
    "subreddit": "modcase_v1_dev"
  }
}
```

- [ ] **Step 4: Run the config verifier and config test**

Run: `npm run verify:config && npx vitest run tests/devvit-config.test.ts`
Expected: `Devvit config check passed.` then PASS — 9 moderator-only internal menu items, all forms internal.

- [ ] **Step 5: Commit**

```bash
git add devvit.json tests/devvit-config.test.ts
git commit -m "Collapse report menu items into a single Team insights picker"
```

---

## Task 4: Update docs to describe the consolidated menu

**Files:**
- Modify: `README.md:27`
- Modify: `docs/LOCAL_DEV.md:31`

- [ ] **Step 1: Update the README walkthrough**

In `README.md`, replace the line (currently line 27):

```text
3. Pick a reason and verify the precedent summary. If the menu payload includes current text, examples are keyword-assisted within the same deterministic bucket.
4. Perform a real approve/remove action and inspect Devvit logs for the raw payload shape.
5. Optional: use subreddit menu -> `ModCase: Audit snapshot`, `Rule health`, `Rule trends`, `Contested rules`, `Second review`, `Rule drift`, `Constitution`, `Export report`, `Transparency summary`, `Unknown cleanup`, `Training mode`, `Settings`, or `Sync rules`.
```

with:

```text
3. Pick a reason and verify the precedent summary. The panel leads with the settled/leaning/contested verdict. If the menu payload includes current text, examples are keyword-assisted within the same deterministic bucket.
4. Perform a real approve/remove action and inspect Devvit logs for the raw payload shape.
5. Optional: open subreddit menu -> `ModCase: Team insights` and pick a report (rule health, rule trends, contested rules, second review, rule drift, community constitution, transparency summary, audit snapshot, export report). Other subreddit items: `ModCase: Sync rules`, `Unknown cleanup`, `Training mode`, and `Settings`.
```

- [ ] **Step 2: Update the LOCAL_DEV menu description**

In `docs/LOCAL_DEV.md`, replace the sentence (currently in line 31) that begins "The subreddit menu also exposes settings, rule sync, audit snapshot..." through "...and aggregate export reports." with:

```text
The subreddit menu also exposes `ModCase: Team insights` (rule health, trends, contested rules, second review, drift, community constitution, transparency summary, audit snapshot, and export report), plus rule sync, unknown cleanup, training mode, and settings.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/LOCAL_DEV.md
git commit -m "Document the Team insights menu consolidation"
```

---

## Final verification

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: `Devvit config check passed.`, typecheck clean, and Vitest green — 41 tests (38 existing + 3 new: two in `summary.test.ts`, one in `routes.test.ts`).

- [ ] **Step 2: Confirm test count moved as expected**

If the Vitest summary does not read `Tests  41 passed (41)`, stop and reconcile against this plan before proceeding.

---

## Self-review notes (author check, already applied)

- **Spec coverage:** Menu diet (Tasks 2–3), hero panel verdict-first (Task 1), teaching empty state (Task 1), docs (Task 4). All three Sub-project A items covered. No data-model change, matching the spec.
- **No-regression strategy:** The nine per-report endpoints in `src/app.ts` are intentionally kept, so `tests/routes.test.ts`'s direct posts to `/internal/menu/rule-trends` etc. stay green; the diet only removes their `devvit.json` menu entries.
- **Substring preservation:** Task 1 reorders but preserves every string the existing tests assert (`Reason:`, `Counts from last N matching decisions:`, the `formatSignal` lines, `Recent trend:`, keyword/fingerprint lines, examples), so prior tests pass unchanged.
- **Type consistency:** New endpoints reuse existing identifiers (`encodeFormContextValue`, `decodeFormContextValue`, `firstFormValue`, `extractSubreddit`, `loadSettings`, `collectBucketSummaries`, `REASON_LABELS`, `idxKey`, `ruleMappingKey`, `normalizeImportedRules`, `parseJsonObject`, `formatAuditSnapshot`, `formatExportReport`) exactly as defined in `src/app.ts`. Report keys used in the menu options (`rule-health`, `audit`, `export`, ...) match the `switch` cases in `insights-submit` one-for-one.
- **Placeholder scan:** No TBD/TODO; every code and command step is complete.
