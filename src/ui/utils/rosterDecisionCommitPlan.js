/**
 * rosterDecisionCommitPlan.js — dry-run validation for Roster Decision Board commits.
 *
 * Converts the board's pending-decision payload ({ [playerId]: decisionKey },
 * stable player-id keys only — see PR #1667) into a validated commit plan that
 * can be reviewed before any real roster mutation is wired up. Pure function:
 * no cache access, no worker calls, no league/player/global writes.
 *
 * Mutation-handler audit (V1, read-only — nothing here calls these):
 *  - extend        → actions.extendContract (useWorker.js → toWorker.EXTEND_CONTRACT)
 *  - cut           → actions.releasePlayer / bulkReleasePlayers (toWorker.RELEASE_PLAYER;
 *                    worker splits dead cap by phase — this plan uses the conservative
 *                    pre-June-1 preview from calculateReleaseDeadCap)
 *  - franchise_tag → actions.applyFranchiseTag (toWorker.APPLY_FRANCHISE_TAG; the worker
 *                    requires the player on the team and league phase 'offseason_resign')
 *  - let_walk      → no roster mutation exists; ContractCenter only records intent via
 *                    actions.updatePlayerManagement({ extensionDecision: 'let_walk' })
 *  - clear_let_walk→ reviewed clear intent for a persisted let-walk; executed via
 *                    actions.updatePlayerManagement({ extensionDecision: null }).
 *                    Not a board pill (never in DECISION_OPTIONS) — it only enters the
 *                    decisions payload when the board toggles off a persisted let-walk.
 */

import { derivePlayerContractFinancials, formatContractMoney } from "./contractFormatting.js";
import { calculateReleaseDeadCap } from "../../core/contracts/contractObligations.js";

export const ROSTER_DECISION_KEYS = Object.freeze([
  "extend",
  "cut",
  "franchise_tag",
  "let_walk",
  "clear_let_walk",
]);

/**
 * Results of the handler audit above. `false` means the decision has no
 * DIRECT roster-mutation handler — not that it has no handler at all.
 * let_walk is false because nothing removes the player from the roster, but
 * it DOES have a management-intent handler: the execution adapter
 * (rosterDecisionCommitExecution.js) records it via
 * actions.updatePlayerManagement({ extensionDecision: 'let_walk' }), which
 * only marks intent and lets the contract expire on its own. The plan
 * surfaces `false` as a warning on the entry.
 */
const DECISION_HAS_ROSTER_MUTATION_HANDLER = Object.freeze({
  extend: true,
  cut: true,
  franchise_tag: true,
  let_walk: false, // intent-only via updatePlayerManagement; no roster mutation
  clear_let_walk: false, // intent-only: wipes a persisted let_walk back to null
});

/** Phase the worker's APPLY_FRANCHISE_TAG handler requires. */
const FRANCHISE_TAG_PHASE = "offseason_resign";

/**
 * Contract years remaining with the board's exact fallback chain
 * (contract.years → yearsLeft → yearsRemaining). Returns null when the value
 * cannot be determined — callers must not guess.
 */
function getYearsRemaining(player) {
  const contract = player?.contract;
  if (contract == null || typeof contract !== "object") return null;
  const years = Number(contract.years ?? contract.yearsLeft ?? contract.yearsRemaining);
  return Number.isFinite(years) ? years : null;
}

function buildValidEntry({ playerId, decision, player, league }) {
  const yearsRemaining = getYearsRemaining(player);
  const { annualSalary } = derivePlayerContractFinancials(player);
  const deadCapTotal = calculateReleaseDeadCap(player).total;
  const deadCap = Number.isFinite(deadCapTotal) ? deadCapTotal : null;
  const warnings = [];
  const blockingErrors = [];

  switch (decision) {
    case "extend":
      if (!DECISION_HAS_ROSTER_MUTATION_HANDLER.extend) {
        warnings.push("No extension action/handler is available yet — this stays a planning note.");
      }
      break;
    case "cut":
      if (deadCap != null && deadCap > 0) {
        warnings.push(`Releasing this player would incur ${formatContractMoney(deadCap)} in dead cap.`);
      }
      break;
    case "franchise_tag": {
      if (yearsRemaining == null) {
        warnings.push("Tag availability could not be determined: contract expiration is unknown.");
      } else if (yearsRemaining > 1) {
        blockingErrors.push(
          `Franchise tag unavailable: contract has ${yearsRemaining} years remaining and is not expiring now.`,
        );
      } else {
        const phase = league?.phase != null ? String(league.phase) : null;
        if (phase == null) {
          warnings.push("Tag window could not be verified: league phase is unknown.");
        } else if (phase !== FRANCHISE_TAG_PHASE) {
          warnings.push(
            `Franchise tags are applied during the re-signing phase; current phase is "${phase}".`,
          );
        }
      }
      break;
    }
    case "let_walk":
      warnings.push(
        "Planning note only — letting a player walk is not an immediate roster change; the contract expires on its own.",
      );
      break;
    case "clear_let_walk":
      warnings.push(
        "Clears the saved let-walk intent — no roster change; the player's extension decision returns to undecided.",
      );
      break;
    default:
      break;
  }

  return {
    playerId,
    decision,
    playerName: player?.name ?? "Unknown Player",
    pos: player?.pos ?? player?.position ?? null,
    contract: {
      yearsRemaining,
      annualSalary: annualSalary ?? null,
      deadCap,
    },
    warnings,
    blockingErrors,
  };
}

/**
 * Build a dry-run commit plan from pending board decisions.
 *
 * @param {object} args
 * @param {object} args.decisions - { [playerId]: decisionKey } payload from the board
 * @param {object[]} args.roster  - sanitized roster array the board rendered from
 * @param {object} args.league    - league snapshot (userTeamId / seasonId / year / phase)
 * @returns {{
 *   source: 'roster_decision_board', version: 1,
 *   teamId: *, season: *,
 *   valid: Array<{playerId, decision, playerName, pos, contract, warnings, blockingErrors}>,
 *   invalid: Array<{playerId, decision, reason}>,
 * }}
 */
export function buildRosterDecisionCommitPlan({ decisions, roster, league } = {}) {
  const plan = {
    source: "roster_decision_board",
    version: 1,
    teamId: league?.userTeamId ?? null,
    season: league?.seasonId ?? league?.year ?? null,
    valid: [],
    invalid: [],
  };

  if (decisions == null || typeof decisions !== "object" || Array.isArray(decisions)) {
    return plan;
  }

  const rosterAvailable = Array.isArray(roster);
  const rosterById = new Map();
  if (rosterAvailable) {
    for (const player of roster) {
      const id = player?.id;
      if (typeof id === "string" || typeof id === "number") {
        rosterById.set(String(id), player);
      }
    }
  }

  for (const [playerId, decision] of Object.entries(decisions)) {
    if (!ROSTER_DECISION_KEYS.includes(decision)) {
      plan.invalid.push({ playerId, decision, reason: `Unsupported decision "${String(decision)}".` });
      continue;
    }
    if (!rosterAvailable) {
      plan.invalid.push({ playerId, decision, reason: "Roster data unavailable — cannot match player." });
      continue;
    }
    const player = rosterById.get(String(playerId));
    if (player == null) {
      plan.invalid.push({ playerId, decision, reason: "No roster player matches this ID." });
      continue;
    }
    plan.valid.push(buildValidEntry({ playerId, decision, player, league }));
  }

  return plan;
}
