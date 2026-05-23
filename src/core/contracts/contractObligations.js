/**
 * contractObligations.js
 *
 * Pure helper layer for salary-cap and contract-obligation calculations.
 * All functions are stateless and side-effect-free — safe to call from
 * UI components, tests, or worker logic without touching IndexedDB.
 *
 * Dead-cap PERSISTENCE is not the responsibility of this module.
 * Persistence already lives on team.deadCap / team.deadMoneyNextYear
 * and is updated by worker.js handleReleasePlayer.
 *
 * Post-June-1 split logic (deferred vs current-year dead cap) is
 * implemented in worker.js and is NOT duplicated here.
 * calculateReleaseDeadCap returns the pre-June-1 total for display/preview.
 */

import {
  normalizeContractDetails,
  calculateContractCapHit,
} from './realisticContracts.js';

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function round2(v) {
  return Math.round(n(v, 0) * 100) / 100;
}

/**
 * Normalize a contract OR a player-with-contract into the canonical
 * ContractDetails shape from realisticContracts.js.
 *
 * Accepts either:
 *   - A player object with a nested `contract` field
 *   - A plain contract object (with baseAnnual / signingBonus / yearsTotal / …)
 *   - A legacy flat player object (with baseAnnual / salary / years at root)
 */
export function normalizeContract(contractOrPlayer = {}) {
  if (contractOrPlayer?.contract && typeof contractOrPlayer.contract === 'object') {
    return normalizeContractDetails(contractOrPlayer.contract, contractOrPlayer);
  }
  return normalizeContractDetails(contractOrPlayer, {});
}

/**
 * Returns the number of years remaining on the player's contract.
 * Falls back safely: yearsRemaining → years → yearsTotal → 1.
 */
export function getContractYearsRemaining(player = {}) {
  return normalizeContract(player).yearsRemaining;
}

/**
 * Returns the annual base salary for the player, excluding bonus proration.
 * Legacy saves that stored total value in `salary` are handled by
 * normalizeContractDetails' deriveAnnualFromLegacy path.
 */
export function getAnnualBaseSalary(player = {}) {
  return normalizeContract(player).baseAnnual;
}

/**
 * Returns the per-year prorated signing bonus.
 *   proratedBonus = signingBonus / yearsTotal
 *
 * Returns 0 if the player has no signing bonus.
 * Missing fields default to 0 / 1 so legacy saves are unaffected.
 */
export function getAnnualBonusProration(player = {}) {
  const c = normalizeContract(player);
  return round2(c.signingBonus / Math.max(1, c.yearsTotal));
}

/**
 * Returns the active cap hit for the player in the current season.
 *   capHit = baseAnnual + proratedBonus + likely incentives
 *
 * Delegates to calculateContractCapHit, which already handles incentives.
 * Legacy flat-salary players (no bonus) produce the same result as before.
 */
export function getActiveCapHit(player = {}) {
  const c = normalizeContract(player);
  return calculateContractCapHit(c);
}

/**
 * Computes the dead cap that would result from releasing this player
 * using simple linear proration (pre-June-1 assumption):
 *
 *   yearlyProration = signingBonus / yearsTotal
 *   deadCapTotal    = yearlyProration × yearsRemaining
 *
 * Returns:
 *   yearlyProration  — prorated bonus per year
 *   deadCapThisYear  — current-year dead cap (pre-June-1 = full remaining)
 *   deadCapDeferred  — always 0 here; post-June-1 split is in worker.js
 *   total            — alias for deadCapThisYear
 *
 * Post-June-1 note: when releasing in free_agency / draft / regular / playoffs
 * phases, worker.js handleReleasePlayer already splits the dead cap correctly
 * using Constants.SALARY_CAP.POST_JUNE1_PHASES.  This helper is for display
 * previews and unit tests — it returns the conservative (worst-case) total.
 */
export function calculateReleaseDeadCap(player = {}) {
  const c = normalizeContract(player);
  const yearlyProration = round2(c.signingBonus / Math.max(1, c.yearsTotal));
  const total = round2(yearlyProration * Math.max(0, c.yearsRemaining));
  return {
    yearlyProration,
    deadCapThisYear: total,
    deadCapDeferred: 0,
    total,
  };
}

/**
 * Aggregates all cap obligations for a team.
 *
 * Inputs:
 *   team           — team object (team.deadCap, team.staffPayroll, team.capTotal)
 *   players        — array of player objects on this team's roster
 *   leagueSettings — optional { salaryCap | currentSalaryCap } override
 *
 * Returns:
 *   playerPayroll  — sum of active cap hits across the roster
 *   deadCap        — current-year dead cap from team record (defaults to 0)
 *   staffPayroll   — coaching/staff payroll from team record (defaults to 0)
 *   totalCapUsed   — playerPayroll + deadCap + staffPayroll
 *   capTotal       — hard cap ceiling
 *   capRoom        — capTotal - totalCapUsed
 *   overCap        — boolean
 */
export function calculateTeamCapObligations(team = {}, players = [], leagueSettings = {}) {
  const capTotal = n(
    team?.capTotal
      ?? leagueSettings?.salaryCap
      ?? leagueSettings?.currentSalaryCap,
    301.2,
  );
  const deadCap = n(team?.deadCap, 0);
  const staffPayroll = n(team?.staffPayroll, 0);

  const playerPayroll = round2(
    players.reduce((sum, p) => sum + getActiveCapHit(p), 0),
  );

  const totalCapUsed = round2(playerPayroll + deadCap + staffPayroll);
  const capRoom = round2(capTotal - totalCapUsed);

  return {
    playerPayroll,
    deadCap,
    staffPayroll,
    totalCapUsed,
    capTotal,
    capRoom,
    overCap: totalCapUsed > capTotal,
  };
}

/**
 * Pure cap-affordability check for a proposed new contract.
 * Does NOT mutate state.
 *
 * Parameters:
 *   team           — team object (capTotal, deadCap, staffPayroll)
 *   players        — current roster array
 *   contract       — proposed contract { baseAnnual, signingBonus, yearsTotal, … }
 *   leagueSettings — optional { salaryCap | currentSalaryCap }
 *
 * Returns { ok, capRoom, projectedCap, capTotal, reason }
 *   ok          — true if the deal fits under the cap
 *   capRoom     — remaining cap after the deal (negative = over cap)
 *   projectedCap — total cap used after adding this contract
 *   reason      — human-readable explanation string
 *
 * Legacy saves without bonus/deadCap fields default to 0 via
 * normalizeContractDetails, so behaviour is identical to the pre-V1 system.
 */
export function canTeamAffordContract(team = {}, players = [], contract = {}, leagueSettings = {}) {
  const obligations = calculateTeamCapObligations(team, players, leagueSettings);
  const newHit = calculateContractCapHit(normalizeContractDetails(contract));
  const projectedCap = round2(obligations.totalCapUsed + newHit);
  const capRoom = round2(obligations.capTotal - projectedCap);
  const ok = projectedCap <= obligations.capTotal;

  const reason = ok
    ? `Contract fits. Projected cap used: $${projectedCap.toFixed(1)}M / $${obligations.capTotal.toFixed(1)}M ($${capRoom.toFixed(1)}M remaining).`
    : `Over cap by $${Math.abs(capRoom).toFixed(1)}M. Projected: $${projectedCap.toFixed(1)}M / $${obligations.capTotal.toFixed(1)}M.`;

  return { ok, capRoom, projectedCap, capTotal: obligations.capTotal, reason };
}
