import { describe, expect, it } from 'vitest';
import { buildContractFromMarket, evaluateContractMarket } from '../contractModel.js';

const ctx = (overrides = {}) => ({
  teamArchetype: 'middle',
  capHealth: 65,
  teamCapRoom: 60,
  positionalNeed: 1.2,
  ...overrides,
});

describe('Contract/Cap Realism V1 contract model', () => {
  it('prices an elite QB as a premium longer-term contract', () => {
    const out = evaluateContractMarket({ pos: 'QB', ovr: 92, potential: 94, age: 27 }, ctx({ teamArchetype: 'contender', positionalNeed: 1.6, teamCapRoom: 120, capHealth: 80 }));
    expect(out.marketTier).toBe('elite starter');
    expect(out.premiumPosition).toBe(true);
    expect(out.suggestedAnnual).toBeGreaterThan(45);
    expect(out.suggestedYears).toBeGreaterThanOrEqual(5);
    expect(out.shouldPursue).toBe(true);
  });

  it('keeps an older RB short and cheaper with decline risk', () => {
    const out = evaluateContractMarket({ pos: 'RB', ovr: 82, potential: 82, age: 31 }, ctx({ positionalNeed: 1.4 }));
    expect(out.marketTier).toBe('aging veteran');
    expect(out.suggestedYears).toBe(1);
    expect(out.suggestedAnnual).toBeLessThan(8);
    expect(out.riskTags).toContain('aging RB decline risk');
  });

  it('flags old expensive non-QB veterans as risky for rebuilds', () => {
    const out = evaluateContractMarket({ pos: 'WR', ovr: 88, potential: 88, age: 32 }, ctx({ teamArchetype: 'rebuild', positionalNeed: 1.5, teamCapRoom: 35, capHealth: 45 }));
    expect(out.riskTags).toContain('age/decline risk');
    expect(out.shouldAvoid).toBe(true);
  });

  it('gives young high-potential players upside value and modest term', () => {
    const out = evaluateContractMarket({ pos: 'CB', ovr: 75, potential: 86, age: 23 }, ctx({ teamArchetype: 'development', positionalNeed: 1.5 }));
    expect(['bridge starter', 'prospect upside']).toContain(out.marketTier);
    expect(out.suggestedYears).toBeGreaterThanOrEqual(2);
    expect(out.reasons.join(' ')).toMatch(/upside/i);
  });

  it('keeps low OVR depth players on low short offers', () => {
    const out = evaluateContractMarket({ pos: 'LB', ovr: 60, potential: 62, age: 27 }, ctx());
    expect(out.marketTier).toBe('replacement level');
    expect(out.suggestedYears).toBe(1);
    expect(out.suggestedAnnual).toBeLessThanOrEqual(1.5);
  });

  it('values premium positions above low-premium positions at similar OVR', () => {
    const edge = evaluateContractMarket({ pos: 'DE', ovr: 80, potential: 82, age: 26 }, ctx());
    const safety = evaluateContractMarket({ pos: 'S', ovr: 80, potential: 82, age: 26 }, ctx());
    expect(edge.suggestedAnnual).toBeGreaterThan(safety.suggestedAnnual);
    expect(edge.premiumPosition).toBe(true);
    expect(safety.lowPremiumPosition).toBe(true);
  });

  it('cap-stressed context lowers safe cap fit', () => {
    const stressed = evaluateContractMarket({ pos: 'WR', ovr: 84, potential: 85, age: 27 }, ctx({ teamCapRoom: 12, capHealth: 20, positionalNeed: 1.1 }));
    const healthy = evaluateContractMarket({ pos: 'WR', ovr: 84, potential: 85, age: 27 }, ctx({ teamCapRoom: 60, capHealth: 80, positionalNeed: 1.1 }));
    expect(stressed.suggestedAnnual).toBeLessThan(healthy.suggestedAnnual);
    expect(stressed.exceedsSafeCapBand).toBe(true);
    expect(stressed.shouldAvoid).toBe(true);
  });

  it('lets contenders tolerate more short-term spend than rebuilds', () => {
    const player = { pos: 'CB', ovr: 86, potential: 86, age: 32 };
    const contender = evaluateContractMarket(player, ctx({ teamArchetype: 'contender', teamCapRoom: 25, capHealth: 55, positionalNeed: 1.8 }));
    const rebuild = evaluateContractMarket(player, ctx({ teamArchetype: 'rebuild', teamCapRoom: 25, capHealth: 55, positionalNeed: 1.8 }));
    expect(contender.shouldPursue).toBe(true);
    expect(rebuild.shouldAvoid).toBe(true);
    expect(contender.suggestedAnnual).toBeGreaterThan(rebuild.suggestedAnnual);
  });

  it('builds a compatible flat contract shape from the model output', () => {
    const market = evaluateContractMarket({ pos: 'TE', ovr: 74, potential: 78, age: 25 }, ctx());
    const contract = buildContractFromMarket(market, { startYear: 2030 });
    expect(contract).toMatchObject({ years: market.suggestedYears, yearsTotal: market.suggestedYears, startYear: 2030 });
    expect(contract.baseAnnual).toBe(market.suggestedAnnual);
  });
});
