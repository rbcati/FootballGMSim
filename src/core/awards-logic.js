/**
 * awards-logic.js  —  Mid-season Award Races & All-Pro Projection Engine
 *
 * Evaluates the live seasonStats accumulator to rank players for every
 * major award and project the 1st/2nd Team All-Pro selections.
 *
 * Design goals:
 *  - Pure functions only — no DB access, no side effects.
 *  - Deterministic: same inputs → same outputs (no randomness).
 *  - Conference-aware: OPOY/DPOY/OROY/DROY split by AFC/NFC.
 *  - Rookie detection: uses player.year === currentYear (draft class year).
 *
 * Exported API:
 *   calculateAwardRaces(allEntries, allPlayers, allTeams, currentYear)
 *
 * Parameters:
 *   allEntries   – Array of enriched stat entries:
 *                  { playerId, name, pos, teamId, teamAbbr, conf, totals }
 *   allPlayers   – Map<playerId, playerObject> (from cache)
 *   allTeams     – Array of team objects with { id, conf, wins, losses, ties }
 *   currentYear  – The numeric year of the current season (for rookie detection)
 *
 * Returns:
 *   {
 *     awards: { mvp, opoy, dpoy, oroy, droy },   // each: { league | afc, nfc } → top-5 candidates
 *     allPro:  { first, second }                  // each: { QB, RB, WR, TE, EDGE, DT, LB, CB, S, K, P }
 *   }
 */

// ── Position group helpers ────────────────────────────────────────────────────

const OFF_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'OL', 'OT', 'OG', 'C', 'G', 'T']);
const DEF_POSITIONS = new Set(['DL', 'DE', 'DT', 'EDGE', 'LB', 'CB', 'S', 'SS', 'FS']);
const CONF_AFC = 0;  // numeric conf values (matches the game's team.conf encoding)
const CONF_NFC = 1;

function normaliseConf(val) {
  if (typeof val === 'number') return val;
  if (val === 'AFC') return CONF_AFC;
  return CONF_NFC;
}

function normalisePos(pos) {
  if (!pos) return '';
  const p = pos.toUpperCase();
  if (['SS', 'FS'].includes(p))          return 'S';
  if (['OT', 'OG', 'G', 'T', 'C'].includes(p)) return 'OL';
  if (['DE', 'DT', 'DL'].includes(p))   return p === 'DT' ? 'DT' : 'EDGE';
  return p;
}

// ── Scoring functions ─────────────────────────────────────────────────────────

/**
 * Passer Rating (0–158.3 scale)
 */
function passerRating(t) {
  const att = t.passAtt || 0;
  if (att < 1) return 0;
  const a = Math.max(0, Math.min(2.375, ((t.passComp || 0) / att - 0.3) / 0.2));
  const b = Math.max(0, Math.min(2.375, ((t.passYd    || 0) / att - 3)   / 4));
  const c = Math.max(0, Math.min(2.375, ((t.passTD    || 0) / att)        / 0.05));
  const d = Math.max(0, Math.min(2.375, 2.375 - ((t.interceptions || 0) / att) / 0.04));
  return ((a + b + c + d) / 6) * 100;
}

/**
 * Offensive value score — position-aware composite
 * Used for OPOY and MVP (offensive component)
 */
function offensiveScore(entry, teamWins) {
  const t   = entry.totals || {};
  const pos = entry.pos?.toUpperCase() ?? '';

  if (pos === 'QB') {
    const rtg = passerRating(t);
    return (t.passYd || 0) * 0.03
      + (t.passTD  || 0) * 2.5
      - (t.interceptions || 0) * 1.8
      + (t.rushYd  || 0) * 0.02
      + (t.rushTD  || 0) * 1.5
      + teamWins * 0.9
      + rtg * 0.05;
  }
  if (pos === 'RB') {
    return (t.rushYd  || 0) * 0.04
      + (t.rushTD  || 0) * 3.0
      + (t.recYd   || 0) * 0.02
      + (t.recTD   || 0) * 2.5
      + teamWins * 0.4;
  }
  if (['WR', 'TE'].includes(pos)) {
    return (t.recYd   || 0) * 0.04
      + (t.recTD   || 0) * 3.0
      + (t.receptions || 0) * 0.2
      + teamWins * 0.35;
  }
  // OL — very limited individual stats
  return (t.gamesPlayed || 0) * 0.5;
}

/**
 * Defensive value score — composite
 */
function defensiveScore(entry) {
  const t   = entry.totals || {};
  const pos = normalisePos(entry.pos);

  if (pos === 'EDGE' || pos === 'DT') {
    return (t.sacks          || 0) * 3.5
      + (t.tacklesForLoss  || 0) * 1.8
      + (t.pressures       || 0) * 0.6
      + (t.forcedFumbles   || 0) * 2.5
      + (t.tackles         || 0) * 0.25;
  }
  if (pos === 'LB') {
    return (t.tackles        || 0) * 0.6
      + (t.sacks            || 0) * 2.5
      + (t.tacklesForLoss   || 0) * 1.5
      + (t.interceptions    || 0) * 4.0
      + (t.passesDefended   || 0) * 1.2
      + (t.forcedFumbles    || 0) * 2.0;
  }
  if (pos === 'CB') {
    return (t.interceptions  || 0) * 5.0
      + (t.passesDefended   || 0) * 1.5
      + (t.tackles          || 0) * 0.35
      + (t.forcedFumbles    || 0) * 2.0;
  }
  if (pos === 'S') {
    return (t.interceptions  || 0) * 4.5
      + (t.passesDefended   || 0) * 1.3
      + (t.tackles          || 0) * 0.45
      + (t.forcedFumbles    || 0) * 2.0;
  }
  // Generic defensive
  return (t.tackles || 0) * 0.3
    + (t.sacks      || 0) * 2.0
    + (t.interceptions || 0) * 3.0;
}

/**
 * MVP composite: heavily favours QBs on winning teams, but any elite
 * offensive or defensive player can appear in the top 5.
 */
function mvpScore(entry, teamWins) {
  const pos = entry.pos?.toUpperCase() ?? '';
  const offScore = offensiveScore(entry, teamWins);
  const defScore = defensiveScore(entry);

  if (OFF_POSITIONS.has(pos)) {
    // QBs get an additional leadership/visibility multiplier
    const multiplier = pos === 'QB' ? 1.15 : 1.0;
    return offScore * multiplier;
  }
  // Defensive players can win MVP but face a significant headwind
  return defScore * 0.7;
}

// ── Key stat summary for display ─────────────────────────────────────────────

/**
 * Build the 3-4 most relevant stats to display next to a candidate.
 * Returns an array of { label, value } objects.
 */
function keyStats(entry) {
  const t   = entry.totals || {};
  const pos = entry.pos?.toUpperCase() ?? '';

  if (pos === 'QB') {
    const cmpPct = t.passAtt ? ((t.passComp || 0) / t.passAtt * 100).toFixed(1) + '%' : '-';
    return [
      { label: 'Pass Yds', value: t.passYd  ?? 0 },
      { label: 'TD',       value: t.passTD  ?? 0 },
      { label: 'INT',      value: t.interceptions ?? 0 },
      { label: 'Cmp%',     value: cmpPct },
    ];
  }
  if (pos === 'RB') {
    const ypc = t.rushAtt ? ((t.rushYd || 0) / t.rushAtt).toFixed(1) : '-';
    return [
      { label: 'Rush Yds', value: t.rushYd ?? 0 },
      { label: 'TD',       value: t.rushTD ?? 0 },
      { label: 'YPC',      value: ypc },
      { label: 'Rec Yds',  value: t.recYd ?? 0 },
    ];
  }
  if (['WR', 'TE'].includes(pos)) {
    return [
      { label: 'Rec Yds', value: t.recYd       ?? 0 },
      { label: 'TD',      value: t.recTD        ?? 0 },
      { label: 'Rec',     value: t.receptions   ?? 0 },
      { label: 'YAC',     value: t.yardsAfterCatch ?? 0 },
    ];
  }
  if (['DL', 'DE', 'EDGE'].includes(pos)) {
    return [
      { label: 'Sacks',    value: t.sacks        ?? 0 },
      { label: 'TFL',      value: t.tacklesForLoss ?? 0 },
      { label: 'Pres',     value: t.pressures    ?? 0 },
      { label: 'FF',       value: t.forcedFumbles ?? 0 },
    ];
  }
  if (pos === 'LB') {
    return [
      { label: 'Tackles', value: t.tackles      ?? 0 },
      { label: 'Sacks',   value: t.sacks        ?? 0 },
      { label: 'INT',     value: t.interceptions ?? 0 },
      { label: 'PD',      value: t.passesDefended ?? 0 },
    ];
  }
  if (['CB', 'S', 'SS', 'FS'].includes(pos)) {
    return [
      { label: 'INT', value: t.interceptions  ?? 0 },
      { label: 'PD',  value: t.passesDefended ?? 0 },
      { label: 'Tkl', value: t.tackles        ?? 0 },
      { label: 'FF',  value: t.forcedFumbles  ?? 0 },
    ];
  }
  if (pos === 'K') {
    const fgPct = t.fgAttempts ? ((t.fgMade || 0) / t.fgAttempts * 100).toFixed(1) + '%' : '-';
    return [
      { label: 'FGM',  value: t.fgMade      ?? 0 },
      { label: 'FGA',  value: t.fgAttempts  ?? 0 },
      { label: 'FG%',  value: fgPct },
      { label: 'XPM',  value: t.xpMade      ?? 0 },
    ];
  }
  if (pos === 'P') {
    const avg = t.punts ? ((t.puntYards || 0) / t.punts).toFixed(1) : '-';
    return [
      { label: 'Punts', value: t.punts      ?? 0 },
      { label: 'Avg',   value: avg },
      { label: 'Lng',   value: t.longestPunt ?? 0 },
    ];
  }
  return [{ label: 'GP', value: t.gamesPlayed ?? 0 }];
}

// ── Ranking helpers ───────────────────────────────────────────────────────────

/**
 * Given a flat list of entries, sort by scoreFn and return the top N.
 * Attaches `.score`, `.keyStats`, and `.rank` to each result.
 */
function topN(entries, scoreFn, n = 5) {
  return entries
    .map(e => ({ ...e, score: scoreFn(e) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((e, i) => ({ ...e, rank: i + 1, keyStats: keyStats(e) }));
}

/**
 * Minimum games threshold to be considered for an award (prevents
 * a player who appeared in one game from headlining the leaderboard).
 */
const MIN_GAMES_AWARD = 2;

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * calculateAwardRaces
 *
 * @param {Array}  allEntries   Enriched stat entries (see module doc above)
 * @param {Map}    playerMap    Map<playerId, player>  from cache
 * @param {Array}  allTeams     All 32 team objects
 * @param {number} currentYear  e.g. 2025
 * @returns {{ awards, allPro }}
 */
export function calculateAwardRaces(allEntries, playerMap, allTeams, currentYear) {
  // Build a fast team-by-id map for conference & record look-ups
  const teamById = new Map(allTeams.map(t => [t.id, t]));

  // Enrich entries with conference info and filter out bench-warmers
  const entries = allEntries
    .filter(e => (e.totals?.gamesPlayed ?? 0) >= MIN_GAMES_AWARD)
    .map(e => {
      const team = teamById.get(e.teamId);
      return {
        ...e,
        conf:     team ? normaliseConf(team.conf) : -1,
        teamWins: team ? (team.wins ?? 0) : 0,
        confLabel: team ? (normaliseConf(team.conf) === CONF_AFC ? 'AFC' : 'NFC') : '?',
      };
    });

  const offEntries = entries.filter(e => OFF_POSITIONS.has(e.pos?.toUpperCase()));
  const defEntries = entries.filter(e => DEF_POSITIONS.has(e.pos?.toUpperCase()));
  const afcOff = offEntries.filter(e => e.conf === CONF_AFC);
  const nfcOff = offEntries.filter(e => e.conf === CONF_NFC);
  const afcDef = defEntries.filter(e => e.conf === CONF_AFC);
  const nfcDef = defEntries.filter(e => e.conf === CONF_NFC);

  // Rookie detection: player.year is the draft year → rookie = year === currentYear
  function isRookie(playerId) {
    const p = playerMap.get(playerId);
    if (!p) return false;
    // A player is a rookie if their draft year matches the current year.
    // Undrafted free agents (no p.year) are not treated as rookies.
    return p.year != null && p.year === currentYear;
  }

  const afcORookies = afcOff.filter(e => isRookie(e.playerId));
  const nfcORookies = nfcOff.filter(e => isRookie(e.playerId));
  const afcDRookies = afcDef.filter(e => isRookie(e.playerId));
  const nfcDRookies = nfcDef.filter(e => isRookie(e.playerId));

  // ── Awards ────────────────────────────────────────────────────────────────

  const awards = {
    mvp:  { league: topN(entries, e => mvpScore(e, e.teamWins)) },

    opoy: {
      afc: topN(afcOff, e => offensiveScore(e, e.teamWins)),
      nfc: topN(nfcOff, e => offensiveScore(e, e.teamWins)),
    },

    dpoy: {
      afc: topN(afcDef, defensiveScore),
      nfc: topN(nfcDef, defensiveScore),
    },

    oroy: {
      afc: topN(afcORookies, e => offensiveScore(e, e.teamWins)),
      nfc: topN(nfcORookies, e => offensiveScore(e, e.teamWins)),
    },

    droy: {
      afc: topN(afcDRookies, defensiveScore),
      nfc: topN(nfcDRookies, defensiveScore),
    },
  };

  // ── All-Pro teams ────────────────────────────────────────────────────────

  /**
   * Resolve the top `slots` players at a position using `scoreFn`.
   * Returns first-team (slot 0) and second-team (slot 1) picks.
   */
  function allProAt(candidatePool, posFilter, scoreFn, slots = 2) {
    const pool = candidatePool
      .filter(e => posFilter(e.pos?.toUpperCase()))
      .map(e => ({ ...e, score: scoreFn(e) }))
      .sort((a, b) => b.score - a.score)
      .map((e, i) => ({ ...e, rank: i + 1, keyStats: keyStats(e) }));

    return {
      first:  pool.slice(0, slots),
      second: pool.slice(slots, slots * 2),
    };
  }

  const isEdge  = p => ['DE', 'EDGE', 'DL'].includes(p) && p !== 'DT';
  const isDT    = p => p === 'DT';
  const isLB    = p => p === 'LB';
  const isCB    = p => p === 'CB';
  const isS     = p => ['S', 'SS', 'FS'].includes(p);
  const isK     = p => p === 'K';
  const isP     = p => p === 'P';
  const isQB    = p => p === 'QB';
  const isRB    = p => p === 'RB';
  const isWR    = p => p === 'WR';
  const isTE    = p => p === 'TE';

  // Helper that returns a scoreFn bound to the entry's team wins
  const offScoreFn = e => offensiveScore(e, e.teamWins);

  const qbAP   = allProAt(offEntries, isQB,   offScoreFn, 1);
  const rbAP   = allProAt(offEntries, isRB,   offScoreFn, 2);
  const wrAP   = allProAt(offEntries, isWR,   offScoreFn, 3); // 3 WR spots on All-Pro
  const teAP   = allProAt(offEntries, isTE,   offScoreFn, 1);
  const edgeAP = allProAt(defEntries, isEdge, defensiveScore, 2);
  const dtAP   = allProAt(defEntries, isDT,   defensiveScore, 1);
  const lbAP   = allProAt(defEntries, isLB,   defensiveScore, 3); // 3 LB spots
  const cbAP   = allProAt(defEntries, isCB,   defensiveScore, 2);
  const sAP    = allProAt(defEntries, isS,    defensiveScore, 1);
  const kAP    = allProAt(entries,    isK,    e => (e.totals?.fgMade ?? 0) * 2 + (e.totals?.fgAttempts ?? 0) * 0.5, 1);
  const pAP    = allProAt(entries,    isP,    e => {
    const t = e.totals ?? {};
    return t.punts ? (t.puntYards / t.punts) : 0;
  }, 1);

  function mergeFirst(obj)  { return obj.first;  }
  function mergeSecond(obj) { return obj.second; }

  const allPro = {
    first: {
      QB:   mergeFirst(qbAP),
      RB:   mergeFirst(rbAP),
      WR:   mergeFirst(wrAP),
      TE:   mergeFirst(teAP),
      EDGE: mergeFirst(edgeAP),
      DT:   mergeFirst(dtAP),
      LB:   mergeFirst(lbAP),
      CB:   mergeFirst(cbAP),
      S:    mergeFirst(sAP),
      K:    mergeFirst(kAP),
      P:    mergeFirst(pAP),
    },
    second: {
      QB:   mergeSecond(qbAP),
      RB:   mergeSecond(rbAP),
      WR:   mergeSecond(wrAP),
      TE:   mergeSecond(teAP),
      EDGE: mergeSecond(edgeAP),
      DT:   mergeSecond(dtAP),
      LB:   mergeSecond(lbAP),
      CB:   mergeSecond(cbAP),
      S:    mergeSecond(sAP),
      K:    mergeSecond(kAP),
      P:    mergeSecond(pAP),
    },
  };

  return { awards, allPro };
}
