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
    });

    expect(mapped.scoreHome).toBe(28);
    expect(mapped.summary.storyline).toContain('Key edge');
  });

  it('builds deterministic seeds', () => {
    expect(buildDeterministicSeed('2026:4:1:2')).toBe(buildDeterministicSeed('2026:4:1:2'));
  });
});
