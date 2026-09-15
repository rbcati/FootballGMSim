import { isCanonicalCompletedGame, resolveCanonicalCompletedGame } from './canonicalCompletedGame.js';

function asId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function teamFor(league, id) {
  return (league?.teams ?? []).find((team) => asId(team?.id) === id) ?? null;
}

/** Canonical UI projection of the worker-owned nested schedule. */
export function getUserScheduleGames(league) {
  const userTeamId = asId(league?.userTeamId);
  if (userTeamId == null) return [];

  return (league?.schedule?.weeks ?? []).flatMap((weekRow) =>
    (weekRow?.games ?? []).flatMap((game, index) => {
      const homeId = asId(game?.homeId ?? game?.home?.id ?? game?.home);
      const awayId = asId(game?.awayId ?? game?.away?.id ?? game?.away);
      if (homeId !== userTeamId && awayId !== userTeamId) return [];
      const isHome = homeId === userTeamId;
      const oppId = isHome ? awayId : homeId;
      const gameId = game?.gameId ?? game?.id ?? null;
      const canonical = resolveCanonicalCompletedGame({ league, gameId, scheduleGame: game });
      const isCompleted = isCanonicalCompletedGame(canonical);
      return [{
        ...game,
        ...(isCompleted ? canonical : null),
        homeId,
        awayId,
        week: Number(weekRow?.week ?? game?.week ?? league?.week ?? 1),
        season: Number(game?.season ?? game?.year ?? weekRow?.season ?? weekRow?.year ?? league?.year),
        isHome,
        oppId,
        opp: teamFor(league, oppId),
        game,
        isCompleted,
        _order: Number(weekRow?.week ?? game?.week ?? 0) * 1000 + index,
      }];
    }),
  ).sort((a, b) => a._order - b._order);
}

export function getNextUserGame(league) {
  return getUserScheduleGames(league).find((game) => !game.isCompleted) ?? null;
}

export function getPreviousUserGame(league) {
  return getUserScheduleGames(league).filter((game) => game.isCompleted).at(-1) ?? null;
}
