/**
 * aiExtensionEngine.js — AI Contract Extensions V1
 *
 * Pure, deterministic AI extension-offer module.
 * AI teams extend their own players before FA opens, creating realistic
 * market scarcity.
 *
 * Design constraints:
 *  - Pure functions only. No side effects.
 *  - No imports from worker, UI, news, morale engine, holdout engine,
 *    HOF engine, coaching engine, or sim engine.
 *  - Receives adjustedDemand, posture, moraleSummary, hofStatus as arguments.
 *  - No Math.random — seeded LCG only.
 *  - Fully deterministic: same inputs → same outputs.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Per-posture extension parameters.
 *  ovrThreshold – minimum player OVR to be offered an extension
 *  offerFactor  – amount = adjustedDemand × offerFactor
 *  maxYears     – maximum contract length offered
 */
export const AI_EXTENSION_FACTORS = Object.freeze({
  contender:    { ovrThreshold: 72, offerFactor: 1.02, maxYears: 4 },
  playoff_hunt: { ovrThreshold: 70, offerFactor: 1.00, maxYears: 4 },
  middle:       { ovrThreshold: 68, offerFactor: 0.97, maxYears: 3 },
  rebuild:      { ovrThreshold: 60, offerFactor: 0.93, maxYears: 3 },
  seller:       { ovrThreshold: 999, offerFactor: 0.90, maxYears: 2 },
});

// Maximum extensions per team per offseason
const MAX_EXTENSIONS_PER_TEAM = 3;

// Cap buffer multiplier: offer must fit within capSpace × this fraction
const CAP_BUFFER = 1.10;

// Signing bonus as fraction of total contract value (amount × years)
const SIGNING_BONUS_PCT = 0.25;

// Cap ceiling: no single extension can exceed this fraction of total capSpace
const CAP_CEILING_PCT = 0.30;

// ── Internal helpers ──────────────────────────────────────────────────────────

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── shouldAIExtendPlayer ──────────────────────────────────────────────────────

/**
 * Determine whether an AI team should attempt to extend this player.
 *
 * @param {object} team      – team data (reads team.id)
 * @param {object} player    – player data
 * @param {string} posture   – DEADLINE_POSTURE value (contender/seller/rebuild/etc.)
 * @param {number} capSpace  – team's effective cap space
 * @returns {boolean}
 */
export function shouldAIExtendPlayer(team, player, posture, capSpace) {
  const factors = AI_EXTENSION_FACTORS[posture] ?? AI_EXTENSION_FACTORS.middle;

  const ovr = safeNum(player?.ovr, 0);
  const age = safeNum(player?.age, 30);

  // Extension year only: player must have exactly 1 year left
  const yearsLeft = safeNum(
    player?.contractYearsLeft ??
    player?.contract?.yearsRemaining ??
    player?.contract?.years ??
    player?.contract?.yearsLeft,
    2,
  );
  if (yearsLeft !== 1) return false;

  // Already signed (extended by another mechanism this offseason)
  if (player?.negotiationStatus === 'SIGNED') return false;

  // Never extend age >= 34
  if (age >= 34) return false;

  // Seller teams: ovrThreshold of 999 means only franchise anchors (OVR >= 80) qualify
  if (posture === 'seller') {
    if (ovr < 80) return false;
  } else {
    // OVR threshold by posture for all other postures
    if (ovr < factors.ovrThreshold) return false;
  }

  // Rebuilder: prioritize age <= 26 players (future core only)
  if (posture === 'rebuild' && age > 26) return false;

  // Never extend a player currently on active holdout
  if (player?.holdout?.active === true) return false;

  // Cap space must cover adjustedDemand × offerFactor × 1.10 buffer
  // We estimate demand conservatively — the actual check happens in getAIExtensionTargets
  // with the real adjustedDemand.  Here we gate on a simple OVR-derived estimate.
  const estimatedDemand = Math.max(0.5, (ovr - 60) * 0.4);
  const estimatedOffer = estimatedDemand * factors.offerFactor;
  if (safeNum(capSpace) < estimatedOffer * CAP_BUFFER) return false;

  return true;
}

// ── computeAIExtensionOffer ───────────────────────────────────────────────────

/**
 * Compute the extension offer for a player.
 *
 * @param {object} team           – team data (reads team.id)
 * @param {object} player         – player data (reads player.age)
 * @param {number} adjustedDemand – market price (baseAnnual after all modifiers)
 * @param {string} posture        – DEADLINE_POSTURE value
 * @param {number} [capSpace]     – team's effective cap space (optional, for cap ceiling)
 * @returns {{ amount: number, years: number, signingBonus: number, teamId: number }}
 */
export function computeAIExtensionOffer(team, player, adjustedDemand, posture, capSpace = 0) {
  const factors = AI_EXTENSION_FACTORS[posture] ?? AI_EXTENSION_FACTORS.middle;
  const demand = safeNum(adjustedDemand);
  const age = safeNum(player?.age, 28);

  // Base: demand × posture factor
  let amount = Math.round(demand * factors.offerFactor * 10) / 10;

  // Cap at 30% of capSpace
  const capCeil = Math.round(safeNum(capSpace) * CAP_CEILING_PCT * 10) / 10;
  if (capCeil > 0) amount = Math.min(amount, capCeil);

  // Years: deterministic from player age, bounded by maxYears for posture
  let years;
  if (age <= 25)      years = factors.maxYears;
  else if (age <= 29) years = Math.max(1, factors.maxYears - 1);
  else if (age <= 32) years = 2;
  else                years = 1;

  // Signing bonus = 25% of total contract value
  const signingBonus = Math.round(amount * years * SIGNING_BONUS_PCT * 10) / 10;

  return {
    amount:       Math.round(amount * 10) / 10,
    years,
    signingBonus,
    teamId:       Number(team?.id),
  };
}

// ── willPlayerAcceptAIExtension ───────────────────────────────────────────────

/**
 * Determine whether a player accepts the AI extension offer.
 * Fully deterministic — no Math.random.
 *
 * @param {object} player         – player data
 * @param {object} offer          – { amount, years, signingBonus, teamId }
 * @param {number} adjustedDemand – player's market price (baseAnnual)
 * @param {object} [moraleSummary]– { score: number } from getPlayerMoraleSummary
 * @returns {boolean}
 */
export function willPlayerAcceptAIExtension(player, offer, adjustedDemand, moraleSummary = {}) {
  const demand = safeNum(adjustedDemand);
  if (demand <= 0) return false;

  const amount = safeNum(offer?.amount, 0);
  const morale = safeNum(moraleSummary?.score ?? player?.morale, 70);
  const hofStatus = player?.hofStatus;

  // HOF inductee: requires at least 1.00× demand (no discount)
  if (hofStatus === 'inducted') {
    return amount >= demand;
  }

  // Unhappy player: demands above-market to stay
  if (morale < 40) {
    return amount >= demand * 1.05;
  }

  // Happy player: accepts slight discount
  if (morale > 75) {
    return amount >= demand * 0.92;
  }

  // Default: accepts if offer >= 95% of demand
  return amount >= demand * 0.95;
}

// ── getAIExtensionTargets ─────────────────────────────────────────────────────

/**
 * For a given AI team, return the players to attempt extending this offseason,
 * in priority order. Accumulates cap usage across extensions.
 *
 * @param {object}   team     – team data
 * @param {object[]} players  – roster players for this team
 * @param {string}   posture  – DEADLINE_POSTURE value
 * @param {number}   capSpace – team's effective cap space
 * @param {object}   context  – { demandByPlayerId: Map<id, { baseAnnual }> }
 *                              Pre-computed demand snapshots (optional).
 * @returns {object[]} players to attempt extending, priority-sorted
 */
export function getAIExtensionTargets(team, players, posture, capSpace, context = {}) {
  const factors = AI_EXTENSION_FACTORS[posture] ?? AI_EXTENSION_FACTORS.middle;
  const { demandByPlayerId = new Map() } = context;

  // Filter: apply shouldAIExtendPlayer
  const eligible = players.filter((p) => shouldAIExtendPlayer(team, p, posture, capSpace));

  // Sort: OVR desc, then age asc (highest value, youngest first)
  eligible.sort((a, b) => {
    const ovrDiff = safeNum(b?.ovr, 0) - safeNum(a?.ovr, 0);
    if (ovrDiff !== 0) return ovrDiff;
    return safeNum(a?.age, 30) - safeNum(b?.age, 30);
  });

  // Cap at MAX_EXTENSIONS_PER_TEAM, accumulating cap usage
  const targets = [];
  let remainingCap = safeNum(capSpace);

  for (const player of eligible) {
    if (targets.length >= MAX_EXTENSIONS_PER_TEAM) break;

    // Get demand from pre-computed map or estimate
    const demandSnapshot = demandByPlayerId.get(player.id);
    const demand = safeNum(demandSnapshot?.baseAnnual, (safeNum(player?.ovr, 60) - 60) * 0.4);

    // Compute offer amount for cap-accumulation check
    let offerAmount = Math.round(demand * factors.offerFactor * 10) / 10;
    const capCeil = Math.round(remainingCap * CAP_CEILING_PCT * 10) / 10;
    if (capCeil > 0) offerAmount = Math.min(offerAmount, capCeil);

    // Cap guard: offer × buffer must fit remaining cap
    if (remainingCap < offerAmount * CAP_BUFFER) continue;

    targets.push(player);
    remainingCap -= offerAmount;
  }

  return targets;
}
