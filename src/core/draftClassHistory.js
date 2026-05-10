/**
 * Draft Class Memory / Redraft V1 — pure helpers (no worker, no React).
 * Builds explainable draft-class views from DRAFT transactions + player career signals.
 */

import { buildLegacyScoreReport } from './legacyScore.js';

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

function teamAbbrFromCtx(teamId, ctx = {}) {
  const id = num(teamId);
  if (!id) return '';
  if (ctx.teamsById instanceof Map) {
    return str(ctx.teamsById.get(id)?.abbr);
  }
  const t = (ctx.teams || []).find((x) => num(x?.id) === id);
  return str(t?.abbr);
}

/**
 * Normalize a raw IndexedDB DRAFT transaction (or enriched worker row) to a pick row.
 * @param {object} rawTx
 * @param {{ teams?: any[], teamsById?: Map<number, any> }} ctx
 */
export function normalizeDraftPickRow(rawTx, ctx = {}) {
  const d = rawTx?.details && typeof rawTx.details === 'object' ? rawTx.details : {};
  const playerId = d.playerId != null ? num(d.playerId) : num(rawTx?.playerId);
  const pl = ctx.playersById instanceof Map
    ? ctx.playersById.get(playerId)
    : (ctx.players || []).find((p) => num(p?.id) === playerId);
  const draftTeamId = num(rawTx?.teamId);
  const abbr = str(rawTx?.teamAbbr) || teamAbbrFromCtx(draftTeamId, ctx);
  const overall = d.overall != null ? num(d.overall) : null;
  const round = d.round != null ? num(d.round) : null;
  const pickInRound = d.pickInRound != null ? num(d.pickInRound) : null;
  let originalPickLabel = '';
  if (overall > 0) originalPickLabel = `#${overall}`;
  else if (round > 0) originalPickLabel = `R${round}${pickInRound > 0 ? ` · ${pickInRound}` : ''}`;

  return {
    playerId: playerId > 0 ? playerId : null,
    playerName: str(rawTx?.playerName) || str(pl?.name) || '',
    pos: str(rawTx?.playerPos) || str(pl?.pos) || '',
    draftTeamId: draftTeamId > 0 ? draftTeamId : null,
    draftTeamAbbr: abbr || null,
    round: round > 0 ? round : null,
    pickInRound: pickInRound > 0 ? pickInRound : null,
    overall: overall > 0 ? overall : null,
    originalPickLabel: originalPickLabel || null,
    seasonId: rawTx?.seasonId != null ? str(rawTx.seasonId) : null,
    _originalTeamId: d.originalTeamId != null ? num(d.originalTeamId) : null,
  };
}

/** @typedef {'developing'|'mature'|'historic'|'weak'} DraftClassLeagueStatus */

function careerGamesPlayed(player) {
  const cs = Array.isArray(player?.careerStats) ? player.careerStats : [];
  return cs.reduce((s, row) => s + num(row?.gamesPlayed), 0) || cs.length * 8;
}

function careerSeasonCount(player) {
  const cs = Array.isArray(player?.careerStats) ? player.careerStats : [];
  return cs.length;
}

/**
 * @param {object} player
 * @param {object} report - buildLegacyScoreReport result
 * @param {number} seasonsSinceDraft
 * @param {{ isDevelopingClass?: boolean }} opts
 */
export function assignOutcomeTier(player, report, seasonsSinceDraft, opts = {}) {
  const reasons = [];
  const isDevelopingClass = Boolean(opts.isDevelopingClass);
  const seasonsPlayed = careerSeasonCount(player);
  const games = careerGamesPlayed(player);
  const ls = num(report?.legacyScore);
  const hof = Boolean(player?.hof);

  if (hof) {
    reasons.push('Hall of Fame résumé');
    return { tier: 'HOF', outcomeLabel: 'Hall of Fame', reasons };
  }

  if (isDevelopingClass || seasonsSinceDraft <= 1) {
    reasons.push('Draft class still developing in the league');
    return { tier: 'TOO_EARLY', outcomeLabel: 'Too early', reasons };
  }

  if (seasonsSinceDraft <= 2 || seasonsPlayed <= 1) {
    reasons.push('Early-career sample; outcomes not finalized');
    return { tier: 'DEVELOPING', outcomeLabel: 'Developing', reasons };
  }

  if (seasonsPlayed <= 2 && games < 20) {
    reasons.push('Limited NFL sample so far');
    return { tier: 'UNKNOWN', outcomeLabel: 'Unknown / too early', reasons };
  }

  const mvp = (player?.accolades || []).filter((a) => a?.type === 'MVP').length;
  const allPro = (player?.accolades || []).filter((a) => a?.type === 'ALL_PRO' || a?.type === 'ALLPRO').length;

  if (ls >= 82 || mvp >= 1) {
    if (mvp) reasons.push(`${mvp}x MVP`);
    if (ls >= 82) reasons.push(`Elite legacy score (${ls})`);
    return { tier: 'SUPERSTAR', outcomeLabel: 'Superstar', reasons };
  }
  if (ls >= 72 || allPro >= 2) {
    if (allPro) reasons.push(`${allPro}x All-Pro`);
    return { tier: 'STAR', outcomeLabel: 'Star', reasons };
  }
  if (ls >= 58 && games >= 40) {
    reasons.push('Solid multi-season production');
    return { tier: 'LONG_STARTER', outcomeLabel: 'Long-term starter', reasons };
  }
  if (ls >= 48 && games >= 24) {
    return { tier: 'CONTRIBUTOR', outcomeLabel: 'Contributor', reasons: ['Positive career value'] };
  }
  if (ls >= 38) {
    return { tier: 'REPLACEMENT', outcomeLabel: 'Replacement-level', reasons: ['Modest career impact to date'] };
  }

  if (seasonsSinceDraft >= 5 && seasonsPlayed >= 3 && ls < 32 && games >= 30) {
    reasons.push('Multiple seasons without standout impact');
    return { tier: 'BUST', outcomeLabel: 'Bust', reasons };
  }

  reasons.push('Career arc still open');
  return { tier: 'UNKNOWN', outcomeLabel: 'Unknown / too early', reasons };
}

/**
 * Outcome score for redraft ordering: legacy-first with games + accolades nudge.
 */
export function computeOutcomeScore(player, report) {
  let s = num(report?.legacyScore);
  s += Math.min(10, careerGamesPlayed(player) / 30);
  if (player?.hof) s += 25;
  const mvp = (player?.accolades || []).filter((a) => a?.type === 'MVP').length;
  s += mvp * 6;
  const ap = (player?.accolades || []).filter((a) => a?.type === 'ALL_PRO' || a?.type === 'ALLPRO').length;
  s += ap * 3;
  return s;
}

/**
 * @param {object[]} draftTransactions - raw DB rows type DRAFT
 * @param {{ teams?: any[], teamsById?: Map<number,any>, players?: any[], playersById?: Map<number,any> }} ctx
 */
export function picksFromDraftTransactions(draftTransactions, ctx = {}) {
  if (!Array.isArray(draftTransactions)) return [];
  const byPlayer = new Map();
  for (const tx of draftTransactions) {
    if (str(tx?.type).toUpperCase() !== 'DRAFT') continue;
    const row = normalizeDraftPickRow(tx, ctx);
    if (!row.playerId) continue;
    byPlayer.set(row.playerId, row);
  }
  return [...byPlayer.values()].sort((a, b) => num(a.overall) - num(b.overall) || num(a.playerId) - num(b.playerId));
}

/**
 * Add picks from player roster fields when no transaction exists for that player/year.
 * @param {number} draftYear
 * @param {object[]} players
 * @param {Set<number>} existingPlayerIds
 * @param {{ teams?: any[], teamsById?: Map<number,any> }} ctx
 */
export function mergePlayerFieldFallbackPicks(draftYear, players, existingPlayerIds, ctx = {}) {
  if (!Number.isFinite(draftYear) || draftYear <= 0 || !Array.isArray(players)) return [];
  const out = [];
  for (const p of players) {
    const pid = num(p?.id);
    if (!pid || existingPlayerIds.has(pid)) continue;
    const py = num(p?.draftYear);
    if (py !== draftYear) continue;
    const tid = num(p?.draftTeamId);
    if (!tid) continue;
    out.push({
      playerId: pid,
      playerName: str(p?.name),
      pos: str(p?.pos),
      draftTeamId: tid,
      draftTeamAbbr: str(p?.draftTeamAbbr) || teamAbbrFromCtx(tid, ctx),
      round: num(p?.draftRound) > 0 ? num(p?.draftRound) : null,
      pickInRound: num(p?.draftPick) > 0 ? num(p?.draftPick) : null,
      overall: num(p?.draftOverall ?? p?.draftOverallPick) > 0 ? num(p?.draftOverall ?? p?.draftOverallPick) : null,
      originalPickLabel: num(p?.draftOverall ?? p?.draftOverallPick) > 0
        ? `#${num(p?.draftOverall ?? p?.draftOverallPick)}`
        : (num(p?.draftRound) > 0 ? `R${num(p?.draftRound)}` : null),
      seasonId: null,
      _fromPlayerFields: true,
    });
  }
  return out;
}

function leagueClassStatus(medianScore, pickCount, isDevelopingClass) {
  if (isDevelopingClass) return 'developing';
  if (pickCount < 8) return 'weak';
  if (medianScore >= 52) return 'historic';
  if (medianScore >= 44) return 'mature';
  if (medianScore < 38) return 'weak';
  return 'mature';
}

/**
 * @param {object} model - output of buildDraftClassModel (needs picks with outcomeScore, redraftRank)
 */
export function buildRedraftBoard(model) {
  const sorted = [...(model?.picks || [])].sort((a, b) => num(b.outcomeScore) - num(a.outcomeScore));
  return sorted.map((p, idx) => ({ ...p, redraftRank: idx + 1 }));
}

/**
 * @param {object} model
 * @param {number} teamId
 */
export function gradeTeamDraftClass(model, teamId) {
  const tid = num(teamId);
  const picks = (model?.picks || []).filter((p) => num(p.draftTeamId) === tid);
  const incomplete = model?.meta?.isDevelopingClass || picks.length === 0;
  if (incomplete || picks.length < 2) {
    return {
      teamId: tid,
      pickCount: picks.length,
      bestPick: null,
      totalValue: 0,
      avgValue: 0,
      steals: 0,
      busts: 0,
      gradeLabel: 'Incomplete',
    };
  }
  const scores = picks.map((p) => num(p.outcomeScore));
  const total = scores.reduce((a, b) => a + b, 0);
  const avg = total / picks.length;
  const bestPick = [...picks].sort((a, b) => num(b.outcomeScore) - num(a.outcomeScore))[0] || null;
  const steals = picks.filter((p) => num(p.redraftDelta) >= 40 && !model.meta?.suppressStealsBusts).length;
  const busts = picks.filter((p) => num(p.redraftDelta) <= -35 && p.outcomeTier === 'BUST' && !model.meta?.suppressStealsBusts).length;

  let gradeLabel = 'C';
  if (avg >= 62) gradeLabel = 'A+';
  else if (avg >= 56) gradeLabel = 'A';
  else if (avg >= 50) gradeLabel = 'B';
  else if (avg >= 44) gradeLabel = 'C';
  else if (avg >= 36) gradeLabel = 'D';
  else gradeLabel = 'D';

  return {
    teamId: tid,
    pickCount: picks.length,
    bestPick: bestPick
      ? { playerId: bestPick.playerId, playerName: bestPick.playerName, outcomeScore: bestPick.outcomeScore }
      : null,
    totalValue: Math.round(total * 10) / 10,
    avgValue: Math.round(avg * 10) / 10,
    steals,
    busts,
    gradeLabel,
  };
}

/**
 * @param {object} player
 * @param {object[]} draftTransactions - recent raw DRAFT rows (optional)
 */
export function findPlayerDraftOrigin(player, draftTransactions = []) {
  const pid = num(player?.id);
  if (!pid) return null;
  if (Array.isArray(draftTransactions)) {
    const hit = draftTransactions.find((tx) => {
      if (str(tx?.type).toUpperCase() !== 'DRAFT') return false;
      const d = tx?.details || {};
      const id = d.playerId != null ? num(d.playerId) : num(tx?.playerId);
      return id === pid;
    });
    if (hit) {
      const row = normalizeDraftPickRow(hit, { players: [player] });
      return {
        source: 'transaction',
        ...row,
        draftYear: null,
      };
    }
  }
  const dy = num(player?.draftYear);
  if (dy > 0 && num(player?.draftTeamId) > 0) {
    return {
      source: 'player',
      playerId: pid,
      playerName: str(player?.name),
      pos: str(player?.pos),
      draftTeamId: num(player?.draftTeamId),
      draftTeamAbbr: str(player?.draftTeamAbbr) || null,
      round: num(player?.draftRound) > 0 ? num(player?.draftRound) : null,
      pickInRound: num(player?.draftPick) > 0 ? num(player?.draftPick) : null,
      overall: num(player?.draftOverall ?? player?.draftOverallPick) > 0 ? num(player?.draftOverall ?? player?.draftOverallPick) : null,
      originalPickLabel: num(player?.draftOverall ?? player?.draftOverallPick) > 0
        ? `#${num(player?.draftOverall ?? player?.draftOverallPick)}`
        : null,
      draftYear: dy,
      seasonId: null,
    };
  }
  return null;
}

/**
 * Build full draft class model + redraft + team grades + steals/busts lists.
 * @param {{
 *   year: number,
 *   seasonId: string|null,
 *   draftTransactions: object[],
 *   playersById: Map<number, object>,
 *   currentLeagueYear: number,
 *   recordBook?: object|null,
 *   archivedSeasons?: any[],
 *   teams?: any[],
 * }} input
 */
export function buildDraftClassModel(input) {
  const {
    year,
    seasonId = null,
    draftTransactions = [],
    playersById = new Map(),
    currentLeagueYear = year,
    recordBook = null,
    archivedSeasons = [],
    teams = [],
  } = input;

  const teamsById = new Map((teams || []).map((t) => [num(t?.id), t]));
  const ctx = { teams, teamsById, playersById };

  let basePicks = picksFromDraftTransactions(draftTransactions, ctx);
  const existingIds = new Set(basePicks.map((p) => num(p.playerId)).filter((x) => x > 0));
  const fallback = mergePlayerFieldFallbackPicks(
    year,
    [...playersById.values()],
    existingIds,
    ctx,
  );
  basePicks = [...basePicks, ...fallback];

  const seasonsSinceDraft = Math.max(0, num(currentLeagueYear) - num(year));
  const isDevelopingClass = seasonsSinceDraft < 2;
  const suppressStealsBusts = isDevelopingClass || seasonsSinceDraft < 3;

  const legacyCtx = { recordBook, archivedSeasons, teams, year: currentLeagueYear };

  const enriched = basePicks.map((pick) => {
    const pl = playersById.get(num(pick.playerId)) || null;
    const report = pl ? buildLegacyScoreReport(pl, legacyCtx) : null;
    const outcome = assignOutcomeTier(pl || {}, report || {}, seasonsSinceDraft, { isDevelopingClass });
    const outcomeScore = pl && report ? computeOutcomeScore(pl, report) : 0;
    const curTid = pl ? num(pl.teamId) : null;
    return {
      ...pick,
      currentTeamId: curTid > 0 ? curTid : null,
      currentTeamAbbr: teamAbbrFromCtx(curTid, ctx) || null,
      careerSummary: report?.careerSummary || '',
      legacyScore: report ? num(report.legacyScore) : null,
      outcomeTier: outcome.tier,
      outcomeLabel: outcome.outcomeLabel,
      reasons: [...(pick._fromPlayerFields ? ['From roster draft fields (no logged pick)'] : []), ...outcome.reasons],
      outcomeScore: Math.round(outcomeScore * 100) / 100,
      redraftRank: null,
      redraftDelta: null,
    };
  });

  const sortedByOutcome = [...enriched].sort((a, b) => num(b.outcomeScore) - num(a.outcomeScore));
  const redraftByPlayerId = new Map();
  sortedByOutcome.forEach((p, idx) => {
    const orig = num(p.overall) > 0 ? num(p.overall) : idx + 32;
    const redraftRank = idx + 1;
    const redraftDelta = orig - redraftRank;
    redraftByPlayerId.set(num(p.playerId), { redraftRank, redraftDelta });
  });
  const byOriginal = [...enriched].sort(
    (a, b) => num(a.overall) - num(b.overall) || num(a.playerId) - num(b.playerId),
  );
  const withRedraft = byOriginal.map((p) => {
    const rr = redraftByPlayerId.get(num(p.playerId)) || { redraftRank: null, redraftDelta: null };
    return { ...p, redraftRank: rr.redraftRank, redraftDelta: rr.redraftDelta };
  });

  const redraftTop10 = sortedByOutcome.slice(0, 10).map((p, idx) => {
    const orig = num(p.overall) > 0 ? num(p.overall) : idx + 32;
    const redraftRank = idx + 1;
    const redraftDelta = orig - redraftRank;
    return {
      playerId: p.playerId,
      playerName: p.playerName,
      pos: p.pos,
      originalOverall: p.overall,
      redraftRank,
      redraftDelta,
      outcomeLabel: p.outcomeLabel,
      reason: (p.reasons && p.reasons[0]) || '',
    };
  });

  let steals = [];
  let busts = [];
  if (!suppressStealsBusts) {
    steals = [...withRedraft]
      .filter((p) => num(p.redraftDelta) >= 48 && num(p.overall) > 0)
      .sort((a, b) => num(b.redraftDelta) - num(a.redraftDelta))
      .slice(0, 5)
      .map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        redraftDelta: p.redraftDelta,
        note: `Drafted #${p.overall} · now redraft #${p.redraftRank}`,
      }));
    busts = [...withRedraft]
      .filter((p) => p.outcomeTier === 'BUST' && num(p.redraftDelta) < -20)
      .sort((a, b) => num(a.redraftDelta) - num(b.redraftDelta))
      .slice(0, 5)
      .map((p) => ({
        playerId: p.playerId,
        playerName: p.playerName,
        redraftDelta: p.redraftDelta,
        note: 'Late-career value never matched draft capital',
      }));
  }

  const teamIds = [...new Set(withRedraft.map((p) => num(p.draftTeamId)).filter((x) => x > 0))];
  const teamGrades = teamIds.map((tid) => gradeTeamDraftClass(
    { picks: withRedraft, meta: { isDevelopingClass, suppressStealsBusts } },
    tid,
  ));

  const legacies = withRedraft.map((p) => num(p.legacyScore)).filter((x) => Number.isFinite(x));
  const medianScore = legacies.length
    ? [...legacies].sort((a, b) => a - b)[Math.floor(legacies.length / 2)]
    : 0;
  const classLeagueStatus = leagueClassStatus(medianScore, withRedraft.length, isDevelopingClass);

  const starCount = withRedraft.filter((p) => p.outcomeTier === 'STAR' || p.outcomeTier === 'SUPERSTAR' || p.outcomeTier === 'HOF').length;
  const starterCount = withRedraft.filter((p) =>
    ['LONG_STARTER', 'STAR', 'SUPERSTAR', 'HOF', 'CONTRIBUTOR'].includes(p.outcomeTier)).length;
  const hofCount = withRedraft.filter((p) => p.outcomeTier === 'HOF').length;
  const mvpCount = withRedraft.filter((p) => (p.playerId && (playersById.get(num(p.playerId))?.accolades || []).some((a) => a?.type === 'MVP'))).length;
  const allProCount = withRedraft.filter((p) => (p.playerId && (playersById.get(num(p.playerId))?.accolades || []).some((a) => a?.type === 'ALL_PRO' || a?.type === 'ALLPRO'))).length;
  const avgLegacyScore = legacies.length
    ? Math.round((legacies.reduce((a, b) => a + b, 0) / legacies.length) * 10) / 10
    : null;

  return {
    year,
    seasonId,
    picks: withRedraft.map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      pos: p.pos,
      draftTeamId: p.draftTeamId,
      draftTeamAbbr: p.draftTeamAbbr,
      round: p.round,
      pickInRound: p.pickInRound,
      overall: p.overall,
      originalPickLabel: p.originalPickLabel,
      currentTeamId: p.currentTeamId,
      currentTeamAbbr: p.currentTeamAbbr,
      careerSummary: p.careerSummary,
      legacyScore: p.legacyScore,
      redraftRank: p.redraftRank,
      redraftDelta: p.redraftDelta,
      outcomeTier: p.outcomeTier,
      outcomeLabel: p.outcomeLabel,
      reasons: (p.reasons || []).slice(0, 6),
    })),
    redraftTop10,
    steals,
    busts,
    teamGrades,
    classSummary: {
      totalPicks: withRedraft.length,
      starCount,
      starterCount,
      hofCount,
      mvpCount,
      allProCount,
      avgLegacyScore,
      classLeagueStatus,
      isDevelopingClass,
      seasonsSinceDraft,
    },
    meta: {
      isDevelopingClass,
      suppressStealsBusts,
      seasonsSinceDraft,
    },
  };
}

/**
 * Summarize which seasons have DRAFT data (for History / worker list).
 * @param {object[]} rawTransactions - capped recent list or season slice
 * @param {{ id: string, year: number }[]} seasonRows - merged season summaries
 */
export function indexDraftClassesFromTransactions(rawTransactions, seasonRows = []) {
  const yearBySeasonId = new Map((seasonRows || []).map((s) => [str(s?.id), num(s?.year)]));
  const groups = new Map();
  for (const tx of rawTransactions || []) {
    if (str(tx?.type).toUpperCase() !== 'DRAFT') continue;
    const sid = tx?.seasonId != null ? str(tx.seasonId) : '';
    if (!sid) continue;
    if (!groups.has(sid)) {
      groups.set(sid, { seasonId: sid, pickCount: 0, teamIds: new Set() });
    }
    const g = groups.get(sid);
    g.pickCount += 1;
    const tid = num(tx?.teamId);
    if (tid > 0) g.teamIds.add(tid);
  }
  const list = [...groups.values()].map((g) => ({
    seasonId: g.seasonId,
    year: yearBySeasonId.get(g.seasonId) || null,
    pickCount: g.pickCount,
    teamIds: [...g.teamIds],
  }));
  list.sort((a, b) => num(b.year) - num(a.year) || str(b.seasonId).localeCompare(str(a.seasonId)));
  return list;
}

/**
 * Compact player draft strip (UI + worker GET_PLAYER_DRAFT_CONTEXT).
 * @param {object} player
 * @param {object|null} classModel - optional full class model for this player's draft year
 */
export function buildPlayerDraftContext(player, classModel = null, draftTransactions = []) {
  const origin = findPlayerDraftOrigin(player, draftTransactions);
  const pid = num(player?.id);
  let redraftRank = null;
  let stealBustNote = '';
  if (classModel?.picks && pid) {
    const row = classModel.picks.find((p) => num(p.playerId) === pid);
    if (row) {
      redraftRank = row.redraftRank;
      if (classModel.classSummary?.isDevelopingClass) stealBustNote = 'Developing class — no steal/bust labels yet.';
      else if (num(row.redraftDelta) >= 48) stealBustNote = 'One of the biggest values vs draft slot.';
      else if (row.outcomeTier === 'BUST') stealBustNote = 'Draft capital has not paid off to date.';
    }
  }
  if (!origin && !redraftRank) {
    return { known: false };
  }
  const dy = num(player?.draftYear) || num(classModel?.year) || null;
  return {
    known: true,
    draftedByAbbr: origin?.draftTeamAbbr || player?.draftTeamAbbr || null,
    round: (origin?.round ?? num(player?.draftRound)) || null,
    pickInRound: (origin?.pickInRound ?? num(player?.draftPick)) || null,
    overall: (origin?.overall ?? num(player?.draftOverall ?? player?.draftOverallPick)) || null,
    draftYear: dy,
    redraftRank,
    outcomeLabel: classModel?.picks?.find((p) => num(p.playerId) === pid)?.outcomeLabel || null,
    stealBustNote,
  };
}
