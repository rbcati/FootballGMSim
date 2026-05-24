/**
 * aiRosterCuts.js
 *
 * Pure evaluation layer for AI offseason roster cuts.
 * All exports are stateless and side-effect-free — safe to call from
 * tests or worker logic without touching IndexedDB.
 *
 * Actual cache mutations (player release, dead cap writes) live in
 * AiLogic.executeOffseasonRosterCuts() in ai-logic.js.
 */

import {
  getActiveCapHit,
  calculateReleaseDeadCap,
} from '../contracts/contractObligations.js';

export const ROSTER_CUT_CONFIG = Object.freeze({
  /** Only trigger the cut sweep when projected cap room is below this value ($M). */
  SAFE_CAP_THRESHOLD_M: 15,

  /** Teams below $0M cap room are critically insolvent — elite starters become eligible. */
  CRITICAL_INSOLVENCY_M: 0,

  /** Players at or above this OVR are protected from cuts under normal conditions. */
  ELITE_OVR_FLOOR: 85,

  /** Age at or above which a veteran is considered for high-priority cuts. */
  HIGH_PRIORITY_AGE: 30,

  /** OVR ceiling — veterans below this threshold are eligible for high-priority cuts. */
  HIGH_PRIORITY_MAX_OVR: 75,

  /** Minimum real cap savings ($M) required to qualify for a high-priority cut. */
  MIN_CAP_SAVINGS_M: 3,
});

function round2(v) {
  return Math.round(Number(v) * 100) / 100;
}

/**
 * Evaluate whether releasing a single player would improve the team's cap position.
 * Pure function — no cache access.
 *
 * @param {object} player - player object (must have ovr, age, contract fields)
 * @returns {{ shouldCut: boolean, reason: string, capSavings: number, priority: string|null }}
 */
export function evaluateCutCandidate(player) {
  const capHit = getActiveCapHit(player);
  const { deadCapThisYear } = calculateReleaseDeadCap(player);
  const capSavings = round2(capHit - deadCapThisYear);

  // Never release if dead cap >= cap hit — this would actively worsen the cap.
  if (capSavings <= 0) {
    return { shouldCut: false, reason: 'no_cap_savings', capSavings, priority: null };
  }

  const ovr = Number(player.ovr ?? 0);
  const age = Number(player.age ?? 28);
  const cfg = ROSTER_CUT_CONFIG;

  // Protect elite starters; critical insolvency override is handled by the caller.
  if (ovr >= cfg.ELITE_OVR_FLOOR) {
    return { shouldCut: false, reason: 'elite_starter_protected', capSavings, priority: null };
  }

  // High-priority: aging veteran, declining production, meaningful real savings.
  if (
    age >= cfg.HIGH_PRIORITY_AGE &&
    ovr < cfg.HIGH_PRIORITY_MAX_OVR &&
    capSavings > cfg.MIN_CAP_SAVINGS_M
  ) {
    return { shouldCut: true, reason: 'aging_veteran', capSavings, priority: 'high' };
  }

  return { shouldCut: false, reason: 'below_cut_threshold', capSavings, priority: null };
}

/**
 * Determine which players an AI team should release during the offseason.
 * Pure function — no cache access.
 *
 * The function:
 * 1. Skips evaluation entirely if team cap room >= SAFE_CAP_THRESHOLD_M.
 * 2. Collects candidates where Cap Savings > 0.
 * 3. Sorts by cap savings descending (greedy: highest savings first).
 * 4. Stops releasing once simulated cap room reaches SAFE_CAP_THRESHOLD_M.
 *
 * @param {object} teamState  - team record with capRoom / capTotal / capUsed / deadCap
 * @param {Array}  roster     - player objects currently on this team
 * @param {number} _currentYear - reserved for future age-cliff logic (unused in V1)
 * @returns {Array<{ player: object, capSavings: number, reason: string, priority: string }>}
 */
export function executeAIOffseasonCuts(teamState, roster, _currentYear) {
  const capRoom =
    typeof teamState?.capRoom === 'number'
      ? teamState.capRoom
      : round2(
          (teamState?.capTotal ?? 255) -
            (teamState?.capUsed ?? 0) -
            (teamState?.deadCap ?? 0),
        );

  const cfg = ROSTER_CUT_CONFIG;

  if (capRoom >= cfg.SAFE_CAP_THRESHOLD_M) return [];

  const isCritical = capRoom < cfg.CRITICAL_INSOLVENCY_M;

  const candidates = (roster ?? [])
    .map((p) => {
      const ev = evaluateCutCandidate(p);

      // Under critical insolvency elite starters become eligible if they generate savings.
      if (isCritical && ev.reason === 'elite_starter_protected' && ev.capSavings > 0) {
        return { player: p, capSavings: ev.capSavings, reason: 'elite_critical_insolvency', priority: 'critical' };
      }

      if (!ev.shouldCut) return null;

      return { player: p, capSavings: ev.capSavings, reason: ev.reason, priority: ev.priority };
    })
    .filter(Boolean)
    .sort((a, b) => b.capSavings - a.capSavings); // highest savings first

  const toRelease = [];
  let simCapRoom = capRoom;

  for (const candidate of candidates) {
    toRelease.push(candidate);
    simCapRoom = round2(simCapRoom + candidate.capSavings);
    if (simCapRoom >= cfg.SAFE_CAP_THRESHOLD_M) break;
  }

  return toRelease;
}
