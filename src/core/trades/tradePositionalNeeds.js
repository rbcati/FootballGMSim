/**
 * tradePositionalNeeds.js
 *
 * Pure positional-needs module for AI trade valuation scoring.
 * Analyzes a receiving team's roster depth quality and applies conservative
 * need-based multipliers to incoming player trade valuation.
 *
 * Architecture:
 *  - Pure/stateless — no I/O, no cache access, no mutations.
 *  - Conservative multipliers intentionally kept small in V1.
 *  - Missing or incomplete data defaults safely to UNKNOWN / 1.00×.
 *  - Applied only to read-only scoring paths, never to finalization.
 *  - Perspective: all analysis is from the RECEIVING team's point of view.
 *
 * V1 integration scope:
 *  - tradeFinderAnalysis.js: outgoing asset valuation from target-team perspective.
 *
 * Deferred (not implemented here):
 *  - AI-to-AI acceptance path (trade-logic.js runAIToAITrades).
 *  - Injury-driven temporary needs (injury data reliability unverified).
 *  - Scheme-specific positional weighting.
 *  - Multi-season succession planning.
 *  - Worker offer scoring path (requires safe perspective identification).
 */

import { FOOTBALL_ROSTER_CONFIG } from '../sports/footballRosterConfig.js';
import { TEAM_STRATEGIC_POSTURE } from './teamStrategicDirection.js';

// ── Need Level Enum ────────────────────────────────────────────────────────────

export const POSITION_NEED_LEVEL = Object.freeze({
  /** Team lacks starter-level quality or has a missing starter slot. */
  CRITICAL: 'CRITICAL',
  /** Starter is acceptable but quality is below strong threshold, or aging starter with no depth. */
  MODERATE: 'MODERATE',
  /** Team has strong starter-level quality at this position. */
  SECURE: 'SECURE',
  /** Insufficient data to classify — callers must treat as 1.00×. */
  UNKNOWN: 'UNKNOWN',
});

// ── Classification Thresholds & Defaults ──────────────────────────────────────

export const POSITIONAL_NEED_DEFAULTS = Object.freeze({
  /** avgStarterOvr below this → CRITICAL. Aligned with trade-logic STARTER_NEED_THRESHOLD − 2. */
  criticalOvrThreshold: 73,
  /** avgStarterOvr below this (and ≥ critical) → MODERATE. */
  moderateOvrThreshold: 80,
  /** OVR at or above this prevents SECURE discounts; elite players are never penalised. */
  eliteOvrFloor: 82,
  /** Max age considered "young" for rebuilder upside protection. */
  youngPlayerAgeMax: 24,
  /** Minimum (potential − ovr) to qualify a player as "upside". */
  upsideDeltaMin: 4,
});

// ── Need Multipliers ──────────────────────────────────────────────────────────

/**
 * Base per-need-level multipliers applied to incoming player values.
 * Intentionally conservative — V1 guardrails.
 */
const NEED_MULTIPLIERS = Object.freeze({
  [POSITION_NEED_LEVEL.CRITICAL]: 1.18,
  [POSITION_NEED_LEVEL.MODERATE]: 1.08,
  [POSITION_NEED_LEVEL.SECURE]:   0.95,
  [POSITION_NEED_LEVEL.UNKNOWN]:  1.00,
});

/** Hard bounds — no single positional modifier exceeds these in any path. */
export const POSITIONAL_NEED_MODIFIER_BOUNDS = Object.freeze({
  MAX_PREMIUM:  1.25,
  MIN_MODIFIER: 0.82,
});

// ── Internal Utilities ────────────────────────────────────────────────────────

const _num = (v, fb = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

/**
 * Map position string variants to FOOTBALL_ROSTER_CONFIG.positionGroups keys.
 * Handles common positional aliases used in player objects (OT→OL, DE/DT→DL, etc.).
 * Returns the input unchanged when no variant mapping applies.
 *
 * @param {string|null|undefined} pos
 * @returns {string}
 */
function normalizePositionForNeeds(pos) {
  const p = String(pos ?? '').toUpperCase();
  if (['OT', 'LT', 'RT', 'OG', 'LG', 'RG', 'C'].includes(p))      return 'OL';
  if (['DE', 'DT', 'NT', 'EDGE', 'IDL'].includes(p))               return 'DL';
  if (['DB', 'NCB'].includes(p))                                     return 'CB';
  if (['ILB', 'OLB', 'MLB'].includes(p))                            return 'LB';
  if (['HB', 'FB'].includes(p))                                      return 'RB';
  if (['SS', 'FS'].includes(p))                                      return 'S';
  if (['FL', 'SE'].includes(p))                                      return 'WR';
  if (['PK'].includes(p))                                            return 'K';
  return p;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a per-position depth snapshot for a team's roster.
 *
 * Returns a frozen map: { [pos]: PositionDepthData }
 * Each entry describes the starter/depth split and average quality.
 *
 * Does NOT mutate the input roster or options.
 *
 * @param {object[]} roster  – array of player objects; each needs `pos` and `ovr`.
 * @param {object}   cfg     – roster config; defaults to FOOTBALL_ROSTER_CONFIG.
 * @param {object}   options – optional overrides (unused in V1, reserved).
 * @returns {Readonly<Record<string, Readonly<object>>>}
 */
export function buildTeamPositionDepthSnapshot(roster = [], cfg = FOOTBALL_ROSTER_CONFIG, options = {}) {
  const players = Array.isArray(roster) ? roster : [];
  const positionGroups = (cfg?.positionGroups ?? FOOTBALL_ROSTER_CONFIG.positionGroups) ?? [];
  const groupConfig    = cfg?.groupConfig ?? FOOTBALL_ROSTER_CONFIG.groupConfig ?? {};

  const snapshot = {};

  for (const pos of positionGroups) {
    const expectedStarters = _num(groupConfig[pos]?.starterCountExpected, 1) ?? 1;

    // Extract only ovr/age — avoids holding references into the original array.
    const playersAtPos = players
      .filter((p) => p != null && normalizePositionForNeeds(p?.pos) === pos)
      .map((p) => ({ ovr: _num(p?.ovr, 0), age: _num(p?.age, null) }));

    // Sort copy descending by OVR — does not mutate the original array.
    playersAtPos.sort((a, b) => b.ovr - a.ovr);

    const starters    = playersAtPos.slice(0, expectedStarters);
    const depth       = playersAtPos.slice(expectedStarters);
    const avgStarterOvr = starters.length
      ? starters.reduce((sum, p) => sum + p.ovr, 0) / starters.length
      : 0;

    snapshot[pos] = Object.freeze({
      pos,
      starterCount:   expectedStarters,
      playersCount:   playersAtPos.length,
      startersCount:  starters.length,
      depthCount:     depth.length,
      avgStarterOvr,
      bestStarterOvr: starters.length > 0 ? starters[0].ovr : 0,
      bestStarterAge: starters.length > 0 ? starters[0].age : null,
    });
  }

  return Object.freeze(snapshot);
}

/**
 * Classify each position group into a POSITION_NEED_LEVEL using a roster snapshot.
 *
 * Classification logic (conservative):
 *  - CRITICAL: no players, missing starter slot(s), or avgStarterOvr < criticalOvrThreshold.
 *  - MODERATE: avgStarterOvr in [criticalOvrThreshold, moderateOvrThreshold).
 *  - SECURE:   avgStarterOvr ≥ moderateOvrThreshold with all starter slots filled.
 *
 * Returns a frozen map: { [pos]: POSITION_NEED_LEVEL }.
 * Missing position data defaults to UNKNOWN.
 *
 * Does NOT mutate inputs.
 *
 * @param {object[]} roster        – array of player objects.
 * @param {object}   cfg           – roster config; defaults to FOOTBALL_ROSTER_CONFIG.
 * @param {object}   leagueContext – reserved for future league-average integration.
 * @param {object}   options       – optional threshold overrides.
 * @returns {Readonly<Record<string, string>>}
 */
export function calculateTeamDepthDeficiencies(
  roster = [],
  cfg = FOOTBALL_ROSTER_CONFIG,
  leagueContext = {},
  options = {},
) {
  const resolvedCfg = options?.cfg ?? cfg ?? FOOTBALL_ROSTER_CONFIG;
  const snapshot    = buildTeamPositionDepthSnapshot(roster, resolvedCfg, options);
  const thresholds  = { ...POSITIONAL_NEED_DEFAULTS, ...options };
  const deficiencies = {};

  for (const [pos, posData] of Object.entries(snapshot)) {
    if (!posData) {
      deficiencies[pos] = POSITION_NEED_LEVEL.UNKNOWN;
      continue;
    }

    const missingStarters = Math.max(0, posData.starterCount - posData.startersCount);

    if (
      posData.playersCount === 0 ||
      missingStarters > 0 ||
      posData.avgStarterOvr < thresholds.criticalOvrThreshold
    ) {
      deficiencies[pos] = POSITION_NEED_LEVEL.CRITICAL;
    } else if (posData.avgStarterOvr < thresholds.moderateOvrThreshold) {
      deficiencies[pos] = POSITION_NEED_LEVEL.MODERATE;
    } else {
      deficiencies[pos] = POSITION_NEED_LEVEL.SECURE;
    }
  }

  return Object.freeze(deficiencies);
}

/**
 * Look up the receiving team's need level for a specific player asset.
 *
 * Returns UNKNOWN when:
 *  - playerAsset is null/undefined.
 *  - depthNeedsMap is null/not an object.
 *  - Player position is not found in the needs map.
 *  - Position cannot be normalized.
 *
 * @param {object} playerAsset   – player object with `pos` field.
 * @param {object} depthNeedsMap – map returned by calculateTeamDepthDeficiencies.
 * @param {object} options       – reserved.
 * @returns {string} POSITION_NEED_LEVEL value
 */
export function getNeedLevelForPlayer(playerAsset = {}, depthNeedsMap = {}, options = {}) {
  if (playerAsset == null || depthNeedsMap == null || typeof depthNeedsMap !== 'object') {
    return POSITION_NEED_LEVEL.UNKNOWN;
  }

  const pos = normalizePositionForNeeds(playerAsset?.pos);
  if (!pos) return POSITION_NEED_LEVEL.UNKNOWN;

  const level = depthNeedsMap[pos];
  return Object.values(POSITION_NEED_LEVEL).includes(level) ? level : POSITION_NEED_LEVEL.UNKNOWN;
}

/**
 * Apply a conservative positional need multiplier to a player asset's base value.
 *
 * Called from receiving-team scoring paths only. Perspective must be the team
 * that would receive this player, using that team's depthNeedsMap.
 *
 * Key guardrails:
 *  - UNKNOWN need → returns baseValue unchanged (1.00×).
 *  - Elite players (OVR ≥ eliteOvrFloor) are never discounted at SECURE positions.
 *  - Rebuilders protect young/upside players from the SECURE discount.
 *  - Contenders receive a small additional bonus on CRITICAL and MODERATE premiums.
 *  - No modifier ever exceeds MAX_PREMIUM (1.25×) or falls below MIN_MODIFIER (0.82×).
 *
 * Does NOT mutate inputs.
 *
 * @param {object} playerAsset   – player object with pos, ovr, age, potential/pot fields.
 * @param {number} baseValue     – pre-modifier player value score.
 * @param {object} depthNeedsMap – receiving team's needs map from calculateTeamDepthDeficiencies.
 * @param {string} teamPosture   – TEAM_STRATEGIC_POSTURE of the receiving team.
 * @param {object} options       – optional threshold overrides.
 * @returns {number} adjusted value, rounded to nearest integer.
 */
export function applyPositionalNeedModifiers(
  playerAsset  = {},
  baseValue    = 0,
  depthNeedsMap = {},
  teamPosture  = TEAM_STRATEGIC_POSTURE.NEUTRAL,
  options      = {},
) {
  const base = _num(baseValue, null);
  if (base == null || !Number.isFinite(base) || base <= 0) {
    return Math.max(0, _num(baseValue, 0));
  }

  const needLevel = getNeedLevelForPlayer(playerAsset, depthNeedsMap, options);
  // Unknown data → neutral — must not modify the value.
  if (needLevel === POSITION_NEED_LEVEL.UNKNOWN) return base;

  const ovr = _num(playerAsset?.ovr, 70);
  const age = _num(playerAsset?.age, 27);
  const pot = _num(playerAsset?.potential ?? playerAsset?.pot, ovr);
  const cfg = { ...POSITIONAL_NEED_DEFAULTS, ...options };
  const { MAX_PREMIUM, MIN_MODIFIER } = POSITIONAL_NEED_MODIFIER_BOUNDS;

  const isElite      = ovr >= cfg.eliteOvrFloor;
  const isYoungUpside = age <= cfg.youngPlayerAgeMax && (pot - ovr) >= cfg.upsideDeltaMin;

  let multiplier = NEED_MULTIPLIERS[needLevel] ?? 1.00;

  // Contenders care more about immediate roster holes.
  if (teamPosture === TEAM_STRATEGIC_POSTURE.CONTENDER) {
    if (needLevel === POSITION_NEED_LEVEL.CRITICAL) {
      multiplier = Math.min(multiplier * 1.04, MAX_PREMIUM);
    } else if (needLevel === POSITION_NEED_LEVEL.MODERATE) {
      multiplier = Math.min(multiplier * 1.02, MAX_PREMIUM);
    }
  }

  // Rebuilders care more about youth/upside than positional saturation.
  // Protect young/upside player values from the SECURE discount.
  if (teamPosture === TEAM_STRATEGIC_POSTURE.REBUILDER) {
    if (needLevel === POSITION_NEED_LEVEL.SECURE && isYoungUpside) {
      multiplier = 1.00; // no discount — young upside is valuable regardless of depth
    }
  }

  // Elite players are never penalised simply because a position is well-stocked.
  if (needLevel === POSITION_NEED_LEVEL.SECURE && isElite) {
    multiplier = Math.max(multiplier, 1.00);
  }

  // Hard conservative bounds — V1 safety rails.
  multiplier = Math.max(MIN_MODIFIER, Math.min(MAX_PREMIUM, multiplier));

  return Math.round(base * multiplier);
}
