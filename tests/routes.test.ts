import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModCaseApp } from '../src/app.js';
import { decisionKey, idxKey, lookupContextKey, rawLogKey, ruleMappingKey, settingsKey, trainingContextKey } from '../src/modcase/keys.js';

const strings = new Map<string, string>();
const sortedSets = new Map<string, { member: string; score: number }[]>();
const setOptions = new Map<string, { expiration?: Date } | undefined>();

function resetRedis(): void {
  strings.clear();
  sortedSets.clear();
  setOptions.clear();
}

function sortedItems(key: string): { member: string; score: number }[] {
  return sortedSets.get(key) ?? [];
}

const redis = {
  async set(key: string, value: string, options?: { expiration?: Date }) {
    strings.set(key, value);
    setOptions.set(key, options);
  },
  async get(key: string) {
    return strings.get(key) ?? null;
  },
  async mGet(keys: string[]) {
    return keys.map((key) => strings.get(key) ?? null);
  },
  async zAdd(key: string, item: { member: string; score: number }) {
    const existing = sortedItems(key).filter((current) => current.member !== item.member);
    sortedSets.set(key, [...existing, item].sort((a, b) => a.score - b.score));
  },
  async zCard(key: string) {
    return sortedItems(key).length;
  },
  async zRange(key: string, start: number, stop: number) {
    return sortedItems(key).slice(start, stop + 1);
  },
  async zRem(key: string, members: string[]) {
    sortedSets.set(
      key,
      sortedItems(key).filter((item) => !members.includes(item.member)),
    );
  },
};

const reddit = {
  async getRules() {
    return [
      { shortName: 'No personal attacks', kind: 'comment', violationReason: 'Harassment' },
      { shortName: 'Stay on topic', kind: 'all', violationReason: 'Off topic' },
    ];
  },
};

const app = createModCaseApp({ redis, reddit, getSubredditName: () => null });

async function postJson(path: string, body: unknown) {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<any>;
}

describe('Devvit route behavior', () => {
  beforeEach(() => {
    resetRedis();
  });

  it('captures a human remove action and indexes it for lookup', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await postJson('/internal/triggers/on-mod-action', {
      id: 'ma_route_1',
      moderatorName: 'human_mod',
      subredditName: 'r/Example',
      type: 'removecomment',
      target: { id: 't1_route', type: 'comment', body: 'Bad attack' },
      removalReason: { title: 'Harassment' },
      createdAt: '2026-05-24T12:00:00.000Z',
    });

    expect(result).toEqual({ status: 'ok' });
    expect(strings.get(decisionKey('modaction:ma_route_1'))).toContain('"reasonLabel":"harassment_abuse"');
    expect(sortedItems(idxKey('example', 'comment', 'harassment_abuse'))).toEqual([
      { member: 'modaction:ma_route_1', score: Date.parse('2026-05-24T12:00:00.000Z') },
    ]);
    expect(sortedItems(rawLogKey())).toHaveLength(1);
  });

  it('captures a Devvit ModAction envelope approve action', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await postJson('/internal/triggers/on-mod-action', {
      action: 'approvelink',
      actionedAt: '2026-05-24T21:41:00.000Z',
      id: 'ma_live_route_1',
      type: 'ModAction',
      moderator: { name: 'ChoiceThese6213' },
      subreddit: { name: 'modcase_v1_dev' },
      targetComment: { id: '' },
      targetPost: { id: 't3_1tmms2d', title: 'Test moderation case' },
    });

    expect(result).toEqual({ status: 'ok' });
    expect(strings.get(decisionKey('modaction:ma_live_route_1'))).toContain('"action":"approved"');
    expect(sortedItems(idxKey('modcase_v1_dev', 'post', 'unknown_reason'))).toEqual([
      { member: 'modaction:ma_live_route_1', score: Date.parse('2026-05-24T21:41:00.000Z') },
    ]);
  });

  it('skips automated actions while still returning trigger success', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await postJson('/internal/triggers/on-mod-action', {
      id: 'ma_route_bot',
      moderatorName: 'AutoModerator',
      subredditName: 'r/Example',
      type: 'removecomment',
      target: { id: 't1_route', type: 'comment' },
    });

    expect(result).toEqual({ status: 'ok' });
    expect(strings.get(decisionKey('modaction:ma_route_bot'))).toBeUndefined();
    expect(sortedItems(rawLogKey())).toHaveLength(1);
  });

  it('shows the reason picker and stores lookup context for a post menu action', async () => {
    const result = await postJson('/internal/menu/check-precedent', {
      postId: 't3_abc',
      subredditName: 'r/Example',
    });

    expect(result.showForm.name).toBe('modcaseReasonPicker');
    const token = result.showForm.data.lookupToken;
    expect(result.showForm.data.lookupTarget).toEqual({
      targetType: 'post',
      targetId: 't3_abc',
      subreddit: 'example',
    });
    expect(JSON.parse(strings.get(lookupContextKey(token)) ?? '{}')).toEqual({
      targetType: 'post',
      targetId: 't3_abc',
      subreddit: 'example',
    });
    expect(setOptions.get(lookupContextKey(token))?.expiration).toBeInstanceOf(Date);
  });

  it('saves retention and lookup settings for the subreddit install', async () => {
    const openResult = await postJson('/internal/menu/settings', {
      subredditName: 'r/Example',
    });

    expect(openResult.showForm.name).toBe('modcaseSettingsForm');
    expect(openResult.showForm.form.fields[0].defaultValue[0]).toContain('180');
    expect(openResult.showForm.form.fields[1].defaultValue[0]).toContain('50');

    const saveResult = await postJson('/internal/form/settings-submit', {
      subreddit: 'example',
      decisionRetentionDays: ['90'],
      lookupLimit: ['25'],
    });

    expect(saveResult.showToast).toBe('ModCase settings saved: 90d retention, 25 lookup cap.');
    expect(JSON.parse(strings.get(settingsKey('example')) ?? '{}')).toMatchObject({
      decisionRetentionDays: 90,
      lookupLimit: 25,
    });

    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await postJson('/internal/triggers/on-mod-action', {
      id: 'ma_settings_retention',
      moderatorName: 'human_mod',
      subredditName: 'r/Example',
      type: 'approvecomment',
      target: { id: 't1_retention', type: 'comment', body: 'Looks fine' },
    });

    const expiration = setOptions.get(decisionKey('modaction:ma_settings_retention'))?.expiration;
    expect(expiration).toBeInstanceOf(Date);
    expect(((expiration as Date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)).toBeGreaterThan(89);
  });

  it('records a manual correction without taking action on Reddit', async () => {
    const openResult = await postJson('/internal/menu/record-correction', {
      location: 'comment',
      targetId: 't1_comment_correct',
      subredditName: 'r/Example',
    });

    expect(openResult.showForm.name).toBe('modcaseManualCorrectionForm');
    const token = openResult.showForm.data.lookupToken;
    expect(openResult.showForm.data.lookupTarget).toEqual({
      targetType: 'comment',
      targetId: 't1_comment_correct',
      subreddit: 'example',
    });
    expect(setOptions.get(lookupContextKey(token))?.expiration).toBeInstanceOf(Date);

    strings.delete(lookupContextKey(token));

    const submitResult = await postJson('/internal/form/manual-correction-submit', {
      lookupToken: token,
      lookupTarget: openResult.showForm.data.lookupTarget,
      decisionAction: ['approved'],
      reasonLabel: ['harassment_abuse'],
      internalNote: 'Allowed because it was clearly a joke.',
    });

    expect(submitResult.showToast).toBe('ModCase recorded approved precedent for this comment.');

    const [idxItem] = sortedItems(idxKey('example', 'comment', 'harassment_abuse'));
    expect(idxItem.member).toMatch(/^manual_correction:approved:/);
    expect(JSON.parse(strings.get(decisionKey(idxItem.member)) ?? '{}')).toMatchObject({
      subreddit: 'example',
      targetType: 'comment',
      action: 'approved',
      reasonLabel: 'harassment_abuse',
      source: 'manual_correction',
      internalNote: 'Allowed because it was clearly a joke.',
    });
  });

  it('returns a precedent summary from stored matching records', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    for (let i = 0; i < 5; i += 1) {
      const id = `seed:${i}`;
      const record = {
        decisionId: id,
        subreddit: 'example',
        targetType: 'comment',
        targetHash: `h${i}`,
        action: 'removed',
        reasonLabel: 'harassment_abuse',
        timestamp: now + i,
        source: 'demo_seed',
        snippet: `example ${i}`,
      };
      strings.set(decisionKey(id), JSON.stringify(record));
      sortedSets.set(idxKey('example', 'comment', 'harassment_abuse'), [
        ...sortedItems(idxKey('example', 'comment', 'harassment_abuse')),
        { member: id, score: now + i },
      ]);
    }

    strings.set(lookupContextKey('lookup:test'), JSON.stringify({ subreddit: 'example', targetType: 'comment', targetId: 't1_abc' }));

    const result = await postJson('/internal/form/reason-picker-submit', {
      lookupToken: 'lookup:test',
      reasonLabel: ['harassment_abuse'],
    });

    const summary = result.showForm.form.fields[0].defaultValue;
    expect(result.showForm.name).toBe('modcaseSummaryAck');
    expect(summary).toContain('Reason: Harassment / Abuse');
    expect(summary).toContain('Settled team pattern: 100% removed.');
    expect(summary).toContain('1. removed comment');
  });

  it('returns a precedent summary when the lookup token is embedded in the select value', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    const record = {
      decisionId: 'seed:embedded-token',
      subreddit: 'example',
      targetType: 'post',
      targetHash: 'h-embedded',
      action: 'removed',
      reasonLabel: 'low_effort',
      timestamp: now,
      source: 'demo_seed',
      snippet: 'low effort post',
    };
    strings.set(decisionKey(record.decisionId), JSON.stringify(record));
    sortedSets.set(idxKey('example', 'post', 'low_effort'), [{ member: record.decisionId, score: now }]);
    strings.set(lookupContextKey('lookup:embedded'), JSON.stringify({ subreddit: 'example', targetType: 'post', targetId: 't3_embedded' }));

    const result = await postJson('/internal/form/reason-picker-submit', {
      reasonLabel: ['low_effort::modcasectx::lookup:embedded'],
    });

    const summary = result.showForm.form.fields[0].defaultValue;
    expect(result.showForm.name).toBe('modcaseSummaryAck');
    expect(summary).toContain('Reason: Low Effort');
    expect(summary).toContain('1. removed post');
  });

  it('returns a precedent summary from form fallback context when the token expired', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    const record = {
      decisionId: 'seed:fallback',
      subreddit: 'example',
      targetType: 'comment',
      targetHash: 'h-fallback',
      action: 'removed',
      reasonLabel: 'harassment_abuse',
      timestamp: now,
      source: 'demo_seed',
      snippet: 'fallback example',
    };
    strings.set(decisionKey(record.decisionId), JSON.stringify(record));
    sortedSets.set(idxKey('example', 'comment', 'harassment_abuse'), [{ member: record.decisionId, score: now }]);

    const result = await postJson('/internal/form/reason-picker-submit', {
      lookupToken: 'lookup:expired',
      lookupTarget: { subreddit: 'example', targetType: 'comment', targetId: 't1_fallback' },
      reasonLabel: ['harassment_abuse'],
    });

    const summary = result.showForm.form.fields[0].defaultValue;
    expect(result.showForm.name).toBe('modcaseSummaryAck');
    expect(summary).toContain('Reason: Harassment / Abuse');
    expect(summary).toContain('1. removed comment');
  });

  it('uses current text as a keyword assist without changing the deterministic lookup bucket', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    const records = [
      {
        decisionId: 'seed:newer',
        subreddit: 'example',
        targetType: 'comment',
        targetHash: 'h-newer',
        action: 'approved',
        reasonLabel: 'spam_promotional',
        timestamp: now + 1000,
        source: 'demo_seed',
        snippet: 'random insult unrelated',
      },
      {
        decisionId: 'seed:keyword',
        subreddit: 'example',
        targetType: 'comment',
        targetHash: 'h-keyword',
        action: 'removed',
        reasonLabel: 'spam_promotional',
        timestamp: now,
        source: 'demo_seed',
        snippet: 'promo code deal',
      },
    ];

    for (const record of records) strings.set(decisionKey(record.decisionId), JSON.stringify(record));
    sortedSets.set(idxKey('example', 'comment', 'spam_promotional'), records.map((record) => ({ member: record.decisionId, score: record.timestamp })));

    const result = await postJson('/internal/form/reason-picker-submit', {
      lookupTarget: {
        subreddit: 'example',
        targetType: 'comment',
        targetId: 't1_keyword',
        currentSnippet: 'promo code discount',
      },
      reasonLabel: ['spam_promotional'],
    });

    const summary = result.showForm.form.fields[0].defaultValue;
    expect(summary).toContain('Keyword assist: 1 matching example shares promo, code.');
    expect(summary.indexOf('"promo code deal"')).toBeLessThan(summary.indexOf('"random insult unrelated"'));
  });

  it('syncs subreddit rules into controlled reason-label mappings', async () => {
    const result = await postJson('/internal/menu/sync-rules', {
      subredditName: 'r/Example',
    });

    const rules = result.showForm.form.fields[0].defaultValue;
    expect(result.showForm.name).toBe('modcaseSummaryAck');
    expect(rules).toContain('No personal attacks (comment) -> harassment_abuse');
    expect(rules).toContain('Stay on topic (all) -> off_topic');
    expect(JSON.parse(strings.get(ruleMappingKey('example')) ?? '[]')).toEqual([
      { shortName: 'No personal attacks', kind: 'comment', reasonLabel: 'harassment_abuse' },
      { shortName: 'Stay on topic', kind: 'all', reasonLabel: 'off_topic' },
    ]);
  });

  it('shows an audit snapshot of indexed decision buckets', async () => {
    sortedSets.set(idxKey('example', 'comment', 'harassment_abuse'), [
      { member: 'seed:1', score: 1 },
      { member: 'seed:2', score: 2 },
    ]);
    sortedSets.set(idxKey('example', 'post', 'low_effort'), [{ member: 'seed:3', score: 3 }]);

    const result = await postJson('/internal/menu/audit-snapshot', {
      subredditName: 'r/Example',
    });

    const snapshot = result.showForm.form.fields[0].defaultValue;
    expect(result.showForm.name).toBe('modcaseSummaryAck');
    expect(snapshot).toContain('Total indexed decisions: 3');
    expect(snapshot).toContain('comment / harassment_abuse: 2');
    expect(snapshot).toContain('post / low_effort: 1');
  });

  it('shows rule trends and contested-rule aggregate reports', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    const actions = ['removed', 'removed', 'removed', 'approved', 'approved'] as const;
    actions.forEach((action, index) => {
      const id = `trend:${index}`;
      const record = {
        decisionId: id,
        subreddit: 'example',
        targetType: 'comment',
        targetHash: `trend-h-${index}`,
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

    const trendResult = await postJson('/internal/menu/rule-trends', {
      subredditName: 'r/Example',
    });
    const trendReport = trendResult.showForm.form.fields[0].defaultValue;
    expect(trendReport).toContain('comment / Harassment / Abuse: 3 removed, 2 approved, 5 total - leaning removed');

    const contestedResult = await postJson('/internal/menu/contested-rules', {
      subredditName: 'r/Example',
    });
    const contestedReport = contestedResult.showForm.form.fields[0].defaultValue;
    expect(contestedReport).toContain('ModCase contested-rule review');
    expect(contestedReport).toContain('Leaning pattern: 60% removed');
  });

  it('shows rule health, second-review, drift, constitution, and transparency reports', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    const actions = ['removed', 'removed', 'removed', 'approved', 'approved'] as const;
    actions.forEach((action, index) => {
      const id = `community:${index}`;
      const record = {
        decisionId: id,
        subreddit: 'example',
        targetType: 'comment',
        targetHash: `community-h-${index}`,
        action,
        reasonLabel: 'harassment_abuse',
        timestamp: now + index,
        source: 'demo_seed',
        snippet: `community example ${index}`,
      };
      strings.set(decisionKey(id), JSON.stringify(record));
      sortedSets.set(idxKey('example', 'comment', 'harassment_abuse'), [
        ...sortedItems(idxKey('example', 'comment', 'harassment_abuse')),
        { member: id, score: now + index },
      ]);
    });

    const health = await postJson('/internal/menu/rule-health', { subredditName: 'r/Example' });
    expect(health.showForm.form.fields[0].defaultValue).toContain('ModCase rule health');
    expect(health.showForm.form.fields[0].defaultValue).toContain('Leaning: 1');

    const secondReview = await postJson('/internal/menu/second-review', { subredditName: 'r/Example' });
    expect(secondReview.showForm.form.fields[0].defaultValue).toContain('ModCase second-review suggestions');
    expect(secondReview.showForm.form.fields[0].defaultValue).toContain('ask for a second moderator read');

    const drift = await postJson('/internal/menu/rule-drift', { subredditName: 'r/Example' });
    expect(drift.showForm.form.fields[0].defaultValue).toContain('more approvals recently');

    const constitution = await postJson('/internal/menu/community-constitution', { subredditName: 'r/Example' });
    expect(constitution.showForm.form.fields[0].defaultValue).toContain('r/example moderation constitution');
    expect(constitution.showForm.form.fields[0].defaultValue).toContain('currently leans');

    const transparency = await postJson('/internal/menu/transparency-report', { subredditName: 'r/Example' });
    expect(transparency.showForm.form.fields[0].defaultValue).toContain('moderation transparency summary');
    expect(transparency.showForm.form.fields[0].defaultValue).toContain('This summary is aggregate-only');
  });

  it('remaps recent unknown-reason records into a controlled bucket', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    for (let i = 0; i < 2; i += 1) {
      const id = `unknown:${i}`;
      const record = {
        decisionId: id,
        subreddit: 'example',
        targetType: 'post',
        targetHash: `unknown-h-${i}`,
        action: 'approved',
        reasonLabel: 'unknown_reason',
        timestamp: now + i,
        source: 'demo_seed',
      };
      strings.set(decisionKey(id), JSON.stringify(record));
      sortedSets.set(idxKey('example', 'post', 'unknown_reason'), [
        ...sortedItems(idxKey('example', 'post', 'unknown_reason')),
        { member: id, score: now + i },
      ]);
    }

    const open = await postJson('/internal/menu/unknown-cleanup', { subredditName: 'r/Example' });
    expect(open.showForm.name).toBe('modcaseUnknownCleanupForm');

    const result = await postJson('/internal/form/unknown-cleanup-submit', {
      targetType: ['post::modcasectx::example'],
      reasonLabel: ['off_topic'],
    });

    expect(result.showToast).toBe('ModCase remapped 2 post records to Off Topic.');
    expect(sortedItems(idxKey('example', 'post', 'unknown_reason'))).toHaveLength(0);
    expect(sortedItems(idxKey('example', 'post', 'off_topic'))).toHaveLength(2);
    expect(JSON.parse(strings.get(decisionKey('unknown:0')) ?? '{}')).toMatchObject({
      reasonLabel: 'off_topic',
      remappedFromReason: 'unknown_reason',
    });
  });

  it('runs training mode against a precedent example without storing moderator scores', async () => {
    const id = 'training:1';
    strings.set(
      decisionKey(id),
      JSON.stringify({
        decisionId: id,
        subreddit: 'example',
        targetType: 'comment',
        targetHash: 'training-h',
        action: 'removed',
        reasonLabel: 'harassment_abuse',
        timestamp: Date.parse('2026-05-24T12:00:00.000Z'),
        source: 'demo_seed',
        snippet: 'personal attack',
      }),
    );
    sortedSets.set(idxKey('example', 'comment', 'harassment_abuse'), [{ member: id, score: Date.parse('2026-05-24T12:00:00.000Z') }]);

    const open = await postJson('/internal/menu/training', { subredditName: 'r/Example' });
    expect(open.showForm.name).toBe('modcaseTrainingForm');
    expect(open.showForm.form.description).toContain('personal attack');
    const encodedAnswer = open.showForm.form.fields[0].defaultValue[0];
    const token = String(encodedAnswer).split('::modcasectx::')[1];
    expect(JSON.parse(strings.get(trainingContextKey(token)) ?? '{}')).toMatchObject({ decisionId: id, subreddit: 'example' });

    const result = await postJson('/internal/form/training-submit', {
      decisionAction: [encodedAnswer],
    });

    expect(result.showForm.form.fields[0].defaultValue).toContain('Correct.');
    expect(result.showForm.form.fields[0].defaultValue).toContain('Team action: removed');
  });

  it('shows a copyable privacy-conscious export report', async () => {
    strings.set(
      ruleMappingKey('example'),
      JSON.stringify([{ shortName: 'No personal attacks', kind: 'comment', reasonLabel: 'harassment_abuse' }]),
    );
    const id = 'export:1';
    strings.set(
      decisionKey(id),
      JSON.stringify({
        decisionId: id,
        subreddit: 'example',
        targetType: 'comment',
        targetHash: 'export-h',
        action: 'removed',
        reasonLabel: 'harassment_abuse',
        timestamp: Date.parse('2026-05-24T12:00:00.000Z'),
        source: 'demo_seed',
        snippet: 'private snippet should not be included',
      }),
    );
    sortedSets.set(idxKey('example', 'comment', 'harassment_abuse'), [{ member: id, score: Date.parse('2026-05-24T12:00:00.000Z') }]);

    const result = await postJson('/internal/menu/export-report', {
      subredditName: 'r/Example',
    });

    const report = result.showForm.form.fields[0].defaultValue;
    expect(report).toContain('ModCase aggregate export');
    expect(report).toContain('No personal attacks (comment) -> Harassment / Abuse');
    expect(report).toContain('comment / Harassment / Abuse: 1 removed, 0 approved, 1 total');
    expect(report).not.toContain('private snippet should not be included');
  });

  it('seeds demo records from the subreddit menu', async () => {
    const result = await postJson('/internal/menu/seed-demo', {
      subredditName: 'r/Example',
    });

    expect(result.showToast).toBe('Seeded 12 ModCase demo decisions for r/example.');
    expect(sortedItems(idxKey('example', 'comment', 'harassment_abuse'))).toHaveLength(8);
    expect(sortedItems(idxKey('example', 'post', 'low_effort'))).toHaveLength(2);
  });

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

    const trends = await postJson('/internal/form/insights-submit', { report: ['rule-trends::modcasectx::example'] });
    expect(trends.showForm.form.fields[0].defaultValue).toContain('ModCase rule trends');

    const contested = await postJson('/internal/form/insights-submit', { report: ['contested-rules::modcasectx::example'] });
    expect(contested.showForm.form.fields[0].defaultValue).toContain('ModCase contested-rule review');

    const secondReview = await postJson('/internal/form/insights-submit', { report: ['second-review::modcasectx::example'] });
    expect(secondReview.showForm.form.fields[0].defaultValue).toContain('ModCase second-review suggestions');

    const drift = await postJson('/internal/form/insights-submit', { report: ['rule-drift::modcasectx::example'] });
    expect(drift.showForm.form.fields[0].defaultValue).toContain('ModCase rule drift');

    const constitution = await postJson('/internal/form/insights-submit', { report: ['community-constitution::modcasectx::example'] });
    expect(constitution.showForm.form.fields[0].defaultValue).toContain('moderation constitution');

    const transparency = await postJson('/internal/form/insights-submit', { report: ['transparency::modcasectx::example'] });
    expect(transparency.showForm.form.fields[0].defaultValue).toContain('moderation transparency summary');

    const unknown = await postJson('/internal/form/insights-submit', { report: ['bogus::modcasectx::example'] });
    expect(unknown.showToast).toContain('ModCase could not identify that report');
  });

  it('reports against-precedent decisions in the consistency digest', async () => {
    const now = Date.parse('2026-05-24T12:00:00.000Z');
    const actions = ['removed', 'removed', 'removed', 'removed', 'removed', 'approved'] as const;
    actions.forEach((action, index) => {
      const id = `divergence:${index}`;
      const record = {
        decisionId: id,
        subreddit: 'example',
        targetType: 'comment',
        targetHash: `divergence-h-${index}`,
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
    expect(JSON.stringify(open.showForm.form.fields[0].options)).toContain('consistency');

    const digest = await postJson('/internal/form/insights-submit', { report: ['consistency::modcasectx::example'] });
    expect(digest.showForm.name).toBe('modcaseSummaryAck');
    expect(digest.showForm.form.fields[0].defaultValue).toContain('ModCase consistency digest');
    expect(digest.showForm.form.fields[0].defaultValue).toContain('comment / Harassment / Abuse: 1 against-precedent of 6');
  });

  it('surfaces one demo divergence in the consistency digest', async () => {
    await postJson('/internal/menu/seed-demo', { subredditName: 'r/Example' });
    const digest = await postJson('/internal/form/insights-submit', { report: ['consistency::modcasectx::example'] });
    expect(digest.showForm.form.fields[0].defaultValue).toContain('comment / Harassment / Abuse: 1 against-precedent of 8');
  });
});
