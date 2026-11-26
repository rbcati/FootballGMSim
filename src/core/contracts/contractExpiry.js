/**
 * contractExpiry.js — the re-signing → free-agency contract lifecycle step.
 *
 * Before this module existed nothing in the game ever decremented a contract
 * or released an expired one: every "1yr EXP" player stayed on his roster
 * forever, Let Walk decisions were recorded but never executed, and the free
 * agent pool stayed nearly empty, so AI teams that lost players to retirement
 * could not refill to the 53-man minimum at the season rollover.
 *
 * Contract `years` counts seasons remaining INCLUDING the season that just
 * finished (the re-signing UI treats `years <= 1` as "expiring"). When the
 * league leaves the re-signing window:
 *
 *   - An expiring contract (years <= 1) that was re-committed during the
 *     window (extension, franchise tag, RFA tender) is kept as-is: its terms
 *     describe the upcoming season(s).
 *   - Any other expiring contract has run out. The player leaves the roster
 *     and enters the free-agent pool. This covers Let Walk, Decide Later
 *     (deferred) and still-Pending decisions alike — the documented gate is
 *     that unresolved players carry into free agency as free agents.
 *   - Every other rostered contract that was NOT re-committed in the window
 *     ticks down one season.
 *
 * The function is pure: it returns a plan and never mutates its inputs.
 */

/** Decisions that mean "this contract was (re)written during the window". */
export const RECOMMITTED_DECISIONS = new Set(['extended', 'tagged', 'franchise_tagged', 'rfa_tendered']);

function contractYears(player) {
  const c = player?.contract;
  const raw = c?.years ?? c?.yearsRemaining ?? player?.years;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function isRostered(player) {
  if (!player || player.teamId == null || player.teamId === 'FA') return false;
  const status = String(player.status ?? 'active').toLowerCase();
  return !['free_agent', 'retired', 'draft_eligible', 'draft_pool', 'deleted', 'removed'].includes(status)
    && player.retired !== true;
}

export function wasRecommitted(player) {
  return RECOMMITTED_DECISIONS.has(String(player?.extensionDecision ?? ''));
}

/**
 * Classify why an expiring player is leaving, for transaction logs and UI.
 * @returns {'let_walk'|'deferred'|'unresolved'}
 */
export function expiryReason(player) {
  const decision = String(player?.extensionDecision ?? 'pending');
  if (decision === 'let_walk') return 'let_walk';
  if (decision === 'deferred') return 'deferred';
  return 'unresolved';
}

/**
 * Build the expiry plan for every player.
 *
 * @param {object[]} players
 * @returns {{
 *   releases: { playerId: any, teamId: any, reason: string, name: string, pos: string }[],
 *   decrements: { playerId: any, contract: object }[],
 *   retained: any[],
 * }}
 */
export function planContractExpiry(players = []) {
  const releases = [];
  const decrements = [];
  const retained = [];
  for (const player of Array.isArray(players) ? players : []) {
    if (!isRostered(player)) continue;
    const years = contractYears(player);
    if (years == null || !player.contract) continue;
    if (wasRecommitted(player)) {
      retained.push(player.id);
      continue;
    }
    if (years <= 1) {
      releases.push({
        playerId: player.id,
        teamId: player.teamId,
        reason: expiryReason(player),
        name: player.name ?? '',
        pos: player.pos ?? '',
      });
      continue;
    }
    const nextYears = years - 1;
    const contract = { ...player.contract, years: nextYears };
    if (player.contract.yearsRemaining != null) contract.yearsRemaining = nextYears;
    decrements.push({ playerId: player.id, contract });
  }
  return { releases, decrements, retained };
}

/**
 * Players on one team whose expiring contracts would run out if the window
 * closed now, split into key and non-key decisions. Used by the Advance gate so
 * the UI can name every player the transition will release.
 */
export function summarizeUnresolvedExpiring(roster = [], { isKey = () => false } = {}) {
  const unresolved = (Array.isArray(roster) ? roster : []).filter((p) => {
    const years = contractYears(p);
    if (years == null || years > 1) return false;
    const decision = String(p?.extensionDecision ?? 'pending');
    return !RECOMMITTED_DECISIONS.has(decision) && decision !== 'let_walk';
  });
  return {
    key: unresolved.filter((p) => isKey(p)),
    other: unresolved.filter((p) => !isKey(p)),
    all: unresolved,
  };
}
