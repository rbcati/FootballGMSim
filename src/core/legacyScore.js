/**
 * Legacy Score V1 — explainable, position-aware; uses only existing player + record book data.
 */

import { buildMergedPlayerAwardTimeline } from './playerAwardTimeline.js';
import {
  RECORD_BOOK_PLAYER_KEYS,
  RECORD_LABELS,
  careerLineDefensiveInts,
} from './recordBookV1.js';

const DEF_POS = new Set(['DL', 'DE', 'DT', 'EDGE', 'LB', 'CB', 'S', 'SS', 'FS']);

/** Minimum seasons before HOF induction is considered (retired players). */
export const HOF_MIN_SEASONS = 5;

/** Total legacy score needed for automatic induction (retired only). */
export const HOF_LEGACY_INDUCT_THRESHOLD = 70;

/** Borderline band below induct threshold. */
export const HOF_LEGACY_BORDERLINE_BAND = 8;

function num(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function getPositionBucket(pos) {
  const p = String(pos ?? '').toUpperCase();
  if (p === 'QB') return 'QB';
  if (p === 'RB') return 'RB';
  if (p === 'WR') return 'WR';
  if (p === 'TE') return 'TE';
  if (p === 'K') return 'K';
  if (DEF_POS.has(p)) return 'defense';
  return 'other';
}

/** Production baselines (career totals) — at ~100% of baseline, production nears its cap. */
const PRODUCTION_BASELINE = {
  QB: { passYds: 12000 },
  RB: { rushYds: 6500, recYds: 2000 },
  WR: { recYds: 8000 },
  TE: { recYds: 5500 },
  defense: { tackles: 380, sacks: 35, defInts: 18 },
  K: { fgMade: 160 },
  other: { games: 140 },
};

const PRODUCTION_CAP = 45;

function sumCareerLines(careerStats, key) {
  return careerStats.reduce((s, row) => s + num(row?.[key]), 0);
}

function careerGamesPlayed(careerStats) {
  return careerStats.reduce((s, row) => s + num(row?.gamesPlayed), 0);
}

function peakOvrFromCareer(player, careerStats) {
  let m = num(player?.ovr);
  for (const line of careerStats) m = Math.max(m, num(line?.ovr));
  return m;
}

function scoreProduction(bucket, careerStats) {
  const reasons = [];
  let raw = 0;

  if (bucket === 'QB') {
    const passYds = sumCareerLines(careerStats, 'passYds');
    const passTDs = sumCareerLines(careerStats, 'passTDs');
    const b = PRODUCTION_BASELINE.QB.passYds;
    const ratio = b > 0 ? passYds / b : 0;
    raw = Math.min(PRODUCTION_CAP, ratio * 37.5 + Math.min(6, passTDs / 80));
    if (passYds >= b) reasons.push('Elite career passing volume');
    else if (passYds >= b * 0.75) reasons.push('Strong career passing totals');
  } else if (bucket === 'RB') {
    const rushYds = sumCareerLines(careerStats, 'rushYds');
    const recYds = sumCareerLines(careerStats, 'recYds');
    const bR = PRODUCTION_BASELINE.RB.rushYds;
    const bRec = PRODUCTION_BASELINE.RB.recYds;
    const ratio = bR > 0 ? rushYds / bR : 0;
    const recRatio = bRec > 0 ? recYds / bRec : 0;
    raw = Math.min(PRODUCTION_CAP, ratio * 26 + recRatio * 10);
    if (rushYds >= bR) reasons.push('Elite career rushing workload');
    else if (rushYds >= bR * 0.8) reasons.push('Strong rushing production');
  } else if (bucket === 'WR' || bucket === 'TE') {
    const recYds = sumCareerLines(careerStats, 'recYds');
    const recTDs = sumCareerLines(careerStats, 'recTDs');
    const b = bucket === 'WR' ? PRODUCTION_BASELINE.WR.recYds : PRODUCTION_BASELINE.TE.recYds;
    const ratio = b > 0 ? recYds / b : 0;
    raw = Math.min(PRODUCTION_CAP, ratio * 30 + Math.min(6, recTDs / 50));
    if (recYds >= b) reasons.push(`Elite career receiving for ${bucket}`);
    else if (recYds >= b * 0.8) reasons.push('Strong receiving totals');
  } else if (bucket === 'defense') {
    const tackles = sumCareerLines(careerStats, 'tackles');
    const sacks = sumCareerLines(careerStats, 'sacks');
    let defInts = 0;
    for (const row of careerStats) defInts += careerLineDefensiveInts(row);
    const b = PRODUCTION_BASELINE.defense;
    const tRatio = b.tackles > 0 ? tackles / b.tackles : 0;
    const sRatio = b.sacks > 0 ? sacks / b.sacks : 0;
    const iRatio = b.defInts > 0 ? defInts / b.defInts : 0;
    raw = Math.min(
      PRODUCTION_CAP,
      tRatio * 14 + sRatio * 14 + iRatio * 10,
    );
    if (tackles >= b.tackles * 0.9 || sacks >= b.sacks * 0.85) reasons.push('Sustained defensive production');
    if (defInts >= 12) reasons.push('Ball-hawk résumé (interceptions)');
  } else if (bucket === 'K') {
    const fg = sumCareerLines(careerStats, 'fgMade');
    const b = PRODUCTION_BASELINE.K.fgMade;
    const ratio = b > 0 ? fg / b : 0;
    raw = Math.min(PRODUCTION_CAP, ratio * 34);
    if (fg >= b) reasons.push('Elite career field goal volume');
  } else {
    const games = careerGamesPlayed(careerStats) || careerStats.length * 10;
    const b = PRODUCTION_BASELINE.other.games;
    raw = Math.min(PRODUCTION_CAP, (games / b) * 22);
  }

  return { production: Math.round(raw * 10) / 10, reasons };
}

function getMergedAwardCounts(playerId, accolades, archivedSeasons, teams) {
  const { counts: tCounts } = countAwardsFromTimeline(playerId, accolades, archivedSeasons, teams);
  const loose = countAccoladesMissingYear(accolades);
  return {
    mvp: tCounts.mvp + loose.mvp,
    opoy: tCounts.opoy + loose.opoy,
    dpoy: tCounts.dpoy + loose.dpoy,
    roty: tCounts.roty + loose.roty,
    sbMvp: tCounts.sbMvp + loose.sbMvp,
    sbRing: tCounts.sbRing + loose.sbRing,
    allPro: tCounts.allPro + loose.allPro,
    bestPos: tCounts.bestPos + loose.bestPos,
    proBowl: tCounts.proBowl + loose.proBowl,
  };
}

function countAwardsFromTimeline(playerId, accolades, archivedSeasons, teams) {
  const { rows } = buildMergedPlayerAwardTimeline(playerId, accolades, archivedSeasons, teams);
  const counts = {
    mvp: 0,
    opoy: 0,
    dpoy: 0,
    roty: 0,
    sbMvp: 0,
    sbRing: 0,
    allPro: 0,
    bestPos: 0,
    proBowl: 0,
  };
  for (const r of rows) {
    const c = r.canonical;
    if (c === 'mvp') counts.mvp += 1;
    else if (c === 'opoy') counts.opoy += 1;
    else if (c === 'dpoy') counts.dpoy += 1;
    else if (c === 'roty' || c === 'oroy' || c === 'droy') counts.roty += 1;
    else if (c === 'sbMvp') counts.sbMvp += 1;
    else if (c === 'sb_ring') counts.sbRing += 1;
    else if (c === 'allProOffense' || c === 'allProDefense') counts.allPro += 1;
    else if (c === 'bestQB' || c === 'bestRB' || c === 'bestWrTe' || c === 'bestDefensivePlayer' || c === 'bestKicker') counts.bestPos += 1;
    else if (c === 'pro_bowl' || c === 'PRO_BOWL') counts.proBowl += 1;
  }
  return { counts, rows };
}

function countAccoladesMissingYear(accolades) {
  const c = {
    mvp: 0, opoy: 0, dpoy: 0, roty: 0, sbMvp: 0, sbRing: 0, allPro: 0, bestPos: 0, proBowl: 0,
  };
  for (const a of Array.isArray(accolades) ? accolades : []) {
    const t = String(a?.type ?? '');
    const y = a?.year ?? a?.seasonYear;
    if (Number.isFinite(Number(y)) && Number(y) > 0) continue;
    if (t === 'MVP') c.mvp += 1;
    else if (t === 'OPOY') c.opoy += 1;
    else if (t === 'DPOY') c.dpoy += 1;
    else if (t === 'ROTY') c.roty += 1;
    else if (t === 'SB_MVP') c.sbMvp += 1;
    else if (t === 'SB_RING') c.sbRing += 1;
    else if (t === 'PRO_BOWL') c.proBowl += 1;
  }
  return c;
}

function scoreAwards(player, archivedSeasons, teams) {
  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];
  const counts = getMergedAwardCounts(player?.id, accolades, archivedSeasons, teams);
  const proBowlExtra = accolades.filter((a) => String(a?.type) === 'PRO_BOWL').length;
  const proBowl = Math.max(counts.proBowl, proBowlExtra);
  const pts = Math.min(
    26,
    Math.round(
      (counts.mvp * 12
        + counts.opoy * 5
        + counts.dpoy * 6
        + counts.roty * 3
        + counts.sbMvp * 6
        + counts.allPro * 3
        + counts.bestPos * 2.5
        + proBowl * 1.2) * 10,
    ) / 10,
  );
  const reasons = [];
  if (counts.mvp) reasons.push(`${counts.mvp} MVP${counts.mvp > 1 ? 's' : ''}`);
  if (counts.dpoy) reasons.push(`${counts.dpoy} DPOY`);
  if (counts.opoy) reasons.push(`${counts.opoy} OPOY`);
  if (counts.sbMvp) reasons.push(`${counts.sbMvp} Finals MVP`);
  if (counts.allPro) reasons.push(`${counts.allPro} First Team All-Pro season${counts.allPro > 1 ? 's' : ''}`);
  if (proBowl >= 3) reasons.push(`${proBowl} Pro Bowls`);
  return { awards: pts, reasons: reasons.slice(0, 4), proBowlCount: proBowl };
}

function scoreRecords(playerId, recordBook) {
  if (!recordBook || playerId == null) return { records: 0, reasons: [], summary: '' };
  const pid = String(playerId);
  const ss = recordBook.singleSeasonV1 ?? {};
  const cl = recordBook.careerLeadersV1 ?? {};
  let pts = 0;
  const reasons = [];
  const bits = [];

  for (const key of RECORD_BOOK_PLAYER_KEYS) {
    const holder = ss[key];
    if (holder && holder.playerId != null && String(holder.playerId) === pid && num(holder.value) > 0) {
      pts += 4;
      reasons.push(`Single-season ${RECORD_LABELS[key] ?? key} record`);
      bits.push(`${RECORD_LABELS[key] ?? key} (season)`);
    }
  }
  for (const key of RECORD_BOOK_PLAYER_KEYS) {
    const board = Array.isArray(cl[key]) ? cl[key] : [];
    const idx = board.findIndex((r) => r.playerId != null && String(r.playerId) === pid);
    if (idx === 0 && board.length) {
      pts += 5;
      reasons.push(`Career ${RECORD_LABELS[key] ?? key} leader`);
      bits.push(`${RECORD_LABELS[key] ?? key} #1`);
    } else if (idx === 1) {
      pts += 2.5;
      bits.push(`${RECORD_LABELS[key] ?? key} #2`);
    } else if (idx === 2) {
      pts += 1.5;
    }
  }
  pts = Math.min(15, Math.round(pts * 10) / 10);
  return {
    records: pts,
    reasons: reasons.slice(0, 4),
    summary: bits.slice(0, 3).join(' · ') || '',
  };
}

function scoreChampionships(accolades, archivedSeasons, teams, playerId) {
  const counts = getMergedAwardCounts(playerId, accolades, archivedSeasons, teams);
  const rings = counts.sbRing;
  const pts = Math.min(10, Math.round(rings * 2.8 * 10) / 10);
  const reasons = [];
  if (rings) reasons.push(`${rings} ring${rings > 1 ? 's' : ''}`);
  return { championships: pts, reasons };
}

function scoreLongevity(seasons) {
  if (seasons <= 0) return { longevity: 0, reasons: [] };
  const pts = Math.min(8, Math.max(0, (seasons - 4) * 0.85));
  const reasons = [];
  if (seasons >= 10) reasons.push(`Long career (${seasons} seasons)`);
  else if (seasons >= 7) reasons.push(`${seasons}-year career body of work`);
  return { longevity: Math.round(pts * 10) / 10, reasons };
}

function scorePeak(peak) {
  const pts = Math.min(7, Math.max(0, (peak - 78) * 0.55));
  const reasons = [];
  if (peak >= 92) reasons.push(`Peak dominance (OVR ${peak})`);
  else if (peak >= 88) reasons.push(`Elite peak OVR (${peak})`);
  return { peak: Math.round(pts * 10) / 10, reasons };
}

function legacyScoreToTier(score) {
  if (score >= 88) return 'gold';
  if (score >= 78) return 'silver';
  if (score >= 68) return 'bronze';
  if (score >= 55) return 'watch';
  return 'minimal';
}

function buildCareerSummary(bucket, careerStats) {
  if (!careerStats.length) return '';
  if (bucket === 'QB') {
    const y = sumCareerLines(careerStats, 'passYds');
    const td = sumCareerLines(careerStats, 'passTDs');
    return `${y.toLocaleString()} pass yds · ${td} TD`;
  }
  if (bucket === 'RB') {
    const y = sumCareerLines(careerStats, 'rushYds');
    return `${y.toLocaleString()} rush yds`;
  }
  if (bucket === 'WR' || bucket === 'TE') {
    const y = sumCareerLines(careerStats, 'recYds');
    return `${y.toLocaleString()} rec yds`;
  }
  if (bucket === 'defense') {
    const t = sumCareerLines(careerStats, 'tackles');
    const sk = sumCareerLines(careerStats, 'sacks');
    return `${t} TKL · ${sk} SK`;
  }
  if (bucket === 'K') {
    const fg = sumCareerLines(careerStats, 'fgMade');
    return `${fg} FGM`;
  }
  return `${careerStats.length} seasons`;
}

function buildAwardsSummary(counts, proBowl) {
  const parts = [];
  if (counts.mvp) parts.push(`${counts.mvp}x MVP`);
  if (counts.dpoy) parts.push(`${counts.dpoy}x DPOY`);
  if (counts.opoy) parts.push(`${counts.opoy}x OPOY`);
  if (counts.sbRing) parts.push(`${counts.sbRing}x Champ`);
  if (counts.allPro) parts.push(`${counts.allPro}x All-Pro`);
  if (proBowl >= 4) parts.push(`${proBowl}x Pro Bowl`);
  return parts.join(' · ') || '';
}

/**
 * Full legacy report for UI + HOF persistence.
 * @param {object} player
 * @param {{ recordBook?: object, archivedSeasons?: any[], teams?: any[], year?: number }} context
 */
export function buildLegacyScoreReport(player, context = {}) {
  const { recordBook = null, archivedSeasons = [], teams = [], year: contextYear = null } = context;
  const pos = String(player?.pos ?? '').toUpperCase() || 'QB';
  const bucket = getPositionBucket(pos);
  const careerStats = Array.isArray(player?.careerStats) ? player.careerStats : [];
  const seasons = careerStats.length;
  const accolades = Array.isArray(player?.accolades) ? player.accolades : [];

  const prod = scoreProduction(bucket, careerStats);
  const aw = scoreAwards(player, archivedSeasons, teams);
  const rec = scoreRecords(player?.id, recordBook);
  const counts = getMergedAwardCounts(player?.id, accolades, archivedSeasons, teams);
  const champ = scoreChampionships(accolades, archivedSeasons, teams, player?.id);
  const long = scoreLongevity(seasons);
  const peak = peakOvrFromCareer(player, careerStats);
  const pk = scorePeak(peak);

  const breakdown = {
    production: prod.production,
    awards: aw.awards,
    records: rec.records,
    championships: champ.championships,
    longevity: long.longevity,
    peak: pk.peak,
  };

  const legacyScore = Math.round(
    breakdown.production
      + breakdown.awards
      + breakdown.records
      + breakdown.championships
      + breakdown.longevity
      + breakdown.peak,
  );

  const tier = legacyScoreToTier(legacyScore);
  const status = String(player?.status ?? '');
  const isRetired = status === 'retired';
  const isActive = !isRetired && status !== 'draft_eligible';

  const eligible =
    isRetired
    && seasons >= HOF_MIN_SEASONS
    && legacyScore >= HOF_LEGACY_INDUCT_THRESHOLD - 5;

  let recommendation = 'not_eligible';
  if (isActive) {
    recommendation = legacyScore >= 52 ? 'legacy_watch' : 'active';
  } else if (isRetired) {
    if (legacyScore >= HOF_LEGACY_INDUCT_THRESHOLD) recommendation = 'induct';
    else if (legacyScore >= HOF_LEGACY_INDUCT_THRESHOLD - HOF_LEGACY_BORDERLINE_BAND) recommendation = 'borderline';
    else recommendation = 'not_eligible';
  } else {
    recommendation = 'not_eligible';
  }

  const reasons = [
    ...prod.reasons,
    ...aw.reasons,
    ...rec.reasons,
    ...champ.reasons,
    ...long.reasons,
    ...pk.reasons,
  ].filter(Boolean);

  const careerSummary = buildCareerSummary(bucket, careerStats);
  const awardsSummary = buildAwardsSummary(counts, aw.proBowlCount ?? 0);
  const recordsSummary = rec.summary || '';

  return {
    playerId: player?.id ?? null,
    playerName: player?.name ?? null,
    pos,
    legacyScore,
    tier,
    eligible,
    recommendation,
    reasons: [...new Set(reasons)].slice(0, 8),
    breakdown,
    careerSummary,
    awardsSummary,
    recordsSummary,
    meta: { bucket, seasonsPlayed: seasons, peakOvr: peak, year: contextYear },
  };
}

/** Whether Player Profile should show the expanded legacy block. */
export function shouldShowLegacyProfileSection(report, player) {
  if (!report) return false;
  if (player?.hof) return true;
  if (String(player?.status) === 'retired') return true;
  const seasons = report.meta?.seasonsPlayed ?? 0;
  const hasAwards = (player?.accolades?.length ?? 0) > 0;
  const hasStats = seasons > 0;
  const scoreOk = (report.legacyScore ?? 0) >= 48;
  return (hasStats || hasAwards) && scoreOk;
}

export function isHallOfFameInducteeFromReport(report, player) {
  if (player?.hof) return true;
  return String(player?.status) === 'retired'
    && (report?.legacyScore ?? 0) >= HOF_LEGACY_INDUCT_THRESHOLD
    && (report?.meta?.seasonsPlayed ?? 0) >= HOF_MIN_SEASONS;
}
