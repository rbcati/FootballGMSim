/**
 * hofEngine.js — Hall of Fame Voting V1
 *
 * Pure module: no side effects, no imports from worker/UI/news/holdout/morale/sim.
 * Deterministic: same input always produces same output. No Math.random.
 *
 * Exported API:
 *   HOF_THRESHOLDS
 *   computeHofScore(player, careerStats, awardSummary) → number
 *   isHofEligible(player, currentSeason, stats, awardSummary) → boolean
 *   generateHofBallot(allPlayers, allCareerStats, meta, season) → { nominees[], autoInducted[] }
 *   resolveHofVote(ballot, allPlayers) → { inducted[], remaining[] }
 *   applyHofInductions(meta, inductedEntries, allNominees, allPlayers, season) → meta fragment
 *   getHofSummary(meta) → { totalInducted, byPosition, recentClass[] }
 *   ensureHofMeta(meta) → meta with hofRoster/hofBallot defaults
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const HOF_THRESHOLDS = Object.freeze({
  ELIGIBLE_SCORE: 120,
  INDUCTION_SCORE: 160,
  MVP_SHORTCUT_SCORE: 120,
  MVP_SHORTCUT_COUNT: 2,
  MAX_BALLOT_SIZE: 10,
  MAX_INDUCTIONS: 5,
  MAX_BALLOT_APPEARANCES: 3,
  LONGEVITY_BONUS_10: 25,
  LONGEVITY_BONUS_14: 50,
  SEASONS_REQUIREMENT: 12,
});

// ── Position normalization ────────────────────────────────────────────────────

function normPos(pos) {
  if (!pos) return '';
  const p = String(pos).toUpperCase();
  if (p === 'FB') return 'RB';
  if (['SS', 'FS'].includes(p)) return 'S';
  if (['OT', 'OG', 'G', 'T', 'C'].includes(p)) return 'OL';
  if (['DE', 'DT', 'EDGE', 'NT'].includes(p)) return 'DL';
  if (['MLB', 'OLB'].includes(p)) return 'LB';
  return p;
}

// ── Season year resolver ──────────────────────────────────────────────────────

function resolveSeasonYear(seasonToken) {
  if (seasonToken == null) return 0;
  const n = Number(seasonToken);
  if (Number.isFinite(n) && n > 1000) return n;
  const s = String(seasonToken);
  if (s.startsWith('s')) {
    const idx = parseInt(s.slice(1), 10);
    if (Number.isFinite(idx)) return 2024 + idx;
  }
  const parsed = parseInt(s, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── Career stats aggregation ──────────────────────────────────────────────────

function aggregateCareerStats(player) {
  const lines = Array.isArray(player?.careerStats) ? player.careerStats : [];
  return lines.reduce((acc, s) => {
    acc.passTD += Number(s.passTD ?? s.passTDs ?? 0);
    acc.passYd += Number(s.passYd ?? s.passYds ?? 0);
    acc.rushTD += Number(s.rushTD ?? s.rushTDs ?? 0);
    acc.rushYd += Number(s.rushYd ?? s.rushYds ?? 0);
    acc.recTD += Number(s.recTD ?? s.recTDs ?? 0);
    acc.recYd += Number(s.recYd ?? s.recYds ?? 0);
    acc.receptions += Number(s.receptions ?? 0);
    acc.sacks += Number(s.sacks ?? 0);
    acc.interceptions += Number(s.defInts ?? s.interceptions ?? 0);
    acc.tackles += Number(s.tackles ?? 0);
    acc.fgMade += Number(s.fgMade ?? 0);
    acc.fgAttempted += Number(s.fgAttempts ?? s.fgAttempted ?? 0);
    return acc;
  }, {
    passTD: 0, passYd: 0, rushTD: 0, rushYd: 0, recTD: 0, recYd: 0,
    receptions: 0, sacks: 0, interceptions: 0, tackles: 0, fgMade: 0, fgAttempted: 0,
  });
}

function getCareerSeasons(player) {
  return Array.isArray(player?.careerStats) ? player.careerStats.length : 0;
}

// ── HOF Score Formula ─────────────────────────────────────────────────────────

/**
 * Compute a deterministic HOF score. No Math.random.
 *
 * @param {Object} player      — Player object (pos, careerStats)
 * @param {Object|null} stats  — Pre-aggregated career stat totals, or null to aggregate from player.careerStats
 * @param {Object} awardSummary — { mvpCount, allProCount, championshipCount }
 * @returns {number}
 */
export function computeHofScore(player, stats, awardSummary) {
  const pos = normPos(player?.pos ?? '');
  const cs = stats ?? aggregateCareerStats(player);
  const seasons = getCareerSeasons(player);

  const mvpCount = Number(awardSummary?.mvpCount ?? 0);
  const allProCount = Number(awardSummary?.allProCount ?? 0);
  const championshipCount = Number(awardSummary?.championshipCount ?? 0);

  let base = 0;

  if (pos === 'QB') {
    base = cs.passTD * 3 + cs.passYd / 250 + cs.rushTD * 2;
  } else if (pos === 'RB') {
    base = cs.rushTD * 4 + cs.rushYd / 60 + cs.recTD * 3;
  } else if (['WR', 'TE'].includes(pos)) {
    base = cs.recTD * 4 + cs.recYd / 60 + cs.receptions / 5;
  } else if (['DL', 'LB', 'CB', 'S'].includes(pos)) {
    base = cs.sacks * 5 + cs.interceptions * 6 + cs.tackles / 20;
  } else if (pos === 'OL') {
    // proWins = All-Pro selections (proxy for OL excellence; no direct stat)
    base = seasons * 8 + allProCount * 10;
  } else if (pos === 'K') {
    const fgAtt = Math.max(cs.fgAttempted, 1);
    base = cs.fgMade * 2 + (cs.fgMade / fgAtt) * 50;
  }

  const awardBonus = mvpCount * 40 + allProCount * 15 + championshipCount * 20;

  let longevityBonus = 0;
  if (seasons >= 14) {
    longevityBonus = HOF_THRESHOLDS.LONGEVITY_BONUS_10 + HOF_THRESHOLDS.LONGEVITY_BONUS_14;
  } else if (seasons >= 10) {
    longevityBonus = HOF_THRESHOLDS.LONGEVITY_BONUS_10;
  }

  return base + awardBonus + longevityBonus;
}

// ── Eligibility Check ─────────────────────────────────────────────────────────

/**
 * Check if a player is eligible for the HOF ballot.
 *
 * Rules:
 *  1. Not already inducted
 *  2. Retired (no active contract) OR seasons >= 12
 *  3. hofScore >= 120
 *  4. At least 1 season since their last active season (no active player inductions in V1)
 *
 * @param {Object} player        — Player object
 * @param {number} currentSeason — Current season year (numeric)
 * @param {Object|null} stats    — Pre-aggregated career stats (optional)
 * @param {Object|null} awardSummary — { mvpCount, allProCount, championshipCount } (optional)
 * @returns {boolean}
 */
export function isHofEligible(player, currentSeason, stats, awardSummary) {
  // Rule 1: Not already inducted
  if (player?.hofStatus === 'inducted') return false;
  if (player?.hof === true) return false;

  const seasons = getCareerSeasons(player);
  const isRetired = player?.status === 'retired';

  // Rule 2: Retired OR seasons >= 12
  if (!isRetired && seasons < HOF_THRESHOLDS.SEASONS_REQUIREMENT) return false;

  // Rule 4: No active player inductions in V1 — must be retired
  if (!isRetired) return false;

  // Rule 4 continued: at least 1 season gap since last active season
  const careerLines = Array.isArray(player?.careerStats) ? player.careerStats : [];
  if (careerLines.length > 0) {
    const lastLine = careerLines[careerLines.length - 1];
    const lastYear = resolveSeasonYear(lastLine?.season ?? lastLine?.year ?? lastLine?.seasonId);
    if (lastYear >= currentSeason) return false;
  }

  // Rule 3: score threshold
  const aw = awardSummary ?? { mvpCount: 0, allProCount: 0, championshipCount: 0 };
  const score = computeHofScore(player, stats, aw);
  return score >= HOF_THRESHOLDS.ELIGIBLE_SCORE;
}

// ── HOF Ballot ────────────────────────────────────────────────────────────────

function buildHofReasons(score, awardSummary, seasons) {
  const reasons = [];
  if (awardSummary.mvpCount > 0) reasons.push(`${awardSummary.mvpCount}× MVP`);
  if (awardSummary.allProCount > 0) reasons.push(`${awardSummary.allProCount}× All-Pro`);
  if (awardSummary.championshipCount > 0) reasons.push(`${awardSummary.championshipCount}× Champion`);
  if (seasons >= 14) reasons.push('14+ season career');
  else if (seasons >= 10) reasons.push('10+ season career');
  return reasons;
}

/**
 * Generate the HOF ballot for a season. Pure and deterministic.
 *
 * @param {Array} allPlayers    — All player objects
 * @param {Object|null} allCareerStats — Map<playerId, stats> or null (uses player.careerStats)
 * @param {Object} meta         — Current meta (hofRoster, hofBallot for prior ballot tracking)
 * @param {number} season       — Current season year
 * @returns {{ nominees: Array, autoInducted: Array }}
 */
export function generateHofBallot(allPlayers, allCareerStats, meta, season) {
  const hofRoster = Array.isArray(meta?.hofRoster) ? meta.hofRoster : [];
  const inductedIds = new Set(hofRoster.map(r => String(r.playerId)));

  // Track prior ballot appearance counts (for lapse rule)
  const priorBallot = meta?.hofBallot ?? null;
  const priorBallotMap = new Map();
  if (Array.isArray(priorBallot?.nominees)) {
    for (const n of priorBallot.nominees) {
      const pidStr = String(n.playerId);
      if (!inductedIds.has(pidStr)) {
        priorBallotMap.set(pidStr, Number(n.ballotCount ?? 0));
      }
    }
  }

  const candidates = [];

  for (const player of allPlayers) {
    if (!player?.id) continue;
    const pidStr = String(player.id);

    // Skip already inducted (new schema or legacy)
    if (inductedIds.has(pidStr)) continue;
    if (player?.hofStatus === 'inducted') continue;
    if (player?.hof === true) continue;

    // Resolve stats
    const extStats = allCareerStats
      ? (allCareerStats.get ? allCareerStats.get(pidStr) : allCareerStats[pidStr]) ?? null
      : null;
    const resolvedStats = extStats ?? aggregateCareerStats(player);

    // Inline award summary (avoid importing awardEngine)
    const awards = Array.isArray(player?.awards) ? player.awards : [];
    const mvpCount = awards.filter(a => a.type === 'MVP').length;
    const allProCount = awards.filter(a => typeof a.type === 'string' && a.type.startsWith('ALL_PRO_')).length;
    const championshipCount = awards.filter(a => a.type === 'LEAGUE_CHAMPION').length;
    const awardSummary = { mvpCount, allProCount, championshipCount };

    const score = computeHofScore(player, resolvedStats, awardSummary);
    if (score < HOF_THRESHOLDS.ELIGIBLE_SCORE) continue;
    if (!isHofEligible(player, season, resolvedStats, awardSummary)) continue;

    // Ballot appearance count
    const priorCount = priorBallotMap.get(pidStr) ?? 0;
    // Lapse: skip if already appeared MAX_BALLOT_APPEARANCES times without induction
    if (priorCount >= HOF_THRESHOLDS.MAX_BALLOT_APPEARANCES) continue;
    const ballotCount = priorCount + 1;

    const pos = normPos(player?.pos ?? '');
    const seasons = getCareerSeasons(player);
    const reasons = buildHofReasons(score, awardSummary, seasons);

    candidates.push({
      playerId: player.id,
      playerName: player.name ?? '',
      pos,
      score,
      reasons,
      mvpCount,
      allProCount,
      ballotCount,
    });
  }

  // Deterministic sort: score desc, then playerId string asc as tiebreaker
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.playerId).localeCompare(String(b.playerId));
  });

  const nominees = candidates.slice(0, HOF_THRESHOLDS.MAX_BALLOT_SIZE);
  const autoInducted = nominees.filter(n => n.score >= HOF_THRESHOLDS.INDUCTION_SCORE);

  return { nominees, autoInducted };
}

// ── Resolve HOF Vote ─────────────────────────────────────────────────────────

/**
 * Resolve the HOF vote. Pure and deterministic.
 *
 * Auto-inducts score >= 160. Also inducts score 120-159 with 2+ MVPs.
 * Caps at 5 inductees per season.
 *
 * @param {Object} ballot    — Output of generateHofBallot
 * @param {Array} _allPlayers — Unused in V1 (reserved for future voter simulation)
 * @returns {{ inducted: Array, remaining: Array }}
 */
export function resolveHofVote(ballot, _allPlayers) {
  const { nominees = [], autoInducted = [] } = ballot;

  const inductedIds = new Set(autoInducted.map(n => String(n.playerId)));
  const inducted = [...autoInducted];

  // MVP shortcut: score 120-159 with 2+ MVPs
  for (const nominee of nominees) {
    const pidStr = String(nominee.playerId);
    if (inductedIds.has(pidStr)) continue;
    if (
      nominee.score >= HOF_THRESHOLDS.MVP_SHORTCUT_SCORE &&
      nominee.score < HOF_THRESHOLDS.INDUCTION_SCORE &&
      nominee.mvpCount >= HOF_THRESHOLDS.MVP_SHORTCUT_COUNT
    ) {
      inducted.push(nominee);
      inductedIds.add(pidStr);
    }
  }

  // Cap at MAX_INDUCTIONS per season
  const inductedCapped = inducted.slice(0, HOF_THRESHOLDS.MAX_INDUCTIONS);
  const cappedIds = new Set(inductedCapped.map(n => String(n.playerId)));

  // Remaining nominees (not inducted this season, still on ballot)
  const remaining = nominees.filter(n => !cappedIds.has(String(n.playerId)));

  // Deduplicate inducted list (safety guard)
  const seen = new Set();
  const deduped = [];
  for (const entry of inductedCapped) {
    const key = String(entry.playerId);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(entry);
    }
  }

  return { inducted: deduped, remaining };
}

// ── Apply HOF Inductions ─────────────────────────────────────────────────────

/**
 * Apply HOF inductions to meta. Returns the meta fragment to merge.
 *
 * @param {Object} meta           — Current meta
 * @param {Array} inductedEntries — Nominee entries from resolveHofVote.inducted
 * @param {Array} allNominees     — Full ballot nominee list (for ballot record)
 * @param {Array} allPlayers      — All player objects (for snapshot data)
 * @param {number} season         — Current season year
 * @returns {{ hofRoster: Array, hofBallot: Object }}
 */
export function applyHofInductions(meta, inductedEntries, allNominees, allPlayers, season) {
  const hofRoster = Array.isArray(meta?.hofRoster) ? [...meta.hofRoster] : [];
  const alreadyInducted = new Set(hofRoster.map(r => String(r.playerId)));

  const playerById = new Map((allPlayers || []).map(p => [String(p.id), p]));

  for (const entry of inductedEntries) {
    const pidStr = String(entry.playerId);
    if (alreadyInducted.has(pidStr)) continue;

    const player = playerById.get(pidStr);
    const careerLines = Array.isArray(player?.careerStats) ? player.careerStats : [];
    // Team abbreviations from career history (exclude FA)
    const teamAbbrs = [...new Set(
      careerLines.map(l => l.team ?? null).filter(t => t && t !== 'FA'),
    )];

    hofRoster.push({
      playerId: entry.playerId,
      playerName: entry.playerName ?? player?.name ?? '',
      position: entry.pos ?? normPos(player?.pos ?? ''),
      seasons: careerLines.length,
      teamIds: teamAbbrs,
      inductionSeason: season,
      awards: Array.isArray(player?.awards) ? [...player.awards] : [],
      careerStats: aggregateCareerStats(player ?? {}),
      hofScore: entry.score,
    });

    alreadyInducted.add(pidStr);
  }

  return {
    hofRoster,
    hofBallot: {
      season,
      nominees: allNominees.map(n => ({
        playerId: n.playerId,
        score: n.score,
        reasons: n.reasons ?? [],
        ballotCount: n.ballotCount ?? 1,
      })),
      inducted: inductedEntries.map(e => e.playerId),
      resolved: true,
    },
  };
}

// ── HOF Summary ──────────────────────────────────────────────────────────────

/**
 * Build a summary of the HOF roster for display.
 *
 * @param {Object} meta
 * @returns {{ totalInducted: number, byPosition: Object, recentClass: Array }}
 */
export function getHofSummary(meta) {
  const hofRoster = Array.isArray(meta?.hofRoster) ? meta.hofRoster : [];

  const byPosition = {};
  for (const entry of hofRoster) {
    const pos = entry.position ?? 'UNK';
    byPosition[pos] = (byPosition[pos] ?? 0) + 1;
  }

  const recentClass = [...hofRoster]
    .sort((a, b) => Number(b.inductionSeason ?? 0) - Number(a.inductionSeason ?? 0))
    .slice(0, 5);

  return { totalInducted: hofRoster.length, byPosition, recentClass };
}

// ── Safe hydration ───────────────────────────────────────────────────────────

/**
 * Ensure meta has the required HOF fields. Safe for old saves without these fields.
 */
export function ensureHofMeta(meta) {
  if (!meta) return meta;
  const out = { ...meta };
  if (!Array.isArray(out.hofRoster)) out.hofRoster = [];
  if (out.hofBallot == null) {
    out.hofBallot = { season: null, nominees: [], inducted: [], resolved: false };
  }
  return out;
}
