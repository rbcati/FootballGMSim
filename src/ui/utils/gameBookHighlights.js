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
  const offense = formatOffense(bestBy(players, ['passYd', 'rushYd', 'recYd']));
  const defense = formatDefense(bestBy(players, ['sacks', 'interceptions', 'tackles']));
  return {
    offense: offense ?? 'Offensive player stats were not recorded.',
    defense: defense ?? 'Defensive player stats were not recorded.',
    hasOffense: Boolean(offense),
    hasDefense: Boolean(defense),
  };
}
