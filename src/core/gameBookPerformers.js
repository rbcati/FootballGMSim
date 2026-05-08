/**
 * Top performer labels for Game Book / Weekly Results (stats-based only).
 */

const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function playerName(player) {
  return player?.name ?? player?.playerName ?? 'Unknown player';
}

function bestBy(players, keys) {
  let best = null;
  let bestValue = -Infinity;
  for (const player of players) {
    for (const key of keys) {
      const value = n(player?.stats?.[key]);
      if (value != null && value > bestValue) {
        best = { player, key, value };
        bestValue = value;
      }
    }
  }
  return bestValue > 0 ? best : null;
}

function formatOffense(best) {
  if (!best) return null;
  const { player, key, value } = best;
  if (key === 'passYd') return `${playerName(player)} — ${value} pass yds${n(player?.stats?.passTD) != null ? `, ${player.stats.passTD} TD` : ''}`;
  if (key === 'rushYd') return `${playerName(player)} — ${value} rush yds${n(player?.stats?.rushTD) != null ? `, ${player.stats.rushTD} TD` : ''}`;
  if (key === 'recYd') return `${playerName(player)} — ${value} rec yds${n(player?.stats?.recTD) != null ? `, ${player.stats.recTD} TD` : ''}`;
  return `${playerName(player)} — ${value}`;
}

function formatDefense(best) {
  if (!best) return null;
  const { player, key, value } = best;
  if (key === 'sacks') return `${playerName(player)} — ${value} sacks${n(player?.stats?.tackles) != null ? `, ${player.stats.tackles} tackles` : ''}`;
  if (key === 'interceptions') return `${playerName(player)} — ${value} INT${value === 1 ? '' : 's'}${n(player?.stats?.tackles) != null ? `, ${player.stats.tackles} tackles` : ''}`;
  if (key === 'tackles') return `${playerName(player)} — ${value} tackles`;
  return `${playerName(player)} — ${value}`;
}

export function getTopPerformers(vm) {
  const players = [...(vm?.playerTables?.away ?? []), ...(vm?.playerTables?.home ?? [])];
  const offenseBest = bestBy(players, ['passYd', 'rushYd', 'recYd']);
  const defenseBest = bestBy(players, ['sacks', 'interceptions', 'tackles']);
  const offense = formatOffense(offenseBest);
  const defense = formatDefense(defenseBest);
  return {
    offense: offense ?? 'Offensive player stats were not recorded.',
    defense: defense ?? 'Defensive player stats were not recorded.',
    offensePlayer: offenseBest?.player ?? null,
    defensePlayer: defenseBest?.player ?? null,
    offenseStatKey: offenseBest?.key ?? null,
    defenseStatKey: defenseBest?.key ?? null,
    hasOffense: Boolean(offense),
    hasDefense: Boolean(defense),
  };
}

/**
 * Serializable snapshot for persistence (completed game result).
 */
export function snapshotTopPerformers(vm) {
  const live = getTopPerformers(vm);
  const snap = (p, side, role) => {
    if (!p) return null;
    return {
      role,
      side,
      playerId: p.playerId ?? p.id ?? null,
      teamId: p.teamId ?? null,
      name: p.name ?? null,
      pos: p.pos ?? null,
    };
  };
  return {
    offense: snap(live.offensePlayer, 'combined', 'offense'),
    defense: snap(live.defensePlayer, 'combined', 'defense'),
    offenseLabel: live.hasOffense ? live.offense : null,
    defenseLabel: live.hasDefense ? live.defense : null,
  };
}
