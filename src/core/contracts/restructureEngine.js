/**
 * restructureEngine.js — Contract Restructuring V1
 *
 * Pure, deterministic contract-restructure module.
 * Converts base salary into signing bonus, creating dead cap / void years.
 *
 * Design constraints:
 *  - Pure functions only. No side effects.
 *  - No imports from worker, UI, news, morale engine, holdout engine,
 *    HOF engine, coaching engine, or sim engine.
 *  - No Math.random — fully deterministic.
 *  - applyRestructure never mutates input objects.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Fraction of current cap hit converted to signing bonus */
const CONVERSION_PCT = 0.40;

/** Maximum number of restructures per contract lifetime */
export const MAX_RESTRUCTURES = 2;

/** Dead cap threshold: team.deadCapItems total must stay below this fraction of capSpace */
const DEAD_CAP_TEAM_THRESHOLD_PCT = 0.15;

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(v) {
  return Math.round(safeNum(v) * 100) / 100;
}

// ── canRestructure ────────────────────────────────────────────────────────────

/**
 * Determine if a player's contract can be restructured.
 *
 * @param {object} player  – player data
 * @param {object} team    – team data (reads team.capRoom, team.deadCapItems)
 * @returns {{ eligible: boolean, reason: string }}
 */
export function canRestructure(player, team) {
  const contract = player?.contract ?? {};
  const yearsLeft = safeNum(
    contract?.yearsRemaining ?? contract?.years ?? contract?.yearsLeft,
    0,
  );
  const restructureCount = safeNum(contract?.restructureCount, 0);

  // Need at least 2 years to spread dead cap
  if (yearsLeft < 2) {
    return { eligible: false, reason: 'Contract must have 2 or more years remaining.' };
  }

  // Max 2 restructures per contract
  if (restructureCount >= MAX_RESTRUCTURES) {
    return { eligible: false, reason: 'Contract has already been restructured the maximum number of times.' };
  }

  // Must have base salary to convert
  const baseAnnual = safeNum(contract?.baseAnnual, 0);
  if (baseAnnual <= 0) {
    return { eligible: false, reason: 'No base salary available to convert.' };
  }

  // Team dead cap threshold: existing dead cap items must be < 15% of cap space
  const capSpace = safeNum(team?.capRoom, 0);
  if (capSpace > 0) {
    const existingDeadCap = Array.isArray(team?.deadCapItems)
      ? team.deadCapItems.reduce((sum, item) => sum + safeNum(item?.amount, 0), 0)
      : 0;
    if (existingDeadCap >= capSpace * DEAD_CAP_TEAM_THRESHOLD_PCT) {
      return {
        eligible: false,
        reason: 'Team dead cap exposure is already at the maximum threshold.',
      };
    }
  }

  return { eligible: true, reason: '' };
}

// ── computeRestructure ────────────────────────────────────────────────────────

/**
 * Calculate the financial preview for a contract restructure.
 *
 * @param {object} player        – player data
 * @param {number} currentCapHit – current-year cap hit ($M)
 * @param {number} yearsLeft     – years remaining on the contract
 * @param {number} season        – current season (for void year expiry)
 * @returns {RestructurePreview}
 *   { conversionAmount, currentYearSaving, deadCapPerFutureYear,
 *     voidYearDeadCap, newCapHit, totalDeadCapCreated, expiresAfterSeason }
 */
export function computeRestructure(player, currentCapHit, yearsLeft, season = 0) {
  const hit = safeNum(currentCapHit, 0);
  const yrs = Math.max(1, Math.round(safeNum(yearsLeft, 1)));

  // Convert 40% of current cap hit to signing bonus
  const conversionAmount = round2(hit * CONVERSION_PCT);

  // This year: saving equals the converted amount (removed from base)
  const currentYearSaving = conversionAmount;

  // Spread across remaining years + 1 void year
  const spreadYears = yrs; // yearsLeft (already includes this year's remainder)
  const deadCapPerFutureYear = round2(conversionAmount / spreadYears);

  // Void year: 1 year past contract end (same as future year amount)
  const voidYearDeadCap = deadCapPerFutureYear;

  // New cap hit: old hit minus conversion plus this year's dead cap portion
  const newCapHit = round2(hit - conversionAmount + deadCapPerFutureYear);

  const totalDeadCapCreated = round2(conversionAmount);

  // Void year dead cap expires the season after the contract ends
  const expiresAfterSeason = safeNum(season) + yrs;

  return {
    conversionAmount,
    currentYearSaving,
    deadCapPerFutureYear,
    voidYearDeadCap,
    newCapHit,
    totalDeadCapCreated,
    expiresAfterSeason,
  };
}

// ── applyRestructure ──────────────────────────────────────────────────────────

/**
 * Apply a restructure to a player and team, returning new immutable objects.
 *
 * @param {object} player  – current player data
 * @param {object} team    – current team data
 * @param {object} preview – output of computeRestructure
 * @param {number} season  – current season (for expiry tracking)
 * @returns {{ updatedPlayer: object, updatedTeam: object }}
 */
export function applyRestructure(player, team, preview, season = 0) {
  const contract = player?.contract ?? {};
  const restructureCount = safeNum(contract?.restructureCount, 0);
  const existingBonus = safeNum(contract?.signingBonus, 0);
  const existingBase = safeNum(contract?.baseAnnual, 0);

  // Update contract: base salary decreases, signing bonus increases
  const newBase = round2(existingBase - preview.conversionAmount);
  const newSigningBonus = round2(existingBonus + preview.conversionAmount);

  const existingVoidYears = Array.isArray(contract?.voidYears) ? contract.voidYears : [];
  const newVoidYears = [
    ...existingVoidYears,
    {
      amount:             preview.voidYearDeadCap,
      expiresAfterSeason: preview.expiresAfterSeason,
      season:             safeNum(season),
    },
  ];

  const updatedPlayer = {
    ...player,
    contract: {
      ...contract,
      baseAnnual:              newBase,
      signingBonus:            newSigningBonus,
      signingBonusRemaining:   round2(safeNum(contract?.signingBonusRemaining, 0) + preview.conversionAmount),
      voidYears:               newVoidYears,
      restructureCount:        restructureCount + 1,
    },
  };

  // Add dead cap item to team for the void year
  const existingDeadCapItems = Array.isArray(team?.deadCapItems) ? team.deadCapItems : [];
  const newDeadCapItem = {
    playerId:           player?.id,
    playerName:         player?.name ?? '',
    amount:             preview.voidYearDeadCap,
    reason:             'restructure_void_year',
    season:             safeNum(season),
    expiresAfterSeason: preview.expiresAfterSeason,
  };

  const updatedTeam = {
    ...team,
    deadCapItems: [...existingDeadCapItems, newDeadCapItem],
  };

  return { updatedPlayer, updatedTeam };
}

// ── getRestructureSummaryForUI ─────────────────────────────────────────────────

/**
 * Build the UI data object for the restructure flow.
 *
 * @param {object} player  – player data
 * @param {object} team    – team data
 * @param {number} season  – current season
 * @returns {{ eligible: boolean, preview: object|null, reason: string }}
 */
export function getRestructureSummaryForUI(player, team, season = 0) {
  const { eligible, reason } = canRestructure(player, team);
  if (!eligible) return { eligible: false, preview: null, reason };

  const contract = player?.contract ?? {};
  const yearsLeft = safeNum(
    contract?.yearsRemaining ?? contract?.years ?? contract?.yearsLeft,
    1,
  );
  const baseAnnual = safeNum(contract?.baseAnnual, 0);
  const signingBonus = safeNum(contract?.signingBonus, 0);
  const yearsTotal = safeNum(contract?.yearsTotal ?? contract?.years, yearsLeft);
  const currentCapHit = round2(baseAnnual + signingBonus / Math.max(1, yearsTotal));
  const restructureCount = safeNum(contract?.restructureCount, 0);

  const preview = computeRestructure(player, currentCapHit, yearsLeft, season);

  return {
    eligible:          true,
    reason:            '',
    preview: {
      ...preview,
      currentCapHit,
      restructuresRemaining: MAX_RESTRUCTURES - restructureCount,
      isHoldoutPlayer:       Boolean(player?.holdout?.active),
    },
  };
}
