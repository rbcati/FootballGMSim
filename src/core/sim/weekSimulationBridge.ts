import type { AttributesV2, Player } from '../../types/player.ts';
import { ensureAttributesV2 } from '../migration/attributeMigrator.ts';
import { getEffectivePlayerForRole } from './positionalMultipliers.js';
import type { GameSummary, Matchup, SimulationManager } from '../../worker/WorkerPool.ts';
import { DEPTH_CHART_ROWS, getCanonicalScrimmageAssignment, getPlayerScrimmageUnitRow, getScrimmageDepthAssignment, getScrimmageDepthRow } from '../depthChart.js';
import { FOOTBALL_ROSTER_CONFIG } from '../sports/footballRosterConfig.js';
import { isAvailableForGameDay } from '../holdouts/holdoutEngine.js';

const OFFENSE_KEYS: Array<keyof AttributesV2> = [
  'throwAccuracyShort', 'throwAccuracyDeep', 'throwPower', 'release', 'routeRunning', 'separation',
  'catchInTraffic', 'ballTracking', 'decisionMaking', 'pocketPresence', 'passBlockFootwork', 'passBlockStrength',
];
const DEFENSE_KEYS: Array<keyof AttributesV2> = ['passRush', 'pressCoverage', 'zoneCoverage'];

const OFFENSE_PRIORITY = ['QB', 'WR', 'TE', 'RB', 'OL', 'LT', 'LG', 'C', 'RG', 'RT'];
const DEFENSE_PRIORITY = DEPTH_CHART_ROWS
  .filter((row) => row.group === 'DEFENSE')
  .map((row) => row.key);

export interface AggregatedTeamUnits {
  offense: AttributesV2;
  defense: AttributesV2;
  migratedPlayers: Array<{ id: number | string; attributesV2: AttributesV2 }>;
  selectedUnitPlayerIds: { offense: Array<number | string>; defense: Array<number | string> };
}

export function buildEligibleGameDayRoster(roster: Player[] = [], teamId?: number | string | null): Player[] {
  return roster.filter((player) => isAvailableForGameDay(player, teamId == null ? {} : { teamId }));
}

interface UnitPlayerMetadata {
  rowKey: string | null;
  depthOrder: number;
  eligibleForGroup: boolean;
}

function stablePlayerSort(a: Player, b: Player, metadata: (player: Player) => UnitPlayerMetadata): number {
  const depthDelta = metadata(a).depthOrder - metadata(b).depthOrder;
  if (depthDelta !== 0) return depthDelta;
  const ovrDelta = Number(b?.ovr ?? b?.ratings?.overall ?? b?.ratings?.ovr ?? 0)
    - Number(a?.ovr ?? a?.ratings?.overall ?? a?.ratings?.ovr ?? 0);
  if (ovrDelta !== 0) return ovrDelta;
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
}

function buildDefensiveRowQuotas(targetSize: number): Map<string, number> {
  const rows = DEPTH_CHART_ROWS.filter((row) => row.group === 'DEFENSE');
  const lineRows = rows.filter((row) => row.match.includes('DL'));
  const lineStarterCount = Number(FOOTBALL_ROSTER_CONFIG.groupConfig.DL?.starterCountExpected ?? lineRows.length);
  const quotas = new Map(rows.map((row) => {
    const configured = Number(FOOTBALL_ROSTER_CONFIG.groupConfig[row.key]?.starterCountExpected);
    const count = lineRows.includes(row)
      ? Math.max(1, Math.floor(lineStarterCount / Math.max(1, lineRows.length)))
      : (Number.isFinite(configured) ? configured : 1);
    return [row.key, Math.min(row.slots, count)] as const;
  }));
  let allocated = [...quotas.values()].reduce((sum, count) => sum + count, 0);
  // The canonical group counts describe 12 defensive starters. The rich unit
  // remains 11 players, so trim rotation seats from the latest rows without
  // ever removing a canonical row entirely.
  for (let index = rows.length - 1; allocated > targetSize && index >= 0; index -= 1) {
    const row = rows[index];
    const removable = Math.min((quotas.get(row.key) ?? 1) - 1, allocated - targetSize);
    quotas.set(row.key, (quotas.get(row.key) ?? 1) - removable);
    allocated -= removable;
  }
  return quotas;
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
  group: 'OFFENSE' | 'DEFENSE',
  metadata: (player: Player) => UnitPlayerMetadata,
): Array<Player & { attributesV2: AttributesV2 }> {
  const picked: Array<Player & { attributesV2: AttributesV2 }> = [];
  const pickedIds = new Set<string>();
  const rowQuotas = group === 'DEFENSE' ? buildDefensiveRowQuotas(targetSize) : null;
  for (const pos of priority) {
    const slice = roster.filter((player) => {
      return metadata(player).rowKey === pos && !pickedIds.has(String(player.id));
    }).sort((a, b) => stablePlayerSort(a, b, metadata));
    const rowLimit = rowQuotas?.get(pos) ?? (pos === 'QB' ? 1 : 3);
    const selected = slice.slice(0, rowLimit);
    picked.push(...selected);
    selected.forEach((player) => pickedIds.add(String(player.id)));
    if (!rowQuotas && picked.length >= targetSize) break;
  }

  if (picked.length < targetSize) {
    const hasQuarterback = group === 'OFFENSE'
      && picked.some((player) => metadata(player).rowKey === 'QB');
    const fillers = roster
      .filter((player) => !pickedIds.has(String(player.id)))
      .filter((player) => metadata(player).eligibleForGroup)
      .filter((player) => !hasQuarterback || metadata(player).rowKey !== 'QB')
      .sort((a, b) => stablePlayerSort(a, b, metadata))
      .slice(0, targetSize - picked.length);
    picked.push(...fillers);
  }

  return picked.slice(0, targetSize);
}

export function aggregateTeamUnitsFromRoster(roster: Player[] = [], teamId?: number | string | null): AggregatedTeamUnits {
  const migratedPlayers: Array<{ id: number | string; attributesV2: AttributesV2 }> = [];
  const upgradedRoster = buildEligibleGameDayRoster(roster, teamId).map((player) => {
    const upgraded = ensureAttributesV2(player);
    if (!player.attributesV2 && player.id != null) {
      migratedPlayers.push({ id: player.id, attributesV2: upgraded.attributesV2 });
    }
    return upgraded as Player & { attributesV2: AttributesV2 };
  });

  const metadataFor = (group: 'OFFENSE' | 'DEFENSE') => {
    const cache = new WeakMap<Player, UnitPlayerMetadata>();
    return (player: Player) => {
      const cached = cache.get(player);
      if (cached) return cached;
      const canonicalAssignment = getCanonicalScrimmageAssignment(player);
      const canonicalRow = canonicalAssignment
        ? DEPTH_CHART_ROWS.find((row) => row.key === canonicalAssignment.rowKey)
        : null;
      const metadata = {
        rowKey: getPlayerScrimmageUnitRow(player, group)?.key ?? null,
        depthOrder: getScrimmageDepthAssignment(player, group)?.order ?? 9999,
        eligibleForGroup: !canonicalRow || canonicalRow.group === group,
      };
      cache.set(player, metadata);
      return metadata;
    };
  };

  const applyGroupRole = (players: Array<Player & { attributesV2: AttributesV2 }>, group: 'OFFENSE' | 'DEFENSE') => players.map((player) => {
    // Eligibility controls starter authority; row identity independently
    // preserves canonical out-of-position effective-rating penalties.
    const assignedRow = getScrimmageDepthRow(player, group);
    const effective = getEffectivePlayerForRole(
      { ...player, ...player.attributesV2 },
      assignedRow?.key ?? String(player.pos ?? ''),
    );
    const attributesV2 = Object.fromEntries(
      Object.keys(player.attributesV2).map((key) => [key, effective[key] ?? player.attributesV2[key]]),
    ) as unknown as AttributesV2;
    return { ...player, attributesV2 };
  });

  const offenseMetadata = metadataFor('OFFENSE');
  const defenseMetadata = metadataFor('DEFENSE');
  const selectedOffense = pickUnitPlayers(upgradedRoster, OFFENSE_PRIORITY, 11, 'OFFENSE', offenseMetadata);
  const selectedDefense = pickUnitPlayers(upgradedRoster, DEFENSE_PRIORITY, 11, 'DEFENSE', defenseMetadata);
  const offensePlayers = applyGroupRole(selectedOffense, 'OFFENSE');
  const defensePlayers = applyGroupRole(selectedDefense, 'DEFENSE');

  return {
    offense: aggregateForKeys(offensePlayers, OFFENSE_KEYS),
    defense: aggregateForKeys(defensePlayers, DEFENSE_KEYS),
    migratedPlayers,
    selectedUnitPlayerIds: {
      offense: selectedOffense.map((player) => player.id),
      defense: selectedDefense.map((player) => player.id),
    },
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
  const homePassRate = Number((summary.teamStats.home.passAtt / Math.max(1, summary.teamStats.home.plays)).toFixed(3));
  const awayPassRate = Number((summary.teamStats.away.passAtt / Math.max(1, summary.teamStats.away.plays)).toFixed(3));

  return {
    gameId: summary.gameId,
    home: summary.homeTeamId,
    away: summary.awayTeamId,
    homeId: summary.homeTeamId,
    awayId: summary.awayTeamId,
    scoreHome: summary.homeScore,
    scoreAway: summary.awayScore,
    homeScore: summary.homeScore,
    awayScore: summary.awayScore,
    recapText: summary.recapText ?? (summary.topReason1 ? `${summary.topReason1}. ${summary.topReason2 ?? ''}`.trim() : null),
    recap: summary.recapText ?? null,
    overtime: summary.overtime ?? null,
    regulationTied: summary.regulationTied ?? false,
    quarterScores: summary.quarterScores,
    driveSummary: summary.driveSummary ?? [],
    boxScore: summary.boxScore,
    playerStats: summary.boxScore,
    playLogs: summary.playLogs,
    eventDigest: summary.playDigest,
    scoringSummary: summary.scoringSummary ?? [],
    linescore: summary.quarterScores,
    teamDriveStats: summary.teamStats,
    teamStats: summary.teamStats,
    stats: {
      home: summary.boxScore.home,
      away: summary.boxScore.away,
      players: summary.boxScore,
      team: summary.teamStats,
      playLogs: summary.playLogs,
    },
    summary: {
      storyline: summary.summary?.storyline ?? (summary.topReason1 ? `Key edge: ${summary.topReason1}` : 'Simulation complete.'),
      headlineMoments: summary.summary?.headlineMoments ?? [],
      teamStats: summary.teamStats,
    },
    simFactors: {
      home: {
        qbRating: summary.simFactors?.home?.qbRating ?? Math.round(summary.homeSuccessRate * 100),
        rushYpc: summary.simFactors?.home?.rushYpc ?? Number((summary.teamStats.home.rushYd / Math.max(1, summary.teamStats.home.rushAtt)).toFixed(2)),
        successRate: summary.homeSuccessRate,
        passRate: summary.simFactors?.home?.passRate ?? homePassRate,
      },
      away: {
        qbRating: summary.simFactors?.away?.qbRating ?? Math.round(summary.awaySuccessRate * 100),
        rushYpc: summary.simFactors?.away?.rushYpc ?? Number((summary.teamStats.away.rushYd / Math.max(1, summary.teamStats.away.rushAtt)).toFixed(2)),
        successRate: summary.awaySuccessRate,
        passRate: summary.simFactors?.away?.passRate ?? awayPassRate,
      },
    },
    advancedAttribution: summary.advancedAttribution,
    shutoutFloorApplied: summary.shutoutFloorApplied,
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
