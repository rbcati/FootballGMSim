import { describe, it, expect } from 'vitest';
import { buildFreeAgencyProfileContext, buildTradeFinderProfileContext, buildDraftProfileContext } from './playerProfileContext.js';

describe('playerProfileContext helpers', () => {
  it('builds free agency context safely', () => {
    const ctx = buildFreeAgencyProfileContext({ fitScore: 82, recommendation: 'Starter upgrade candidate', riskFlags: ['age_decline'] });
    expect(ctx.source).toBe('free_agency');
    expect(ctx.action).toBe('sign_candidate');
    expect(ctx.fitScore).toBe(82);
  });

  it('builds trade finder context with warning-safe recommendation', () => {
    const ctx = buildTradeFinderProfileContext({ recommendation: 'Explore offer' }, 'target');
    expect(ctx.source).toBe('trade_finder');
    expect(ctx.recommendation).toContain('not guaranteed');
  });

  it('builds draft context', () => {
    const ctx = buildDraftProfileContext({ fitScore: 77, currentTeamNeedLevel: 'urgent' });
    expect(ctx.source).toBe('draft_board');
    expect(ctx.action).toBe('draft_fit');
  });

  it('returns partial context without fake fields', () => {
    const ctx = buildDraftProfileContext({});
    expect(ctx.source).toBe('draft_board');
    expect(ctx.fitScore).toBeUndefined();
  });
});
