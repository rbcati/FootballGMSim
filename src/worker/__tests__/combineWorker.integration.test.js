/**
 * combineWorker.integration.test.js
 * Integration tests for the combine engine functions that worker handlers use.
 * Tests are engine-level (pure functions), matching the pattern of scoutingWorker.test.js.
 */
import { describe, it, expect } from 'vitest';
import {
  generateCombineMetrics,
  generateCombineMetricsForClass,
  applyPrivateWorkout,
  getAIDraftBoardAdjustment,
  computeCombineGrade,
  getPositionGroup,
  COMBINE_GRADE_THRESHOLDS,
} from '../../core/draft/combineEngine.js';

function makeProspect(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    age: 22,
    ovr: 75,
    trueOvr: 75,
    status: 'draft_eligible',
    ratings: { speed: 85, agility: 80, acceleration: 75 },
    scoutedRanges: {},
    ...overrides,
  };
}

// ── 1. generateCombineMetricsForClass populates all prospects during init ─────

describe('worker integration — combine engine: class generation', () => {
  it('generates combine metrics for all draft_eligible prospects', () => {
    const prospects = [
      makeProspect({ id: 1, pos: 'WR' }),
      makeProspect({ id: 2, pos: 'QB', ratings: { speed: 65, agility: 70 } }),
      makeProspect({ id: 3, pos: 'OL', ratings: { speed: 50, agility: 55, runBlock: 80 } }),
    ];
    const result = generateCombineMetricsForClass(prospects, 2025);
    expect(result).toHaveLength(3);
    result.forEach((p) => {
      expect(p.combineMetrics).not.toBeNull();
      expect(p.combineMetrics.fortyYardDash).toBeTypeOf('number');
      expect(p.combineMetrics.benchPressReps).toBeTypeOf('number');
      expect(p.combineMetrics.combineGrade).toBeTypeOf('number');
    });
  });

  // ── 2. Prospects with existing metrics are not overwritten ─────────────────

  it('skips prospects that already have combineMetrics', () => {
    const existingMetrics = { fortyYardDash: 4.30, benchPressReps: 35, combineGrade: 9.0, threeCone: 6.55, verticalJump: 40 };
    const prospect = makeProspect({ id: 10, combineMetrics: existingMetrics });
    const result = generateCombineMetricsForClass([prospect], 2025);
    expect(result[0].combineMetrics).toEqual(existingMetrics);
  });

  // ── 3. Empty class returns empty array ────────────────────────────────────

  it('handles an empty draft class', () => {
    expect(generateCombineMetricsForClass([], 2025)).toEqual([]);
  });

  // ── 4. Determinism: same inputs produce identical metrics ─────────────────

  it('generateCombineMetrics is deterministic across calls', () => {
    const prospect = makeProspect({ id: 42, trueOvr: 80 });
    const first = generateCombineMetrics(prospect, 2025);
    const second = generateCombineMetrics(prospect, 2025);
    expect(first).toEqual(second);
  });

  // ── 5. Different seasons produce different metrics ────────────────────────

  it('different seasons yield different combine metrics', () => {
    const prospect = makeProspect({ id: 5, trueOvr: 75 });
    const season1 = generateCombineMetrics(prospect, 2024);
    const season2 = generateCombineMetrics(prospect, 2025);
    expect(season1.fortyYardDash).not.toBe(season2.fortyYardDash);
  });
});

// ── AI draft board adjustment ─────────────────────────────────────────────────

describe('worker integration — combine engine: AI board adjustment', () => {
  // ── 6. Athletic freak (+15 slots) ────────────────────────────────────────

  it('returns +15 slots for a grade above athletic_freak threshold', () => {
    const prospect = makeProspect({ combineMetrics: { combineGrade: COMBINE_GRADE_THRESHOLDS.athletic_freak + 0.1 } });
    const adj = getAIDraftBoardAdjustment(prospect);
    expect(adj.slots).toBe(15);
    expect(adj.reason).toBe('athletic_freak');
  });

  // ── 7. Combine bust (-15 slots) ──────────────────────────────────────────

  it('returns -15 slots for a grade below bust threshold', () => {
    const prospect = makeProspect({ combineMetrics: { combineGrade: COMBINE_GRADE_THRESHOLDS.bust - 0.1 } });
    const adj = getAIDraftBoardAdjustment(prospect);
    expect(adj.slots).toBe(-15);
    expect(adj.reason).toBe('combine_bust');
  });

  // ── 8. Normal range → no adjustment ─────────────────────────────────────

  it('returns 0 slots for a normal combine grade', () => {
    const prospect = makeProspect({ combineMetrics: { combineGrade: 6.0 } });
    const adj = getAIDraftBoardAdjustment(prospect);
    expect(adj.slots).toBe(0);
    expect(adj.reason).toBe('none');
  });

  // ── 9. Null metrics → no adjustment ─────────────────────────────────────

  it('returns 0 slots when combineMetrics is null', () => {
    const prospect = makeProspect({ combineMetrics: null });
    const adj = getAIDraftBoardAdjustment(prospect);
    expect(adj.slots).toBe(0);
    expect(adj.reason).toBe('none');
  });

  // ── 10. Missing combineMetrics property → no adjustment ─────────────────

  it('returns 0 slots when combineMetrics is undefined', () => {
    const prospect = makeProspect();
    delete prospect.combineMetrics;
    const adj = getAIDraftBoardAdjustment(prospect);
    expect(adj.slots).toBe(0);
  });
});

// ── applyPrivateWorkout ───────────────────────────────────────────────────────

describe('worker integration — combine engine: private workout', () => {
  // ── 11. Sets workoutCompleted flag ────────────────────────────────────────

  it('marks the prospect as workoutCompleted', () => {
    const prospect = makeProspect({ id: 7, trueOvr: 82 });
    const result = applyPrivateWorkout(prospect, 3, 2025);
    expect(result.workoutCompleted).toBe(true);
  });

  // ── 12. Reveals trueOvr in scoutedRanges with Verified label ─────────────

  it('adds Verified scouted range with trueOvr for the requesting team', () => {
    const prospect = makeProspect({ id: 7, trueOvr: 82 });
    const result = applyPrivateWorkout(prospect, 3, 2025);
    expect(result.scoutedRanges[3]).toEqual({
      low: 82,
      high: 82,
      confidence: 1.0,
      label: 'Verified',
    });
  });

  // ── 13. Preserves existing scoutedRanges for other teams ─────────────────

  it('preserves existing scouted ranges from other teams', () => {
    const prospect = makeProspect({
      id: 8,
      trueOvr: 78,
      scoutedRanges: { 5: { low: 70, high: 80, confidence: 0.6, label: 'Decent' } },
    });
    const result = applyPrivateWorkout(prospect, 3, 2025);
    expect(result.scoutedRanges[5]).toEqual({ low: 70, high: 80, confidence: 0.6, label: 'Decent' });
    expect(result.scoutedRanges[3].low).toBe(78);
  });

  // ── 14. Does not mutate the original prospect ─────────────────────────────

  it('returns a new object without mutating the original', () => {
    const prospect = makeProspect({ id: 9, trueOvr: 70 });
    const result = applyPrivateWorkout(prospect, 1, 2025);
    expect(result).not.toBe(prospect);
    expect(prospect.workoutCompleted).toBeUndefined();
  });
});

// ── computeCombineGrade coverage ─────────────────────────────────────────────

describe('worker integration — combine engine: grade computation', () => {
  // ── 15. Speed group grade is weighted towards forty ───────────────────────

  it('speed group: elite forty boosts grade significantly', () => {
    const elite = { fortyYardDash: 4.28, threeCone: 6.90, benchPressReps: 15, verticalJump: 35 };
    const slow  = { fortyYardDash: 4.78, threeCone: 6.90, benchPressReps: 15, verticalJump: 35 };
    const eliteGrade = computeCombineGrade(elite, 'WR');
    const slowGrade  = computeCombineGrade(slow,  'WR');
    expect(eliteGrade).toBeGreaterThan(slowGrade + 2);
  });

  it('linemen group: elite bench press boosts grade significantly', () => {
    const strongMan = { fortyYardDash: 5.10, threeCone: 7.80, benchPressReps: 38, verticalJump: 26 };
    const weakMan   = { fortyYardDash: 5.10, threeCone: 7.80, benchPressReps: 8,  verticalJump: 26 };
    const strongGrade = computeCombineGrade(strongMan, 'OL');
    const weakGrade   = computeCombineGrade(weakMan,   'OL');
    expect(strongGrade).toBeGreaterThan(weakGrade + 2);
  });

  it('grade is clamped between 0 and 10', () => {
    const worst = { fortyYardDash: 5.60, threeCone: 9.00, benchPressReps: 4,  verticalJump: 17 };
    const best  = { fortyYardDash: 4.28, threeCone: 6.45, benchPressReps: 41, verticalJump: 46 };
    expect(computeCombineGrade(worst, 'WR')).toBeGreaterThanOrEqual(0);
    expect(computeCombineGrade(best,  'WR')).toBeLessThanOrEqual(10);
  });
});
