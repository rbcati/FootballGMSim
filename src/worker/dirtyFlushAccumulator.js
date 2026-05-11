function emptyDirtySnapshot() {
  return {
    meta: false,
    teams: [],
    players: [],
    games: [],
    seasonStats: [],
    draftPicks: [],
  };
}

function uniqueConcat(a = [], b = []) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];
}

export function hasDirtySnapshot(dirty = null) {
  return !!(
    dirty?.meta ||
    dirty?.teams?.length ||
    dirty?.players?.length ||
    dirty?.games?.length ||
    dirty?.seasonStats?.length ||
    dirty?.draftPicks?.length
  );
}

export function mergeDirtySnapshots(...snapshots) {
  const merged = emptyDirtySnapshot();
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    merged.meta = merged.meta || !!snapshot.meta;
    merged.teams = uniqueConcat(merged.teams, snapshot.teams);
    merged.players = uniqueConcat(merged.players, snapshot.players);
    merged.games = [...merged.games, ...(Array.isArray(snapshot.games) ? snapshot.games : [])];
    merged.seasonStats = uniqueConcat(merged.seasonStats, snapshot.seasonStats);
    merged.draftPicks = uniqueConcat(merged.draftPicks, snapshot.draftPicks);
  }
  return merged;
}

export function queueDirtySnapshot(currentPending, dirty) {
  return mergeDirtySnapshots(currentPending, dirty);
}

export function createEmptyDirtySnapshot() {
  return emptyDirtySnapshot();
}
