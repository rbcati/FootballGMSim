import { describe, expect, it } from 'vitest';
import { SimulationManager, type Matchup } from '../WorkerPool.ts';
import { mapOverallToAttributesV2 } from '../../core/migration/attributeMigrator.ts';

function buildMatchup(gameId: number): Matchup {
  return {
    gameId,
    homeTeamId: gameId,
    awayTeamId: gameId + 100,
    seed: gameId,
    homeOffense: mapOverallToAttributesV2(86, 5.5, `h-off-${gameId}`),
    awayOffense: mapOverallToAttributesV2(83, 5.5, `a-off-${gameId}`),
    homeDefense: mapOverallToAttributesV2(84, 5.5, `h-def-${gameId}`),
    awayDefense: mapOverallToAttributesV2(82, 5.5, `a-def-${gameId}`),
  };
}

describe('SimulationManager', () => {
  it('simulates a full week with main-thread fallback and emits progress', async () => {
    const manager = new SimulationManager();
    const progress: Array<string> = [];
    const matchups = Array.from({ length: 16 }, (_, idx) => buildMatchup(idx + 1));

    const summary = await manager.simWeekParallel(matchups, ({ done, total }) => {
      progress.push(`${done}/${total}`);
    });

    expect(summary.totalGames).toBe(16);
    expect(summary.completedGames).toBe(16);
    expect(summary.results).toHaveLength(16);
    expect(progress.at(-1)).toBe('16/16');
    expect(summary.results[0].teamStats.home.plays).toBeGreaterThan(0);
    expect(summary.results[0].boxScore.home).toBeTruthy();
    expect(summary.results[0].playDigest.length).toBeGreaterThan(0);
  });
});
