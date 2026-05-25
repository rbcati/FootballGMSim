/**
 * aiRetentionLogic.js
 *
 * Pure evaluation layer for AI offseason contract extensions.
 * All exports are stateless and side-effect-free — safe to call from
 * tests or worker logic without touching IndexedDB.
 *
 * Actual cache mutations (contract writes, cap recalculation, transaction logs)
 * live in AiLogic.processExtensions() in ai-logic.js.
 */

import {
  buildContractProfile,
  buildDemandFromProfile,
  computeMarketHeat,
} from '../contract-market.js';

// ── Configuration ─────────────────────────────────────────────────────────────

export const AI_RETENTION_CONFIG = Object.freeze({
  /** Minimum cap buffer to preserve after all extensions ($M). */
  MIN_CAP_BUFFER_M: 5,

  /** OVR floor: players below this threshold are not offered extensions. */
  MIN_OVR_FOR_EXTENSION: 76,

  /** Age ceilings by position group. */
  MAX_AGE_STANDARD: 32,
  MAX_AGE_QB: 36,
  MAX_AGE_RB: 28,

  /**
   * Positional value multipliers applied to the priority score.
   * Higher values push a position up the retention board.
   * Mirrors the position multiplier hierarchy used in worker.js and contract-market.js.
   */
  POSITIONAL_VALUE: Object.freeze({
    QB:   1.45,
    EDGE: 1.20,
    DE:   1.16,
    OT:   1.18,
    LT:   1.18,
    WR:   1.12,
    CB:   1.08,
    DL:   0.94,
    OL:   0.95,
    LB:   0.86,
    S:    0.78,
    TE:   0.76,
    RB:   0.66,
    K:    0.40,
    P:    0.40,
  }),

  /** Minimum acceptance score (0–100) for a player to agree to the AI's offer. */
  ACCEPT_SCORE_THRESHOLD: 72,
});

// ── Internal helpers ──────────────────────────────────────────────────────────

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function round2(v) {
  return Math.round(safeNum(v) * 100) / 100;
}

/**
 * Deterministic per-player hash used to add consistent, reproducible variance
 * to the acceptance simulation without touching Math.random().
 * Identical to the `seeded()` implementation in contract-market.js.
 */
function seededHash(id, salt = 0x1a3f) {
  const raw = String(id ?? '0');
  let h = 2166136261 ^ salt;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 100);
}

/** True when the player has ≤1 contract year remaining (expiring this offseason). */
function isExpiring(player) {
  const years = safeNum(
    player?.contract?.years ??
    player?.contract?.yearsRemaining ??
    player?.contract?.yearsLeft,
    1,
  );
  return years <= 1;
}

/** Whether a player's age is within the allowed extension window for their position. */
function isWithinAgeLimit(pos, age, config) {
  if (pos === 'RB') return age <= config.MAX_AGE_RB;
  if (pos === 'QB') return age <= config.MAX_AGE_QB;
  return age <= config.MAX_AGE_STANDARD;
}

/**
 * Compute the priority score used to rank players on the retention board.
 *
 * Formula:
 *   base  = OVR × positionalMultiplier
 *   bonus = upside for young developing players
 *   penalty = age drag beyond position-specific soft ceilings
 *
 * Higher-OVR players at premium positions (QB, EDGE, OT) naturally float to
 * the top. Aging RBs receive the steepest penalty due to their low positional
 * multiplier and aggressive age ceiling.
 */
function computePriorityScore(player, config) {
  const ovr = safeNum(player?.ovr, 65);
  const pot = safeNum(player?.potential, ovr);
  const age = safeNum(player?.age, 26);
  const pos = String(player?.pos ?? 'OL');
  const posMult = config.POSITIONAL_VALUE[pos] ?? 0.90;

  let score = ovr * posMult;

  // Young-player upside bump (ascending development trajectory)
  if (age <= 26 && pot > ovr) score += (pot - ovr) * 0.5;

  // Age drag: applied beyond soft ceilings even for eligible players,
  // so veterans who barely qualify still rank below prime-age alternatives.
  if (pos === 'RB') {
    if (age > config.MAX_AGE_RB) score -= (age - config.MAX_AGE_RB) * 8;
  } else if (pos === 'QB') {
    if (age > 32) score -= (age - 32) * 3;
  } else {
    if (age > 30) score -= (age - 30) * 6;
  }

  return score;
}

/**
 * Calculate the net change to the team's annual cap hit when a player is extended.
 *
 *   capHit = baseAnnual + (signingBonus / yearsTotal)
 *   delta  = newCapHit − currentCapHit
 *
 * Because we are in the offseason, the player's current contract may still
 * carry proration. We honour those obligations in the delta calculation.
 */
function computeCapHitDelta(player, newContract) {
  const curAnnual  = safeNum(player?.contract?.baseAnnual, 0);
  const curYears   = Math.max(1, safeNum(player?.contract?.yearsTotal ?? player?.contract?.years, 1));
  const curBonus   = safeNum(player?.contract?.signingBonus, 0);
  const currentHit = round2(curAnnual + curBonus / curYears);

  const newAnnual = safeNum(newContract?.baseAnnual, 0);
  const newYears  = Math.max(1, safeNum(newContract?.yearsTotal ?? newContract?.years, 1));
  const newBonus  = safeNum(newContract?.signingBonus, 0);
  const newHit    = round2(newAnnual + newBonus / newYears);

  return round2(newHit - currentHit);
}

/**
 * Deterministic acceptance simulation.
 *
 * Scores the quality of the offer on a 0–100 scale, then adds a small
 * per-player variance term derived from a hash of the player's ID so the
 * result is reproducible across multiple calls with the same input.
 *
 * Accept when score >= AI_RETENTION_CONFIG.ACCEPT_SCORE_THRESHOLD (72).
 *
 * Key properties:
 * - A fair-market offer (annualRatio ≈ 1.0) yields a base score of 85.
 * - Even with maximum downward variance (−5) and neutral morale/success,
 *   a matched offer scores 80 — safely above the threshold.
 * - Players with below-market offers or poor morale can fall below 72 and
 *   decline, simulating realistic hold-outs or departures.
 */
function simulateAcceptance(player, demand, offer, teamSuccessRate, config) {
  const annualRatio = offer.baseAnnual / Math.max(0.01, demand.baseAnnual);
  const morale = safeNum(player?.morale, 70);

  let score = Math.min(85, annualRatio * 85);      // 85 for fair-market offer
  score += (morale - 70) * 0.3;                    // ±3 for morale
  score += (teamSuccessRate - 0.5) * 10;           // ±5 for team success

  // Deterministic per-player variance in [−5, +5]
  score += (seededHash(player?.id) % 11) - 5;

  return score >= config.ACCEPT_SCORE_THRESHOLD;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Determine which expiring players an AI team should extend during the
 * `offseason_resign` phase, respecting cap-space constraints.
 * Pure function — no cache access, no side effects.
 *
 * Algorithm:
 *  1. Filter roster to players with ≤1 contract year remaining who pass
 *     the OVR floor and positional age ceiling.
 *  2. Sort into a Priority Retention Board (OVR × positional multiplier,
 *     age penalty, youth upside bonus).
 *  3. Iterate in priority order:
 *     a. Generate a fair-market offer via buildDemandFromProfile.
 *     b. Skip if extending this player would drop available cap below
 *        MIN_CAP_BUFFER_M (insolvency guard).
 *     c. Simulate player acceptance deterministically.
 *     d. Deduct the cap-hit delta from the running available pool so later
 *        iterations see an accurate budget.
 *  4. Return only accepted extensions.
 *
 * @param {object} teamState        - team record: { id, capRoom, wins, losses, ties, … }
 * @param {Array}  roster           - all player objects currently on this team
 * @param {object} marketConstants  - { freeAgents?: [], phase?: string, season?: number }
 * @returns {Array<{ player, contract, capHitDelta, priorityScore }>}
 */
export function executeAIOffseasonExtensions(teamState, roster = [], marketConstants = {}) {
  const config = AI_RETENTION_CONFIG;
  const freeAgents = Array.isArray(marketConstants?.freeAgents) ? marketConstants.freeAgents : [];

  const wins   = safeNum(teamState?.wins, 0);
  const losses = safeNum(teamState?.losses, 0);
  const ties   = safeNum(teamState?.ties, 0);
  const played = wins + losses + ties;
  const teamSuccessRate = played > 0 ? (wins + ties * 0.5) / played : 0.5;

  // Derive available cap from whichever fields the caller provides.
  let availableCap =
    typeof teamState?.capRoom === 'number'
      ? teamState.capRoom
      : round2(
          safeNum(teamState?.capTotal, 255) -
          safeNum(teamState?.capUsed, 0) -
          safeNum(teamState?.deadCap, 0),
        );

  // Step 1 ── Filter to expiring, eligible players ───────────────────────────
  const eligible = (roster ?? []).filter((p) => {
    if (!isExpiring(p)) return false;
    const ovr = safeNum(p?.ovr, 0);
    const age = safeNum(p?.age, 26);
    const pos = String(p?.pos ?? 'OL');
    if (ovr < config.MIN_OVR_FOR_EXTENSION) return false;
    if (!isWithinAgeLimit(pos, age, config)) return false;
    return true;
  });

  // Step 2 ── Build Priority Retention Board (highest score first) ──────────
  const board = eligible
    .map((player) => ({ player, priorityScore: computePriorityScore(player, config) }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  // Step 3 ── Iterate and offer extensions ──────────────────────────────────
  const extensions = [];

  for (const { player, priorityScore } of board) {
    const pos       = String(player?.pos ?? 'OL');
    const morale    = safeNum(player?.morale, 70);
    const schemeFit = safeNum(player?.schemeFit, 65);
    const marketHeat = computeMarketHeat(pos, freeAgents);

    // Generate market-based demand using the shared contract-market helpers.
    const profile = buildContractProfile(player, {
      tenureYears: safeNum(player?.tenureYears, 0),
    });
    const demand = buildDemandFromProfile(player, profile, {
      marketHeat,
      morale,
      fit: schemeFit,
      teamSuccess: teamSuccessRate,
    });

    // AI offers exactly at market value — fair, not desperate.
    const offer = {
      baseAnnual:   demand.baseAnnual,
      years:        demand.years,
      yearsTotal:   demand.yearsTotal,
      signingBonus: demand.signingBonus,
      guaranteedPct: Math.max(0.45, safeNum(demand.guaranteedPct, 0.45)),
    };

    const capHitDelta = computeCapHitDelta(player, offer);

    // Cap-space guard: skip this player if extending them would violate the buffer.
    if (availableCap - capHitDelta < config.MIN_CAP_BUFFER_M) continue;

    // Deterministic acceptance simulation.
    if (!simulateAcceptance(player, demand, offer, teamSuccessRate, config)) continue;

    availableCap = round2(availableCap - capHitDelta);
    extensions.push({ player, contract: offer, capHitDelta, priorityScore });
  }

  return extensions;
}
