import { resolveCompletedGameId } from './gameResultIdentity.js';
import { deriveBoxScoreImmersion, derivePostgameStory, normalizeTeamId } from './gamePresentation.js';

export function findLatestUserCompletedGame(league) {
  const currentWeek = Number(league?.week ?? 1);
  if (!league?.seasonId || currentWeek < 1) return null;
  const userTeamId = Number(league?.userTeamId);
  const weeks = Array.isArray(league?.schedule?.weeks) ? league.schedule.weeks : [];

  let chosenWeek = null;
  let game = null;
  for (let week = currentWeek - 1; week >= 1; week -= 1) {
    const weekData = weeks.find((w) => Number(w?.week) === week);
    const userGame = (weekData?.games ?? []).find((g) => {
      const homeId = Number(normalizeTeamId(g?.home));
      const awayId = Number(normalizeTeamId(g?.away));
      return g?.played && (homeId === userTeamId || awayId === userTeamId);
    });
    if (userGame) {
      chosenWeek = week;
      game = userGame;
      break;
    }
  }

  // Fallback: latest league result if the user's latest week had a bye.
  if (!game) {
    for (let week = currentWeek - 1; week >= 1; week -= 1) {
      const weekData = weeks.find((w) => Number(w?.week) === week);
      const latestGame = (weekData?.games ?? []).find((g) => g?.played);
      if (latestGame) {
        chosenWeek = week;
        game = latestGame;
        break;
      }
    }
  }

  if (!game || chosenWeek == null) return null;
  const gameId = resolveCompletedGameId(game, { seasonId: league.seasonId, week: chosenWeek });
  return {
    week: chosenWeek,
    game,
    gameId,
    story: derivePostgameStory({ league, game, week: chosenWeek }),
    immersion: deriveBoxScoreImmersion({ league, game, week: chosenWeek }),
  };
}
