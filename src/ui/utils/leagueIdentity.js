/** Resolve the stable save identity carried by worker league snapshots. */
export function getLeagueIdentity(league) {
  const identity = league?.activeLeagueId ?? league?.leagueId ?? league?.id ?? null;
  if (identity == null || String(identity).trim() === '') return null;
  return String(identity);
}

/** League-scoped UI persistence must never fall back to team/season identity. */
export function getLeagueScopedStorageKey(baseKey, league) {
  const leagueId = getLeagueIdentity(league);
  return leagueId ? `${baseKey}:${encodeURIComponent(leagueId)}` : null;
}
