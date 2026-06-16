/**
 * negotiationModifiers.js — Contract Negotiation Depth V2
 *
 * Pure, deterministic negotiation-modifier module.
 * Computes demand multipliers from player morale, award history,
 * and franchise reputation. Applied after base demand is established,
 * before offer comparison.
 *
 * Design constraints:
 *  - Pure functions only. No side effects.
 *  - No imports from worker, UI, or news modules.
 *  - No imports from playerMoraleEngine or awardEngine — receive their
 *    output as arguments via the context parameter.
 *  - No Math.random — fully deterministic.
 *  - Total demand shift bounded at ±MAX_SHIFT (25%).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const LEVERAGE_MODIFIERS = Object.freeze({
  /** MVP in the last 2 seasons → +15% demand premium */
  MVP_RECENT: 0.15,
  /** 2+ All-Pro selections (career) → +10% demand premium */
  ALL_PRO_MULTIPLE: 0.10,
  /** League champion in any season → +8% demand premium */
  LEAGUE_CHAMPION_HISTORY: 0.08,
  /** Hall of Fame inductee → +20% demand premium */
  HOF_INDUCTED: 0.20,
  /** HOF nominee on the ballot → +8% demand premium */
  HOF_NOMINEE: 0.08,
  /** Disgruntled morale (< 40) → −10% demand */
  MORALE_DISGRUNTLED: -0.10,
  /** Frustrated morale (40–54) → −5% demand */
  MORALE_FRUSTRATED: -0.05,
  /** Thriving morale (85–100) → +5% demand */
  MORALE_THRIVING: 0.05,
  /** Franchise has 2+ championships → −5% demand from FAs */
  FRANCHISE_CHAMPION: -0.05,
  /** Franchise had 0 playoff appearances in 3+ seasons → +8% demand */
  FRANCHISE_DROUGHT: 0.08,
  /** Franchise instability — 3+ coaching changes in 3 seasons → +6% demand */
  COACHING_INSTABILITY: 0.06,
  /** Maximum total demand shift in either direction */
  MAX_SHIFT: 0.25,
});

// Award type string constant — duplicated here to avoid importing from awardEngine.
const AWARD_TYPE_MVP = 'MVP';
const AWARD_TYPE_LEAGUE_CHAMPION = 'LEAGUE_CHAMPION';
const ALL_PRO_PREFIX = 'ALL_PRO_';

// Morale score thresholds (mirrored from playerMoraleEngine constants).
const MORALE_DISGRUNTLED_MAX = 40;
const MORALE_FRUSTRATED_MAX = 55;
const MORALE_THRIVING_MIN = 85;
const MORALE_DEFAULT = 70;

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampShift(shift) {
  return Math.max(-LEVERAGE_MODIFIERS.MAX_SHIFT, Math.min(LEVERAGE_MODIFIERS.MAX_SHIFT, shift));
}

// ── computePlayerLeverage ─────────────────────────────────────────────────────

/**
 * Compute player-specific leverage modifiers.
 *
 * @param {object} player       – player data (reads player.awards, player.morale)
 * @param {object} context      – {
 *   moraleSummary?: object,   – output of getPlayerMoraleSummary(player) (optional)
 *   awardSummary?: object,    – output of getPlayerAwardSummary(player) (optional)
 *   currentSeason?: number,   – current season year (used for MVP recency check)
 * }
 * @returns {{ multiplier: number, reasons: string[] }}
 */
export function computePlayerLeverage(player, context = {}) {
  const { moraleSummary = {}, awardSummary = {}, currentSeason = 0 } = context;

  const reasons = [];
  let shift = 0;

  // ── HOF status modifier ─────────────────────────────────────────────────
  // Read directly from player.hofStatus — no import needed (already on player).

  if (player?.hofStatus === 'inducted') {
    shift += LEVERAGE_MODIFIERS.HOF_INDUCTED;
    reasons.push('Hall of Famer commands a premium');
  } else if (player?.hofStatus === 'nominee') {
    shift += LEVERAGE_MODIFIERS.HOF_NOMINEE;
    reasons.push('HOF nominee on the market');
  }
  // 'eligible' → no modifier; absent / 'none' → no modifier, no crash

  // ── Award modifiers ──────────────────────────────────────────────────────

  const awards = Array.isArray(player?.awards) ? player.awards : [];

  // MVP in last 2 seasons
  const hasMVPRecent = awards.some((a) => {
    if (a?.type !== AWARD_TYPE_MVP) return false;
    if (!currentSeason) return false;
    const seasonDiff = currentSeason - safeNum(a?.season);
    return seasonDiff >= 0 && seasonDiff <= 2;
  });
  if (hasMVPRecent) {
    shift += LEVERAGE_MODIFIERS.MVP_RECENT;
    reasons.push('Recent MVP award increases his market value');
  }

  // 2+ All-Pro selections — prefer awardSummary if provided, fall back to raw count
  const allProCount = safeNum(
    awardSummary?.allProCount ?? awards.filter((a) => String(a?.type ?? '').startsWith(ALL_PRO_PREFIX)).length,
  );
  if (allProCount >= 2) {
    shift += LEVERAGE_MODIFIERS.ALL_PRO_MULTIPLE;
    reasons.push('Multiple All-Pro selections raise his leverage');
  }

  // League champion (any season)
  const championshipCount = safeNum(
    awardSummary?.championshipCount ?? awards.filter((a) => a?.type === AWARD_TYPE_LEAGUE_CHAMPION).length,
  );
  if (championshipCount >= 1) {
    shift += LEVERAGE_MODIFIERS.LEAGUE_CHAMPION_HISTORY;
    reasons.push('Championship pedigree commands a premium');
  }

  // ── Morale modifiers ─────────────────────────────────────────────────────

  const moraleScore = safeNum(moraleSummary?.score ?? player?.morale, MORALE_DEFAULT);

  if (moraleScore < MORALE_DISGRUNTLED_MAX) {
    shift += LEVERAGE_MODIFIERS.MORALE_DISGRUNTLED;
    reasons.push('Player is frustrated — open to discounted deal');
  } else if (moraleScore < MORALE_FRUSTRATED_MAX) {
    shift += LEVERAGE_MODIFIERS.MORALE_FRUSTRATED;
    reasons.push('Player is unhappy — slightly open to discount');
  } else if (moraleScore >= MORALE_THRIVING_MIN) {
    shift += LEVERAGE_MODIFIERS.MORALE_THRIVING;
    reasons.push('Player is thriving — expects premium to stay');
  }
  // Settled (55–84): no modifier

  return { multiplier: 1 + shift, reasons };
}

// ── computeFranchiseReputation ────────────────────────────────────────────────

/**
 * Compute franchise-level reputation modifiers (applied to all negotiations).
 *
 * Reads from:
 *   meta.franchiseAwards           – { type, season, teamId }[]
 *   meta.franchiseHistoryByTeam    – keyed by teamId string
 *
 * @param {object} meta      – game meta (reads franchiseAwards + franchiseHistoryByTeam)
 * @param {object} context   – {
 *   userTeamId: number|string,
 *   currentSeason?: number,
 *   coachingInstabilityPenalty?: { penalty: number, reason: string } | null
 * }
 * @returns {{ multiplier: number, reasons: string[] }}
 */
export function computeFranchiseReputation(meta, context = {}) {
  const { userTeamId = null, currentSeason = 0, coachingInstabilityPenalty = null } = context;

  const reasons = [];
  let shift = 0;

  if (!userTeamId) return { multiplier: 1, reasons };

  // 2+ championships in franchise history
  const franchiseAwards = Array.isArray(meta?.franchiseAwards) ? meta.franchiseAwards : [];
  const teamChampionships = franchiseAwards.filter(
    (a) => a?.type === 'LEAGUE_CHAMPION' && Number(a?.teamId) === Number(userTeamId),
  ).length;

  if (teamChampionships >= 2) {
    shift += LEVERAGE_MODIFIERS.FRANCHISE_CHAMPION;
    reasons.push('Franchise championship history attracts top talent');
  }

  // Playoff drought: 0 playoff appearances in most recent 3+ completed seasons
  const teamHistory = meta?.franchiseHistoryByTeam?.[String(userTeamId)];
  if (teamHistory?.seasons) {
    const completedSeasons = (teamHistory.seasons)
      .filter((s) => !currentSeason || safeNum(s?.year) < currentSeason)
      .sort((a, b) => safeNum(b?.year) - safeNum(a?.year))
      .slice(0, 3);

    if (completedSeasons.length >= 3 && completedSeasons.every((s) => !s.madePlayoffs)) {
      shift += LEVERAGE_MODIFIERS.FRANCHISE_DROUGHT;
      reasons.push('Franchise playoff drought raises free agent skepticism');
    }
  }

  // Coaching instability: 3+ changes in last 3 seasons → +6% demand premium
  if (coachingInstabilityPenalty?.penalty) {
    shift += LEVERAGE_MODIFIERS.COACHING_INSTABILITY;
    reasons.push(coachingInstabilityPenalty.reason ?? 'Franchise instability — frequent coaching changes');
  }

  return { multiplier: 1 + shift, reasons };
}

// ── applyNegotiationModifiers ─────────────────────────────────────────────────

/**
 * Apply combined player + franchise modifiers to a base demand object.
 * Total shift is capped at ±MAX_SHIFT (25%).
 *
 * Only baseAnnual is adjusted; years and signingBonus are preserved.
 *
 * @param {object} baseDemand            – demand snapshot ({ baseAnnual, ... })
 * @param {{ multiplier: number }} playerLeverage
 * @param {{ multiplier: number }} franchiseReputation
 * @returns {object} – adjusted demand with updated baseAnnual and _negotiationShift
 */
export function applyNegotiationModifiers(baseDemand, playerLeverage, franchiseReputation) {
  const playerShift = safeNum(playerLeverage?.multiplier, 1) - 1;
  const franchiseShift = safeNum(franchiseReputation?.multiplier, 1) - 1;
  const totalShift = playerShift + franchiseShift;
  const clamped = clampShift(totalShift);

  const baseAnnual = safeNum(baseDemand?.baseAnnual);
  const adjustedAnnual = baseAnnual > 0 ? Math.round(baseAnnual * (1 + clamped) * 10) / 10 : 0;

  return {
    ...baseDemand,
    baseAnnual: adjustedAnnual,
    _negotiationShift: Math.round(clamped * 1000) / 1000,
  };
}

// ── getNegotiationContext ─────────────────────────────────────────────────────

/**
 * Build human-readable negotiation context for the UI.
 *
 * @param {object} player   – player data
 * @param {object} meta     – game meta
 * @param {object} context  – {
 *   moraleSummary?: object,
 *   awardSummary?: object,
 *   currentSeason?: number,
 *   userTeamId?: number|string,
 * }
 * @returns {{ leverageLabel: string, reputationLabel: string, feedbackLine: string|null }}
 */
export function getNegotiationContext(player, meta, context = {}) {
  const { moraleSummary = {}, awardSummary = {}, currentSeason = 0, userTeamId = null } = context;

  const playerLeverage = computePlayerLeverage(player, { moraleSummary, awardSummary, currentSeason });
  const franchiseRep = computeFranchiseReputation(meta, { userTeamId, currentSeason });

  const playerShift = playerLeverage.multiplier - 1;
  const franchiseShift = franchiseRep.multiplier - 1;
  const totalClamped = clampShift(playerShift + franchiseShift);

  let leverageLabel;
  if (totalClamped > 0.005) leverageLabel = 'High Leverage';
  else if (totalClamped < -0.005) leverageLabel = 'Discount';
  else leverageLabel = 'Standard';

  let reputationLabel;
  if (franchiseShift < -0.005) reputationLabel = 'Championship franchise';
  else if (franchiseShift > 0.005) reputationLabel = 'Franchise in drought';
  else reputationLabel = 'Standard franchise';

  // Primary feedback line: most impactful reason (player first, franchise second)
  const allReasons = [...playerLeverage.reasons, ...franchiseRep.reasons];
  const feedbackLine = allReasons[0] ?? null;

  return { leverageLabel, reputationLabel, feedbackLine };
}
