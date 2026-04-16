import type { AttributesV2, Player } from '../../types/player.ts';
import { ensureAttributesV2 } from '../migration/attributeMigrator.ts';
import type { GameSummary, Matchup, SimulationManager } from '../../worker/WorkerPool.ts';

const OFFENSE_KEYS: Array<keyof AttributesV2> = [
  'throwAccuracyShort', 'throwAccuracyDeep', 'throwPower', 'release', 'routeRunning', 'separation',
  'catchInTraffic', 'ballTracking', 'decisionMaking', 'pocketPresence', 'passBlockFootwork', 'passBlockStrength',
];
const DEFENSE_KEYS: Array<keyof AttributesV2> = ['passRush', 'pressCoverage', 'zoneCoverage'];

const OFFENSE_PRIORITY = ['QB', 'WR', 'TE', 'RB', 'OL', 'LT', 'LG', 'C', 'RG', 'RT'];
const DEFENSE_PRIORITY = ['EDGE', 'DE', 'DT', 'LB', 'CB', 'S', 'FS', 'SS'];

export interface AggregatedTeamUnits {
  offense: AttributesV2;
  defense: AttributesV2;
  migratedPlayers: Array<{ id: number | string; attributesV2: AttributesV2 }>;
}

function stablePlayerSort(a: Player, b: Player): number {
  const ovrDelta = Number(b?.ovr ?? b?.ratings?.overall ?? b?.ratings?.ovr ?? 0)
    - Number(a?.ovr ?? a?.ratings?.overall ?? a?.ratings?.ovr ?? 0);
  if (ovrDelta !== 0) return ovrDelta;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

function aggregateForKeys(players: Array<Player & { attributesV2: AttributesV2 }>, keys: Array<keyof AttributesV2>): AttributesV2 {
  const base = players.length > 0 ? players : [{ attributesV2: ensureAttributesV2({ id: 'fallback', ovr: 60 }).attributesV2 } as Player & { attributesV2: AttributesV2 }];
  const values = {} as Record<keyof AttributesV2, number>;

  const allKeys: Array<keyof AttributesV2> = [...new Set([...OFFENSE_KEYS, ...DEFENSE_KEYS])];
  for (const key of allKeys) {
    if (!keys.includes(key)) {
      values[key] = 50;
      continue;
    }
    const sum = base.reduce((acc, player) => acc + Number(player.attributesV2[key] ?? 50), 0);
    values[key] = Math.round(sum / base.length);
  }

  return values as AttributesV2;
}

function pickUnitPlayers(
  roster: Array<Player & { attributesV2: AttributesV2 }>,
  priority: string[],
  targetSize = 11,
): Array<Player & { attributesV2: AttributesV2 }> {
  const picked: Array<Player & { attributesV2: AttributesV2 }> = [];
  for (const pos of priority) {
    const slice = roster.filter((player) => String(player.pos ?? '').toUpperCase() === pos).sort(stablePlayerSort);
    picked.push(...slice.slice(0, pos === 'QB' ? 1 : 3));
    if (picked.length >= targetSize) break;
  }

  if (picked.length < targetSize) {
    const pickedIds = new Set(picked.map((player) => String(player.id)));
    const fillers = roster
      .filter((player) => !pickedIds.has(String(player.id)))
      .sort(stablePlayerSort)
      .slice(0, targetSize - picked.length);
    picked.push(...fillers);
  }

  return picked.slice(0, targetSize);
}

export function aggregateTeamUnitsFromRoster(roster: Player[] = []): AggregatedTeamUnits {
  const migratedPlayers: Array<{ id: number | string; attributesV2: AttributesV2 }> = [];
  const upgradedRoster = roster
    .map((player) => {
      const upgraded = ensureAttributesV2(player);
      if (!player.attributesV2 && player.id != null) {
        migratedPlayers.push({ id: player.id, attributesV2: upgraded.attributesV2 });
      }
      return upgraded as Player & { attributesV2: AttributesV2 };
    })
    .sort(stablePlayerSort);

  const offensePlayers = pickUnitPlayers(upgradedRoster, OFFENSE_PRIORITY, 11);
  const defensePlayers = pickUnitPlayers(upgradedRoster, DEFENSE_PRIORITY, 11);

  return {
    offense: aggregateForKeys(offensePlayers, OFFENSE_KEYS),
    defense: aggregateForKeys(defensePlayers, DEFENSE_KEYS),
    migratedPlayers,
  };
}

export function buildDeterministicSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function mapGameSummaryToLegacyResult(summary: GameSummary) {
  return {
    gameId: summary.gameId,
    home: summary.homeTeamId,
    away: summary.awayTeamId,
    scoreHome: summary.homeScore,
    scoreAway: summary.awayScore,
    recapText: summary.topReason1 ? `${summary.topReason1}. ${summary.topReason2 ?? ''}`.trim() : null,
    summary: {
      storyline: summary.topReason1 ? `Key edge: ${summary.topReason1}` : 'Simulation complete.',
    },
    simFactors: {
      home: { qbRating: Math.round(summary.homeSuccessRate * 100), rushYpc: Number((summary.homePassYards / Math.max(1, summary.totalPlays / 2)).toFixed(2)) },
      away: { qbRating: Math.round(summary.awaySuccessRate * 100), rushYpc: Number((summary.awayPassYards / Math.max(1, summary.totalPlays / 2)).toFixed(2)) },
    },
  };
}

export async function simulateWithOptionalNewEngine({
  enabled,
  matchups,
  manager,
  legacySimulate,
  onProgress,
  onError,
}: {
  enabled: boolean;
  matchups: Matchup[];
  manager: Pick<SimulationManager, 'simWeekParallel'>;
  legacySimulate: () => Promise<any[]>;
  onProgress?: (p: { done: number; total: number; currentGameId?: Matchup['gameId'] }) => void;
  onError?: (error: unknown) => void;
}) {
  if (!enabled) {
    return { mode: 'legacy' as const, results: await legacySimulate() };
  }

  try {
    const summary = await manager.simWeekParallel(matchups, onProgress);
    return { mode: 'new' as const, results: summary.results.map((result) => mapGameSummaryToLegacyResult(result)) };
  } catch (error) {
    onError?.(error);
    return { mode: 'legacy' as const, results: await legacySimulate() };
  }
}
