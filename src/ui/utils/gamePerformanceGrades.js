/**
 * gamePerformanceGrades.js — Game Performance Grades (canonical, in-game)
 * ─────────────────────────────────────────────────────────────────────
 * Deterministic, position-aware performance grades derived ONLY from the
 * canonical player box score (the same authority that owns the final score).
 * This module never reads narration play-logs or live per-play references.
 *
 * These are an in-game performance estimate based on simulated production and
 * participation. They are NOT affiliated with, licensed by, or equivalent to
 * any external football-analytics company. Small samples are protected against
 * one-play grade inflation via confidence-weighted shrinkage toward a neutral
 * baseline, so a player with a single target/carry cannot post an "Elite" grade.
 *
 * Pure functions only — safe to unit-test in isolation.
 */

const BASELINE = 60; // neutral grade a replacement-level, low-sample player regresses toward

export function clampGrade(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// ── Field alias resolution (canonical box score already normalizes these, but we
//    stay defensive so legacy archives without the normalizer still grade) ──────
function num(stats, ...keys) {
  for (const k of keys) {
    const v = stats?.[k];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return 0;
}

const OFFENSE_POS = new Set(['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'C', 'G', 'T', 'K', 'P']);
const DEFENSE_POS = new Set(['DL', 'DE', 'DT', 'NT', 'LB', 'OLB', 'ILB', 'MLB', 'EDGE', 'CB', 'S', 'FS', 'SS', 'DB']);

export function sideForPosition(pos) {
  const p = String(pos || '').toUpperCase();
  if (DEFENSE_POS.has(p)) return 'defense';
  if (OFFENSE_POS.has(p)) return 'offense';
  return 'offense';
}

/**
 * Participation volume + thresholds per position. `full` is the volume at which
 * no shrinkage is applied; `min` is the floor below which the grade is treated
 * as a "Limited sample" (no Elite/Star tier, overall regressed hard toward
 * baseline). Participation is drawn from canonical involvement counts — never
 * from a count of narration references.
 */
function participationFor(pos, stats) {
  const p = String(pos || '').toUpperCase();
  if (p === 'QB') {
    return { value: num(stats, 'passAtt'), label: `${num(stats, 'passAtt')} att`, min: 6, full: 18 };
  }
  if (p === 'RB' || p === 'FB') {
    const touches = num(stats, 'rushAtt') + num(stats, 'receptions');
    return { value: touches, label: `${touches} touch${touches === 1 ? '' : 'es'}`, min: 5, full: 12 };
  }
  if (p === 'WR' || p === 'TE') {
    const tgts = num(stats, 'targets') || num(stats, 'receptions');
    return { value: tgts, label: `${tgts} tgt`, min: 3, full: 6 };
  }
  if (DEFENSE_POS.has(p)) {
    const involvements = num(stats, 'tackles') + num(stats, 'sacks')
      + num(stats, 'passesDefended', 'passDefls') + num(stats, 'interceptions')
      + num(stats, 'tacklesForLoss', 'tfl') + num(stats, 'fumbleRecoveries', 'fumbleRecs');
    return { value: involvements, label: `${involvements} inv`, min: 2, full: 5 };
  }
  if (p === 'K') {
    const fga = num(stats, 'fieldGoalsAttempted', 'fgAttempts');
    return { value: fga, label: `${fga} FGA`, min: 1, full: 3 };
  }
  // OL / P / unknown — no reliable individual production metric this build.
  return { value: 0, label: null, min: Infinity, full: Infinity };
}

/** Raw (pre-shrinkage) grade + sub-grades from canonical rate stats. */
function rawGradeFor(pos, stats) {
  const p = String(pos || '').toUpperCase();
  const sub = {};

  if (p === 'QB') {
    const att = num(stats, 'passAtt');
    const compPct = att > 0 ? num(stats, 'passComp') / att : 0.62;
    const ypa = att > 0 ? num(stats, 'passYd', 'passYds') / att : 0;
    const tdRate = att > 0 ? num(stats, 'passTD', 'passTDs') / att : 0;
    const intRate = att > 0 ? num(stats, 'interceptions', 'INT') / att : 0;
    sub.accuracy = clampGrade(compPct * 100 * 0.9 + 10);
    sub.efficiency = clampGrade((ypa - 4) * 8 + 60);
    sub.bigPlays = clampGrade(tdRate * 400 + 55);
    sub.ballSecurity = clampGrade(100 - intRate * 500);
    return { overall: sub.accuracy * 0.3 + sub.efficiency * 0.3 + sub.bigPlays * 0.2 + sub.ballSecurity * 0.2, sub };
  }
  if (p === 'RB' || p === 'FB') {
    const ra = num(stats, 'rushAtt');
    const ypc = ra > 0 ? num(stats, 'rushYd', 'rushYds') / ra : 4;
    const rec = num(stats, 'receptions');
    sub.rushing = clampGrade((ypc - 3) * 10 + 65);
    sub.receiving = clampGrade(rec > 0 ? (num(stats, 'recYd', 'recYds') / rec) * 5 + 55 : 60);
    sub.bigPlays = clampGrade(num(stats, 'rushTD', 'rushTDs') * 8 + (num(stats, 'rushYd', 'rushYds') > 60 ? 10 : 0) + 55);
    sub.vision = clampGrade(ypc * 6 + 42);
    return { overall: sub.rushing * 0.45 + sub.receiving * 0.2 + sub.bigPlays * 0.2 + sub.vision * 0.15, sub };
  }
  if (p === 'WR' || p === 'TE') {
    const rec = num(stats, 'receptions');
    const tgt = num(stats, 'targets') || rec;
    const ypr = rec > 0 ? num(stats, 'recYd', 'recYds') / rec : 0;
    const catchRate = tgt > 0 ? rec / tgt : 0.6;
    sub.hands = clampGrade(catchRate * 80 + 20);
    sub.receiving = clampGrade((ypr - 5) * 4 + 68);
    sub.bigPlays = clampGrade(num(stats, 'recTD', 'recTDs') * 10 + (num(stats, 'recYd', 'recYds') > 50 ? 8 : 0) + 52);
    sub.routes = clampGrade(catchRate * 90 + 15);
    return { overall: sub.hands * 0.25 + sub.receiving * 0.3 + sub.bigPlays * 0.25 + sub.routes * 0.2, sub };
  }
  if (p === 'DL' || p === 'DE' || p === 'DT' || p === 'NT' || p === 'EDGE') {
    const sacks = num(stats, 'sacks');
    const tackles = num(stats, 'tackles');
    sub.passRush = clampGrade(sacks * 12 + tackles * 2 + 55);
    sub.runDefense = clampGrade(tackles * 3 + 58);
    sub.disruption = clampGrade((sacks + num(stats, 'fumbleRecoveries', 'fumbleRecs') + num(stats, 'tacklesForLoss', 'tfl')) * 8 + 55);
    return { overall: sub.passRush * 0.4 + sub.runDefense * 0.35 + sub.disruption * 0.25, sub };
  }
  if (p === 'LB' || p === 'OLB' || p === 'ILB' || p === 'MLB') {
    const tackles = num(stats, 'tackles');
    sub.tackling = clampGrade(tackles * 4 + 50);
    sub.coverage = clampGrade(num(stats, 'passesDefended', 'passDefls') * 8 + num(stats, 'interceptions') * 12 + 58);
    sub.passRush = clampGrade(num(stats, 'sacks') * 14 + 55);
    return { overall: sub.tackling * 0.4 + sub.coverage * 0.3 + sub.passRush * 0.3, sub };
  }
  if (DEFENSE_POS.has(p)) { // CB / S / DB
    sub.coverage = clampGrade(num(stats, 'passesDefended', 'passDefls') * 9 + num(stats, 'interceptions') * 13 + 58);
    sub.tackling = clampGrade(num(stats, 'tackles') * 4 + 52);
    sub.ballHawk = clampGrade((num(stats, 'passesDefended', 'passDefls') + num(stats, 'interceptions') * 2 + num(stats, 'fumbleRecoveries', 'fumbleRecs')) * 7 + 55);
    return { overall: sub.coverage * 0.45 + sub.tackling * 0.25 + sub.ballHawk * 0.3, sub };
  }
  if (p === 'K') {
    const fga = num(stats, 'fieldGoalsAttempted', 'fgAttempts');
    const fgm = num(stats, 'fieldGoalsMade', 'fgMade');
    const pct = fga > 0 ? fgm / fga : 1;
    sub.kicking = clampGrade(pct * 45 + 55);
    return { overall: sub.kicking, sub };
  }
  return { overall: BASELINE, sub };
}

/**
 * Grade one canonical box-score row. Never inflates a tiny sample: the raw grade
 * is regressed toward BASELINE by the confidence ratio (volume / fullSample),
 * and Elite/Star tiers are gated behind sufficient participation.
 */
export function computePlayerGameGrade(pos, stats = {}) {
  const participation = participationFor(pos, stats);
  const { overall: raw, sub } = rawGradeFor(pos, stats);

  const hasMetric = Number.isFinite(participation.full);
  const confidence = hasMetric ? Math.max(0, Math.min(1, participation.value / participation.full)) : 0;
  const limitedSample = hasMetric ? participation.value < participation.min : true;

  // Confidence-weighted shrinkage toward the neutral baseline.
  const overall = clampGrade(BASELINE + (raw - BASELINE) * confidence);

  return {
    overall,
    sub,
    participation,
    limitedSample,
    confidence,
    hasGrade: hasMetric && participation.value > 0,
    tier: gradeTier(overall, { limitedSample, confidence }),
  };
}

/**
 * Tier label. Elite/Star require a confident (near-full) sample so a
 * mathematically perfect one-play rate can never present as authoritative.
 */
export function gradeTier(overall, { limitedSample = false, confidence = 1 } = {}) {
  if (limitedSample) return 'Limited';
  if (overall >= 90 && confidence >= 0.85) return 'Elite';
  if (overall >= 80 && confidence >= 0.7) return 'Star';
  if (overall >= 70) return 'Good';
  if (overall >= 58) return 'Average';
  return 'Below Avg';
}

export function gradeColor(g, { limitedSample = false } = {}) {
  if (limitedSample) return '#8E8E93';
  if (g >= 90) return '#FFD60A';
  if (g >= 80) return '#BF5AF2';
  if (g >= 70) return '#0A84FF';
  if (g >= 58) return '#34C759';
  return '#8E8E93';
}

/** A short, honest stat line for a graded row, from canonical stats. */
export function statLineFor(pos, stats = {}) {
  const p = String(pos || '').toUpperCase();
  if (p === 'QB') {
    return `${num(stats, 'passComp')}/${num(stats, 'passAtt')} · ${num(stats, 'passYd', 'passYds')} yds${num(stats, 'passTD', 'passTDs') ? ` · ${num(stats, 'passTD', 'passTDs')} TD` : ''}`;
  }
  if (p === 'RB' || p === 'FB') {
    return `${num(stats, 'rushAtt')} car · ${num(stats, 'rushYd', 'rushYds')} yds${num(stats, 'rushTD', 'rushTDs') ? ` · ${num(stats, 'rushTD', 'rushTDs')} TD` : ''}`;
  }
  if (p === 'WR' || p === 'TE') {
    return `${num(stats, 'receptions')}/${num(stats, 'targets') || num(stats, 'receptions')} · ${num(stats, 'recYd', 'recYds')} yds${num(stats, 'recTD', 'recTDs') ? ` · ${num(stats, 'recTD', 'recTDs')} TD` : ''}`;
  }
  if (DEFENSE_POS.has(p)) {
    const parts = [];
    if (num(stats, 'tackles')) parts.push(`${num(stats, 'tackles')} tkl`);
    if (num(stats, 'sacks')) parts.push(`${num(stats, 'sacks')} sk`);
    if (num(stats, 'interceptions')) parts.push(`${num(stats, 'interceptions')} INT`);
    if (num(stats, 'passesDefended', 'passDefls')) parts.push(`${num(stats, 'passesDefended', 'passDefls')} PD`);
    return parts.join(' · ') || '—';
  }
  if (p === 'K') {
    return `${num(stats, 'fieldGoalsMade', 'fgMade')}/${num(stats, 'fieldGoalsAttempted', 'fgAttempts')} FG`;
  }
  return '—';
}

/**
 * Turn a canonical box score ({ [pid]: { name, pos, stats } }) for one team
 * into a sorted array of graded rows. Only rows with a real production metric
 * are graded, so an all-zero OL never shows a fabricated grade.
 */
export function gradeTeamBoxScore(teamBoxScore = {}, teamMeta = {}) {
  const rows = [];
  for (const [pid, row] of Object.entries(teamBoxScore || {})) {
    if (!row || typeof row !== 'object') continue;
    const stats = row.stats && typeof row.stats === 'object' ? row.stats : row;
    const pos = row.pos ?? row.position ?? '—';
    const grade = computePlayerGameGrade(pos, stats);
    if (!grade.hasGrade) continue; // omit players with no honest production metric
    rows.push({
      playerId: pid,
      name: row.name ?? 'Unknown',
      pos,
      teamId: teamMeta.teamId ?? null,
      teamAbbr: teamMeta.teamAbbr ?? null,
      teamSide: teamMeta.teamSide ?? null,
      side: sideForPosition(pos),
      stats,
      statLine: statLineFor(pos, stats),
      ...grade,
    });
  }
  return rows.sort((a, b) => b.overall - a.overall);
}
