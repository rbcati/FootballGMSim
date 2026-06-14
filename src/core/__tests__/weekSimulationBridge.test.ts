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

  it('applies severe out-of-position penalties when depth assignment is known', () => {
    const qbAttrs = mapOverallToAttributesV2(90, 5.5, 'qb');
    const wrAttrs = mapOverallToAttributesV2(90, 5.5, 'wr');
    const roster = [
      { id: 1, name: 'Natural QB', pos: 'QB', attributesV2: qbAttrs, depthChart: { rowKey: 'QB', order: 1 } },
      { id: 2, name: 'Wrong QB', pos: 'WR', attributesV2: wrAttrs, depthChart: { rowKey: 'QB', order: 1 } },
    ];

    const natural = aggregateTeamUnitsFromRoster([roster[0]] as any);
    const mismatch = aggregateTeamUnitsFromRoster([roster[1]] as any);

    expect(mismatch.offense.throwAccuracyShort).toBeLessThanOrEqual(natural.offense.throwAccuracyShort);
    expect(mismatch.offense.throwPower).toBeLessThan(natural.offense.throwPower);
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
      scoringSummary: [{ id: 'score_1', quarter: 1, clock: '12:00', teamId: 1, teamAbbr: 'HME', type: 'Touchdown', scoreType: 'touchdown', points: 7, text: 'TD', scoreAfter: { home: 7, away: 0 } }],
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
    expect(mapped.playerStats).toEqual({ home: {}, away: {} });
    expect(mapped.teamStats.home.totalYards).toBe(370);
    expect(mapped.scoringSummary).toHaveLength(1);
    expect(mapped.summary.storyline).toContain('Key edge');
  });

  it('builds deterministic seeds', () => {
    expect(buildDeterministicSeed('2026:4:1:2')).toBe(buildDeterministicSeed('2026:4:1:2'));
  });

  it('carries advancedAttribution from rich summary into bridge result', () => {
    const advancedAttribution = {
      'qb-1': { targets: 0, receptionsAllowed: 0, coverageTargets: 0, coverageCompletionsAllowed: 0, drops: 2, battedPasses: 1, sacksAllowed: 3, sacksMade: 0 },
    };
    const mapped = mapGameSummaryToLegacyResult({
      gameId: 'g-adv',
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 21,
      awayScore: 14,
      totalPlays: 110,
      homePassYards: 240,
      awayPassYards: 200,
      homeSuccessRate: 0.55,
      awaySuccessRate: 0.50,
      normalizationConstant: 0.74,
      topReason1: null,
      topReason2: null,
      quarterScores: { home: [7, 0, 7, 7], away: [7, 7, 0, 0] },
      teamStats: {
        home: { plays: 60, passAtt: 30, passComp: 20, passYd: 240, rushAtt: 30, rushYd: 110, passTD: 1, rushTD: 2, totalYards: 350, yardsPerPlay: 5.8, turnovers: 0, sacksAllowed: 1, sacksMade: 2, interceptions: 0, redZoneTrips: 3, redZoneScores: 2, explosivePlays: 3, successRate: 0.55, firstDowns: 18, fieldGoalsMade: 0, fieldGoalsAttempted: 0, extraPointsMade: 3, extraPointsAttempted: 3, punts: 4, puntYards: 160, kickReturns: 3, kickReturnYards: 60, puntReturns: 2, puntReturnYards: 18 },
        away: { plays: 58, passAtt: 28, passComp: 18, passYd: 200, rushAtt: 30, rushYd: 90, passTD: 1, rushTD: 1, totalYards: 290, yardsPerPlay: 5.0, turnovers: 1, sacksAllowed: 2, sacksMade: 1, interceptions: 1, redZoneTrips: 2, redZoneScores: 1, explosivePlays: 2, successRate: 0.50, firstDowns: 15, fieldGoalsMade: 1, fieldGoalsAttempted: 1, extraPointsMade: 2, extraPointsAttempted: 2, punts: 5, puntYards: 200, kickReturns: 2, kickReturnYards: 44, puntReturns: 1, puntReturnYards: 8 },
      },
      boxScore: { home: {}, away: {} },
      playDigest: [],
      scoringSummary: [],
      playLogs: [],
      summary: { storyline: 'Solid win.', headlineMoments: [] },
      recapText: 'Home holds on.',
      regulationTied: false,
      overtime: { played: false, periods: 0, decidedBy: null },
      shutoutFloorApplied: { home: false, away: false },
      advancedAttribution,
      simFactors: {
        home: { qbRating: 95.0, rushYpc: 3.67, successRate: 0.55, passRate: 0.5 },
        away: { qbRating: 85.0, rushYpc: 3.0, successRate: 0.50, passRate: 0.483 },
      },
    } as any);

    expect(mapped.advancedAttribution).toEqual(advancedAttribution);
  });

  it('carries shutoutFloorApplied from rich summary into bridge result', () => {
    const mapped = mapGameSummaryToLegacyResult({
      gameId: 'g-shutout',
      homeTeamId: 10,
      awayTeamId: 20,
      homeScore: 17,
      awayScore: 3,
      totalPlays: 100,
      homePassYards: 200,
      awayPassYards: 150,
      homeSuccessRate: 0.52,
      awaySuccessRate: 0.44,
      normalizationConstant: 0.74,
      topReason1: null,
      topReason2: null,
      quarterScores: { home: [7, 0, 10, 0], away: [0, 0, 0, 3] },
      teamStats: {
        home: { plays: 55, passAtt: 25, passComp: 15, passYd: 200, rushAtt: 30, rushYd: 120, passTD: 1, rushTD: 2, totalYards: 320, yardsPerPlay: 5.8, turnovers: 0, sacksAllowed: 1, sacksMade: 3, interceptions: 0, redZoneTrips: 3, redZoneScores: 3, explosivePlays: 2, successRate: 0.52, firstDowns: 16, fieldGoalsMade: 0, fieldGoalsAttempted: 0, extraPointsMade: 3, extraPointsAttempted: 3, punts: 3, puntYards: 120, kickReturns: 2, kickReturnYards: 40, puntReturns: 1, puntReturnYards: 6 },
        away: { plays: 52, passAtt: 24, passComp: 14, passYd: 150, rushAtt: 28, rushYd: 70, passTD: 0, rushTD: 0, totalYards: 220, yardsPerPlay: 4.2, turnovers: 2, sacksAllowed: 3, sacksMade: 1, interceptions: 2, redZoneTrips: 1, redZoneScores: 0, explosivePlays: 1, successRate: 0.44, firstDowns: 11, fieldGoalsMade: 1, fieldGoalsAttempted: 1, extraPointsMade: 0, extraPointsAttempted: 0, punts: 6, puntYards: 252, kickReturns: 3, kickReturnYards: 63, puntReturns: 2, puntReturnYards: 12 },
      },
      boxScore: { home: {}, away: {} },
      playDigest: [],
      scoringSummary: [],
      playLogs: [],
      summary: { storyline: 'Home dominates.', headlineMoments: [] },
      recapText: 'Home wins big.',
      regulationTied: false,
      overtime: { played: false, periods: 0, decidedBy: null },
      shutoutFloorApplied: { home: false, away: true },
      simFactors: {
        home: { qbRating: 92.0, rushYpc: 4.0, successRate: 0.52, passRate: 0.455 },
        away: { qbRating: 72.0, rushYpc: 2.5, successRate: 0.44, passRate: 0.462 },
      },
    } as any);

    expect(mapped.shutoutFloorApplied).toEqual({ home: false, away: true });
  });
});
