import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deriveWeeklyPrepState,
  getWeeklyPrepProgress,
  markWeeklyPrepStep,
  clearWeeklyPrepForWeek,
  normalizeGamePlan,
  getStoredGamePlan,
  saveStoredGamePlan,
  resetStoredGamePlan,
  GAME_PLAN_DEFAULTS,
  GAME_PLAN_PRESETS,
  recommendGamePlanPreset,
} from './weeklyPrep.js';

const league = {
  year: 2028,
  week: 6,
  seasonId: 's-2028',
  phase: 'regular',
  userTeamId: 1,
  teams: [
    {
      id: 1,
      name: 'Bears',
      abbr: 'CHI',
      wins: 4,
      losses: 1,
      ovr: 85,
      offenseRating: 84,
      defenseRating: 82,
      recentResults: ['W', 'W', 'L', 'W', 'W'],
      roster: [
        { id: 11, pos: 'QB', ovr: 86, teamId: 1, depthChart: { rowKey: 'QB' } },
        { id: 12, pos: 'RB', ovr: 80, teamId: 1, injuredWeeks: 3, depthChart: { rowKey: 'RB' } },
        { id: 13, pos: 'RB', ovr: 67, teamId: 1 },
        { id: 14, pos: 'WR', ovr: 78, teamId: 1 },
      ],
      strategies: { offSchemeId: 'WEST_COAST' },
    },
    {
      id: 2,
      name: 'Lions',
      abbr: 'DET',
      wins: 2,
      losses: 3,
      ovr: 80,
      offenseRating: 87,
      defenseRating: 74,
      recentResults: ['L', 'L', 'W', 'L', 'W'],
      ptsFor: 110,
      ptsAgainst: 145,
      roster: [],
    },
  ],
  schedule: {
    weeks: [
      { week: 6, games: [{ id: 'g6', home: { id: 1 }, away: { id: 2 }, played: false }] },
    ],
  },
};

describe('weeklyPrep', () => {
  it('resets weekly prep progress when week advances', () => {
    const bucket = new Map();
    global.window = {
      localStorage: {
        getItem: (key) => bucket.get(key) ?? null,
        setItem: (key, value) => bucket.set(key, String(value)),
        removeItem: (key) => bucket.delete(key),
      },
    };
    const scopedLeague = { seasonId: 's-reset', week: 3, userTeamId: 1 };
    markWeeklyPrepStep(scopedLeague, 'planReviewed', true);
    expect(getWeeklyPrepProgress(scopedLeague).planReviewed).toBe(true);
    clearWeeklyPrepForWeek(scopedLeague);
    expect(getWeeklyPrepProgress(scopedLeague).planReviewed).toBe(false);
    delete global.window;
  });

  it('builds opponent scout/readiness model from league context', () => {
    const prep = deriveWeeklyPrepState(league);
    expect(prep.opponentSnapshot.record).toBe('2-3');
    expect(prep.opponentStrengths.length).toBeGreaterThan(0);
    expect(prep.opponentWeaknesses.length).toBeGreaterThan(0);
    expect(prep.lineupIssues.length).toBeGreaterThan(0);
    expect(prep.recommendations.length).toBeGreaterThan(0);
    expect(prep.readinessLabel).toContain('remaining');
    expect(prep.prepMultipliers).toBeTruthy();
    expect(Array.isArray(prep.prepSummary.reasons)).toBe(true);
  });

  it('is safe with partial saves and missing opponent data', () => {
    const prep = deriveWeeklyPrepState({
      year: 2028,
      week: 1,
      userTeamId: 1,
      teams: [{ id: 1, name: 'Legacy', roster: [] }],
      schedule: { weeks: [] },
    });

    expect(prep.nextGame).toBeNull();
    expect(prep.recommendations).toEqual([]);
    expect(Array.isArray(prep.lineupIssues)).toBe(true);
    expect(prep.readinessLabel).toContain('remaining');
    expect(prep.prepSummary).toBeTruthy();
  });
});

describe('game plan write helpers', () => {
  let bucket;

  beforeEach(() => {
    bucket = new Map();
    global.window = {
      localStorage: {
        getItem: (key) => bucket.get(key) ?? null,
        setItem: (key, value) => bucket.set(key, String(value)),
        removeItem: (key) => bucket.delete(key),
      },
    };
  });

  afterEach(() => {
    delete global.window;
  });

  it('normalizeGamePlan returns defaults for empty input', () => {
    expect(normalizeGamePlan({})).toEqual({ runPassBalance: 50, aggressionLevel: 50, deepShortBalance: 50 });
  });

  it('normalizeGamePlan clamps out-of-range values', () => {
    expect(normalizeGamePlan({ runPassBalance: 150, aggressionLevel: -10, deepShortBalance: 75 })).toEqual({
      runPassBalance: 100,
      aggressionLevel: 0,
      deepShortBalance: 75,
    });
  });

  it('normalizeGamePlan replaces non-numeric fields with defaults', () => {
    expect(normalizeGamePlan({ runPassBalance: 'bad', aggressionLevel: undefined, deepShortBalance: NaN })).toEqual({
      runPassBalance: GAME_PLAN_DEFAULTS.runPassBalance,
      aggressionLevel: GAME_PLAN_DEFAULTS.aggressionLevel,
      deepShortBalance: GAME_PLAN_DEFAULTS.deepShortBalance,
    });
  });

  it('normalizeGamePlan is safe with null and undefined input', () => {
    expect(normalizeGamePlan(null)).toEqual({ runPassBalance: 50, aggressionLevel: 50, deepShortBalance: 50 });
    expect(normalizeGamePlan(undefined)).toEqual({ runPassBalance: 50, aggressionLevel: 50, deepShortBalance: 50 });
  });

  it('saveStoredGamePlan and getStoredGamePlan round-trip correctly', () => {
    saveStoredGamePlan({ runPassBalance: 65, aggressionLevel: 60, deepShortBalance: 55 });
    const plan = getStoredGamePlan();
    expect(plan.runPassBalance).toBe(65);
    expect(plan.aggressionLevel).toBe(60);
    expect(plan.deepShortBalance).toBe(55);
  });

  it('resetStoredGamePlan restores defaults', () => {
    saveStoredGamePlan({ runPassBalance: 80, aggressionLevel: 70, deepShortBalance: 65 });
    resetStoredGamePlan();
    const plan = getStoredGamePlan();
    expect(plan.runPassBalance).toBe(50);
    expect(plan.aggressionLevel).toBe(50);
    expect(plan.deepShortBalance).toBe(50);
  });

  it('does not crash when window/localStorage is unavailable', () => {
    delete global.window;
    expect(() => saveStoredGamePlan({ runPassBalance: 60 })).not.toThrow();
    expect(() => resetStoredGamePlan()).not.toThrow();
    expect(() => getStoredGamePlan()).not.toThrow();
    expect(getStoredGamePlan()).toEqual({});
  });

  it('each preset sets only the three supported fields (plus label)', () => {
    for (const [key, preset] of Object.entries(GAME_PLAN_PRESETS)) {
      const fields = Object.keys(preset).filter((k) => k !== 'label').sort();
      expect(fields).toEqual(['aggressionLevel', 'deepShortBalance', 'runPassBalance'], `preset ${key} has unexpected fields`);
    }
  });

  it('recommendGamePlanPreset maps weakSecondary to attackWeakSecondary', () => {
    expect(recommendGamePlanPreset({ prep: { insights: { weakSecondary: true } } })).toBe('attackWeakSecondary');
  });

  it('recommendGamePlanPreset maps weakRunDefense to groundControl', () => {
    expect(recommendGamePlanPreset({ prep: { insights: { weakRunDefense: true } } })).toBe('groundControl');
  });

  it('recommendGamePlanPreset maps elitePassRush to quickGame', () => {
    expect(recommendGamePlanPreset({ prep: { insights: { elitePassRush: true } } })).toBe('quickGame');
  });

  it('recommendGamePlanPreset maps explosiveOpponentOffense to conservativeUnderdog', () => {
    expect(recommendGamePlanPreset({ prep: { insights: { explosiveOpponentOffense: true } } })).toBe('conservativeUnderdog');
  });

  it('recommendGamePlanPreset defaults to balanced for balanced matchup or no insight', () => {
    expect(recommendGamePlanPreset({ prep: { insights: { balancedMatchup: true } } })).toBe('balanced');
    expect(recommendGamePlanPreset({ prep: { insights: {} } })).toBe('balanced');
    expect(recommendGamePlanPreset({})).toBe('balanced');
  });
});
