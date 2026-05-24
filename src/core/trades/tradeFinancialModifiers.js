/**
 * tradeFinancialModifiers.js
 *
 * Pure financial burden modifier module for AI trade package scoring.
 * Adjusts incoming player asset valuations based on the receiving team's
 * salary cap flexibility — preventing AI franchises from accepting proposals
 * that would breach their cap parameters.
 *
 * All functions are stateless and non-mutating — safe to call from tests,
 * UI components, and worker scoring loops without touching IndexedDB.
 *
 * Integration: used by trade-logic.js scoring loops only.
 * These helpers do NOT affect trade finalization, ownership transfer,
 * or worker transaction paths.
 */

import { getActiveCapHit } from '../contracts/contractObligations.js';
import { TEAM_STRATEGIC_POSTURE } from './teamStrategicDirection.js';

// ── Financial Posture Enum ────────────────────────────────────────────────────

export const CAP_FINANCIAL_POSTURE = Object.freeze({
  SECURE: 'SECURE',
  RESTRICTED: 'RESTRICTED',
  INSOLVENCY_RISK: 'INSOLVENCY_RISK',
});

// ── Cap Burden Configuration Constants ────────────────────────────────────────

/**
 * Configurable thresholds and multipliers for cap burden scoring.
 * All monetary values are in $M (millions).
 *
 * Consumers may override any field via the `options` argument of each helper.
 */
export const CAP_BURDEN_CONFIG = Object.freeze({
  // Minimum cap buffer ($M) that must remain after absorbing a new contract.
  // If the team would be left with less than this after ingesting a salary, a
  // penalty is applied even if the contract technically "fits".
  CRITICAL_BUFFER_M: 2.0,

  // Team financial posture classification thresholds ($M cap room).
  SECURE_CAP_ROOM_MIN: 15.0,      // >= $15M → SECURE
  RESTRICTED_CAP_ROOM_MIN: 2.0,   // $2M–$15M → RESTRICTED; below → INSOLVENCY_RISK

  // Trade value multipliers based on cap impact of the incoming contract.
  BASELINE_MULTIPLIER: 1.00,         // salary fits with ample buffer — no penalty
  TIGHT_FIT_MULTIPLIER: 0.80,        // salary fits but leaves < CRITICAL_BUFFER_M remaining
  OVER_CAP_PENALTY_MULTIPLIER: 0.40, // salary exceeds available cap space entirely

  // Posture-specific adjustments applied on top of the burden multiplier.
  CONTENDER_BURDEN_RELIEF: 1.15,     // contenders tolerate mild cap stress for immediate stars
  REBUILDER_BURDEN_PENALTY: 0.75,    // rebuilders extra-discount expensive aging veterans

  // Thresholds for triggering the REBUILDER veteran burden penalty.
  VETERAN_SALARY_THRESHOLD_M: 12.0,  // >= $12M annual cap hit = expensive contract
  VETERAN_AGE_THRESHOLD: 30,         // age >= 30 = aging veteran
});

// ── Internal helpers ──────────────────────────────────────────────────────────

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Like num() but treats null and undefined as missing — returns fallback for those.
// Needed because Number(null) === 0, which is finite, so num(null, null) returns 0.
function numNullable(v, fallback = null) {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Classify a team's overall salary-cap financial flexibility.
 *
 * @param {object} teamState         - team object (reserved for future enrichment; unused now)
 * @param {number} availableCapRoom  - team's currently available cap room in $M
 * @param {object} options           - optional overrides for CAP_BURDEN_CONFIG constants
 * @returns {string} one of CAP_FINANCIAL_POSTURE values
 */
export function calculateCapFlexibilityPostures(teamState = {}, availableCapRoom, options = {}) {
  const cfg = { ...CAP_BURDEN_CONFIG, ...options };
  const room = num(availableCapRoom, 0);
  if (room >= cfg.SECURE_CAP_ROOM_MIN) return CAP_FINANCIAL_POSTURE.SECURE;
  if (room >= cfg.RESTRICTED_CAP_ROOM_MIN) return CAP_FINANCIAL_POSTURE.RESTRICTED;
  return CAP_FINANCIAL_POSTURE.INSOLVENCY_RISK;
}

/**
 * Apply a financial burden multiplier to an incoming player's trade value,
 * based on whether the receiving team can safely absorb the contract.
 *
 * Scoring logic (in order):
 *  1. Read the incoming player's active cap hit via getActiveCapHit(), falling
 *     back to `playerAsset.capHit`, then `playerAsset.contract.baseAnnual`,
 *     then `playerAsset.baseAnnual` / `playerAsset.salary` as legacy paths.
 *  2. If any required input is missing or non-finite, return baseValue × 1.00
 *     (safe baseline — never throws, never mutates).
 *  3. Compute `remaining = availableCapRoom − capHit`:
 *       remaining >= CRITICAL_BUFFER_M → BASELINE_MULTIPLIER (1.00×)
 *       remaining in [0, CRITICAL_BUFFER_M) → TIGHT_FIT_MULTIPLIER (0.80×)
 *       remaining < 0                  → OVER_CAP_PENALTY_MULTIPLIER (0.40×)
 *  4. CONTENDER posture: relieve cap stress multiplier by CONTENDER_BURDEN_RELIEF
 *     (capped at 1.00×) — lets contenders absorb mild restrictions for stars.
 *  5. REBUILDER posture: when the incoming player is an expensive (≥ $12M) aging
 *     (age ≥ 30) veteran AND a burden multiplier is already active, apply an
 *     additional REBUILDER_BURDEN_PENALTY — rebuilders aggressively reject these.
 *
 * @param {object} playerAsset      - incoming player trade asset (not mutated)
 * @param {number} baseValue        - current trade value before this modifier (not mutated)
 * @param {number} availableCapRoom - receiving team's effective cap room in $M
 * @param {string} teamPosture      - TEAM_STRATEGIC_POSTURE value
 * @param {object} options          - optional overrides for CAP_BURDEN_CONFIG constants
 * @returns {number} adjusted trade value, rounded to nearest integer
 */
export function applyContractCapBurdenModifiers(
  playerAsset = {},
  baseValue = 0,
  availableCapRoom,
  teamPosture = TEAM_STRATEGIC_POSTURE.NEUTRAL,
  options = {},
) {
  const cfg = { ...CAP_BURDEN_CONFIG, ...options };
  const base = num(baseValue, 0);
  if (!Number.isFinite(base) || base <= 0) return Math.max(0, base);

  // Resolve incoming cap hit: prefer getActiveCapHit for accuracy (includes
  // prorated bonus and likely incentives), then fall back through legacy fields.
  let capHit;
  try {
    const computed = getActiveCapHit(playerAsset);
    capHit = Number.isFinite(computed) && computed > 0
      ? computed
      : num(
          playerAsset?.capHit
            ?? playerAsset?.contract?.baseAnnual
            ?? playerAsset?.baseAnnual
            ?? playerAsset?.salary,
          null,
        );
  } catch {
    capHit = num(
      playerAsset?.capHit
        ?? playerAsset?.contract?.baseAnnual
        ?? playerAsset?.baseAnnual
        ?? playerAsset?.salary,
      null,
    );
  }

  // If no salary data is present, return baseline — never throw.
  if (capHit === null || !Number.isFinite(capHit)) {
    return Math.round(base * cfg.BASELINE_MULTIPLIER);
  }

  const capRoom = numNullable(availableCapRoom, null);
  // If no cap room data is present, return baseline — never throw.
  if (capRoom === null) {
    return Math.round(base * cfg.BASELINE_MULTIPLIER);
  }

  const remainingAfterIngest = capRoom - capHit;

  // Determine raw burden multiplier from cap headroom analysis.
  let burdenMultiplier;
  if (remainingAfterIngest >= cfg.CRITICAL_BUFFER_M) {
    burdenMultiplier = cfg.BASELINE_MULTIPLIER;
  } else if (remainingAfterIngest >= 0) {
    burdenMultiplier = cfg.TIGHT_FIT_MULTIPLIER;
  } else {
    burdenMultiplier = cfg.OVER_CAP_PENALTY_MULTIPLIER;
  }

  // CONTENDER posture: mild relief — can stomach cap stress for immediate stars.
  // Only applies when there is already a penalty (multiplier < baseline).
  if (
    teamPosture === TEAM_STRATEGIC_POSTURE.CONTENDER
    && burdenMultiplier < cfg.BASELINE_MULTIPLIER
  ) {
    burdenMultiplier = Math.min(
      cfg.BASELINE_MULTIPLIER,
      burdenMultiplier * cfg.CONTENDER_BURDEN_RELIEF,
    );
  }

  // REBUILDER posture: additional penalty for expensive aging veterans when
  // cap is already under stress. Rebuilders reject these contracts most aggressively.
  if (
    teamPosture === TEAM_STRATEGIC_POSTURE.REBUILDER
    && burdenMultiplier < cfg.BASELINE_MULTIPLIER
  ) {
    const playerAge = num(playerAsset?.age, 0);
    if (capHit >= cfg.VETERAN_SALARY_THRESHOLD_M && playerAge >= cfg.VETERAN_AGE_THRESHOLD) {
      burdenMultiplier *= cfg.REBUILDER_BURDEN_PENALTY;
    }
  }

  return Math.round(base * burdenMultiplier);
}
