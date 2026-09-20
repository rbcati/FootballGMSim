import { clearWeeklyPrepForWeek } from './weeklyPrep.js';
import { getLeagueIdentity } from './leagueIdentity.js';

export function buildWeeklyPrepMarker(league) {
  const activeLeagueId = getLeagueIdentity(league);
  if (!activeLeagueId) return null;
  return {
    activeLeagueId,
    seasonId: league?.seasonId ?? league?.year ?? 'season',
    week: league?.week ?? 0,
    userTeamId: league?.userTeamId ?? 'user',
  };
}

function isSameWeeklyPrepCoordinate(previous, current) {
  return previous.seasonId === current.seasonId
    && Number(previous.week) === Number(current.week)
    && String(previous.userTeamId) === String(current.userTeamId);
}

export function transitionWeeklyPrep(previous, league, clearPrep = clearWeeklyPrepForWeek) {
  const current = buildWeeklyPrepMarker(league);
  if (!current) return previous;
  if (
    previous
    && previous.activeLeagueId === current.activeLeagueId
    && !isSameWeeklyPrepCoordinate(previous, current)
  ) {
    clearPrep(previous);
  }
  return current;
}
