import { describe, expect, it } from 'vitest';
import { processWeeklyEvolution } from '../progression/evolutionEngine.ts';

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
    expect(Math.abs(vet.growthHistoryEntry.totalDelta)).toBeLessThanOrEqual(16);
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

    expect(result.summary.netDelta).toBeLessThanOrEqual(Math.max(10, Math.floor(players.length * 0.16)));
  });
});
