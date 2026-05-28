/**
 * Resolves a display name for a player from the best available source.
 *
 * Resolution order:
 *   a. stat row .name or .playerName (already in archived data)
 *   b. league player map by numeric/string playerId
 *   e. safe fallback "Player #<id>" — never blank/undefined
 */
export function resolvePlayerName(playerId, { row, playerMap } = {}) {
  const rowName = row?.name ?? row?.playerName;
  if (rowName && typeof rowName === 'string' && rowName.trim()) return rowName;
  if (playerId != null && playerMap) {
    const found = playerMap[String(playerId)];
    if (found?.name && typeof found.name === 'string' && found.name.trim()) return found.name;
  }
  if (playerId != null) return `Player #${playerId}`;
  return 'Player';
}

/**
 * Builds a flat { [String(id)]: playerObject } map from all team rosters in league.
 * Handles league.teams[].roster and league.teams[].players array shapes.
 */
export function buildLeaguePlayerMap(league) {
  const map = {};
  for (const team of (league?.teams ?? [])) {
    for (const player of (team?.roster ?? team?.players ?? [])) {
      if (player?.id != null) map[String(player.id)] = player;
    }
  }
  return map;
}
