/**
 * awardEngine.js — Historical Awards & Dynasty Records V1
 *
 * Pure module: no side effects, no imports from worker/UI/news.
 * Deterministic: same input always produces same output.
 *
 * Exported API:
 *   AWARD_TYPES            — constant object for all award type strings
 *   SEASON_END             — week constant for award entries
 *   determineSeasonAwards(players, teams, season, context)
 *     → { playerAwards, franchiseAwards, allProTeam }
 *   applySeasonAwards(playerMap, currentMeta, awardResults)
 *     → { playerUpdates: Map<pid, {awards:[...]}>, updatedFranchiseAwards: [...] }
 *   getPlayerAwardSummary(player)
 *     → { totalAwards, mvpCount, allProCount, championshipCount, highlights }
 *   checkCareerMilestones(player, season)
 *     → milestone event object or null
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const SEASON_END = 'SEASON_END';

export const AWARD_TYPES = Object.freeze({
  MVP: 'MVP',
  OFFENSIVE_POY: 'OFFENSIVE_POY',
  DEFENSIVE_POY: 'DEFENSIVE_POY',
  COACH_OF_YEAR: 'COACH_OF_YEAR',
  COMEBACK_PLAYER: 'COMEBACK_PLAYER',
  ROOKIE_OF_YEAR: 'ROOKIE_OF_YEAR',
  LEAGUE_CHAMPION: 'LEAGUE_CHAMPION',
  ALL_PRO_QB: 'ALL_PRO_QB',
  ALL_PRO_RB: 'ALL_PRO_RB',
  ALL_PRO_WR: 'ALL_PRO_WR',
  ALL_PRO_TE: 'ALL_PRO_TE',
  ALL_PRO_OL: 'ALL_PRO_OL',
  ALL_PRO_DL: 'ALL_PRO_DL',
  ALL_PRO_LB: 'ALL_PRO_LB',
  ALL_PRO_CB: 'ALL_PRO_CB',
  ALL_PRO_S: 'ALL_PRO_S',
  ALL_PRO_K: 'ALL_PRO_K',
  ALL_PRO_P: 'ALL_PRO_P',
});

export const AWARD_LABELS = Object.freeze({
  [AWARD_TYPES.MVP]: 'Most Valuable Player',
  [AWARD_TYPES.OFFENSIVE_POY]: 'Offensive Player of the Year',
  [AWARD_TYPES.DEFENSIVE_POY]: 'Defensive Player of the Year',
  [AWARD_TYPES.COACH_OF_YEAR]: 'Coach of the Year',
  [AWARD_TYPES.COMEBACK_PLAYER]: 'Comeback Player of the Year',
  [AWARD_TYPES.ROOKIE_OF_YEAR]: 'Rookie of the Year',
  [AWARD_TYPES.LEAGUE_CHAMPION]: 'League Champion',
  [AWARD_TYPES.ALL_PRO_QB]: 'First Team All-Pro QB',
  [AWARD_TYPES.ALL_PRO_RB]: 'First Team All-Pro RB',
  [AWARD_TYPES.ALL_PRO_WR]: 'First Team All-Pro WR',
  [AWARD_TYPES.ALL_PRO_TE]: 'First Team All-Pro TE',
  [AWARD_TYPES.ALL_PRO_OL]: 'First Team All-Pro OL',
  [AWARD_TYPES.ALL_PRO_DL]: 'First Team All-Pro DL',
  [AWARD_TYPES.ALL_PRO_LB]: 'First Team All-Pro LB',
  [AWARD_TYPES.ALL_PRO_CB]: 'First Team All-Pro CB',
  [AWARD_TYPES.ALL_PRO_S]: 'First Team All-Pro S',
  [AWARD_TYPES.ALL_PRO_K]: 'First Team All-Pro K',
  [AWARD_TYPES.ALL_PRO_P]: 'First Team All-Pro P',
});

export const CAREER_MILESTONE_TYPES = Object.freeze({
  TD_300: '300_CAREER_TDs',
  WINS_1000: '1000_CAREER_WINS',
  HOF_ELIGIBLE: 'HALL_OF_FAME_ELIGIBLE',
});

// ── Position group helpers ────────────────────────────────────────────────────

const OFF_SKILL_POS = new Set(['QB', 'RB', 'WR', 'TE']);
const OFF_POS = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'OT', 'OG', 'C', 'G', 'T', 'K', 'P']);
const DEF_POS = new Set(['DL', 'DE', 'DT', 'EDGE', 'LB', 'CB', 'S', 'SS', 'FS']);

function normPos(pos) {
  if (!pos) return '';
  const p = String(pos).toUpperCase();
  if (['SS', 'FS'].includes(p)) return 'S';
  if (['OT', 'OG', 'G', 'T', 'C'].includes(p)) return 'OL';
  if (p === 'DE') return 'DL';
  return p;
}

// ── Scoring helpers ───────────────────────────────────────────────────────────

function sv(totals, keys) {
  for (const key of keys) {
    const v = Number(totals?.[key] ?? 0);
    if (Number.isFinite(v) && v !== 0) return v;
  }
  return 0;
}

function teamWins(row, teamById) {
  return Number(teamById?.get(Number(row?.teamId))?.wins ?? 0);
}

function mvpScore(row, teamById) {
  const t = row?.totals ?? {};
  const tw = teamWins(row, teamById);
  const pos = String(row?.pos ?? '').toUpperCase();
  if (pos === 'QB') {
    return sv(t, ['passYd', 'passingYards']) / 25
      + sv(t, ['passTD', 'passingTd']) * 6
      + sv(t, ['rushYd', 'rushingYards']) / 10
      + sv(t, ['rushTD', 'rushingTd']) * 6
      - sv(t, ['passInt', 'interceptionsThrown', 'intsThrown', 'interceptions']) * 3
      + tw * 1.5;
  }
  if (pos === 'RB') {
    return sv(t, ['rushYd', 'rushingYards']) / 10
      + sv(t, ['rushTD', 'rushingTd']) * 6
      + sv(t, ['recYd', 'receivingYards']) / 10
      + sv(t, ['recTD', 'receivingTd']) * 6
      + tw * 0.8;
  }
  if (['WR', 'TE'].includes(pos)) {
    return sv(t, ['recYd', 'receivingYards']) / 10
      + sv(t, ['recTD', 'receivingTd']) * 6
      + Number(t.receptions ?? 0) * 0.15
      + tw * 0.6;
  }
  return 0;
}

function offpoyScore(row, teamById) {
  // Same as MVP score but excludes QBs (non-QB offensive POY)
  const pos = String(row?.pos ?? '').toUpperCase();
  if (pos === 'QB') return -1;
  return mvpScore(row, teamById);
}

function dpoyScore(row) {
  const t = row?.totals ?? {};
  const defInts = (() => {
    const pos = String(row?.pos ?? '').toUpperCase();
    const isDefPos = DEF_POS.has(pos);
    return isDefPos ? sv(t, ['defInterceptions', 'interceptions']) : sv(t, ['defInterceptions']);
  })();
  return Number(t.tackles ?? 0) * 1
    + Number(t.sacks ?? 0) * 5.5
    + defInts * 6.5
    + Number(t.forcedFumbles ?? 0) * 4;
}

function rotyScore(row, teamById) {
  return mvpScore(row, teamById)
    + sv(row?.totals ?? {}, ['passYd', 'passingYards']) / 30
    + sv(row?.totals ?? {}, ['rushYd', 'rushingYards']) / 12
    + sv(row?.totals ?? {}, ['recYd', 'receivingYards']) / 12;
}

function allProQBScore(row, teamById) {
  const t = row?.totals ?? {};
  return sv(t, ['passYd', 'passingYards']) / 23
    + sv(t, ['passTD', 'passingTd']) * 5.5
    + sv(t, ['rushYd', 'rushingYards']) / 12
    - sv(t, ['passInt', 'interceptionsThrown', 'intsThrown', 'interceptions']) * 3
    + teamWins(row, teamById) * 0.8;
}

function allProRBScore(row, teamById) {
  const t = row?.totals ?? {};
  return sv(t, ['rushYd', 'rushingYards'])
    + sv(t, ['rushTD', 'rushingTd']) * 80
    + sv(t, ['recYd', 'receivingYards']) * 0.4
    + teamWins(row, teamById) * 3;
}

function allProWRScore(row, teamById) {
  const t = row?.totals ?? {};
  return sv(t, ['recYd', 'receivingYards'])
    + sv(t, ['recTD', 'receivingTd']) * 90
    + Number(t.receptions ?? 0) * 3;
}

function allProTEScore(row, teamById) {
  const t = row?.totals ?? {};
  return sv(t, ['recYd', 'receivingYards'])
    + sv(t, ['recTD', 'receivingTd']) * 85
    + Number(t.receptions ?? 0) * 2.5;
}

function allProOLScore(row) {
  const t = row?.totals ?? {};
  // TODO: OL lacks individual stats; using OVR as proxy from player object
  return Number(t.gamesPlayed ?? 0) * 2 + Number(row?.ovr ?? 70);
}

function allProDLScore(row) {
  const t = row?.totals ?? {};
  return Number(t.sacks ?? 0) * 5
    + Number(t.tacklesForLoss ?? 0) * 2
    + Number(t.pressures ?? 0) * 0.4
    + Number(t.forcedFumbles ?? 0) * 3
    + Number(t.tackles ?? 0) * 0.2;
}

function allProLBScore(row) {
  const t = row?.totals ?? {};
  const defInts = sv(t, ['defInterceptions', 'interceptions']);
  return Number(t.tackles ?? 0) * 0.8
    + Number(t.sacks ?? 0) * 5
    + defInts * 6
    + Number(t.passesDefended ?? 0) * 2
    + Number(t.forcedFumbles ?? 0) * 3;
}

function allProCBScore(row) {
  const t = row?.totals ?? {};
  const defInts = sv(t, ['defInterceptions', 'interceptions']);
  return defInts * 7
    + Number(t.passesDefended ?? 0) * 2.5
    + Number(t.tackles ?? 0) * 0.4
    + Number(t.forcedFumbles ?? 0) * 3;
}

function allProSScore(row) {
  const t = row?.totals ?? {};
  const defInts = sv(t, ['defInterceptions', 'interceptions']);
  return defInts * 6.5
    + Number(t.passesDefended ?? 0) * 2
    + Number(t.tackles ?? 0) * 0.6
    + Number(t.forcedFumbles ?? 0) * 3;
}

function allProKScore(row) {
  const t = row?.totals ?? {};
  return sv(t, ['fgMade', 'fieldGoalsMade']) * 3
    + sv(t, ['xpMade', 'extraPointsMade']) * 1;
}

function allProPScore(row) {
  const t = row?.totals ?? {};
  const punts = Number(t.punts ?? 0);
  return punts > 0 ? (sv(t, ['puntYards', 'puntYd']) / punts) : 0;
}

// ── Selection helpers ─────────────────────────────────────────────────────────

const MIN_GAMES = 2;

function eligible(rows) {
  return (rows || []).filter(r => (r?.totals?.gamesPlayed ?? 0) >= MIN_GAMES);
}

function topByScore(rows, scoreFn) {
  return [...rows]
    .map(r => ({ row: r, score: scoreFn(r) }))
    .filter(item => Number.isFinite(item.score) && item.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.row ?? null;
}

function topNByScore(rows, scoreFn, n) {
  return [...rows]
    .map(r => ({ row: r, score: scoreFn(r) }))
    .filter(item => Number.isFinite(item.score) && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map(item => item.row);
}

function statSnapshotFor(row, type) {
  const t = row?.totals ?? {};
  const pos = String(row?.pos ?? '').toUpperCase();
  const base = { ovr: row?.ovr ?? 0 };
  if (pos === 'QB') return { ...base, passYd: t.passYd ?? 0, passTD: t.passTD ?? 0, interceptions: t.interceptions ?? 0, gamesPlayed: t.gamesPlayed ?? 0 };
  if (pos === 'RB') return { ...base, rushYd: t.rushYd ?? 0, rushTD: t.rushTD ?? 0, recYd: t.recYd ?? 0, gamesPlayed: t.gamesPlayed ?? 0 };
  if (['WR', 'TE'].includes(pos)) return { ...base, recYd: t.recYd ?? 0, recTD: t.recTD ?? 0, receptions: t.receptions ?? 0, gamesPlayed: t.gamesPlayed ?? 0 };
  if (['DL', 'EDGE', 'DT'].includes(pos)) return { ...base, sacks: t.sacks ?? 0, tackles: t.tackles ?? 0, forcedFumbles: t.forcedFumbles ?? 0, gamesPlayed: t.gamesPlayed ?? 0 };
  if (['LB', 'CB', 'S'].includes(pos)) return { ...base, tackles: t.tackles ?? 0, interceptions: t.interceptions ?? 0, sacks: t.sacks ?? 0, gamesPlayed: t.gamesPlayed ?? 0 };
  return { ...base, gamesPlayed: t.gamesPlayed ?? 0 };
}

function makePlayerAward(type, row, season) {
  if (!row) return null;
  return {
    type,
    season,
    week: SEASON_END,
    playerId: row.playerId,
    name: row.name ?? '',
    pos: row.pos ?? '',
    teamId: row.teamId ?? null,
    statSnapshot: statSnapshotFor(row, type),
    dedupeKey: `${type}_${season}`,
  };
}

// ── Main: determineSeasonAwards ────────────────────────────────────────────────

/**
 * Determine all season awards. Pure and deterministic.
 *
 * @param {Array} players      — All player objects (for age, careerStats, OVR lookups)
 * @param {Array} teams        — All team objects with { id, wins, ovr }
 * @param {number} season      — Season year (e.g. 2025)
 * @param {Object} context     — { stats: populatedStats, coaches: [{teamId, name}], championTeamId }
 * @returns {{ playerAwards, franchiseAwards, allProTeam }}
 */
export function determineSeasonAwards(players, teams, season, context) {
  const stats = Array.isArray(context?.stats) ? context.stats : [];
  const coaches = Array.isArray(context?.coaches) ? context.coaches : [];
  const championTeamId = context?.championTeamId ?? null;

  const teamById = new Map((teams || []).map(t => [Number(t.id), t]));
  const playerById = new Map((players || []).filter(p => p?.id != null).map(p => [String(p.id), p]));

  const rows = eligible(stats.filter(s => s?.totals));

  const offRows = rows.filter(r => {
    const p = String(r?.pos ?? '').toUpperCase();
    return OFF_SKILL_POS.has(p);
  });
  const defRows = rows.filter(r => DEF_POS.has(String(r?.pos ?? '').toUpperCase()));

  const isRookie = (row) => {
    const p = playerById.get(String(row?.playerId));
    return p?.year != null && Number(p.year) === Number(season);
  };

  // ── Individual season awards ──────────────────────────────────────────────

  const mvpWinner = topByScore(offRows, r => mvpScore(r, teamById));

  const offpoyWinner = topByScore(
    offRows.filter(r => String(r?.pos ?? '').toUpperCase() !== 'QB'),
    r => offpoyScore(r, teamById),
  );

  const dpoyWinner = topByScore(defRows, dpoyScore);

  const rookieRows = rows.filter(isRookie);
  const rotyWinner = topByScore(rookieRows, r => rotyScore(r, teamById));

  // COMEBACK_PLAYER: age 28+, biggest positive OVR delta from previous season careerStats
  const comebackWinner = (() => {
    const candidates = offRows.filter(r => {
      const p = playerById.get(String(r?.playerId));
      return p != null && Number(p?.age ?? 0) >= 28;
    });
    if (!candidates.length) return null;
    return topByScore(candidates, (r) => {
      const p = playerById.get(String(r?.playerId));
      const cs = Array.isArray(p?.careerStats) ? p.careerStats : [];
      if (cs.length < 2) return 0;
      const curr = Number(cs[cs.length - 1]?.ovr ?? 0);
      const prev = Number(cs[cs.length - 2]?.ovr ?? 0);
      const delta = curr - prev;
      return delta > 0 ? delta : 0;
    });
  })();

  // COACH_OF_YEAR: win-count overperformance vs pre-season OVR baseline
  // TODO: store preseason team OVR at season start for more accurate baseline
  const coachTeam = (() => {
    const sorted = [...(teams || [])]
      .map(t => {
        const expectedWins = Math.round(((t.ovr ?? 70) - 70) / 5 + 8.5);
        return { team: t, overperform: (t.wins ?? 0) - expectedWins };
      })
      .filter(item => item.overperform > 0)
      .sort((a, b) => b.overperform - a.overperform);
    return sorted[0]?.team ?? null;
  })();

  // ── Build playerAwards list ────────────────────────────────────────────────

  const playerAwards = [];
  const push = (type, row) => {
    const entry = makePlayerAward(type, row, season);
    if (entry) playerAwards.push(entry);
  };

  push(AWARD_TYPES.MVP, mvpWinner);
  push(AWARD_TYPES.OFFENSIVE_POY, offpoyWinner);
  push(AWARD_TYPES.DEFENSIVE_POY, dpoyWinner);
  push(AWARD_TYPES.ROOKIE_OF_YEAR, rotyWinner);
  push(AWARD_TYPES.COMEBACK_PLAYER, comebackWinner);

  // ── Franchise awards ──────────────────────────────────────────────────────

  const franchiseAwards = [];

  if (coachTeam != null) {
    const coachRow = coaches.find(c => Number(c.teamId) === Number(coachTeam.id));
    franchiseAwards.push({
      type: AWARD_TYPES.COACH_OF_YEAR,
      season,
      teamId: coachTeam.id,
      coachName: coachRow?.name ?? null,
    });
  }

  if (championTeamId != null) {
    franchiseAwards.push({
      type: AWARD_TYPES.LEAGUE_CHAMPION,
      season,
      teamId: championTeamId,
      coachName: null,
    });
  }

  // ── All-Pro team ──────────────────────────────────────────────────────────

  const allProTeam = [];

  const allProEntry = (type, row) => {
    const entry = makePlayerAward(type, row, season);
    if (entry) {
      entry.dedupeKey = `${type}_${season}`;
      allProTeam.push(entry);
    }
  };

  const qbRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'QB');
  const rbRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'RB');
  const wrRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'WR');
  const teRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'TE');
  const olRows = rows.filter(r => {
    const p = String(r?.pos ?? '').toUpperCase();
    return ['OL', 'OT', 'OG', 'C', 'G', 'T'].includes(p);
  });
  const dlRows = rows.filter(r => {
    const p = String(r?.pos ?? '').toUpperCase();
    return ['DL', 'DE', 'DT', 'EDGE'].includes(p);
  });
  const lbRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'LB');
  const cbRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'CB');
  const sRows = rows.filter(r => ['S', 'SS', 'FS'].includes(String(r?.pos ?? '').toUpperCase()));
  const kRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'K');
  const pRows = rows.filter(r => String(r?.pos ?? '').toUpperCase() === 'P');

  // 1 QB
  allProEntry(AWARD_TYPES.ALL_PRO_QB, topByScore(qbRows, r => allProQBScore(r, teamById)));

  // 1 RB
  allProEntry(AWARD_TYPES.ALL_PRO_RB, topByScore(rbRows, r => allProRBScore(r, teamById)));

  // 2 WR — dedupe by playerId
  const seenWR = new Set();
  for (const row of topNByScore(wrRows, r => allProWRScore(r, teamById), 2)) {
    if (!seenWR.has(row.playerId)) {
      seenWR.add(row.playerId);
      allProEntry(AWARD_TYPES.ALL_PRO_WR, row);
    }
  }

  // 1 TE
  allProEntry(AWARD_TYPES.ALL_PRO_TE, topByScore(teRows, allProTEScore));

  // 2 OL — dedupe
  const seenOL = new Set();
  for (const row of topNByScore(olRows, allProOLScore, 2)) {
    if (!seenOL.has(row.playerId)) {
      seenOL.add(row.playerId);
      // Each OL entry needs a unique dedupeKey since there are 2 slots
      const entry = makePlayerAward(AWARD_TYPES.ALL_PRO_OL, row, season);
      if (entry) {
        entry.dedupeKey = `${AWARD_TYPES.ALL_PRO_OL}_${season}_${row.playerId}`;
        allProTeam.push(entry);
      }
    }
  }

  // 2 DL — dedupe
  const seenDL = new Set();
  for (const row of topNByScore(dlRows, allProDLScore, 2)) {
    if (!seenDL.has(row.playerId)) {
      seenDL.add(row.playerId);
      const entry = makePlayerAward(AWARD_TYPES.ALL_PRO_DL, row, season);
      if (entry) {
        entry.dedupeKey = `${AWARD_TYPES.ALL_PRO_DL}_${season}_${row.playerId}`;
        allProTeam.push(entry);
      }
    }
  }

  // 2 LB — dedupe
  const seenLB = new Set();
  for (const row of topNByScore(lbRows, allProLBScore, 2)) {
    if (!seenLB.has(row.playerId)) {
      seenLB.add(row.playerId);
      const entry = makePlayerAward(AWARD_TYPES.ALL_PRO_LB, row, season);
      if (entry) {
        entry.dedupeKey = `${AWARD_TYPES.ALL_PRO_LB}_${season}_${row.playerId}`;
        allProTeam.push(entry);
      }
    }
  }

  // 2 CB — dedupe
  const seenCB = new Set();
  for (const row of topNByScore(cbRows, allProCBScore, 2)) {
    if (!seenCB.has(row.playerId)) {
      seenCB.add(row.playerId);
      const entry = makePlayerAward(AWARD_TYPES.ALL_PRO_CB, row, season);
      if (entry) {
        entry.dedupeKey = `${AWARD_TYPES.ALL_PRO_CB}_${season}_${row.playerId}`;
        allProTeam.push(entry);
      }
    }
  }

  // 1 S
  allProEntry(AWARD_TYPES.ALL_PRO_S, topByScore(sRows, allProSScore));

  // 1 K
  allProEntry(AWARD_TYPES.ALL_PRO_K, topByScore(kRows, allProKScore));

  // 1 P
  allProEntry(AWARD_TYPES.ALL_PRO_P, topByScore(pRows, allProPScore));

  return { playerAwards, franchiseAwards, allProTeam };
}

// ── applySeasonAwards ─────────────────────────────────────────────────────────

/**
 * Pure function: merges new award entries into player.awards and meta.franchiseAwards.
 * Deduplicates by dedupeKey.
 *
 * @param {Map} playerMap           — Map<playerId (string), playerObject>
 * @param {Object} currentMeta      — Current meta object (reads franchiseAwards)
 * @param {Object} awardResults     — Output of determineSeasonAwards
 * @returns {{ playerUpdates: Map<string, {awards:[...]}>, updatedFranchiseAwards: [...] }}
 */
export function applySeasonAwards(playerMap, currentMeta, awardResults) {
  const { playerAwards = [], franchiseAwards = [], allProTeam = [] } = awardResults;
  const allPlayerAwards = [...playerAwards, ...allProTeam];

  const playerUpdates = new Map();

  for (const award of allPlayerAwards) {
    if (award?.playerId == null) continue;
    const pidStr = String(award.playerId);
    const player = playerMap.get(pidStr) ?? playerMap.get(Number(award.playerId));
    if (!player) continue;

    const existingAwards = Array.isArray(player.awards) ? player.awards : [];
    if (existingAwards.some(a => a.dedupeKey === award.dedupeKey)) continue;

    const pending = playerUpdates.get(pidStr);
    const base = pending?.awards ?? existingAwards;
    playerUpdates.set(pidStr, { awards: [...base, award] });
  }

  const existingFranchiseAwards = Array.isArray(currentMeta?.franchiseAwards) ? currentMeta.franchiseAwards : [];
  const seenKeys = new Set(existingFranchiseAwards.map(a => `${a.type}_${a.season}`));
  const newFranchiseAwards = [];
  for (const fa of franchiseAwards) {
    const key = `${fa.type}_${fa.season}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    newFranchiseAwards.push(fa);
  }

  return {
    playerUpdates,
    updatedFranchiseAwards: [...existingFranchiseAwards, ...newFranchiseAwards],
  };
}

// ── getPlayerAwardSummary ──────────────────────────────────────────────────────

/**
 * Build a compact summary of a player's career awards from player.awards.
 * Safe for players with no awards field.
 */
export function getPlayerAwardSummary(player) {
  const awards = Array.isArray(player?.awards) ? player.awards : [];
  const mvpCount = awards.filter(a => a.type === AWARD_TYPES.MVP).length;
  const allProCount = awards.filter(a => a.type.startsWith('ALL_PRO_')).length;
  const championshipCount = awards.filter(a => a.type === AWARD_TYPES.LEAGUE_CHAMPION).length;

  const sortedForHighlights = [...awards].sort((a, b) => (b.season ?? 0) - (a.season ?? 0));
  const highlights = sortedForHighlights.slice(0, 5).map(a => ({
    label: AWARD_LABELS[a.type] ?? a.type,
    season: a.season,
    teamId: a.teamId,
    dedupeKey: a.dedupeKey,
  }));

  // Compact summary line, e.g. "2× All-Pro · 1× MVP · 1× Champion"
  const parts = [];
  if (mvpCount > 0) parts.push(`${mvpCount > 1 ? `${mvpCount}× ` : ''}MVP`);
  if (allProCount > 0) parts.push(`${allProCount > 1 ? `${allProCount}× ` : ''}All-Pro`);
  if (championshipCount > 0) parts.push(`${championshipCount > 1 ? `${championshipCount}× ` : ''}Champion`);

  const otherTypes = [AWARD_TYPES.OFFENSIVE_POY, AWARD_TYPES.DEFENSIVE_POY, AWARD_TYPES.ROOKIE_OF_YEAR, AWARD_TYPES.COMEBACK_PLAYER];
  for (const type of otherTypes) {
    const cnt = awards.filter(a => a.type === type).length;
    if (cnt > 0) {
      const short = AWARD_LABELS[type]?.split(' ').map(w => w[0]).join('') ?? type;
      parts.push(`${cnt > 1 ? `${cnt}× ` : ''}${short}`);
    }
  }

  return {
    totalAwards: awards.length,
    mvpCount,
    allProCount,
    championshipCount,
    highlights,
    summaryLine: parts.join(' · ') || null,
  };
}

// ── checkCareerMilestones ─────────────────────────────────────────────────────

/**
 * Check if a player crossed a career milestone this season.
 * Returns the first milestone crossed, or null.
 *
 * Safe for players with no careerStats.
 */
export function checkCareerMilestones(player, season) {
  if (!player) return null;
  const careerStats = Array.isArray(player.careerStats) ? player.careerStats : [];
  if (!careerStats.length) return null;

  const pos = String(player?.pos ?? '').toUpperCase();

  // 300 career TDs — QB/WR/TE/RB
  if (['QB', 'WR', 'TE', 'RB'].includes(pos)) {
    let total = 0;
    let prevTotal = 0;
    for (let i = 0; i < careerStats.length; i++) {
      const s = careerStats[i];
      const tds = (s.passTDs ?? s.passTD ?? 0)
        + (s.rushTDs ?? s.rushTD ?? 0)
        + (s.recTDs ?? s.recTD ?? 0);
      if (i < careerStats.length - 1) prevTotal += tds;
      total += tds;
    }
    if (prevTotal < 300 && total >= 300) {
      return {
        type: CAREER_MILESTONE_TYPES.TD_300,
        playerId: player.id,
        name: player.name,
        pos,
        season,
        totalTDs: total,
      };
    }
  }

  // HOF eligibility: age 35+, retired, OVR 85+ or 3+ MVP/DPOY in player.awards
  const age = Number(player?.age ?? 0);
  const ovr = Number(player?.ovr ?? 0);
  const isRetired = player?.status === 'retired';
  const awardsArr = Array.isArray(player?.awards) ? player.awards : [];
  const mvpCount = awardsArr.filter(a => a.type === AWARD_TYPES.MVP).length;
  const dpoyCount = awardsArr.filter(a => a.type === AWARD_TYPES.DEFENSIVE_POY).length;

  if (isRetired && age >= 35 && (ovr >= 85 || mvpCount + dpoyCount >= 3)) {
    return {
      type: CAREER_MILESTONE_TYPES.HOF_ELIGIBLE,
      playerId: player.id,
      name: player.name,
      pos,
      season,
      ovr,
      mvpCount,
    };
  }

  return null;
}
