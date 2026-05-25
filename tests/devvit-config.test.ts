import { describe, expect, it } from 'vitest';
import devvitConfig from '../devvit.json';

describe('devvit.json', () => {
  it('uses the registered app slug', () => {
    expect(devvitConfig.name).toBe('modcase-v1');
  });

  it('points Devvit at the built server bundle', () => {
    expect(devvitConfig.server).toEqual({
      dir: 'dist/server',
      entry: 'index.cjs',
    });
  });

  it('keeps moderator-facing actions locked to moderators', () => {
    expect(devvitConfig.menu.items).toHaveLength(12);
    for (const item of devvitConfig.menu.items) {
      expect(item.forUserType).toBe('moderator');
      expect(item.endpoint).toMatch(/^\/internal\//);
    }
  });

  it('registers form endpoints used by menu flows', () => {
    expect(devvitConfig.forms).toMatchObject({
      modcaseReasonPicker: '/internal/form/reason-picker-submit',
      modcaseManualCorrectionForm: '/internal/form/manual-correction-submit',
      modcaseSettingsForm: '/internal/form/settings-submit',
      modcaseUnknownCleanupForm: '/internal/form/unknown-cleanup-submit',
      modcaseTrainingForm: '/internal/form/training-submit',
      modcaseInsightsPicker: '/internal/form/insights-submit',
      modcaseCompareForm: '/internal/form/compare-submit',
      modcaseSummaryAck: '/internal/form/summary-ack',
    });
  });

  it('registers storage and Reddit runtime permissions', () => {
    expect(devvitConfig.permissions).toMatchObject({
      reddit: true,
      redis: true,
    });
  });

  it('keeps the mod action trigger route stable', () => {
    expect(devvitConfig.triggers.onModAction).toBe('/internal/triggers/on-mod-action');
  });
});
