import { describe, expect, it } from 'vitest';
import { processOffseasonEvolution, processWeeklyEvolution } from '../progression/evolutionEngine.ts';

function makeAttrs(value: number) {
  return {
    release: value,
    routeRunning: value,
    separation: value,
    catchInTraffic: value,
    ballTracking: value,
    throwAccuracyShort: value,
    throwAccuracyDeep: value,
    throwPower: value,
    decisionMaking: value,
    pocketPresence: value,
    passBlockFootwork: value,
    passBlockStrength: value,
    passRush: value,
    pressCoverage: value,
    zoneCoverage: value,
  };
}

const baseFocus = {
  trainingFocus: 'balanced',
  intensity: 'normal',
  drillType: 'technique',
  positionGroups: [],
  trainingLevel: 3,
  scoutingLevel: 3,
  medicalSupport: 0,
  continuityScore: 0,
  developmentPrecision: 0,
  staffBonuses: {},
};

describe('processWeeklyEvolution', () => {
  it('grows a 22-year-old starter more than a bench peer with similar talent', () => {
    const sharedAttrs = makeAttrs(74);
    const result = processWeeklyEvolution({
      week: 4,
      seasonId: 2031,
      seed: 99,
      players: [
        { id: 'starter-qb', pos: 'QB', age: 22, teamId: 1, attributesV2: sharedAttrs },
        { id: 'bench-qb', pos: 'QB', age: 22, teamId: 1, attributesV2: sharedAttrs },
      ],
      results: [
        {
          home: 1,
          away: 2,
          teamDriveStats: { home: { explosivePlays: 6 }, away: {} },
          boxScore: {
            home: {
              'starter-qb': {
                pos: 'QB',
                stats: { passAtt: 36, passComp: 27, passYd: 318, passTD: 3, interceptions: 0, sacks: 1 },
              },
              'bench-qb': {
                pos: 'QB',
                stats: { passAtt: 3, passComp: 1, passYd: 8, passTD: 0, interceptions: 0, sacks: 0 },
              },
            },
            away: {},
          },
        },
      ],
    });

    const starter = result.updates.find((row) => row.playerId === 'starter-qb');
    const bench = result.updates.find((row) => row.playerId === 'bench-qb');
    const starterGain = Object.values(starter?.growthHistoryEntry.deltas ?? {}).reduce((sum, delta) => sum + Math.max(0, Number(delta ?? 0)), 0);
    const benchGain = Object.values(bench?.growthHistoryEntry.deltas ?? {}).reduce((sum, delta) => sum + Math.max(0, Number(delta ?? 0)), 0);

    expect(starterGain).toBeGreaterThan(benchGain);
  });

  it('keeps strong older production near maintenance and can include regression pressure', () => {
    const result = processWeeklyEvolution({
      week: 8,
      seasonId: 2031,
      seed: 77,
      players: [
        { id: 'veteran-qb', pos: 'QB', age: 35, teamId: 1, attributesV2: makeAttrs(84) },
      ],
      results: [
        {
          home: 1,
          away: 2,
          teamDriveStats: { home: { explosivePlays: 5 }, away: {} },
          boxScore: {
            home: {
              'veteran-qb': {
                pos: 'QB',
                stats: { passAtt: 34, passComp: 23, passYd: 274, passTD: 2, interceptions: 1, sacks: 3 },
              },
            },
            away: {},
          },
        },
      ],
    });

    const vet = result.updates[0];
    expect(vet).toBeTruthy();
    expect(Math.abs(vet.growthHistoryEntry.totalDelta)).toBeLessThanOrEqual(4);
    const hasRegression = Object.values(vet.growthHistoryEntry.deltas).some((delta) => Number(delta ?? 0) < 0);
    expect(hasRegression).toBe(true);
  });

  it('is deterministic for same seed and same statline', () => {
    const payload = {
      week: 5,
      seasonId: 2031,
      seed: 1337,
      players: [{ id: 'wr1', pos: 'WR', age: 24, teamId: 1, attributesV2: makeAttrs(79) }],
      results: [{ home: 1, away: 2, boxScore: { home: { wr1: { pos: 'WR', stats: { targets: 12, receptions: 8, recYd: 118, recTD: 1 } } }, away: {} }, teamDriveStats: { home: { explosivePlays: 4 }, away: {} } }],
    };

    const first = processWeeklyEvolution(payload);
    const second = processWeeklyEvolution(payload);
    expect(first).toEqual(second);
  });

  it('applies a league-wide inflation guardrail in one weekly run', () => {
    const players = Array.from({ length: 64 }).map((_, idx) => ({
      id: `wr-${idx}`,
      pos: 'WR',
      age: 22,
      teamId: idx % 8,
      attributesV2: makeAttrs(70),
    }));
    const boxHome = Object.fromEntries(players.slice(0, 32).map((p) => [p.id, { pos: 'WR', stats: { targets: 14, receptions: 10, recYd: 140, recTD: 1 } }]));
    const boxAway = Object.fromEntries(players.slice(32).map((p) => [p.id, { pos: 'WR', stats: { targets: 14, receptions: 10, recYd: 140, recTD: 1 } }]));

    const result = processWeeklyEvolution({
      week: 11,
      seasonId: 2031,
      seed: 4,
      players,
      results: [{ home: 1, away: 2, boxScore: { home: boxHome, away: boxAway }, teamDriveStats: { home: { explosivePlays: 10 }, away: { explosivePlays: 10 } } }],
    });

    expect(result.summary.netDelta).toBeLessThanOrEqual(Math.max(5, Math.floor(players.length * 0.12)));
  });

  it('biases weekly growth toward the selected training focus without changing determinism', () => {
    const commonPlayer = {
      id: 'wr1',
      pos: 'WR',
      age: 22,
      teamId: 1,
      ovr: 74,
      potential: 82,
      attributesV2: makeAttrs(74),
    };
    const weeklyPayload = {
      week: 6,
      seasonId: 2031,
      seed: 901,
      players: [commonPlayer],
      results: [{
        home: 1,
        away: 2,
        boxScore: {
          home: {
            wr1: { pos: 'WR', stats: { targets: 11, receptions: 8, recYd: 124, recTD: 1 } },
          },
          away: {},
        },
        teamStats: { home: { explosivePlays: 5 }, away: {} },
      }],
    };

    const neutral = processWeeklyEvolution({
      ...weeklyPayload,
      teamFocusByTeamId: { 1: baseFocus },
    });
    const focused = processWeeklyEvolution({
      ...weeklyPayload,
      teamFocusByTeamId: {
        1: {
          ...baseFocus,
          trainingFocus: 'youth_development',
          intensity: 'hard',
          drillType: 'film',
          positionGroups: ['wr'],
          trainingLevel: 5,
          developmentPrecision: 0.18,
          continuityScore: 0.08,
          staffBonuses: {
            developmentDelta: 0.12,
            offensiveDevelopmentDelta: 0.08,
            mentorDelta: 0.06,
            rookieAdaptationDelta: 0.05,
          },
        },
      },
    });

    const neutralRouteDelta = Number(neutral.updates[0]?.growthHistoryEntry?.deltas?.routeRunning ?? 0);
    const focusedRouteDelta = Number(focused.updates[0]?.growthHistoryEntry?.deltas?.routeRunning ?? 0);
    const neutralSeparationDelta = Number(neutral.updates[0]?.growthHistoryEntry?.deltas?.separation ?? 0);
    const focusedSeparationDelta = Number(focused.updates[0]?.growthHistoryEntry?.deltas?.separation ?? 0);

    expect(focusedRouteDelta + focusedSeparationDelta).toBeGreaterThanOrEqual(neutralRouteDelta + neutralSeparationDelta);
    expect(focused).toEqual(processWeeklyEvolution({
      ...weeklyPayload,
      teamFocusByTeamId: {
        1: {
          ...baseFocus,
          trainingFocus: 'youth_development',
          intensity: 'hard',
          drillType: 'film',
          positionGroups: ['wr'],
          trainingLevel: 5,
          developmentPrecision: 0.18,
          continuityScore: 0.08,
          staffBonuses: {
            developmentDelta: 0.12,
            offensiveDevelopmentDelta: 0.08,
            mentorDelta: 0.06,
            rookieAdaptationDelta: 0.05,
          },
        },
      },
    }));
  });
});

describe('processOffseasonEvolution', () => {
  function makeHistory({
    seasonId = 2031,
    usage = 0.8,
    production = 1.2,
    totalDelta = 2,
    wearDelta = 0.8,
  } = {}) {
    return [
      {
        seasonId,
        week: 6,
        stage: 'weekly',
        stamp: `${seasonId}:6`,
        deltas: {},
        totalDelta,
        notes: [],
        usage,
        production,
        wearDelta,
        trend: 'rising',
      },
      {
        seasonId,
        week: 7,
        stage: 'weekly',
        stamp: `${seasonId}:7`,
        deltas: {},
        totalDelta,
        notes: [],
        usage,
        production,
        wearDelta,
        trend: 'rising',
      },
    ];
  }

  it('keeps young starters on a stronger growth path than similarly talented low-usage peers', () => {
    const result = processOffseasonEvolution({
      seasonId: 2031,
      year: 2031,
      seed: 55,
      teamFocusByTeamId: { 1: baseFocus },
      players: [
        {
          id: 'young-starter',
          name: 'Young Starter',
          pos: 'WR',
          age: 22,
          teamId: 1,
          ovr: 73,
          potential: 84,
          attributesV2: makeAttrs(73),
          growthHistory: makeHistory({ usage: 0.92, production: 1.45, totalDelta: 2, wearDelta: 0.9 }),
        },
        {
          id: 'young-bench',
          name: 'Young Bench',
          pos: 'WR',
          age: 22,
          teamId: 1,
          ovr: 73,
          potential: 84,
          attributesV2: makeAttrs(73),
          growthHistory: makeHistory({ usage: 0.16, production: 0.32, totalDelta: 0, wearDelta: 0.2 }),
        },
      ],
    });

    const starter = result.updates.find((row) => row.playerId === 'young-starter');
    const bench = result.updates.find((row) => row.playerId === 'young-bench');

    expect(Number(starter?.progressionDelta ?? 0)).toBeGreaterThan(Number(bench?.progressionDelta ?? 0));
  });

  it('keeps older productive veterans under maintenance or regression pressure', () => {
    const result = processOffseasonEvolution({
      seasonId: 2031,
      year: 2031,
      seed: 88,
      teamFocusByTeamId: { 1: baseFocus },
      players: [
        {
          id: 'aging-qb',
          name: 'Aging QB',
          pos: 'QB',
          age: 33,
          teamId: 1,
          ovr: 87,
          potential: 88,
          wearAndTear: 32,
          attributesV2: makeAttrs(87),
          growthHistory: makeHistory({ usage: 0.95, production: 1.6, totalDelta: 1, wearDelta: 1.4 }),
        },
      ],
    });

    expect(Number(result.updates[0]?.progressionDelta ?? 1)).toBeLessThanOrEqual(0);
  });

  it('uses medical and staff context to soften decline in bounded ways', () => {
    const player = {
      id: 'veteran-rb',
      name: 'Veteran RB',
      pos: 'RB',
      age: 32,
      teamId: 1,
      ovr: 81,
      potential: 81,
      wearAndTear: 34,
      attributesV2: makeAttrs(81),
      growthHistory: makeHistory({ usage: 0.72, production: 0.95, totalDelta: 0, wearDelta: 1.6 }),
    };

    const weakSupport = processOffseasonEvolution({
      seasonId: 2031,
      year: 2031,
      seed: 202,
      players: [player],
      teamFocusByTeamId: { 1: baseFocus },
    });
    const strongSupport = processOffseasonEvolution({
      seasonId: 2031,
      year: 2031,
      seed: 202,
      players: [player],
      teamFocusByTeamId: {
        1: {
          ...baseFocus,
          trainingFocus: 'rehab_recovery',
          medicalSupport: 0.28,
          developmentPrecision: 0.08,
          staffBonuses: {
            developmentDelta: 0.04,
            recoveryDelta: 0.14,
            injuryRateDelta: -0.08,
          },
        },
      },
    });

    expect(Number(strongSupport.updates[0]?.progressionDelta ?? -5)).toBeGreaterThanOrEqual(Number(weakSupport.updates[0]?.progressionDelta ?? 5));
    expect(Number(strongSupport.updates[0]?.wearAndTear ?? 100)).toBeLessThanOrEqual(Number(weakSupport.updates[0]?.wearAndTear ?? 0));
    expect(Math.abs(Number(strongSupport.updates[0]?.progressionDelta ?? 0) - Number(weakSupport.updates[0]?.progressionDelta ?? 0))).toBeLessThanOrEqual(2);
  });

  it('is deterministic for the same offseason seed and history', () => {
    const payload = {
      seasonId: 2031,
      year: 2031,
      seed: 404,
      teamFocusByTeamId: { 1: baseFocus },
      players: [
        {
          id: 'cb1',
          name: 'CB One',
          pos: 'CB',
          age: 24,
          teamId: 1,
          ovr: 77,
          potential: 86,
          attributesV2: makeAttrs(77),
          growthHistory: makeHistory({ usage: 0.78, production: 1.1, totalDelta: 2, wearDelta: 0.7 }),
        },
      ],
    };

    expect(processOffseasonEvolution(payload)).toEqual(processOffseasonEvolution(payload));
  });
});
