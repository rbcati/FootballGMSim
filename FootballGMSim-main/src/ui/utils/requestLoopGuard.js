export function buildLeagueCacheScopeKey(league) {
  if (!league) return "global";
  return `${league.seasonId ?? league.year ?? "season"}:${league.week ?? 0}`;
}

export function buildRouteRequestKey(prefix, id) {
  if (id == null || id === '') return null;
  return `${prefix}:${String(id)}`;
}

export function shouldStartRouteRequest({ requestKey, inFlightKey, lastCompletedKey, force = false }) {
  if (!requestKey) return false;
  if (force) return requestKey !== inFlightKey;
  return requestKey !== inFlightKey && requestKey !== lastCompletedKey;
}

export function shouldWarnRepeatedRouteRequest({ requestKey, previousKey, repeatCount, threshold = 4 }) {
  if (!requestKey) return false;
  const nextCount = previousKey === requestKey ? repeatCount + 1 : 1;
  return nextCount >= threshold;
}
