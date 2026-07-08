/**
 * rosterDecisionCommitExecution.js — execution adapter for a reviewed Roster
 * Decision Board commit plan (see rosterDecisionCommitPlan.js for the dry-run
 * builder that produces the plan).
 *
 * This module never touches league / player / roster objects and never writes
 * to global state. Every real mutation is delegated to an existing worker
 * action handler (useWorker.js `actions`); if a handler is missing or a
 * decision has no unambiguous handler, the entry lands in `skipped` — nothing
 * here throws for an individual entry.
 *
 * Handler wiring audit (signatures from src/ui/hooks/useWorker.js, call
 * conventions from Roster.jsx / ContractCenter.jsx):
 *  - cut           → actions.releasePlayer(playerId, teamId)
 *                    send-based (toWorker.RELEASE_PLAYER): dispatches and
 *                    returns undefined, so worker-side success can NEVER be
 *                    observed here. Its `applied` entry means "dispatched" —
 *                    the message must use dispatched/submitted language and
 *                    must not claim confirmed success; the worker reports the
 *                    real outcome via its STATE_UPDATE roster refresh.
 *  - franchise_tag → actions.applyFranchiseTag(playerId, teamId)
 *                    request-based (toWorker.APPLY_FRANCHISE_TAG): the promise
 *                    rejects when the worker posts an ERROR (wrong team /
 *                    wrong phase), which lands the entry in `failed`.
 *  - let_walk      → actions.updatePlayerManagement(playerId, teamId,
 *                    { extensionDecision: 'let_walk' }) — the exact
 *                    ContractCenter intent path (toWorker.UPDATE_PLAYER_MANAGEMENT).
 *                    Intent only: the player is not removed from the roster.
 *  - clear_let_walk→ actions.updatePlayerManagement(playerId, teamId,
 *                    { extensionDecision: null }) — reviewed clear intent for a
 *                    PERSISTED let-walk. Same handler, same intent-only
 *                    semantics; the worker wipes the stored decision to null.
 *  - extend        → never executed from the board. The plan only carries a
 *                    decision key, not negotiated contract terms, so extend is
 *                    always skipped toward the Contract Center flow.
 */

export const EXTEND_SKIP_REASON =
  "Extension requires contract terms; use Contract Center negotiation flow.";

/**
 * True when a plan entry is executable by this adapter: no blocking errors
 * from the dry-run validation and a decision other than "extend".
 */
export function isExecutableCommitPlanEntry(entry) {
  if (entry == null || typeof entry !== "object") return false;
  if (!Array.isArray(entry.blockingErrors) || entry.blockingErrors.length > 0) return false;
  return entry.decision != null && entry.decision !== "extend";
}

/** Count of executable entries in a dry-run plan (0 for malformed plans). */
export function countExecutableCommitPlanEntries(plan) {
  const valid = Array.isArray(plan?.valid) ? plan.valid : [];
  return valid.filter(isExecutableCommitPlanEntry).length;
}

/**
 * Apply the executable entries of a reviewed dry-run commit plan through the
 * existing worker action handlers.
 *
 * Only `plan.valid` is processed (invalid entries were already rejected by the
 * dry-run). Entries with blocking errors, extend decisions, or missing /
 * ambiguous handlers are skipped — skipped means NOT applied. A rejected
 * action promise lands the entry in `failed`. The plan object is treated as
 * read-only and is never mutated.
 *
 * @param {object} args
 * @param {object} args.plan    - plan from buildRosterDecisionCommitPlan
 * @param {object} args.actions - useWorker action creators
 * @returns {Promise<{
 *   applied: Array<{playerId, decision, message}>,
 *   skipped: Array<{playerId, decision, reason}>,
 *   failed:  Array<{playerId, decision, reason}>,
 * }>}
 */
export async function executeRosterDecisionCommitPlan({ plan, actions } = {}) {
  const applied = [];
  const skipped = [];
  const failed = [];

  const valid = Array.isArray(plan?.valid) ? plan.valid : [];
  const teamId = plan?.teamId ?? null;

  for (const entry of valid) {
    const playerId = entry?.playerId ?? null;
    const decision = entry?.decision ?? null;
    const blockingErrors = Array.isArray(entry?.blockingErrors) ? entry.blockingErrors : null;

    if (blockingErrors == null || blockingErrors.length > 0) {
      skipped.push({
        playerId,
        decision,
        reason: blockingErrors == null
          ? "Not applied — dry-run validation results are missing for this entry."
          : `Not applied — blocked by dry-run validation: ${blockingErrors.join(" ")}`,
      });
      continue;
    }

    if (decision === "extend") {
      skipped.push({ playerId, decision, reason: EXTEND_SKIP_REASON });
      continue;
    }

    if (playerId == null || teamId == null) {
      skipped.push({
        playerId,
        decision,
        reason: "Not applied — the plan is missing the player or team ID this action requires.",
      });
      continue;
    }

    if (decision === "cut") {
      if (typeof actions?.releasePlayer !== "function") {
        skipped.push({ playerId, decision, reason: "Not applied — no release action handler is available." });
        continue;
      }
      try {
        // send-based: resolves immediately; the worker owns all release /
        // dead-cap behavior and reports back via STATE_UPDATE. Dispatch is
        // all we can confirm here, so the copy must never say "applied".
        await Promise.resolve(actions.releasePlayer(playerId, teamId));
        applied.push({
          playerId,
          decision,
          message: "Release request dispatched — the roster update from the release handler is the final result.",
        });
      } catch (err) {
        failed.push({ playerId, decision, reason: err?.message ?? "Release action failed." });
      }
      continue;
    }

    if (decision === "franchise_tag") {
      if (typeof actions?.applyFranchiseTag !== "function") {
        skipped.push({ playerId, decision, reason: "Not applied — no franchise tag action handler is available." });
        continue;
      }
      try {
        await Promise.resolve(actions.applyFranchiseTag(playerId, teamId));
        applied.push({ playerId, decision, message: "Franchise tag applied via the existing tag handler." });
      } catch (err) {
        failed.push({ playerId, decision, reason: err?.message ?? "Franchise tag action failed." });
      }
      continue;
    }

    if (decision === "let_walk" || decision === "clear_let_walk") {
      if (typeof actions?.updatePlayerManagement !== "function") {
        skipped.push({ playerId, decision, reason: "Not applied — no player management action handler is available." });
        continue;
      }
      try {
        await Promise.resolve(
          actions.updatePlayerManagement(playerId, teamId, {
            extensionDecision: decision === "let_walk" ? "let_walk" : null,
          }),
        );
        applied.push({
          playerId,
          decision,
          message: decision === "let_walk"
            ? "Marked as let walk (intent only — the player stays on the roster until the contract expires)."
            : "Cleared the saved let-walk intent (the player's extension decision is back to undecided).",
        });
      } catch (err) {
        failed.push({ playerId, decision, reason: err?.message ?? "Let-walk intent update failed." });
      }
      continue;
    }

    skipped.push({
      playerId,
      decision,
      reason: `Not applied — no execution mapping exists for decision "${String(decision)}".`,
    });
  }

  return { applied, skipped, failed };
}
