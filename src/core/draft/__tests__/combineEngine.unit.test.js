import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPositionGroup,
  generateCombineMetrics,
  computeCombineGrade,
  generateCombineMetricsForClass,
  applyPrivateWorkout,
  getAIDraftBoardAdjustment,
  COMBINE_GRADE_THRESHOLDS,
} from '../combineEngine.js';

function makeProspect(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    age: 22,
    ovr: 75,
    trueOvr: 75,
    scoutedRanges: {},
    combineMetrics: null,
    workoutCompleted: false,
    ratings: {
      speed: 70,
      agility: 70,
      acceleration: 70,
      runBlock: 50,
      passRushPower: 50,
      trucking: 50,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getPositionGroup
// ---------------------------------------------------------------------------
describe('getPositionGroup', () => {
  it('returns "speed" for WR', () => {
    expect(getPositionGroup('WR')).toBe('speed');
  });

  it('returns "speed" for CB', () => {
    expect(getPositionGroup('CB')).toBe('speed');
  });

  it('returns "big_skill" for QB', () => {
    expect(getPositionGroup('QB')).toBe('big_skill');
  });

  it('returns "linemen" for OL', () => {
    expect(getPositionGroup('OL')).toBe('linemen');
  });

  it('returns "linemen" for DE', () => {
    expect(getPositionGroup('DE')).toBe('linemen');
  });
});

// ---------------------------------------------------------------------------
// generateCombineMetrics
// ---------------------------------------------------------------------------
describe('generateCombineMetrics', () => {
  it('forty time in [4.28, 4.38] for WR with speed >= 90 (elite tier)', () => {
    const prospect = makeProspect({
      pos: 'WR',
      ratings: { speed: 92, agility: 70, acceleration: 70, runBlock: 50, passRushPower: 50, trucking: 50 },
    });
    const metrics = generateCombineMetrics(prospect, 2024);
    expect(metrics.fortyYardDash).toBeGreaterThanOrEqual(4.28);
    expect(metrics.fortyYardDash).toBeLessThanOrEqual(4.38);
  });

  it('forty time in [5.25, 5.55] for OL with speed < 40 (below tier for linemen)', () => {
    const prospect = makeProspect({
      pos: 'OL',
      ratings: { speed: 30, agility: 30, acceleration: 30, runBlock: 50, passRushPower: 50, trucking: 50 },
    });
    const metrics = generateCombineMetrics(prospect, 2024);
    expect(metrics.fortyYardDash).toBeGreaterThanOrEqual(5.25);
    expect(metrics.fortyYardDash).toBeLessThanOrEqual(5.55);
  });

  it('bench reps in [30, 40] for OL with strength (runBlock) >= 90 (elite)', () => {
    const prospect = makeProspect({
      pos: 'OL',
      ratings: { speed: 50, agility: 50, acceleration: 50, runBlock: 92, passRushPower: 60, trucking: 60 },
    });
    const metrics = generateCombineMetrics(prospect, 2024);
    expect(metrics.benchPressReps).toBeGreaterThanOrEqual(30);
    expect(metrics.benchPressReps).toBeLessThanOrEqual(40);
  });

  it('bench reps in [5, 12] for WR with all strength attrs < 50 (below tier)', () => {
    const prospect = makeProspect({
      pos: 'WR',
      ratings: { speed: 70, agility: 70, acceleration: 70, runBlock: 40, passRushPower: 40, trucking: 40 },
    });
    const metrics = generateCombineMetrics(prospect, 2024);
    expect(metrics.benchPressReps).toBeGreaterThanOrEqual(5);
    expect(metrics.benchPressReps).toBeLessThanOrEqual(12);
  });

  it('is deterministic — same prospect + same season yields identical metrics', () => {
    const prospect = makeProspect({ id: 42, trueOvr: 80 });
    const first  = generateCombineMetrics(prospect, 2025);
    const second = generateCombineMetrics(prospect, 2025);
    expect(first).toEqual(second);
  });

  it('does not call Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    const prospect = makeProspect({ id: 7, trueOvr: 77 });
    generateCombineMetrics(prospect, 2025);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// computeCombineGrade
// ---------------------------------------------------------------------------
describe('computeCombineGrade', () => {
  it('returns a value in [0, 10] for speed group metrics', () => {
    const metrics = { fortyYardDash: 4.50, threeCone: 6.90, benchPressReps: 15, verticalJump: 32 };
    const grade = computeCombineGrade(metrics, 'WR');
    expect(grade).toBeGreaterThanOrEqual(0);
    expect(grade).toBeLessThanOrEqual(10);
  });

  it('returns a value in [0, 10] for big_skill group metrics', () => {
    const metrics = { fortyYardDash: 4.75, threeCone: 7.10, benchPressReps: 18, verticalJump: 30 };
    const grade = computeCombineGrade(metrics, 'QB');
    expect(grade).toBeGreaterThanOrEqual(0);
    expect(grade).toBeLessThanOrEqual(10);
  });

  it('returns a value in [0, 10] for linemen group metrics', () => {
    const metrics = { fortyYardDash: 5.00, threeCone: 7.60, benchPressReps: 25, verticalJump: 28 };
    const grade = computeCombineGrade(metrics, 'OL');
    expect(grade).toBeGreaterThanOrEqual(0);
    expect(grade).toBeLessThanOrEqual(10);
  });

  it('returns a higher grade for elite metrics than below metrics for the same position', () => {
    const eliteMetrics = { fortyYardDash: 4.28, threeCone: 6.45, benchPressReps: 40, verticalJump: 45 };
    const belowMetrics = { fortyYardDash: 4.78, threeCone: 7.50, benchPressReps: 5,  verticalJump: 18 };
    const eliteGrade = computeCombineGrade(eliteMetrics, 'WR');
    const belowGrade = computeCombineGrade(belowMetrics, 'WR');
    expect(eliteGrade).toBeGreaterThan(belowGrade);
  });

  it('returns >= 9.5 when all metrics are at elite tier top for WR', () => {
    const eliteMetricsWR = { fortyYardDash: 4.28, threeCone: 6.45, benchPressReps: 40, verticalJump: 45 };
    expect(computeCombineGrade(eliteMetricsWR, 'WR')).toBeGreaterThanOrEqual(9.5);
  });

  it('returns <= 0.5 when all metrics are at below tier bottom for WR', () => {
    const belowMetricsWR = { fortyYardDash: 4.78, threeCone: 7.50, benchPressReps: 5, verticalJump: 18 };
    expect(computeCombineGrade(belowMetricsWR, 'WR')).toBeLessThanOrEqual(0.5);
  });
});

// ---------------------------------------------------------------------------
// generateCombineMetricsForClass
// ---------------------------------------------------------------------------
describe('generateCombineMetricsForClass', () => {
  it('does not re-generate metrics for a prospect that already has combineMetrics', () => {
    const existingMetrics = {
      fortyYardDash: 4.40,
      threeCone: 6.70,
      benchPressReps: 22,
      verticalJump: 35,
      combineGrade: 7.5,
      generatedAt: 'combine_week',
    };
    const prospect = makeProspect({ combineMetrics: existingMetrics });
    const [result] = generateCombineMetricsForClass([prospect], 2025);
    expect(result.combineMetrics).toBe(existingMetrics); // strict reference equality — not re-created
  });

  it('does not mutate the input array', () => {
    const prospect = makeProspect({ combineMetrics: null });
    const original = [prospect];
    const copy = [...original];
    generateCombineMetricsForClass(original, 2025);
    expect(original).toHaveLength(copy.length);
    expect(original[0]).toBe(prospect); // original element reference unchanged
    expect(prospect.combineMetrics).toBeNull(); // original prospect object not mutated
  });
});

// ---------------------------------------------------------------------------
// applyPrivateWorkout
// ---------------------------------------------------------------------------
describe('applyPrivateWorkout', () => {
  it('sets workoutCompleted to true', () => {
    const prospect = makeProspect({ trueOvr: 80 });
    const result = applyPrivateWorkout(prospect, 'team_1', 2025);
    expect(result.workoutCompleted).toBe(true);
  });

  it('sets scoutedRange with low === high === trueOvr, confidence === 1.0, label === "Verified"', () => {
    const prospect = makeProspect({ trueOvr: 82 });
    const result = applyPrivateWorkout(prospect, 'team_2', 2025);
    const range = result.scoutedRanges['team_2'];
    expect(range).toBeDefined();
    expect(range.low).toBe(82);
    expect(range.high).toBe(82);
    expect(range.confidence).toBe(1.0);
    expect(range.label).toBe('Verified');
  });

  it('does not mutate the input prospect', () => {
    const prospect = makeProspect({ trueOvr: 78 });
    const originalWorkoutCompleted = prospect.workoutCompleted;
    const originalScoutedRanges = { ...prospect.scoutedRanges };
    applyPrivateWorkout(prospect, 'team_3', 2025);
    expect(prospect.workoutCompleted).toBe(originalWorkoutCompleted);
    expect(prospect.scoutedRanges).toEqual(originalScoutedRanges);
  });
});

// ---------------------------------------------------------------------------
// getAIDraftBoardAdjustment
// ---------------------------------------------------------------------------
describe('getAIDraftBoardAdjustment', () => {
  it('returns { slots: 15, reason: "athletic_freak" } for combineGrade > 8.5', () => {
    const prospect = makeProspect({ combineMetrics: { combineGrade: 9.0 } });
    expect(getAIDraftBoardAdjustment(prospect)).toEqual({ slots: 15, reason: 'athletic_freak' });
  });

  it('returns { slots: -15, reason: "combine_bust" } for combineGrade < 4.0', () => {
    const prospect = makeProspect({ combineMetrics: { combineGrade: 3.0 } });
    expect(getAIDraftBoardAdjustment(prospect)).toEqual({ slots: -15, reason: 'combine_bust' });
  });

  it('returns { slots: 0, reason: "none" } for combineGrade in [4.0, 8.5]', () => {
    const prospect = makeProspect({ combineMetrics: { combineGrade: 6.0 } });
    expect(getAIDraftBoardAdjustment(prospect)).toEqual({ slots: 0, reason: 'none' });
  });

  it('returns { slots: 0, reason: "none" } when combineMetrics is null', () => {
    const prospect = makeProspect({ combineMetrics: null });
    expect(getAIDraftBoardAdjustment(prospect)).toEqual({ slots: 0, reason: 'none' });
  });
});

// ---------------------------------------------------------------------------
// COMBINE_GRADE_THRESHOLDS — exported constant sanity check
// ---------------------------------------------------------------------------
describe('COMBINE_GRADE_THRESHOLDS', () => {
  it('exports athletic_freak threshold of 8.5', () => {
    expect(COMBINE_GRADE_THRESHOLDS.athletic_freak).toBe(8.5);
  });

  it('exports bust threshold of 4.0', () => {
    expect(COMBINE_GRADE_THRESHOLDS.bust).toBe(4.0);
  });
});
