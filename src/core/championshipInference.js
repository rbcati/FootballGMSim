/**
 * Pure helpers to infer championship winner / runner-up from season games and meta.
 * Prefers explicit postseason / Super Bowl signals; avoids treating early playoff
 * rounds as the title game when the final is missing.
 */

export function isCompletedGame(game) {
  return Number.isFinite(Number(game?.homeScore)) && Number.isFinite(Number(game?.awayScore));
}

export function isPostseasonGame(game) {
  const round = String(game?.playoffRound ?? game?.round ?? game?.stage ?? '').toLowerCase();
  return Boolean(
    game?.isPlayoff ||
      game?.isPostseason ||
      ['wildcard', 'divisional', 'conference', 'conference_final', 'final', 'championship', 'superbowl', 'super_bowl'].includes(round),
  );
}

/** True only for games that may represent the league championship / Super Bowl. */
export function isChampionshipFinalGame(game) {
  if (!isPostseasonGame(game) || !isCompletedGame(game)) return false;
  const round = String(game?.playoffRound ?? game?.round ?? game?.stage ?? '').toLowerCase();
  const week = Number(game?.week ?? 0);
  if (game?.isChampionshipGame || game?.isFinal) return true;
  if (['superbowl', 'super_bowl', 'championship', 'final', 'playoff_final'].includes(round)) return true;
  if (week === 22) return true;
  return false;
}

export function resolveGameWinnerLoser(game) {
  if (!isCompletedGame(game)) return { winnerId: null, loserId: null };
  const homeScore = Number(game.homeScore);
  const awayScore = Number(game.awayScore);
  if (homeScore === awayScore) return { winnerId: null, loserId: null };
  if (homeScore > awayScore) return { winnerId: Number(game.homeId), loserId: Number(game.awayId) };
  return { winnerId: Number(game.awayId), loserId: Number(game.homeId) };
}

function findGameById(seasonGames, gameId) {
  if (gameId == null || gameId === '') return null;
  const idStr = String(gameId);
  return (seasonGames || []).find((g) => String(g?.id ?? g?.gameId) === idStr) ?? null;
}

/**
 * @param {{ seasonGames?: any[]; meta?: Record<string, unknown> }} args
 * @returns {{ championshipGame: any | null; championTeamId: number | null; runnerUpTeamId: number | null }}
 */
function finalsGameIdFromPlayoffResults(meta) {
  const pr = Array.isArray(meta?.playoffResults) ? meta.playoffResults : [];
  const finalsRow = [...pr].reverse().find((r) => {
    const rRound = String(r?.round ?? r?.playoffRound ?? r?.stage ?? '').toLowerCase();
    return ['superbowl', 'super_bowl', 'championship', 'final', 'playoff_final', 'f'].includes(rRound);
  });
  if (!finalsRow) return null;
  return finalsRow.gameId ?? finalsRow.id ?? finalsRow.game_id ?? null;
}

export function inferChampionshipOutcome({ seasonGames = [], meta = {} }) {
  const metaChamp = meta?.championTeamId != null ? Number(meta.championTeamId) : null;
  const metaRunner = meta?.runnerUpTeamId != null ? Number(meta.runnerUpTeamId) : null;
  const metaFinalGameId = meta?.championshipGameId ?? meta?.superBowlGameId ?? finalsGameIdFromPlayoffResults(meta) ?? null;

  const completedPostseason = (seasonGames || []).filter((g) => isCompletedGame(g) && isPostseasonGame(g));
  const finalCandidates = completedPostseason.filter(isChampionshipFinalGame);

  let resolvedGame =
    (metaFinalGameId != null ? findGameById(seasonGames, metaFinalGameId) : null) ||
    [...finalCandidates].sort((a, b) => Number(b?.week ?? 0) - Number(a?.week ?? 0))[0] ||
    null;

  const fromGame = resolveGameWinnerLoser(resolvedGame);

  let championTeamId = Number.isFinite(fromGame.winnerId) ? fromGame.winnerId : null;
  let runnerUpTeamId = Number.isFinite(fromGame.loserId) ? fromGame.loserId : null;

  if (championTeamId == null && Number.isFinite(metaChamp)) {
    championTeamId = metaChamp;
  }
  if (runnerUpTeamId == null && Number.isFinite(metaRunner)) {
    runnerUpTeamId = metaRunner;
  }

  if (championTeamId != null && runnerUpTeamId == null && resolvedGame && Number.isFinite(fromGame.winnerId)) {
    runnerUpTeamId = Number.isFinite(fromGame.loserId) ? fromGame.loserId : null;
  }

  return {
    championshipGame: resolvedGame,
    championTeamId: Number.isFinite(championTeamId) ? championTeamId : null,
    runnerUpTeamId: Number.isFinite(runnerUpTeamId) ? runnerUpTeamId : null,
  };
}
