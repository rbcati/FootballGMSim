import { isTradeWindowOpen } from '../core/tradeWindow.js';

export function safeGetLeagueState(league) {
  if (!league || typeof league !== 'object') {
    return {
      year: null,
      week: 1,
      phase: 'regular',
      userTeamId: null,
      teams: [],
      schedule: { weeks: [] },
      tradeDeadline: null,
    };
  }

  return {
    ...league,
    teams: Array.isArray(league?.teams) ? league.teams : [],
    schedule: league?.schedule && Array.isArray(league?.schedule?.weeks)
      ? league.schedule
      : { weeks: [] },
    week: Number(league?.week ?? 1),
    phase: league?.phase ?? 'regular',
  };
}

export function canOpenBoxScore(game) {
  if (!game || typeof game !== 'object') return false;
  const hasFinal = !!game.played || game.homeScore != null || game.awayScore != null;
  const hasId = !!(game.gameId || game.id);
  return hasFinal && hasId;
}

export function getHQViewModel(league) {
  const safe = safeGetLeagueState(league);
  const userTeam = safe.teams.find((t) => Number(t?.id) === Number(safe.userTeamId)) ?? null;
  return {
    league: safe,
    userTeam,
    isTradeWindowOpen: isTradeWindowOpen(safe),
    hasSchedule: (safe.schedule?.weeks?.length ?? 0) > 0,
  };
}

export function getScheduleViewModel(league, filters = {}) {
  const safe = safeGetLeagueState(league);
  const selectedWeek = Number(filters?.week ?? safe.week ?? 1);
  const selectedTeamId = filters?.teamId != null ? Number(filters.teamId) : Number(safe.userTeamId);
  const mode = filters?.mode ?? 'team';
  const status = filters?.status ?? 'all';
  const weekData = safe.schedule.weeks.find((w) => Number(w?.week) === selectedWeek);
  const games = Array.isArray(weekData?.games) ? weekData.games : [];

  const filtered = games.filter((game) => {
    const homeId = Number(game?.home?.id ?? game?.home ?? -1);
    const awayId = Number(game?.away?.id ?? game?.away ?? -1);
    const isTeamGame = homeId === selectedTeamId || awayId === selectedTeamId;
    const isCompleted = !!game?.played;
    if (mode === 'team' && !isTeamGame) return false;
    if (status === 'completed' && !isCompleted) return false;
    if (status === 'upcoming' && isCompleted) return false;
    return true;
  });

  return {
    selectedWeek,
    selectedTeamId,
    mode,
    status,
    games: filtered,
  };
}
