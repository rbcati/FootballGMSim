import { describe, expect, it } from 'vitest';
import { evaluatePlayerMarketRealism, adjustTradeValueForMarketRealism } from '../marketRealismModel.js';

const team = (overrides = {}) => ({ id: 1, capRoom: 50, capTotal: 255, ...overrides });
const strategy = (archetype = 'middle', priority = 55) => ({
  archetype,
  positionalNeeds: [{ positionGroup: 'QB', priority }, { positionGroup: 'DL_EDGE', priority }, { positionGroup: 'RB', priority }],
});

describe('Trade + Free Agency Market Realism V2 model', () => {
  it('gives elite young QB/premium players high market demand', () => {
    const out = evaluatePlayerMarketRealism({
      player: { pos: 'QB', ovr: 90, potential: 95, age: 24 },
      team: team({ capRoom: 120 }),
      strategy: strategy('retool', 80),
      positionalNeed: 1.8,
      proposedAnnual: 45,
    });

    expect(out.marketDemandScore).toBeGreaterThanOrEqual(70);
    expect(out.positionalPremium).toBe(100);
    expect(out.reasons).toContain('premium position tax');
    expect(out.shouldPursue).toBe(true);
  });

  it('keeps aging running backs as low or short-term demand assets', () => {
    const out = evaluatePlayerMarketRealism({
      player: { pos: 'RB', ovr: 82, potential: 82, age: 31 },
      team: team({ capRoom: 45 }),
      strategy: strategy('middle', 35),
      positionalNeed: 1.1,
      proposedAnnual: 8,
    });

    expect(out.marketDemandScore).toBeLessThan(55);
    expect(out.ageRisk).toBeGreaterThanOrEqual(70);
    expect(out.flags).toContain('age_risk');
  });

  it('flags old expensive veterans with high cap and age risk', () => {
    const out = evaluatePlayerMarketRealism({
      player: { pos: 'WR', ovr: 86, potential: 86, age: 33 },
      team: team({ capRoom: 18 }),
      strategy: strategy('rebuild', 60),
      positionalNeed: 1.5,
      proposedAnnual: 18,
    });

    expect(out.capRisk).toBeGreaterThanOrEqual(70);
    expect(out.ageRisk).toBeGreaterThanOrEqual(45);
    expect(out.shouldAvoid).toBe(true);
    expect(out.reasons).toContain('rebuild avoids old expensive veteran');
  });

  it('treats young high-potential premium players as strong rebuild/retool fits', () => {
    const out = evaluatePlayerMarketRealism({
      player: { pos: 'CB', ovr: 76, potential: 88, age: 23 },
      team: team({ capRoom: 38 }),
      strategy: strategy('rebuild', 72),
      positionalNeed: 1.7,
      proposedAnnual: 9,
    });

    expect(out.teamFitTier).toMatch(/strong|good/);
    expect(out.flags).toContain('rebuild_fit');
    expect(out.shouldPursue).toBe(true);
  });

  it('scores low OVR depth players with low market demand', () => {
    const out = evaluatePlayerMarketRealism({
      player: { pos: 'LB', ovr: 61, potential: 63, age: 27 },
      team: team(),
      strategy: strategy('middle', 20),
      positionalNeed: 1.05,
      proposedAnnual: 1.2,
    });

    expect(out.marketDemandScore).toBeLessThan(35);
    expect(out.shouldPursue).toBe(false);
  });

  it('lowers fit score for cap-stressed teams chasing expensive players', () => {
    const player = { pos: 'DE', ovr: 84, potential: 86, age: 27 };
    const healthy = evaluatePlayerMarketRealism({ player, team: team({ capRoom: 70 }), strategy: strategy('middle', 65), positionalNeed: 1.5, proposedAnnual: 16 });
    const stressed = evaluatePlayerMarketRealism({ player, team: team({ capRoom: 12 }), strategy: strategy('middle', 65), positionalNeed: 1.5, proposedAnnual: 16 });

    expect(stressed.fitScore).toBeLessThan(healthy.fitScore);
    expect(stressed.capRisk).toBeGreaterThan(healthy.capRisk);
  });

  it('distinguishes contender veteran fit from rebuild veteran fit', () => {
    const player = { pos: 'CB', ovr: 84, potential: 84, age: 32 };
    const contender = evaluatePlayerMarketRealism({ player, team: team({ capRoom: 32 }), strategy: strategy('contender', 82), positionalNeed: 1.8, proposedAnnual: 11 });
    const rebuild = evaluatePlayerMarketRealism({ player, team: team({ capRoom: 32 }), strategy: strategy('rebuild', 82), positionalNeed: 1.8, proposedAnnual: 11 });

    expect(contender.shouldPursue).toBe(true);
    expect(contender.reasons).toContain('contender rental');
    expect(rebuild.shouldAvoid).toBe(true);
    expect(rebuild.fitScore).toBeLessThan(contender.fitScore);
  });

  it('adds a premium tax so young premium players are not undervalued in trades', () => {
    const base = 120;
    const qb = adjustTradeValueForMarketRealism({ pos: 'QB', ovr: 78, potential: 90, age: 23, contract: { baseAnnual: 5 } }, base);
    const rb = adjustTradeValueForMarketRealism({ pos: 'RB', ovr: 78, potential: 90, age: 29, contract: { baseAnnual: 5 } }, base);

    expect(qb).toBeGreaterThan(base + 40);
    expect(rb).toBeLessThan(base);
  });
});
