/**
 * workerHofLeaderboard.test.js — Worker integration tests for Feature B + C
 *
 * Tests that:
 *  - buildAllLeaderboards is wired correctly (via statLeaderboard.js)
 *  - HOF leverage modifier flows correctly through FA demand calc helpers
 *  - Old saves (no hofRoster, no hofStatus) produce safe zero output
 */

import { describe, it, expect } from 'vitest';
import {
  LEVERAGE_MODIFIERS,
  computePlayerLeverage,
  applyNegotiationModifiers,
} from '../contracts/negotiationModifiers.js';
import { buildAllLeaderboards, TRACKED_STATS } from '../awards/statLeaderboard.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 'p1', name: 'Test', pos: 'QB', ovr: 80, age: 28,
    morale: 70, moraleEvents: [], awards: [], careerStats: [],
    ...overrides,
  };
}

function baseDemand(annual = 20) {
  return { baseAnnual: annual, yearsTotal: 3, signingBonus: 5, guaranteedPct: 0.5 };
}

// ── buildAllLeaderboards — buildViewState wire simulation ─────────────────────

describe('buildAllLeaderboards wire (simulates buildViewState)', () => {
  it('returns an entry for each TRACKED_STATS key when called with empty data', () => {
    const result = buildAllLeaderboards([], []);
    for (const s of TRACKED_STATS) {
      expect(result).toHaveProperty(s.key);
      expect(Array.isArray(result[s.key])).toBe(true);
    }
  });

  it('old save with no hofRoster returns empty leaderboards without crash', () => {
    expect(() => buildAllLeaderboards(undefined, [])).not.toThrow();
    expect(() => buildAllLeaderboards(null, [])).not.toThrow();
    const result = buildAllLeaderboards(undefined, []);
    for (const s of TRACKED_STATS) {
      expect(result[s.key]).toEqual([]);
    }
  });

  it('old save with no active players returns empty leaderboards without crash', () => {
    expect(() => buildAllLeaderboards([], undefined)).not.toThrow();
    const result = buildAllLeaderboards([], undefined);
    for (const s of TRACKED_STATS) {
      expect(result[s.key]).toEqual([]);
    }
  });
});

// ── HOF leverage modifier flows through FA demand calculation ─────────────────

describe('HOF leverage modifier — FA demand flow', () => {
  it('HOF inducted raises FA demand by HOF_INDUCTED rate (before cap)', () => {
    const player = makePlayer({ hofStatus: 'inducted' });
    const leverage = computePlayerLeverage(player, {});
    const demand = applyNegotiationModifiers(baseDemand(20), leverage, { multiplier: 1, reasons: [] });
    expect(demand.baseAnnual).toBeCloseTo(20 * (1 + LEVERAGE_MODIFIERS.HOF_INDUCTED));
  });

  it('HOF nominee raises FA demand by HOF_NOMINEE rate (before cap)', () => {
    const player = makePlayer({ hofStatus: 'nominee' });
    const leverage = computePlayerLeverage(player, {});
    const demand = applyNegotiationModifiers(baseDemand(20), leverage, { multiplier: 1, reasons: [] });
    expect(demand.baseAnnual).toBeCloseTo(20 * (1 + LEVERAGE_MODIFIERS.HOF_NOMINEE));
  });

  it('HOF leverage modifier flows through extension ask (same computePlayerLeverage path)', () => {
    const inductee = makePlayer({ hofStatus: 'inducted' });
    const neutral = makePlayer({ hofStatus: 'none' });
    const inducteeLeverage = computePlayerLeverage(inductee, {});
    const neutralLeverage = computePlayerLeverage(neutral, {});
    expect(inducteeLeverage.multiplier).toBeGreaterThan(neutralLeverage.multiplier);
    const inducteeAsk = applyNegotiationModifiers(baseDemand(15), inducteeLeverage, { multiplier: 1, reasons: [] });
    const neutralAsk = applyNegotiationModifiers(baseDemand(15), neutralLeverage, { multiplier: 1, reasons: [] });
    expect(inducteeAsk.baseAnnual).toBeGreaterThan(neutralAsk.baseAnnual);
  });

  it('old save (no hofStatus) produces zero HOF modifier without crash', () => {
    const oldSavePlayer = { id: 'old1', name: 'Legacy', pos: 'QB', ovr: 75, awards: [] };
    expect(() => computePlayerLeverage(oldSavePlayer, {})).not.toThrow();
    const leverage = computePlayerLeverage(oldSavePlayer, {});
    expect(leverage.multiplier).toBe(1);
  });
});
