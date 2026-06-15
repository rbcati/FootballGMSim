/**
 * holdoutEngine.js — Player Holdouts & Contract Disputes V1
 *
 * Pure, deterministic holdout-state module.
 *
 * Design constraints:
 *  - No I/O, no cache access, no side effects.
 *  - No imports from worker, UI, news, or sim engine.
 *  - No Math.random — fully deterministic.
 *  - Reads morale summary via argument injection (same pattern as negotiationModifiers.js).
 */

// ── Trigger constants ─────────────────────────────────────────────────────────

export const HOLDOUT_TRIGGERS = Object.freeze({
  EXTENSION_REJECTED: 'extension_rejected',
  TRADE_REQUEST_DENIED: 'trade_request_denied',
  STARTER_ROLE_LOST: 'starter_role_lost',
});

// ── Resolution constants ──────────────────────────────────────────────────────

export const HOLDOUT_RESOLUTION = Object.freeze({
  GM_SIGNED: 'gm_signed',
  GM_TRADED: 'gm_traded',
  GM_RELEASED: 'gm_released',
  TIME_EXPIRED: 'time_expired',
});

// ── Demand premiums (fractional) per trigger ──────────────────────────────────

export const HOLDOUT_DEMAND_PREMIUMS = Object.freeze({
  [HOLDOUT_TRIGGERS.EXTENSION_REJECTED]:  0.12,
  [HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED]: 0.18,
  [HOLDOUT_TRIGGERS.STARTER_ROLE_LOST]:   0.08,
});

// ── Expiry threshold (weeks) ──────────────────────────────────────────────────

export const HOLDOUT_EXPIRY_WEEKS = 4;

// ── HOLDOUT_RETURNED delta (applied on time expiry) ──────────────────────────
export const HOLDOUT_RETURNED_DELTA = -8;

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Return a safe holdout object (hydrates old saves that have no holdout field).
 */
export function ensureHoldout(player) {
  const h = player?.holdout;
  return {
    active:          Boolean(h?.active ?? false),
    reason:          h?.reason ?? null,
    startWeek:       h?.startWeek ?? null,
    startSeason:     h?.startSeason ?? null,
    demandPremium:   safeNum(h?.demandPremium, 0),
    resolvedWeek:    h?.resolvedWeek ?? null,
    resolvedSeason:  h?.resolvedSeason ?? null,
    resolvedBy:      h?.resolvedBy ?? null,
  };
}

/**
 * True if the player already had a holdout (active or resolved) this season.
 * Only one holdout per player per season.
 */
function hadHoldoutThisSeason(player, season) {
  const h = player?.holdout;
  if (!h) return false;
  if (h.active && h.startSeason === season) return true;
  if (!h.active && h.resolvedSeason === season) return true;
  // startSeason may exist even after resolution
  if (h.startSeason === season && h.resolvedBy != null) return true;
  return false;
}

/**
 * Check whether the player has a CONTRACT_EXTENDED event with negative delta
 * in their moraleEvents (extension offer below demand countered).
 */
function hasNegativeExtensionEvent(player, season) {
  const events = Array.isArray(player?.moraleEvents) ? player.moraleEvents : [];
  return events.some(
    (e) => e.type === 'CONTRACT_EXTENDED' && safeNum(e.delta, 0) < 0 && e.season === season,
  );
}

/**
 * Check if a CONTRACT_EXTENDED event of any polarity exists for this season.
 */
function hasAnyExtensionEventThisSeason(player, season) {
  const events = Array.isArray(player?.moraleEvents) ? player.moraleEvents : [];
  return events.some((e) => e.type === 'CONTRACT_EXTENDED' && e.season === season);
}

/**
 * Check if the player has a TRADE_REQUEST_DENIED event in moraleEvents.
 */
function hasTradeRequestDeniedEvent(player) {
  const events = Array.isArray(player?.moraleEvents) ? player.moraleEvents : [];
  return events.some((e) => e.type === 'TRADE_REQUEST_DENIED');
}

/**
 * Check if the player has a STARTER_ROLE_LOST event in moraleEvents.
 */
function hasStarterRoleLostEvent(player) {
  const events = Array.isArray(player?.moraleEvents) ? player.moraleEvents : [];
  return events.some((e) => e.type === 'STARTER_ROLE_LOST');
}

/**
 * True when the player is in the final year of their contract.
 * Reads player.contract.years or player.contract.yearsRemaining.
 */
function isContractFinalYear(player) {
  const years = safeNum(
    player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.contractYears,
    2,
  );
  return years <= 1;
}

/**
 * True when the player is a rookie (drafted this season or age <= 22 with draftYear == season).
 */
function isRookiePlayer(player, season) {
  if (player?.draftYear != null && safeNum(player.draftYear) === safeNum(season)) return true;
  return false;
}

/**
 * True when the player is on the practice squad.
 */
function isOnPracticeSquad(player) {
  const status = String(player?.status ?? '').toLowerCase();
  return status === 'practice_squad' || status === 'ps' || Boolean(player?.onPracticeSquad);
}

// ── evaluateHoldoutTriggers ───────────────────────────────────────────────────

/**
 * Evaluate all holdout trigger conditions for a single player.
 *
 * @param {object} player  — player data (reads morale, moraleEvents, contract, holdout)
 * @param {number} season  — current season (year)
 * @param {number} week    — current week
 * @param {object} context — optional { moraleSummary: object }
 * @returns {string|null}  — HOLDOUT_TRIGGERS value, or null if no trigger fires
 */
export function evaluateHoldoutTriggers(player, season, week, context = {}) {
  if (!player?.id) return null;

  // Skip rookies and practice squad
  if (isRookiePlayer(player, season)) return null;
  if (isOnPracticeSquad(player)) return null;

  // Skip if already on holdout
  const holdout = ensureHoldout(player);
  if (holdout.active) return null;

  // Only one holdout per player per season
  if (hadHoldoutThisSeason(player, season)) return null;

  const morale = safeNum(
    context?.moraleSummary?.score ?? player?.morale,
    70,
  );

  // ── Trigger B — Trade request denied (check first: strongest signal) ────────
  if (morale < 38 && hasTradeRequestDeniedEvent(player)) {
    return HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED;
  }

  // ── Trigger A — Extension rejected ──────────────────────────────────────────
  if (
    morale < 45 &&
    isContractFinalYear(player) &&
    !holdout.active
  ) {
    const negExtension = hasNegativeExtensionEvent(player, season);
    const noExtensionOffered = !hasAnyExtensionEventThisSeason(player, season);
    if (negExtension || (noExtensionOffered && morale < 40)) {
      return HOLDOUT_TRIGGERS.EXTENSION_REJECTED;
    }
  }

  // ── Trigger C — Starter role lost (training camp only, weeks 1–4) ────────────
  if (
    week >= 1 && week <= 4 &&
    morale < 42 &&
    hasStarterRoleLostEvent(player)
  ) {
    return HOLDOUT_TRIGGERS.STARTER_ROLE_LOST;
  }

  return null;
}

// ── applyHoldout ──────────────────────────────────────────────────────────────

/**
 * Apply a holdout to a player.
 *
 * @param {object} player   — player data
 * @param {string} trigger  — HOLDOUT_TRIGGERS value
 * @param {number} season
 * @param {number} week
 * @returns {object}        — updated player object (new reference)
 */
export function applyHoldout(player, trigger, season, week) {
  if (!player || !trigger) return player;
  const premium = safeNum(HOLDOUT_DEMAND_PREMIUMS[trigger], 0);
  return {
    ...player,
    holdout: {
      active:        true,
      reason:        trigger,
      startWeek:     week,
      startSeason:   season,
      demandPremium: premium,
      resolvedWeek:  null,
      resolvedSeason: null,
      resolvedBy:    null,
    },
  };
}

// ── resolveHoldout ────────────────────────────────────────────────────────────

/**
 * Resolve a holdout.
 *
 * @param {object} player      — player data
 * @param {string} resolvedBy  — HOLDOUT_RESOLUTION value
 * @param {number} season
 * @param {number} week
 * @returns {object}           — updated player object (new reference)
 */
export function resolveHoldout(player, resolvedBy, season, week) {
  if (!player) return player;
  const existing = ensureHoldout(player);
  if (!existing.active) return player;
  return {
    ...player,
    holdout: {
      ...existing,
      active:         false,
      resolvedWeek:   week,
      resolvedSeason: season,
      resolvedBy,
    },
  };
}

// ── getHoldoutDemandPremium ───────────────────────────────────────────────────

/**
 * Return the active holdout demand premium (0 if no active holdout).
 * This is a fractional value (e.g. 0.12 = +12%).
 *
 * @param {object} player
 * @returns {number}
 */
export function getHoldoutDemandPremium(player) {
  const h = player?.holdout;
  if (!h?.active) return 0;
  return safeNum(h.demandPremium, 0);
}

// ── isAvailableForGameDay ─────────────────────────────────────────────────────

/**
 * False when a player is on holdout (excluded from active game-day roster).
 *
 * @param {object} player
 * @returns {boolean}
 */
export function isAvailableForGameDay(player) {
  const h = player?.holdout;
  if (!h) return true;
  return !h.active;
}

// ── checkHoldoutTimeExpiry ────────────────────────────────────────────────────

/**
 * Check if an active holdout has expired (4+ consecutive weeks).
 * Returns true if the holdout should be resolved by time.
 *
 * @param {object} player
 * @param {number} season
 * @param {number} week
 * @returns {boolean}
 */
export function checkHoldoutTimeExpiry(player, season, week) {
  const h = player?.holdout;
  if (!h?.active) return false;
  if (h.startSeason !== season) return false;
  const weeksOnHoldout = safeNum(week, 0) - safeNum(h.startWeek, 0);
  return weeksOnHoldout >= HOLDOUT_EXPIRY_WEEKS;
}
