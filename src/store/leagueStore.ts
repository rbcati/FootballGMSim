import type { Matchup, WeekSummary } from '../worker/WorkerPool.ts';
import { simulationManager } from '../worker/WorkerPool.ts';
import { ensureAttributesV2, type LegacyPlayerLike } from '../core/migration/attributeMigrator.ts';

export interface LeagueState {
  players: LegacyPlayerLike[];
  simLoading: {
    active: boolean;
    done: number;
    total: number;
  };
}

export function migrateLeaguePlayers(players: LegacyPlayerLike[]): LegacyPlayerLike[] {
  return players.map((player) => ensureAttributesV2(player));
}

export async function simWeek(
  matchups: Matchup[],
  setLoading: (loading: LeagueState['simLoading']) => void,
): Promise<WeekSummary> {
  setLoading({ active: true, done: 0, total: matchups.length });

  const weekSummary = await simulationManager.simWeekParallel(matchups, ({ done, total }) => {
    setLoading({ active: true, done, total });
  });

  setLoading({ active: false, done: weekSummary.completedGames, total: weekSummary.totalGames });
  return weekSummary;
}
