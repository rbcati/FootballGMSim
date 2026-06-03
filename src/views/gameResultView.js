/*
 * Game Result View (data-preparation layer)
 * ─────────────────────────────────────────
 * Shapes a committed game-result object (as produced by the simulation engine's
 * commitGameResult) into the box score, play log, and key stat highlights the
 * post-game UI consumes. Pure: no React, no JSX, no hooks.
 */

function boxRows(side) {
  const map = side && typeof side === 'object' ? side : {};
  return Object.entries(map).map(([pid, row]) => {
    const stats = row?.stats && typeof row.stats === 'object' ? row.stats : row ?? {};
    return {
      playerId: row?.playerId ?? pid,
      name: row?.name ?? 'Unknown',
      pos: row?.pos ?? '',
      stats,
    };
  });
}

function highlightsFor(rows, teamAbbr) {
  const out = [];
  for (const row of rows) {
    const s = row.stats || {};
    const passYd = Number(s.passYd ?? 0);
    const passTD = Number(s.passTD ?? 0);
    const rushYd = Number(s.rushYd ?? 0);
    const rushTD = Number(s.rushTD ?? 0);
    const recYd = Number(s.recYd ?? 0);
    const recTD = Number(s.recTD ?? 0);
    const sacks = Number(s.sacks ?? 0);
    const ints = Number(s.interceptions ?? 0);

    if (passYd >= 300 || passTD >= 3) {
      out.push({ playerId: row.playerId, name: row.name, teamAbbr, line: `${passYd} pass yds, ${passTD} TD` });
    } else if (rushYd >= 100 || rushTD >= 2) {
      out.push({ playerId: row.playerId, name: row.name, teamAbbr, line: `${rushYd} rush yds, ${rushTD} TD` });
    } else if (recYd >= 100 || recTD >= 2) {
      out.push({ playerId: row.playerId, name: row.name, teamAbbr, line: `${recYd} rec yds, ${recTD} TD` });
    } else if (sacks >= 2 || ints >= 1) {
      out.push({ playerId: row.playerId, name: row.name, teamAbbr, line: `${sacks} sacks, ${ints} INT` });
    }
  }
  return out;
}

/**
 * @param {object} state - a committed game-result object
 * @returns {{
 *   gameId: any,
 *   isPlayoff: boolean,
 *   week: any,
 *   year: any,
 *   home: { id:any, name:string|null, abbr:string, score:number, won:boolean },
 *   away: { id:any, name:string|null, abbr:string, score:number, won:boolean },
 *   boxScore: { home: Array<{playerId:any, name:string, pos:string, stats:object}>, away: Array<{playerId:any, name:string, pos:string, stats:object}> },
 *   teamStats: object|null,
 *   playLog: Array,
 *   scoringSummary: Array,
 *   quarterScores: object|null,
 *   highlights: Array<{playerId:any, name:string, teamAbbr:string, line:string}>,
 *   recapText: string|null,
 * }}
 */
export function prepareGameResultView(state) {
  const game = state ?? {};
  const box = game.boxScore ?? game.playerStats ?? game.stats ?? {};
  const homeRows = boxRows(box.home);
  const awayRows = boxRows(box.away);
  const homeAbbr = game.homeTeamAbbr ?? '';
  const awayAbbr = game.awayTeamAbbr ?? '';

  const homeScore = Number(game.scoreHome ?? game.homeScore ?? 0);
  const awayScore = Number(game.scoreAway ?? game.awayScore ?? 0);

  return {
    gameId: game.gameId ?? game.id ?? null,
    isPlayoff: Boolean(game.isPlayoff),
    week: game.week ?? null,
    year: game.year ?? null,
    home: {
      id: game.homeId ?? game.home ?? null,
      name: game.homeTeamName ?? null,
      abbr: homeAbbr,
      score: homeScore,
      won: homeScore > awayScore,
    },
    away: {
      id: game.awayId ?? game.away ?? null,
      name: game.awayTeamName ?? null,
      abbr: awayAbbr,
      score: awayScore,
      won: awayScore > homeScore,
    },
    boxScore: { home: homeRows, away: awayRows },
    teamStats: game.teamStats ?? null,
    playLog: Array.isArray(game.playLogs) ? game.playLogs : (Array.isArray(game.playLog) ? game.playLog : []),
    scoringSummary: Array.isArray(game.scoringSummary) ? game.scoringSummary : [],
    quarterScores: game.quarterScores ?? null,
    highlights: [...highlightsFor(homeRows, homeAbbr), ...highlightsFor(awayRows, awayAbbr)],
    recapText: game.recapText ?? null,
  };
}
