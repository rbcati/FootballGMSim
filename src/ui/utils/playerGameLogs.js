import { resolveCompletedGameId } from './gameResultIdentity.js';

function normalizeTeamId(value) {
  return Number(value?.id ?? value);
}

function normalizeResult(game, teamId) {
  const homeId = normalizeTeamId(game?.homeId ?? game?.home);
  const awayId = normalizeTeamId(game?.awayId ?? game?.away);
  const homeScore = Number(game?.homeScore);
  const awayScore = Number(game?.awayScore);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return '—';
  const isHome = teamId === homeId;
  const teamScore = isHome ? homeScore : awayScore;
  const oppScore = isHome ? awayScore : homeScore;
  const prefix = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T';
  return `${prefix} ${teamScore}-${oppScore}`;
}

export function summarizePlayerGameStats(stats = {}, pos = '') {
  const position = String(pos || '').toUpperCase();
  if (position === 'QB') return `${stats.passComp ?? 0}/${stats.passAtt ?? 0}, ${stats.passYd ?? 0} PYD, ${stats.passTD ?? 0} TD, ${stats.interceptions ?? 0} INT`;
  if (['RB', 'FB'].includes(position)) return `${stats.rushAtt ?? 0} CAR, ${stats.rushYd ?? 0} RYD, ${stats.rushTD ?? 0} TD`;
  if (['WR', 'TE'].includes(position)) return `${stats.receptions ?? 0} REC, ${stats.recYd ?? 0} RYD, ${stats.recTD ?? 0} TD`;
  if (['K'].includes(position)) return `${stats.fieldGoalsMade ?? 0}/${stats.fieldGoalsAttempted ?? 0} FG, ${stats.extraPointsMade ?? 0}/${stats.extraPointsAttempted ?? 0} XP`;
  if (['P'].includes(position)) return `${stats.punts ?? 0} P, ${stats.puntYards ?? 0} YDS`;
  return `${stats.tackles ?? 0} TKL, ${stats.sacks ?? 0} SACK, ${stats.interceptions ?? 0} INT`;
}

export function getPlayerGameLogs(league, player) {
  if (!league?.schedule?.weeks || !player?.id) return [];
  const playerId = String(player.id);
  const rows = [];
  for (const weekRow of league.schedule.weeks) {
    const week = Number(weekRow?.week);
    for (const game of weekRow?.games ?? []) {
      if (!game?.played) continue;
      const homeStats = game?.playerStats?.home ?? game?.stats?.home ?? {};
      const awayStats = game?.playerStats?.away ?? game?.stats?.away ?? {};
      const statRow = homeStats[playerId] ?? awayStats[playerId] ?? null;
      if (!statRow) continue;
      const homeId = normalizeTeamId(game?.homeId ?? game?.home);
      const awayId = normalizeTeamId(game?.awayId ?? game?.away);
      const playerTeamId = normalizeTeamId(player?.teamId);
      const opponentId = playerTeamId === homeId ? awayId : homeId;
      rows.push({
        week,
        gameId: resolveCompletedGameId(game, { seasonId: league?.seasonId, week }),
        opponentId,
        opponentAbbr: league?.teamById?.[opponentId]?.abbr ?? 'OPP',
        result: normalizeResult(game, playerTeamId),
        summary: summarizePlayerGameStats(statRow?.stats ?? statRow, player?.pos ?? player?.position),
      });
    }
  }
  return rows.sort((a, b) => a.week - b.week);
}
