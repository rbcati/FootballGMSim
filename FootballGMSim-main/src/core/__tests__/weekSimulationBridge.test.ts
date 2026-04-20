import { describe, expect, it, vi } from 'vitest';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import {
  aggregateTeamUnitsFromRoster,
  buildDeterministicSeed,
  mapGameSummaryToLegacyResult,
  simulateWithOptionalNewEngine,
} from '../sim/weekSimulationBridge.ts';

describe('weekSimulationBridge', () => {
  it('aggregates offense/defense units from roster players and migrates missing attributesV2', () => {
    const roster = [
      { id: 1, name: 'QB1', pos: 'QB', ovr: 90 },
      { id: 2, name: 'WR1', pos: 'WR', ovr: 88 },
      { id: 3, name: 'WR2', pos: 'WR', ovr: 84 },
      { id: 4, name: 'CB1', pos: 'CB', ovr: 85, attributesV2: mapOverallToAttributesV2(85, 5.5, 'cb1') },
      { id: 5, name: 'EDGE1', pos: 'EDGE', ovr: 86 },
    ];

    const units = aggregateTeamUnitsFromRoster(roster as any);

    expect(units.migratedPlayers.length).toBe(4);
    expect(units.offense.throwAccuracyShort).toBeGreaterThan(40);
    expect(units.defense.passRush).toBeGreaterThan(40);
  });

  it('keeps migration idempotent when attributesV2 already exists', () => {
    const attrs = mapOverallToAttributesV2(82, 5.5, 'existing-player');
    const roster = [{ id: 7, name: 'Existing', pos: 'LB', attributesV2: attrs }];

    const units = aggregateTeamUnitsFromRoster(roster as any);

    expect(units.migratedPlayers).toHaveLength(0);
    expect(units.defense.zoneCoverage).toBeGreaterThan(0);
  });

  it('falls back to legacy simulation when new path throws', async () => {
    const legacySimulate = vi.fn(async () => [{ scoreHome: 14, scoreAway: 10 }]);
    const manager = {
      simWeekParallel: vi.fn(async () => {
        throw new Error('worker unavailable');
      }),
    };

    const result = await simulateWithOptionalNewEngine({
      enabled: true,
      matchups: [],
      manager: manager as any,
      legacySimulate,
    });

    expect(result.mode).toBe('legacy');
    expect(legacySimulate).toHaveBeenCalledTimes(1);
  });

  it('maps game summaries into existing result shape', () => {
    const mapped = mapGameSummaryToLegacyResult({
      gameId: 'g1',
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 28,
      awayScore: 21,
      totalPlays: 120,
      homePassYards: 260,
      awayPassYards: 230,
      homeSuccessRate: 0.58,
      awaySuccessRate: 0.53,
      normalizationConstant: 0.74,
      topReason1: 'Pocket survived pressure',
      topReason2: 'Route leverage over zone',
      quarterScores: { home: [7, 7, 7, 7], away: [7, 7, 0, 7] },
      teamStats: {
        home: {
          plays: 62, firstDowns: 21, passAtt: 35, passComp: 23, passYd: 260, passTD: 2,
          rushAtt: 27, rushYd: 110, rushTD: 2, totalYards: 370, yardsPerPlay: 5.97,
          turnovers: 1, sacksAllowed: 2, sacksMade: 3, interceptions: 1,
          redZoneTrips: 3, redZoneScores: 2, explosivePlays: 4, successRate: 0.58,
        },
        away: {
          plays: 58, firstDowns: 18, passAtt: 31, passComp: 20, passYd: 230, passTD: 2,
          rushAtt: 27, rushYd: 93, rushTD: 1, totalYards: 323, yardsPerPlay: 5.57,
          turnovers: 2, sacksAllowed: 3, sacksMade: 2, interceptions: 1,
          redZoneTrips: 2, redZoneScores: 2, explosivePlays: 3, successRate: 0.53,
        },
      },
      boxScore: { home: {}, away: {} },
      playDigest: [],
      playLogs: [],
      summary: { storyline: 'Key edge: Pocket survived pressure', headlineMoments: [] },
      recapText: 'Home wins with late pressure.',
      simFactors: {
        home: { qbRating: 101.4, rushYpc: 4.07, successRate: 0.58, passRate: 0.565 },
        away: { qbRating: 89.1, rushYpc: 3.44, successRate: 0.53, passRate: 0.534 },
      },
    });

    expect(mapped.scoreHome).toBe(28);
    expect(mapped.boxScore).toEqual({ home: {}, away: {} });
    expect(mapped.summary.storyline).toContain('Key edge');
  });

  it('builds deterministic seeds', () => {
    expect(buildDeterministicSeed('2026:4:1:2')).toBe(buildDeterministicSeed('2026:4:1:2'));
  });
});
