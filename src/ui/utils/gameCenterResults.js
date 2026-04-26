function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getGameLifecycleBucket(game) {
  if (!game || typeof game !== 'object') return 'upcoming';
  if (game.played || safeNumber(game?.homeScore) != null || safeNumber(game?.awayScore) != null) return 'completed';
  if (game?.inProgress || game?.status === 'live' || game?.status === 'in_progress') return 'live';
  return 'upcoming';
}

export function deriveCompactResultRecap(game, { awayTeam, homeTeam } = {}) {
  const awayAbbr = awayTeam?.abbr ?? 'AWY';
  const homeAbbr = homeTeam?.abbr ?? 'HME';
  const richStoryline = game?.summary?.storyline
    ?? game?.summary?.headline
    ?? game?.summary?.standout
    ?? game?.recap
    ?? game?.topReason1
    ?? game?.headline;
  if (typeof richStoryline === 'string' && richStoryline.trim()) return richStoryline.trim();

  const awayScore = safeNumber(game?.awayScore);
  const homeScore = safeNumber(game?.homeScore);
  if (awayScore == null || homeScore == null) {
    return `${awayAbbr} at ${homeAbbr} is upcoming.`;
  }

  if (awayScore === homeScore) {
    return `${awayAbbr} and ${homeAbbr} finished level at ${awayScore}-${homeScore}.`;
  }

  const winnerAbbr = awayScore > homeScore ? awayAbbr : homeAbbr;
  const margin = Math.abs(awayScore - homeScore);
  return `${winnerAbbr} won by ${margin} (${awayScore}-${homeScore}).`;
}

export function selectWeekGames(schedule, week) {
  if (!Array.isArray(schedule?.weeks)) return [];
  const row = schedule.weeks.find((entry) => Number(entry?.week) === Number(week));
  return Array.isArray(row?.games) ? row.games : [];
}

function hasCompletedGame(games = []) {
  return games.some((game) => getGameLifecycleBucket(game) === 'completed');
}

export function resolveDefaultResultsWeek(schedule, { initialWeek, currentWeek = 1 } = {}) {
  const parsedInitialWeek = Number(initialWeek);
  if (Number.isFinite(parsedInitialWeek) && parsedInitialWeek >= 1) return parsedInitialWeek;

  if (!Array.isArray(schedule?.weeks) || !schedule.weeks.length) {
    const fallback = Number(currentWeek);
    return Number.isFinite(fallback) && fallback >= 1 ? fallback : 1;
  }

  const normalizedWeeks = schedule.weeks
    .map((row) => ({ week: Number(row?.week), games: Array.isArray(row?.games) ? row.games : [] }))
    .filter((row) => Number.isFinite(row.week) && row.week >= 1)
    .sort((a, b) => a.week - b.week);

  if (!normalizedWeeks.length) return 1;

  const parsedCurrentWeek = Number(currentWeek);
  const effectiveCurrentWeek = Number.isFinite(parsedCurrentWeek) && parsedCurrentWeek >= 1
    ? parsedCurrentWeek
    : normalizedWeeks[normalizedWeeks.length - 1].week;
  const currentRow = normalizedWeeks.find((row) => row.week === effectiveCurrentWeek);

  if (currentRow && hasCompletedGame(currentRow.games)) return currentRow.week;

  for (let i = normalizedWeeks.length - 1; i >= 0; i -= 1) {
    const row = normalizedWeeks[i];
    if (row.week > effectiveCurrentWeek) continue;
    if (hasCompletedGame(row.games)) return row.week;
  }

  const closest = normalizedWeeks.find((row) => row.week >= effectiveCurrentWeek) ?? normalizedWeeks[normalizedWeeks.length - 1];
  return closest?.week ?? 1;
}
