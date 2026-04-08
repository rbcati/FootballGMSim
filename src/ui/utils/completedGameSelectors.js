import { resolveCompletedGameId } from './gameResultIdentity.js';
import { deriveBoxScoreImmersion, derivePostgameStory, normalizeTeamId } from './gamePresentation.js';

export function findLatestUserCompletedGame(league) {
  const targetWeek = Number(league?.week ?? 1) - 1;
  if (!league?.seasonId || targetWeek < 1) return null;
  const weekData = league?.schedule?.weeks?.find((w) => Number(w?.week) === targetWeek);
  const game = (weekData?.games ?? []).find((g) => {
    const homeId = normalizeTeamId(g?.home);
    const awayId = normalizeTeamId(g?.away);
    return g?.played && (homeId === league?.userTeamId || awayId === league?.userTeamId);
  });
  if (!game) return null;
  const gameId = resolveCompletedGameId(game, { seasonId: league.seasonId, week: targetWeek });
  return {
    week: targetWeek,
    game,
    gameId,
    story: derivePostgameStory({ league, game, week: targetWeek }),
    immersion: deriveBoxScoreImmersion({ league, game, week: targetWeek }),
  };
}
