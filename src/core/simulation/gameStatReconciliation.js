/*
 * gameStatReconciliation.js — Canonical postgame reconciliation invariants
 * ────────────────────────────────────────────────────────────────────────
 * Pure helpers that prove the canonical postgame surfaces describe ONE game:
 *
 *   • score breakdown  — TDs / FGs / XPs / 2-pt / safeties / def+ST scores
 *                        add up to the final score.
 *   • player ↔ team    — every team offensive total is exactly the sum of its
 *                        players' canonical box-score lines.
 *   • passing ↔ receiving — team passing yards/TDs equal team receiving
 *                        yards/TDs (this model attributes a completion to one
 *                        receiver, so they are identical by construction).
 *
 * These functions never mutate input and never call an RNG. They are the
 * assertion surface for the reconciliation test-suite; nothing in the sim path
 * is "repaired" here — a failure means a producer upstream is contradictory.
 */

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

function rowStats(row) {
  return row && typeof row === 'object' && row.stats && typeof row.stats === 'object' ? row.stats : (row || {});
}

/**
 * Sum a canonical box-score side ({ [pid]: { name, pos, stats } }) into team
 * offensive/defensive totals, using the same offense/defense discrimination the
 * canonical team-stat builder uses (a row with pass/rush/target/reception
 * involvement is an offensive row; a bare `interceptions` on a non-passer is a
 * takeaway, not a giveaway).
 */
export function sumBoxScoreSide(side = {}) {
  const rows = Object.values(side || {});
  const isOffense = (s) => n(s.passAtt) > 0 || n(s.rushAtt) > 0 || n(s.targets) > 0 || n(s.receptions) > 0;
  const sumIf = (key, pred = () => true) => rows.reduce((a, row) => {
    const s = rowStats(row);
    return pred(s) ? a + n(s[key]) : a;
  }, 0);

  return {
    passAtt: sumIf('passAtt'),
    passComp: sumIf('passComp'),
    passYd: sumIf('passYd', (s) => n(s.passAtt) > 0),
    passTD: sumIf('passTD', (s) => n(s.passAtt) > 0),
    rushAtt: sumIf('rushAtt'),
    rushYd: sumIf('rushYd'),
    rushTD: sumIf('rushTD'),
    receptions: sumIf('receptions'),
    recYd: sumIf('recYd'),
    recTD: sumIf('recTD'),
    // Interceptions thrown (giveaways) live on passer rows; INTs made live on
    // defenders. Keep them apart so they never cancel.
    interceptionsThrown: sumIf('interceptions', (s) => n(s.passAtt) > 0),
    interceptionsMade: sumIf('interceptions', (s) => n(s.passAtt) === 0),
    sacksMade: sumIf('sacks', (s) => n(s.passAtt) === 0),
  };
}

/**
 * Reconcile one team's player totals against each other (the internal identities
 * that must always hold for a single canonical game). Returns a structured
 * report; `ok` is true only when every identity holds exactly.
 */
export function reconcilePlayerIdentities(side = {}) {
  const t = sumBoxScoreSide(side);
  const checks = [
    { key: 'passYards==recYards', a: t.passYd, b: t.recYd },
    { key: 'passTD==recTD', a: t.passTD, b: t.recTD },
    { key: 'passComp==receptions', a: t.passComp, b: t.receptions },
  ];
  const results = checks.map((c) => ({ ...c, delta: c.a - c.b, ok: c.a === c.b }));
  return { totals: t, checks: results, ok: results.every((r) => r.ok) };
}

/**
 * Reconcile a team's player-sum totals against an independently-provided team
 * total object (e.g. teamStats from the canonical builder). `tolerance` allows a
 * documented gross/net passing-yard gap (sack yardage) when the team total is
 * net; pass 0 to require exact equality.
 */
export function reconcilePlayerToTeam(side = {}, teamTotals = {}, { tolerance = 0 } = {}) {
  const p = sumBoxScoreSide(side);
  const field = (teamKeys, playerVal) => {
    let team = null;
    for (const k of teamKeys) { if (teamTotals?.[k] != null) { team = n(teamTotals[k]); break; } }
    if (team == null) return null;
    const delta = playerVal - team;
    return { player: playerVal, team, delta, ok: Math.abs(delta) <= tolerance };
  };
  const report = {
    passYards: field(['passYards', 'passYd', 'passYds'], p.passYd),
    rushYards: field(['rushYards', 'rushYd', 'rushYds'], p.rushYd),
    passAtt: field(['passAtt'], p.passAtt),
    rushAtt: field(['rushAtt'], p.rushAtt),
    receptions: field(['receptions'], p.receptions),
    recYards: field(['recYards', 'recYd', 'recYds'], p.recYd),
    passTD: field(['passTD'], p.passTD),
    rushTD: field(['rushTD'], p.rushTD),
  };
  const evaluated = Object.values(report).filter(Boolean);
  return { report, ok: evaluated.every((r) => r.ok) };
}

/**
 * Verify the point-scoring breakdown sums to the final score for one team.
 * Accounts for missed extra points, two-point conversions, safeties, and
 * defensive / special-teams touchdowns — no assumption that every TD is worth 7.
 *
 * points = 6*(offTDs) + xpMade + 2*twoPtMade + 3*fieldGoals + 6*(defTDs+stTDs)
 *          + xp on those return TDs + 2*safeties
 *
 * Because the drive engine owns the score AND the TD/FG/XP breakdown, this is an
 * exact identity for the authoritative side of the result.
 */
export function reconcileScoreBreakdown(breakdown = {}) {
  const offTDs = n(breakdown.touchdowns);          // offensive TDs
  const returnTDs = n(breakdown.defensiveTDs) + n(breakdown.specialTeamsTDs);
  const fieldGoals = n(breakdown.fieldGoals);
  const xpMade = n(breakdown.xpMade) + n(breakdown.returnXpMade);
  const twoPtMade = n(breakdown.twoPtMade);
  const safeties = n(breakdown.safeties);

  const computed = (offTDs + returnTDs) * 6 + xpMade + twoPtMade * 2 + fieldGoals * 3 + safeties * 2;
  const finalScore = n(breakdown.finalScore);
  return {
    computed,
    finalScore,
    delta: computed - finalScore,
    ok: computed === finalScore,
    parts: { offTDs, returnTDs, fieldGoals, xpMade, twoPtMade, safeties },
  };
}

/**
 * Confirm the quarter-by-quarter totals add up to the final score for each side.
 * (Quarter attribution timeline may lag the authoritative total in the
 * transitional narration model; this helper is the assertion that flags any gap
 * so it can be surfaced rather than hidden.)
 */
export function reconcileQuarterTotals(quarterScores = {}, finalScore = {}) {
  const side = (arr) => (Array.isArray(arr) ? arr.reduce((a, v) => a + n(v), 0) : 0);
  const home = side(quarterScores.home);
  const away = side(quarterScores.away);
  return {
    home: { quarters: home, final: n(finalScore.home), ok: home === n(finalScore.home) },
    away: { quarters: away, final: n(finalScore.away), ok: away === n(finalScore.away) },
    ok: home === n(finalScore.home) && away === n(finalScore.away),
  };
}
