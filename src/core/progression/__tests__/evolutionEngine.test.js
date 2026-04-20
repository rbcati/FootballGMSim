import { describe, expect, it } from 'vitest';
import { processOffseasonEvolution, processWeeklyEvolution } from '../evolutionEngine.ts';

function makePlayer(overrides = {}) {
  return {
    id: String(overrides.id ?? 'p1'),
    age: overrides.age ?? 23,
    pos: overrides.pos ?? 'QB',
    teamId: overrides.teamId ?? 1,
    attributesV2: {
      release: 60, routeRunning: 60, separation: 60, catchInTraffic: 60, ballTracking: 60,
      throwAccuracyShort: 60, throwAccuracyDeep: 60, throwPower: 60, decisionMaking: 60,
      pocketPresence: 60, passBlockFootwork: 60, passBlockStrength: 60, passRush: 60,
      pressCoverage: 60, zoneCoverage: 60,
      ...(overrides.attributesV2 ?? {}),
    },
    attributeXp: overrides.attributeXp ?? {},
  };
}

describe('evolutionEngine integration behaviors', () => {
  it('runs offseason evolution and returns deterministic updates', () => {
    const players = [makePlayer({ id: '1', age: 22 }), makePlayer({ id: '2', age: 33, pos: 'WR' })];
    const result = processOffseasonEvolution({
      players,
      seasonId: 2027,
      seed: 99,
      teamFocusByTeamId: { '1': { staffQuality: 85 }, '2': { staffQuality: 40 } },
    });

    expect(result.stamp).toBe('offseason:2027');
    expect(result.updates.length).toBe(2);
    expect(result.summary.processedPlayers).toBe(2);
    expect(result.summary.netDelta).not.toBe(0);
  });

  it('keeps weekly evolution functional for in-season path', () => {
    const players = [makePlayer({ id: '11', pos: 'QB' })];
    const results = [{
      home: 1,
      away: 2,
      boxScore: {
        home: { '11': { pos: 'QB', stats: { passAtt: 32, passComp: 22, passYd: 280, passTD: 2, interceptions: 1, sacks: 2 } } },
        away: {},
      },
      teamDriveStats: { home: { explosivePlays: 4 }, away: {} },
    }];

    const result = processWeeklyEvolution({ players, results, week: 5, seasonId: 2027, seed: 12345, teamFocusByTeamId: { '1': { staffQuality: 70, medicalQuality: 65, facilityQuality: 70 } } });

    expect(result.stamp).toBe('2027:5');
    expect(result.summary.processedPlayers).toBe(1);
    expect(result.updates[0].growthHistoryEntry.week).toBe(5);
  });
});
