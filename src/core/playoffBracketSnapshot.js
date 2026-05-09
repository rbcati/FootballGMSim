/**
 * Compact postseason bracket / path view from archived season games.
 * Pure helpers — no DB, no simulation.
 */

import { isCompletedGame, isPostseasonGame, resolveGameWinnerLoser } from './championshipInference.js';

const ROUND_ORDER = [
  { key: 'WILDCARD', label: 'Wild Card' },
  { key: 'DIVISIONAL', label: 'Divisional' },
  { key: 'CONF_FINAL', label: 'Conference Championship' },
  { key: 'CHAMPIONSHIP', label: 'Championship' },
];

/**
 * Map a completed postseason game to a coarse round bucket when metadata allows.
 * Returns null when round cannot be determined without guessing.
 */
export function classifyPlayoffRoundBucket(game) {
  const round = String(game?.playoffRound ?? game?.round ?? game?.stage ?? '').toLowerCase();
  if (['superbowl', 'super_bowl', 'championship', 'final', 'playoff_final', 'f'].includes(round)) return 'CHAMPIONSHIP';
  if (game?.isChampionshipGame || game?.isFinal) return 'CHAMPIONSHIP';
  if (Number(game?.week ?? 0) === 22) return 'CHAMPIONSHIP';
  if (['wildcard', 'wild_card', 'wc'].includes(round)) return 'WILDCARD';
  if (['divisional', 'div', 'division'].includes(round)) return 'DIVISIONAL';
  if (['conference', 'conference_final', 'conf', 'afc_championship', 'nfc_championship'].includes(round)) return 'CONF_FINAL';
  return null;
}

function teamAbbrev(teamId, teams) {
  const t = (teams || []).find((x) => Number(x?.id) === Number(teamId));
  return t?.abbr ?? (teamId != null ? String(teamId) : '—');
}

function compactPlayoffGame(g, teams, championshipGameId) {
  const { winnerId } = resolveGameWinnerLoser(g);
  const gid = g?.id ?? g?.gameId ?? null;
  return {
    id: gid,
    gameId: gid,
    week: g?.week ?? null,
    homeId: g?.homeId ?? null,
    awayId: g?.awayId ?? null,
    homeAbbr: teamAbbrev(g?.homeId, teams),
    awayAbbr: teamAbbrev(g?.awayId, teams),
    homeScore: g?.homeScore,
    awayScore: g?.awayScore,
    winnerId: Number.isFinite(Number(winnerId)) ? Number(winnerId) : null,
    isChampionshipGame: championshipGameId != null && String(g?.id ?? g?.gameId) === String(championshipGameId),
  };
}

/**
 * @param {{ games?: any[]; teams?: any[]; championshipGameId?: string|number|null }} args
 * @returns {{ mode: 'empty'|'flat'|'rounds'; rounds: Array<{ label: string; games: any[] }>; note: string|null }}
 */
export function buildPlayoffBracketSnapshot({ games = [], teams = [], championshipGameId = null } = {}) {
  const playoffGames = (games || []).filter((g) => isPostseasonGame(g) && isCompletedGame(g));
  if (!playoffGames.length) {
    return { mode: 'empty', rounds: [], note: null };
  }

  const buckets = playoffGames.map((g) => classifyPlayoffRoundBucket(g));
  const anyUnknown = buckets.some((b) => b == null);

  const sortByWeek = (a, b) => Number(a?.week ?? 0) - Number(b?.week ?? 0);

  if (anyUnknown) {
    const sorted = [...playoffGames].sort(sortByWeek);
    return {
      mode: 'flat',
      rounds: [{ label: 'Postseason games', games: sorted.map((g) => compactPlayoffGame(g, teams, championshipGameId)) }],
      note: 'Round labels are unavailable for some games in this archive; showing all postseason results together.',
    };
  }

  const byRound = { WILDCARD: [], DIVISIONAL: [], CONF_FINAL: [], CHAMPIONSHIP: [] };
  for (const g of playoffGames) {
    const b = classifyPlayoffRoundBucket(g);
    if (b && byRound[b]) byRound[b].push(g);
  }
  for (const k of Object.keys(byRound)) {
    byRound[k].sort(sortByWeek);
  }
  const rounds = ROUND_ORDER.filter((r) => (byRound[r.key] ?? []).length > 0).map((r) => ({
    label: r.label,
    games: byRound[r.key].map((g) => compactPlayoffGame(g, teams, championshipGameId)),
  }));

  if (!rounds.length) {
    const sorted = [...playoffGames].sort(sortByWeek);
    return {
      mode: 'flat',
      rounds: [{ label: 'Postseason games', games: sorted.map((g) => compactPlayoffGame(g, teams, championshipGameId)) }],
      note: 'Playoff results are archived without standard round metadata.',
    };
  }

  return { mode: 'rounds', rounds, note: null };
}
