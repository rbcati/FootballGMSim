/**
 * Resolves a display name for a player from the best available source.
 *
 * Resolution order:
 *   a. stat row .name or .playerName (already in archived data)
 *   b. league player map by numeric/string playerId
 *   e. safe fallback "Player #<id>" — never blank/undefined
 */
const PLACEHOLDER_PATTERNS = [/^player\s*#?\s*\d+$/i, /^unknown$/i, /^unknown player$/i, /^n\/?a$/i, /^--+$/];

function isRealName(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function resolvePlayerName(playerId, { row, playerMap } = {}) {
  const rowName = row?.name ?? row?.playerName;
  if (isRealName(rowName)) return rowName.trim();
  if (playerId != null && playerMap) {
    const found = playerMap[String(playerId)];
    if (isRealName(found?.name)) return found.name.trim();
  }
  if (playerId != null) return `Player #${playerId}`;
  return 'Player';
}

/**
 * Builds a flat { [String(id)]: playerObject } map from all team rosters in league.
 * Handles league.teams[].roster and league.teams[].players array shapes.
 */
function putPlayer(map, player) {
  if (player?.id == null) return;
  const key = String(player.id);
  const current = map[key];
  if (!current || !isRealName(current?.name)) map[key] = player;
}

export function buildLeaguePlayerMap(league, archivedGame = null) {
  const map = {};
  for (const team of (league?.teams ?? [])) {
    for (const player of (team?.roster ?? team?.players ?? [])) putPlayer(map, player);
  }
  for (const fa of (league?.freeAgents ?? league?.freeAgencyPool ?? [])) putPlayer(map, fa);
  const sides = [archivedGame?.playerSnapshots?.home, archivedGame?.playerSnapshots?.away, archivedGame?.playerStats?.home, archivedGame?.playerStats?.away];
  for (const side of sides) {
    for (const [id, row] of Object.entries(side ?? {})) {
      if (!map[String(id)] && isRealName(row?.name ?? row?.playerName)) {
        map[String(id)] = { id, name: (row?.name ?? row?.playerName).trim() };
      }
    }
  }
  return map;
}
