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
