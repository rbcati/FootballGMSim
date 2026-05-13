import { describe, it, expect } from 'vitest';
import { evaluateResignRecommendation } from './contractInsights.js';
import { buildContractOfferInsight } from './contractOfferInsights.js';

describe('contract insights prioritization', () => {
  it('marks elite expensive non-contender as trade/tag candidate', () => {
    const rec = evaluateResignRecommendation(
      { pos: 'WR', ovr: 88, potential: 90, age: 28, morale: 72, schemeFit: 81, contract: { baseAnnual: 16 }, extensionAsk: { baseAnnual: 24 } },
      { team: { capRoom: 20 }, direction: 'rebuilding', roster: [{ pos: 'WR' }, { pos: 'WR' }] },
    );
    expect(rec.tier).toBe('trade_or_tag');
  });

  it('marks core player as must keep', () => {
    const rec = evaluateResignRecommendation(
      { pos: 'QB', ovr: 91, potential: 93, age: 25, morale: 80, schemeFit: 85, contract: { baseAnnual: 12 }, extensionAsk: { baseAnnual: 13 } },
      { team: { capRoom: 35 }, direction: 'contender', roster: [{ pos: 'QB' }] },
    );
    expect(rec.tier).toBe('priority_resign');
  });
});


describe('contract offer insight adapter', () => {
  it('displays elite QB as premium / elite starter', () => {
    const insight = buildContractOfferInsight({ pos: 'QB', age: 26, ovr: 90, potential: 94 }, { capRoom: 80 });
    expect(insight.marketTierLabel).toBe('Elite starter');
    expect(insight.riskTags).toContain('Premium position cost');
  });

  it('displays aging RB as short-term risk', () => {
    const insight = buildContractOfferInsight({ pos: 'RB', age: 31, ovr: 78, potential: 78 }, { capRoom: 35 });
    expect(insight.marketTierLabel).toBe('Aging veteran');
    expect(insight.termLabel).toContain('short-term');
    expect(insight.riskTags).toContain('Short-term RB risk');
  });

  it('displays young high-potential player as upside', () => {
    const insight = buildContractOfferInsight({ pos: 'WR', age: 23, ovr: 68, potential: 80 }, { capRoom: 45 });
    expect(insight.marketTierLabel).toBe('Prospect upside');
    expect(insight.reasonBullets.join(' ')).toMatch(/upside|POT/i);
  });

  it('displays low OVR depth player as replacement/depth', () => {
    const insight = buildContractOfferInsight({ pos: 'LB', age: 26, ovr: 59, potential: 61 }, { capRoom: 20 });
    expect(insight.marketTierLabel).toBe('Replacement level');
  });

  it('handles missing/legacy metadata safely and keeps cap fit labels stable', () => {
    const insight = buildContractOfferInsight({}, { capRoom: 0 }, { contract: { baseAnnual: 2, yearsTotal: 1 } });
    expect(insight.marketTierLabel).toBeTruthy();
    expect(['Good cap fit', 'Manageable cap fit', 'Tight cap fit', 'Risky cap fit', 'Over cap']).toContain(insight.capFitLabel);
  });

  it('uses saved contractModel metadata when present', () => {
    const insight = buildContractOfferInsight(
      { pos: 'QB', offers: { topOfferContractModel: { marketTier: 'elite starter', capFit: 'risky', riskTags: ['large cap share'], reasons: ['CPU offer context.'], suggestedAnnual: 32, suggestedYears: 5 } } },
      { capRoom: 50 },
    );
    expect(insight.hasMetadata).toBe(true);
    expect(insight.capFitLabel).toBe('Risky cap fit');
    expect(insight.annualValueLabel).toBe('$32.0M/yr');
  });
});
