/**
 * tradeFinancialModifiers.test.js
 *
 * Validates the pure financial burden modifier module used in AI trade scoring.
 *
 * Coverage:
 *  - calculateCapFlexibilityPostures: threshold classification, edge cases, fallbacks
 *  - applyContractCapBurdenModifiers:
 *      safe fits (1.00×), tight fits (0.80×), over-cap penalties (0.40×)
 *      CONTENDER posture relief, REBUILDER veteran burden penalty
 *      missing/invalid input fallbacks (always baseline — never throws)
 *      input non-mutation guarantees
 *  - Integration: existing posture and valuation tests are unaffected (zero regressions)
 */

import { describe, it, expect } from 'vitest';
import {
  CAP_FINANCIAL_POSTURE,
  CAP_BURDEN_CONFIG,
  calculateCapFlexibilityPostures,
  applyContractCapBurdenModifiers,
} from '../../src/core/trades/tradeFinancialModifiers.js';
import { TEAM_STRATEGIC_POSTURE } from '../../src/core/trades/teamStrategicDirection.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal player asset with a simple contract (no signing bonus, so
 * getActiveCapHit returns exactly baseAnnual — deterministic for tests).
 */
function makePlayerAsset(overrides = {}) {
  return {
    assetType: 'player',
    pos: 'WR',
    ovr: 82,
    age: 27,
    contract: {
      baseAnnual: 10,
      signingBonus: 0,
      yearsTotal: 3,
      yearsRemaining: 2,
    },
    ...overrides,
  };
}

/** Expensive aging veteran: $20M salary, age 33 */
const expensiveVet = makePlayerAsset({
  pos: 'QB',
  ovr: 86,
  age: 33,
  contract: { baseAnnual: 20, signingBonus: 0, yearsTotal: 4, yearsRemaining: 3 },
});

/** Cheap young player: $1M salary, age 23 */
const rookieAsset = makePlayerAsset({
  pos: 'WR',
  ovr: 72,
  age: 23,
  contract: { baseAnnual: 1, signingBonus: 0, yearsTotal: 4, yearsRemaining: 3 },
});

/** Mid-tier player: $12M salary, age 28 */
const midTierAsset = makePlayerAsset({
  pos: 'CB',
  ovr: 80,
  age: 28,
  contract: { baseAnnual: 12, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 },
});

// ── CAP_FINANCIAL_POSTURE enum sanity ─────────────────────────────────────────

describe('CAP_FINANCIAL_POSTURE enum', () => {
  it('is frozen and contains the three posture keys', () => {
    expect(Object.isFrozen(CAP_FINANCIAL_POSTURE)).toBe(true);
    expect(CAP_FINANCIAL_POSTURE.SECURE).toBe('SECURE');
    expect(CAP_FINANCIAL_POSTURE.RESTRICTED).toBe('RESTRICTED');
    expect(CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK).toBe('INSOLVENCY_RISK');
  });
});

// ── CAP_BURDEN_CONFIG constants sanity ───────────────────────────────────────

describe('CAP_BURDEN_CONFIG constants', () => {
  it('is frozen', () => {
    expect(Object.isFrozen(CAP_BURDEN_CONFIG)).toBe(true);
  });

  it('BASELINE_MULTIPLIER is exactly 1.0', () => {
    expect(CAP_BURDEN_CONFIG.BASELINE_MULTIPLIER).toBe(1.0);
  });

  it('TIGHT_FIT_MULTIPLIER is less than 1.0 but greater than OVER_CAP_PENALTY_MULTIPLIER', () => {
    expect(CAP_BURDEN_CONFIG.TIGHT_FIT_MULTIPLIER).toBeGreaterThan(
      CAP_BURDEN_CONFIG.OVER_CAP_PENALTY_MULTIPLIER,
    );
    expect(CAP_BURDEN_CONFIG.TIGHT_FIT_MULTIPLIER).toBeLessThan(1.0);
  });

  it('OVER_CAP_PENALTY_MULTIPLIER is at most 0.50 (aggressive discount)', () => {
    expect(CAP_BURDEN_CONFIG.OVER_CAP_PENALTY_MULTIPLIER).toBeLessThanOrEqual(0.50);
  });

  it('CRITICAL_BUFFER_M is at least $2.0M', () => {
    expect(CAP_BURDEN_CONFIG.CRITICAL_BUFFER_M).toBeGreaterThanOrEqual(2.0);
  });

  it('VETERAN_AGE_THRESHOLD is 30', () => {
    expect(CAP_BURDEN_CONFIG.VETERAN_AGE_THRESHOLD).toBe(30);
  });

  it('VETERAN_SALARY_THRESHOLD_M is at least $10M', () => {
    expect(CAP_BURDEN_CONFIG.VETERAN_SALARY_THRESHOLD_M).toBeGreaterThanOrEqual(10);
  });
});

// ── calculateCapFlexibilityPostures ──────────────────────────────────────────

describe('calculateCapFlexibilityPostures — SECURE classification', () => {
  it('classifies $15M+ cap room as SECURE (exact boundary)', () => {
    const posture = calculateCapFlexibilityPostures({}, 15.0);
    expect(posture).toBe(CAP_FINANCIAL_POSTURE.SECURE);
  });

  it('classifies $30M cap room as SECURE', () => {
    expect(calculateCapFlexibilityPostures({}, 30)).toBe(CAP_FINANCIAL_POSTURE.SECURE);
  });

  it('classifies $100M cap room as SECURE', () => {
    expect(calculateCapFlexibilityPostures({}, 100)).toBe(CAP_FINANCIAL_POSTURE.SECURE);
  });
});

describe('calculateCapFlexibilityPostures — RESTRICTED classification', () => {
  it('classifies $2M cap room as RESTRICTED (exact boundary)', () => {
    expect(calculateCapFlexibilityPostures({}, 2.0)).toBe(CAP_FINANCIAL_POSTURE.RESTRICTED);
  });

  it('classifies $10M cap room as RESTRICTED', () => {
    expect(calculateCapFlexibilityPostures({}, 10)).toBe(CAP_FINANCIAL_POSTURE.RESTRICTED);
  });

  it('classifies $14.99M cap room as RESTRICTED (just below SECURE boundary)', () => {
    expect(calculateCapFlexibilityPostures({}, 14.99)).toBe(CAP_FINANCIAL_POSTURE.RESTRICTED);
  });
});

describe('calculateCapFlexibilityPostures — INSOLVENCY_RISK classification', () => {
  it('classifies $0 cap room as INSOLVENCY_RISK', () => {
    expect(calculateCapFlexibilityPostures({}, 0)).toBe(CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK);
  });

  it('classifies negative cap room as INSOLVENCY_RISK', () => {
    expect(calculateCapFlexibilityPostures({}, -5)).toBe(CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK);
  });

  it('classifies $1.99M cap room as INSOLVENCY_RISK (just below RESTRICTED boundary)', () => {
    expect(calculateCapFlexibilityPostures({}, 1.99)).toBe(CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK);
  });

  it('falls back to INSOLVENCY_RISK when capRoom is undefined (safe default to 0)', () => {
    expect(calculateCapFlexibilityPostures({}, undefined)).toBe(CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK);
  });

  it('falls back to INSOLVENCY_RISK when capRoom is null', () => {
    expect(calculateCapFlexibilityPostures({}, null)).toBe(CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK);
  });

  it('falls back to INSOLVENCY_RISK when capRoom is NaN', () => {
    expect(calculateCapFlexibilityPostures({}, NaN)).toBe(CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK);
  });
});

describe('calculateCapFlexibilityPostures — custom threshold options', () => {
  it('respects custom SECURE_CAP_ROOM_MIN override', () => {
    const posture = calculateCapFlexibilityPostures({}, 10, { SECURE_CAP_ROOM_MIN: 10 });
    expect(posture).toBe(CAP_FINANCIAL_POSTURE.SECURE);
  });

  it('respects custom RESTRICTED_CAP_ROOM_MIN override', () => {
    const posture = calculateCapFlexibilityPostures({}, 5, { RESTRICTED_CAP_ROOM_MIN: 5, SECURE_CAP_ROOM_MIN: 20 });
    expect(posture).toBe(CAP_FINANCIAL_POSTURE.RESTRICTED);
  });
});

// ── applyContractCapBurdenModifiers — baseline (safe fit) ────────────────────

describe('applyContractCapBurdenModifiers — safe fit (1.00× baseline)', () => {
  it('returns full value when salary fits with ample buffer', () => {
    // $10M salary, $30M cap room → $20M remaining > $2M buffer → 1.00×
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 10, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100,
      30,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(100);
  });

  it('returns full value when remaining buffer is exactly CRITICAL_BUFFER_M', () => {
    // $10M salary, $12M cap room → $2M remaining = exactly CRITICAL_BUFFER_M → 1.00×
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 10, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      200,
      12,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(200);
  });

  it('applies 1.00× for rookie-scale salary regardless of posture', () => {
    // $1M salary, $5M cap room → $4M remaining > $2M → 1.00×
    const result = applyContractCapBurdenModifiers(
      rookieAsset,
      150,
      5,
      TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    expect(result).toBe(150);
  });
});

// ── applyContractCapBurdenModifiers — tight fit (0.80×) ──────────────────────

describe('applyContractCapBurdenModifiers — tight fit (0.80× penalty)', () => {
  it('applies TIGHT_FIT_MULTIPLIER when salary fits but leaves < CRITICAL_BUFFER_M', () => {
    // $10M salary, $11M cap room → $1M remaining < $2M buffer → 0.80×
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 10, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100,
      11,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(Math.round(100 * CAP_BURDEN_CONFIG.TIGHT_FIT_MULTIPLIER));
  });

  it('applies TIGHT_FIT_MULTIPLIER when remaining is exactly $0 (at cap limit)', () => {
    // $10M salary, $10M cap room → $0 remaining → fits but no buffer → 0.80×
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 10, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      200,
      10,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(Math.round(200 * CAP_BURDEN_CONFIG.TIGHT_FIT_MULTIPLIER));
  });

  it('tight-fit value is less than baseline but greater than over-cap penalty', () => {
    const baseValue = 300;
    const capRoom = 11; // $10M salary: $1M remaining — tight fit
    const tightResult = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 10, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      baseValue, capRoom, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    const overCapResult = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 15, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      baseValue, capRoom, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(tightResult).toBeLessThan(baseValue);
    expect(tightResult).toBeGreaterThan(overCapResult);
  });
});

// ── applyContractCapBurdenModifiers — over-cap penalty (0.40×) ───────────────

describe('applyContractCapBurdenModifiers — over-cap penalty (≤ 0.50× severe discount)', () => {
  it('applies OVER_CAP_PENALTY_MULTIPLIER when salary exceeds cap room', () => {
    // $25M salary, $20M cap room → -$5M remaining → 0.40×
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 25, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100,
      20,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(Math.round(100 * CAP_BURDEN_CONFIG.OVER_CAP_PENALTY_MULTIPLIER));
  });

  it('caps penalty at OVER_CAP_PENALTY_MULTIPLIER even when cap room is deeply negative', () => {
    // Team already over the cap; penalty should not go below OVER_CAP_PENALTY_MULTIPLIER
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 40, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100,
      -20,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(Math.round(100 * CAP_BURDEN_CONFIG.OVER_CAP_PENALTY_MULTIPLIER));
  });

  it('expensive incoming contract gets massive discount against cap-tight team', () => {
    // $40M star QB salary, team with only $10M room → should drastically reduce value
    const result = applyContractCapBurdenModifiers(
      expensiveVet,
      500,
      10,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBeLessThanOrEqual(250); // at most half of base value
  });
});

// ── CONTENDER posture relief ──────────────────────────────────────────────────

describe('applyContractCapBurdenModifiers — CONTENDER posture relief', () => {
  it('CONTENDER gets higher value than NEUTRAL for same cap-tight situation', () => {
    const asset = makePlayerAsset({
      contract: { baseAnnual: 25, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 },
    });
    const neutralResult = applyContractCapBurdenModifiers(asset, 100, 20, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    const contenderResult = applyContractCapBurdenModifiers(asset, 100, 20, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(contenderResult).toBeGreaterThan(neutralResult);
  });

  it('CONTENDER multiplier never exceeds 1.00× (baseline cap)', () => {
    // Even with relief, cannot exceed the baseline no-penalty value
    const safeAsset = makePlayerAsset({
      contract: { baseAnnual: 5, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 },
    });
    const result = applyContractCapBurdenModifiers(safeAsset, 100, 30, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(result).toBeLessThanOrEqual(100);
  });

  it('CONTENDER in tight-fit scenario receives a higher multiplier than NEUTRAL', () => {
    // $10M salary, $11M cap room (tight fit: 0.80× for NEUTRAL)
    const asset = makePlayerAsset({
      contract: { baseAnnual: 10, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 },
    });
    const neutralResult = applyContractCapBurdenModifiers(asset, 100, 11, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    const contenderResult = applyContractCapBurdenModifiers(asset, 100, 11, TEAM_STRATEGIC_POSTURE.CONTENDER);
    // CONTENDER should receive more than NEUTRAL (0.80 × 1.15 = 0.92×)
    expect(contenderResult).toBeGreaterThan(neutralResult);
    expect(contenderResult).toBeLessThanOrEqual(100);
  });

  it('CONTENDER over-cap penalty = OVER_CAP_PENALTY × CONTENDER_BURDEN_RELIEF', () => {
    const asset = makePlayerAsset({
      contract: { baseAnnual: 25, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 },
    });
    const expected = Math.round(
      100 * CAP_BURDEN_CONFIG.OVER_CAP_PENALTY_MULTIPLIER * CAP_BURDEN_CONFIG.CONTENDER_BURDEN_RELIEF,
    );
    const result = applyContractCapBurdenModifiers(asset, 100, 20, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(result).toBe(expected);
  });
});

// ── REBUILDER posture veteran burden penalty ──────────────────────────────────

describe('applyContractCapBurdenModifiers — REBUILDER expensive veteran penalty', () => {
  it('REBUILDER discounts expensive aging veteran MORE than NEUTRAL when cap is tight', () => {
    // $20M salary, $10M cap room → over-cap scenario
    const neutralResult = applyContractCapBurdenModifiers(
      expensiveVet, 200, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    const rebuilderResult = applyContractCapBurdenModifiers(
      expensiveVet, 200, 10, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    expect(rebuilderResult).toBeLessThan(neutralResult);
  });

  it('REBUILDER veteran penalty = OVER_CAP × REBUILDER_BURDEN_PENALTY for qualifying vet', () => {
    // expensiveVet: $20M salary (>= $12M threshold), age 33 (>= 30 threshold)
    const expected = Math.round(
      200 * CAP_BURDEN_CONFIG.OVER_CAP_PENALTY_MULTIPLIER * CAP_BURDEN_CONFIG.REBUILDER_BURDEN_PENALTY,
    );
    const result = applyContractCapBurdenModifiers(
      expensiveVet, 200, 10, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    expect(result).toBe(expected);
  });

  it('REBUILDER does NOT apply veteran penalty for young players even at high salary', () => {
    // $15M salary, age 25 — expensive but NOT aging (< age threshold)
    const youngExpensive = makePlayerAsset({
      age: 25,
      contract: { baseAnnual: 15, signingBonus: 0, yearsTotal: 4, yearsRemaining: 3 },
    });
    const neutralResult = applyContractCapBurdenModifiers(
      youngExpensive, 200, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    const rebuilderResult = applyContractCapBurdenModifiers(
      youngExpensive, 200, 10, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    // Should receive same penalty as NEUTRAL since player is not old enough
    expect(rebuilderResult).toBe(neutralResult);
  });

  it('REBUILDER does NOT apply veteran penalty for cheap aged players', () => {
    // $5M salary, age 34 — aging but NOT expensive (< salary threshold)
    const cheapAgedPlayer = makePlayerAsset({
      age: 34,
      contract: { baseAnnual: 5, signingBonus: 0, yearsTotal: 2, yearsRemaining: 1 },
    });
    const neutralResult = applyContractCapBurdenModifiers(
      cheapAgedPlayer, 200, 2, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    const rebuilderResult = applyContractCapBurdenModifiers(
      cheapAgedPlayer, 200, 2, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    // Salary < VETERAN_SALARY_THRESHOLD_M, so no extra rebuilder penalty
    expect(rebuilderResult).toBe(neutralResult);
  });

  it('REBUILDER does NOT apply extra penalty when cap is healthy (no cap stress)', () => {
    // $20M salary, $30M cap room → well within buffer → BASELINE_MULTIPLIER
    const rebuilderResult = applyContractCapBurdenModifiers(
      expensiveVet, 200, 30, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    // No burden penalty when cap is healthy, regardless of veteran status
    expect(rebuilderResult).toBe(200);
  });

  it('REBUILDER maintains baseline valuation for rookie-scale players in cap-restricted scenario', () => {
    // $1M salary on a rebuilder with tight cap — rookies should not be penalized by cap burden
    const result = applyContractCapBurdenModifiers(
      rookieAsset, 150, 5, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    // $1M salary, $5M room → $4M remaining > $2M buffer → BASELINE = no penalty
    expect(result).toBe(150);
  });
});

// ── REBUILDER vs CONTENDER comparison ────────────────────────────────────────

describe('applyContractCapBurdenModifiers — REBUILDER vs CONTENDER ordering', () => {
  it('CONTENDER values an expensive veteran MORE than REBUILDER in same cap-stressed scenario', () => {
    const contenderResult = applyContractCapBurdenModifiers(
      expensiveVet, 300, 10, TEAM_STRATEGIC_POSTURE.CONTENDER,
    );
    const rebuilderResult = applyContractCapBurdenModifiers(
      expensiveVet, 300, 10, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    expect(contenderResult).toBeGreaterThan(rebuilderResult);
  });

  it('ordering: CONTENDER >= NEUTRAL >= REBUILDER for expensive veteran when cap-stressed', () => {
    const neutralResult = applyContractCapBurdenModifiers(
      expensiveVet, 300, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    const contenderResult = applyContractCapBurdenModifiers(
      expensiveVet, 300, 10, TEAM_STRATEGIC_POSTURE.CONTENDER,
    );
    const rebuilderResult = applyContractCapBurdenModifiers(
      expensiveVet, 300, 10, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    expect(contenderResult).toBeGreaterThanOrEqual(neutralResult);
    expect(neutralResult).toBeGreaterThanOrEqual(rebuilderResult);
  });
});

// ── Safe fallbacks — missing / invalid inputs ─────────────────────────────────

describe('applyContractCapBurdenModifiers — safe fallbacks', () => {
  it('returns baseValue × 1.00 when playerAsset has no contract data', () => {
    const emptyAsset = { assetType: 'player', pos: 'WR', ovr: 80 };
    const result = applyContractCapBurdenModifiers(emptyAsset, 100, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    expect(result).toBe(Math.round(100 * CAP_BURDEN_CONFIG.BASELINE_MULTIPLIER));
  });

  it('returns baseValue × 1.00 when availableCapRoom is undefined', () => {
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset(), 100, undefined, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(Math.round(100 * CAP_BURDEN_CONFIG.BASELINE_MULTIPLIER));
  });

  it('returns baseValue × 1.00 when availableCapRoom is null', () => {
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset(), 100, null, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(100);
  });

  it('returns baseValue × 1.00 when availableCapRoom is NaN', () => {
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset(), 100, NaN, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(100);
  });

  it('returns 0 when baseValue is 0', () => {
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset(), 0, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(0);
  });

  it('returns 0 when baseValue is negative', () => {
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset(), -50, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(0);
  });

  it('never throws with completely empty inputs', () => {
    expect(() => applyContractCapBurdenModifiers()).not.toThrow();
    expect(() => applyContractCapBurdenModifiers({}, 0, undefined, undefined)).not.toThrow();
    expect(() => applyContractCapBurdenModifiers(null, null, null, null)).not.toThrow();
  });

  it('handles an unknown teamPosture gracefully (no posture modifiers applied)', () => {
    // $25M salary, $20M cap room → over-cap; unknown posture → same as NEUTRAL
    const unknownPostureResult = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 25, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100, 20, 'TOTALLY_UNKNOWN_POSTURE',
    );
    const neutralResult = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 25, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100, 20, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(unknownPostureResult).toBe(neutralResult);
  });

  it('reads capHit from playerAsset.capHit override when present', () => {
    // If capHit is provided directly, it overrides the contract computation.
    // capHit = 5M, capRoom = 30M → $25M remaining > $2M → 1.00×
    const assetWithCapHit = { assetType: 'player', capHit: 5, ovr: 80 };
    const result = applyContractCapBurdenModifiers(assetWithCapHit, 100, 30, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    expect(result).toBe(100);
  });
});

// ── Input non-mutation guarantees ─────────────────────────────────────────────

describe('applyContractCapBurdenModifiers — non-mutation guarantees', () => {
  it('does not mutate playerAsset', () => {
    const asset = makePlayerAsset({ contract: { baseAnnual: 25, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } });
    const originalJson = JSON.stringify(asset);
    applyContractCapBurdenModifiers(asset, 200, 10, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(JSON.stringify(asset)).toBe(originalJson);
  });

  it('does not mutate the options object', () => {
    const options = { CRITICAL_BUFFER_M: 5 };
    const originalJson = JSON.stringify(options);
    applyContractCapBurdenModifiers(makePlayerAsset(), 100, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL, options);
    expect(JSON.stringify(options)).toBe(originalJson);
  });

  it('baseValue number is not affected by the call', () => {
    const value = 250;
    applyContractCapBurdenModifiers(expensiveVet, value, 5, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(value).toBe(250);
  });
});

// ── calculateCapFlexibilityPostures — non-mutation ────────────────────────────

describe('calculateCapFlexibilityPostures — non-mutation', () => {
  it('does not mutate teamState object', () => {
    const teamState = { id: 1, name: 'Test', capRoom: 10 };
    const original = JSON.stringify(teamState);
    calculateCapFlexibilityPostures(teamState, 10);
    expect(JSON.stringify(teamState)).toBe(original);
  });
});

// ── Custom options override ───────────────────────────────────────────────────

describe('applyContractCapBurdenModifiers — custom options overrides', () => {
  it('respects a custom CRITICAL_BUFFER_M override', () => {
    // With CRITICAL_BUFFER_M = 10, a $5M salary on $12M cap room leaves $7M < 10M buffer → TIGHT_FIT
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 5, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100,
      12,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
      { CRITICAL_BUFFER_M: 10 },
    );
    expect(result).toBe(Math.round(100 * CAP_BURDEN_CONFIG.TIGHT_FIT_MULTIPLIER));
  });

  it('respects custom OVER_CAP_PENALTY_MULTIPLIER override', () => {
    const result = applyContractCapBurdenModifiers(
      makePlayerAsset({ contract: { baseAnnual: 25, signingBonus: 0, yearsTotal: 3, yearsRemaining: 2 } }),
      100,
      10,
      TEAM_STRATEGIC_POSTURE.NEUTRAL,
      { OVER_CAP_PENALTY_MULTIPLIER: 0.30 },
    );
    expect(result).toBe(Math.round(100 * 0.30));
  });
});

// ── Mid-tier asset scenarios ──────────────────────────────────────────────────

describe('applyContractCapBurdenModifiers — mid-tier asset scenarios', () => {
  it('mid-tier player ($12M) fits safely on a cap-healthy team', () => {
    // $12M salary, $30M cap room → $18M remaining > $2M → 1.00×
    const result = applyContractCapBurdenModifiers(
      midTierAsset, 180, 30, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(180);
  });

  it('mid-tier player ($12M) gets tight-fit penalty on a $13M cap room team', () => {
    // $12M salary, $13M cap room → $1M remaining < $2M buffer → TIGHT_FIT 0.80×
    const result = applyContractCapBurdenModifiers(
      midTierAsset, 180, 13, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(Math.round(180 * CAP_BURDEN_CONFIG.TIGHT_FIT_MULTIPLIER));
  });

  it('mid-tier player ($12M) gets over-cap penalty on a $10M cap room team', () => {
    // $12M salary, $10M cap room → -$2M remaining → OVER_CAP 0.40×
    const result = applyContractCapBurdenModifiers(
      midTierAsset, 180, 10, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(result).toBe(Math.round(180 * CAP_BURDEN_CONFIG.OVER_CAP_PENALTY_MULTIPLIER));
  });
});

// ── Integration: REBUILDER penalty meets VETERAN_SALARY_THRESHOLD_M boundary ─

describe('applyContractCapBurdenModifiers — REBUILDER veteran threshold boundaries', () => {
  it('player at exactly VETERAN_SALARY_THRESHOLD_M and VETERAN_AGE_THRESHOLD triggers extra penalty', () => {
    const exactThresholdVet = makePlayerAsset({
      age: CAP_BURDEN_CONFIG.VETERAN_AGE_THRESHOLD,
      contract: {
        baseAnnual: CAP_BURDEN_CONFIG.VETERAN_SALARY_THRESHOLD_M,
        signingBonus: 0,
        yearsTotal: 3,
        yearsRemaining: 2,
      },
    });
    // Cap room below salary → over-cap scenario where REBUILDER penalty applies
    const capRoom = CAP_BURDEN_CONFIG.VETERAN_SALARY_THRESHOLD_M - 5;
    const neutralResult = applyContractCapBurdenModifiers(
      exactThresholdVet, 200, capRoom, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    const rebuilderResult = applyContractCapBurdenModifiers(
      exactThresholdVet, 200, capRoom, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    expect(rebuilderResult).toBeLessThan(neutralResult);
  });

  it('player 1 year below VETERAN_AGE_THRESHOLD does NOT trigger extra REBUILDER penalty', () => {
    const almostVet = makePlayerAsset({
      age: CAP_BURDEN_CONFIG.VETERAN_AGE_THRESHOLD - 1,
      contract: {
        baseAnnual: CAP_BURDEN_CONFIG.VETERAN_SALARY_THRESHOLD_M + 5,
        signingBonus: 0,
        yearsTotal: 3,
        yearsRemaining: 2,
      },
    });
    const capRoom = 5; // below salary → over-cap
    const neutralResult = applyContractCapBurdenModifiers(
      almostVet, 200, capRoom, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    const rebuilderResult = applyContractCapBurdenModifiers(
      almostVet, 200, capRoom, TEAM_STRATEGIC_POSTURE.REBUILDER,
    );
    // Should NOT receive extra penalty since age is below threshold
    expect(rebuilderResult).toBe(neutralResult);
  });
});
