/**
 * negotiationModifiers.test.js — Contract Negotiation Depth V2
 *
 * Tests for pure modifier functions: computePlayerLeverage,
 * computeFranchiseReputation, applyNegotiationModifiers, getNegotiationContext.
 */

import { describe, it, expect } from 'vitest';
import {
  LEVERAGE_MODIFIERS,
  computePlayerLeverage,
  computeFranchiseReputation,
  applyNegotiationModifiers,
  getNegotiationContext,
} from '../contracts/negotiationModifiers.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'QB',
    ovr: 80,
    age: 28,
    morale: 70,
    moraleEvents: [],
    awards: [],
    ...overrides,
  };
}

function makeMeta(overrides = {}) {
  return {
    season: 2025,
    userTeamId: 1,
    franchiseAwards: [],
    franchiseHistoryByTeam: {},
    ...overrides,
  };
}

function makeMoraleSummary(score = 70) {
  let label = 'Settled';
  if (score >= 85) label = 'Thriving';
  else if (score >= 70) label = 'Settled';
  else if (score >= 55) label = 'Neutral';
  else if (score >= 40) label = 'Frustrated';
  else label = 'Disgruntled';
  return { score, label, topEvent: null, isLow: score < 40, isAlert: score < 35 };
}

function makeAwardSummary(overrides = {}) {
  return { totalAwards: 0, mvpCount: 0, allProCount: 0, championshipCount: 0, highlights: [], summaryLine: null, ...overrides };
}

// ── computePlayerLeverage ─────────────────────────────────────────────────────

describe('computePlayerLeverage', () => {
  it('MVP winner in last 2 seasons applies +15% premium', () => {
    const player = makePlayer({
      awards: [{ type: 'MVP', season: 2024, dedupeKey: 'MVP_2024' }],
    });
    const context = { moraleSummary: makeMoraleSummary(70), awardSummary: makeAwardSummary({ mvpCount: 1 }), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.MVP_RECENT);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons[0]).toMatch(/MVP/i);
  });

  it('MVP 3 seasons ago does NOT apply recent MVP premium', () => {
    const player = makePlayer({
      awards: [{ type: 'MVP', season: 2021, dedupeKey: 'MVP_2021' }],
    });
    const context = { moraleSummary: makeMoraleSummary(70), awardSummary: makeAwardSummary({ mvpCount: 1 }), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    // No MVP_RECENT premium; only possibly LEAGUE_CHAMPION_HISTORY from past champ (not here)
    const expectedShift = 0;
    expect(result.multiplier).toBeCloseTo(1 + expectedShift);
  });

  it('2+ All-Pro selections apply +10% premium', () => {
    const player = makePlayer({ awards: [] });
    const context = { moraleSummary: makeMoraleSummary(70), awardSummary: makeAwardSummary({ allProCount: 3 }), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.ALL_PRO_MULTIPLE);
    expect(result.reasons.some((r) => /All-Pro/i.test(r))).toBe(true);
  });

  it('1 All-Pro selection does NOT trigger the 2+ premium', () => {
    const player = makePlayer({ awards: [] });
    const context = { moraleSummary: makeMoraleSummary(70), awardSummary: makeAwardSummary({ allProCount: 1 }), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBe(1);
    expect(result.reasons.length).toBe(0);
  });

  it('League champion (any season) applies +8% premium', () => {
    const player = makePlayer({
      awards: [{ type: 'LEAGUE_CHAMPION', season: 2020, dedupeKey: 'LEAGUE_CHAMPION_2020' }],
    });
    const context = { moraleSummary: makeMoraleSummary(70), awardSummary: makeAwardSummary({ championshipCount: 1 }), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.LEAGUE_CHAMPION_HISTORY);
    expect(result.reasons.some((r) => /[Cc]hampionship/i.test(r))).toBe(true);
  });

  it('Disgruntled morale (< 40) applies -10% discount', () => {
    const player = makePlayer({ morale: 30 });
    const context = { moraleSummary: makeMoraleSummary(30), awardSummary: makeAwardSummary(), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.MORALE_DISGRUNTLED);
    expect(result.reasons.some((r) => /frustrated|discounte/i.test(r))).toBe(true);
  });

  it('Frustrated morale (40–54) applies -5% discount', () => {
    const player = makePlayer({ morale: 48 });
    const context = { moraleSummary: makeMoraleSummary(48), awardSummary: makeAwardSummary(), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.MORALE_FRUSTRATED);
  });

  it('Thriving morale (85–100) applies +5% premium', () => {
    const player = makePlayer({ morale: 90 });
    const context = { moraleSummary: makeMoraleSummary(90), awardSummary: makeAwardSummary(), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.MORALE_THRIVING);
    expect(result.reasons.some((r) => /thriving/i.test(r))).toBe(true);
  });

  it('Settled morale (70–84) applies no morale modifier', () => {
    const player = makePlayer({ morale: 75 });
    const context = { moraleSummary: makeMoraleSummary(75), awardSummary: makeAwardSummary(), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBe(1);
    expect(result.reasons.length).toBe(0);
  });

  it('Neutral morale (55–69) applies no morale modifier', () => {
    const player = makePlayer({ morale: 62 });
    const context = { moraleSummary: makeMoraleSummary(62), awardSummary: makeAwardSummary(), currentSeason: 2025 };
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBe(1);
    expect(result.reasons.length).toBe(0);
  });

  it('Player with no awards/morale fields returns zero modifier, no crash', () => {
    const player = { id: 99, name: 'Ghost', pos: 'QB', ovr: 70 };
    const context = {};
    const result = computePlayerLeverage(player, context);
    expect(result.multiplier).toBe(1);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.reasons.length).toBe(0);
  });

  it('Old save (empty awards, no morale) returns zero modifier safely', () => {
    const player = { id: 5, name: 'Legacy', pos: 'RB', ovr: 78, awards: undefined, morale: undefined };
    const result = computePlayerLeverage(player, {});
    expect(result.multiplier).toBe(1);
    expect(result.reasons.length).toBe(0);
  });

  it('Modifiers stack correctly: MVP + All-Pro stacks without capping', () => {
    const player = makePlayer({
      awards: [{ type: 'MVP', season: 2024, dedupeKey: 'MVP_2024' }],
    });
    const context = {
      moraleSummary: makeMoraleSummary(70),
      awardSummary: makeAwardSummary({ allProCount: 2 }),
      currentSeason: 2025,
    };
    const result = computePlayerLeverage(player, context);
    // MVP (+0.15) + All-Pro (+0.10) = +0.25
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.MVP_RECENT + LEVERAGE_MODIFIERS.ALL_PRO_MULTIPLE);
  });

  it('is fully deterministic (same inputs → same output)', () => {
    const player = makePlayer({ morale: 38, awards: [{ type: 'MVP', season: 2024, dedupeKey: 'MVP_2024' }] });
    const context = { moraleSummary: makeMoraleSummary(38), awardSummary: makeAwardSummary({ mvpCount: 1 }), currentSeason: 2025 };
    const r1 = computePlayerLeverage(player, context);
    const r2 = computePlayerLeverage(player, context);
    expect(r1.multiplier).toBe(r2.multiplier);
    expect(r1.reasons).toEqual(r2.reasons);
  });
});

// ── computeFranchiseReputation ────────────────────────────────────────────────

describe('computeFranchiseReputation', () => {
  it('2+ championships in franchise history reduces demand by 5%', () => {
    const meta = makeMeta({
      franchiseAwards: [
        { type: 'LEAGUE_CHAMPION', season: 2022, teamId: 1 },
        { type: 'LEAGUE_CHAMPION', season: 2023, teamId: 1 },
      ],
    });
    const result = computeFranchiseReputation(meta, { userTeamId: 1, currentSeason: 2025 });
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.FRANCHISE_CHAMPION);
    expect(result.reasons.some((r) => /championship/i.test(r))).toBe(true);
  });

  it('1 championship does NOT trigger franchise champion discount', () => {
    const meta = makeMeta({
      franchiseAwards: [{ type: 'LEAGUE_CHAMPION', season: 2023, teamId: 1 }],
    });
    const result = computeFranchiseReputation(meta, { userTeamId: 1, currentSeason: 2025 });
    expect(result.multiplier).toBe(1);
  });

  it('0 playoff appearances in 3+ seasons increases demand by 8%', () => {
    const meta = makeMeta({
      franchiseHistoryByTeam: {
        '1': {
          teamId: 1,
          seasons: [
            { year: 2022, wins: 5, losses: 11, madePlayoffs: false },
            { year: 2023, wins: 6, losses: 11, madePlayoffs: false },
            { year: 2024, wins: 7, losses: 10, madePlayoffs: false },
          ],
        },
      },
    });
    const result = computeFranchiseReputation(meta, { userTeamId: 1, currentSeason: 2025 });
    expect(result.multiplier).toBeCloseTo(1 + LEVERAGE_MODIFIERS.FRANCHISE_DROUGHT);
    expect(result.reasons.some((r) => /drought/i.test(r))).toBe(true);
  });

  it('Only 2 seasons of drought (need 3) does NOT trigger drought modifier', () => {
    const meta = makeMeta({
      franchiseHistoryByTeam: {
        '1': {
          teamId: 1,
          seasons: [
            { year: 2023, wins: 5, losses: 12, madePlayoffs: false },
            { year: 2024, wins: 6, losses: 11, madePlayoffs: false },
          ],
        },
      },
    });
    const result = computeFranchiseReputation(meta, { userTeamId: 1, currentSeason: 2025 });
    expect(result.multiplier).toBe(1);
  });

  it('Playoff appearance in last 3 seasons breaks the drought', () => {
    const meta = makeMeta({
      franchiseHistoryByTeam: {
        '1': {
          teamId: 1,
          seasons: [
            { year: 2022, wins: 5, losses: 12, madePlayoffs: false },
            { year: 2023, wins: 11, losses: 6, madePlayoffs: true },
            { year: 2024, wins: 7, losses: 10, madePlayoffs: false },
          ],
        },
      },
    });
    const result = computeFranchiseReputation(meta, { userTeamId: 1, currentSeason: 2025 });
    expect(result.multiplier).toBe(1);
  });

  it('No userTeamId returns no modifier', () => {
    const meta = makeMeta({ franchiseAwards: [{ type: 'LEAGUE_CHAMPION', season: 2024, teamId: 1 }] });
    const result = computeFranchiseReputation(meta, {});
    expect(result.multiplier).toBe(1);
    expect(result.reasons.length).toBe(0);
  });

  it('Missing meta fields (old save) returns zero modifier safely', () => {
    const result = computeFranchiseReputation({}, { userTeamId: 1, currentSeason: 2025 });
    expect(result.multiplier).toBe(1);
    expect(result.reasons.length).toBe(0);
  });
});

// ── applyNegotiationModifiers ─────────────────────────────────────────────────

describe('applyNegotiationModifiers', () => {
  it('applies positive multipliers to baseAnnual', () => {
    const demand = { baseAnnual: 10, yearsTotal: 3, signingBonus: 1 };
    const playerLev = { multiplier: 1.15 };
    const franchiseRep = { multiplier: 1 };
    const result = applyNegotiationModifiers(demand, playerLev, franchiseRep);
    expect(result.baseAnnual).toBeCloseTo(10 * 1.15, 1);
  });

  it('applies negative multipliers to baseAnnual', () => {
    const demand = { baseAnnual: 10, yearsTotal: 3, signingBonus: 1 };
    const playerLev = { multiplier: 0.9 }; // -10% disgruntled
    const franchiseRep = { multiplier: 1 };
    const result = applyNegotiationModifiers(demand, playerLev, franchiseRep);
    expect(result.baseAnnual).toBeCloseTo(10 * 0.9, 1);
  });

  it('cap prevents shift exceeding +25%', () => {
    const demand = { baseAnnual: 10 };
    // MVP (+0.15) + All-Pro (+0.10) + Champion (+0.08) + Thriving (+0.05) = +0.38 → capped at +0.25
    const playerLev = { multiplier: 1.38 };
    const franchiseRep = { multiplier: 1 };
    const result = applyNegotiationModifiers(demand, playerLev, franchiseRep);
    expect(result.baseAnnual).toBeCloseTo(10 * 1.25, 1);
    expect(result._negotiationShift).toBeCloseTo(0.25, 3);
  });

  it('cap prevents shift exceeding -25%', () => {
    const demand = { baseAnnual: 10 };
    const playerLev = { multiplier: 0.6 }; // -40% — capped at -25%
    const franchiseRep = { multiplier: 1 };
    const result = applyNegotiationModifiers(demand, playerLev, franchiseRep);
    expect(result.baseAnnual).toBeCloseTo(10 * 0.75, 1);
    expect(result._negotiationShift).toBeCloseTo(-0.25, 3);
  });

  it('stacks player and franchise shifts before capping', () => {
    const demand = { baseAnnual: 20 };
    const playerLev = { multiplier: 1.15 };     // +0.15
    const franchiseRep = { multiplier: 1.08 };   // +0.08 drought — combined = +0.23
    const result = applyNegotiationModifiers(demand, playerLev, franchiseRep);
    expect(result.baseAnnual).toBeCloseTo(20 * (1 + 0.23), 1);
  });

  it('preserves yearsTotal, signingBonus, and other fields unchanged', () => {
    const demand = { baseAnnual: 10, yearsTotal: 4, signingBonus: 2, guaranteedPct: 0.5 };
    const result = applyNegotiationModifiers(demand, { multiplier: 1.1 }, { multiplier: 1 });
    expect(result.yearsTotal).toBe(4);
    expect(result.signingBonus).toBe(2);
    expect(result.guaranteedPct).toBe(0.5);
  });

  it('zero baseAnnual stays zero', () => {
    const demand = { baseAnnual: 0 };
    const result = applyNegotiationModifiers(demand, { multiplier: 1.2 }, { multiplier: 1 });
    expect(result.baseAnnual).toBe(0);
  });

  it('null leverage inputs apply no modifier', () => {
    const demand = { baseAnnual: 10 };
    const result = applyNegotiationModifiers(demand, null, null);
    expect(result.baseAnnual).toBe(10);
  });
});

// ── getNegotiationContext ─────────────────────────────────────────────────────

describe('getNegotiationContext', () => {
  it('returns "High Leverage" label for positive modifiers', () => {
    const player = makePlayer({
      awards: [{ type: 'MVP', season: 2024, dedupeKey: 'MVP_2024' }],
    });
    const meta = makeMeta();
    const ctx = getNegotiationContext(player, meta, {
      moraleSummary: makeMoraleSummary(70),
      awardSummary: makeAwardSummary({ mvpCount: 1 }),
      currentSeason: 2025,
      userTeamId: 1,
    });
    expect(ctx.leverageLabel).toBe('High Leverage');
    expect(ctx.feedbackLine).toBeTruthy();
  });

  it('returns "Discount" label for negative modifiers', () => {
    const player = makePlayer({ morale: 30 });
    const meta = makeMeta();
    const ctx = getNegotiationContext(player, meta, {
      moraleSummary: makeMoraleSummary(30),
      awardSummary: makeAwardSummary(),
      currentSeason: 2025,
      userTeamId: 1,
    });
    expect(ctx.leverageLabel).toBe('Discount');
  });

  it('returns "Standard" for neutral player with no modifiers', () => {
    const player = makePlayer({ morale: 70 });
    const meta = makeMeta();
    const ctx = getNegotiationContext(player, meta, {
      moraleSummary: makeMoraleSummary(70),
      awardSummary: makeAwardSummary(),
      currentSeason: 2025,
      userTeamId: 1,
    });
    expect(ctx.leverageLabel).toBe('Standard');
    expect(ctx.feedbackLine).toBeNull();
  });

  it('includes franchise reputation reason when applicable', () => {
    const player = makePlayer({ morale: 70 });
    const meta = makeMeta({
      franchiseAwards: [
        { type: 'LEAGUE_CHAMPION', season: 2022, teamId: 1 },
        { type: 'LEAGUE_CHAMPION', season: 2023, teamId: 1 },
      ],
    });
    const ctx = getNegotiationContext(player, meta, {
      moraleSummary: makeMoraleSummary(70),
      awardSummary: makeAwardSummary(),
      currentSeason: 2025,
      userTeamId: 1,
    });
    expect(ctx.reputationLabel).toContain('Championship');
    expect(ctx.leverageLabel).toBe('Discount');
  });

  it('is deterministic (same inputs → same output)', () => {
    const player = makePlayer({ morale: 88 });
    const meta = makeMeta();
    const ctx1 = getNegotiationContext(player, meta, { moraleSummary: makeMoraleSummary(88), awardSummary: makeAwardSummary(), currentSeason: 2025, userTeamId: 1 });
    const ctx2 = getNegotiationContext(player, meta, { moraleSummary: makeMoraleSummary(88), awardSummary: makeAwardSummary(), currentSeason: 2025, userTeamId: 1 });
    expect(ctx1.leverageLabel).toBe(ctx2.leverageLabel);
    expect(ctx1.feedbackLine).toBe(ctx2.feedbackLine);
    expect(ctx1.reputationLabel).toBe(ctx2.reputationLabel);
  });

  it('handles missing meta gracefully (old save)', () => {
    const player = makePlayer();
    expect(() => getNegotiationContext(player, undefined, {})).not.toThrow();
    expect(() => getNegotiationContext(player, null, {})).not.toThrow();
  });
});

// ── Integration: stack and cap scenarios ─────────────────────────────────────

describe('modifier stacking and cap', () => {
  it('stacked positive modifiers are capped at +25%', () => {
    // MVP (+15) + All-Pro (+10) = +25% — hits cap exactly
    const player = makePlayer({
      morale: 90, // +5% thriving
      awards: [
        { type: 'MVP', season: 2024, dedupeKey: 'MVP_2024' },
        { type: 'LEAGUE_CHAMPION', season: 2023, dedupeKey: 'LC_2023' },
      ],
    });
    const context = {
      moraleSummary: makeMoraleSummary(90),
      awardSummary: makeAwardSummary({ mvpCount: 1, allProCount: 3, championshipCount: 1 }),
      currentSeason: 2025,
    };
    // Total: +15 (MVP) + +10 (All-Pro) + +8 (Champ) + +5 (Thriving) = +38% → capped at +25%
    const leverage = computePlayerLeverage(player, context);
    const combined = applyNegotiationModifiers({ baseAnnual: 10 }, leverage, { multiplier: 1 });
    expect(combined._negotiationShift).toBeCloseTo(0.25, 3);
    expect(combined.baseAnnual).toBeCloseTo(12.5, 1);
  });

  it('stacked negative modifiers are capped at -25%', () => {
    // Disgruntled (-10) + franchise drought (+8) = -2% net... but with all negatives:
    // Disgruntled (-10) + franchise drought (+8) = -2% ... let's construct a -25% cap case
    const player = makePlayer({ morale: 30 }); // -10%
    const franchiseRep = { multiplier: 1 - 0.20 }; // hypothetical franchise -20%
    const demand = { baseAnnual: 10 };
    const leverage = computePlayerLeverage(player, { moraleSummary: makeMoraleSummary(30), awardSummary: makeAwardSummary(), currentSeason: 2025 });
    const result = applyNegotiationModifiers(demand, leverage, franchiseRep);
    // (-10) + (-20) = -30% → capped at -25%
    expect(result._negotiationShift).toBeCloseTo(-0.25, 3);
  });
});
