/**
 * Salary-cap & contract-integrity invariants.
 *
 * The harness does NOT establish any new cap-legality rule. It only asserts
 * numeric SAFETY (finite, non-absurd) on the values the production cap
 * calculator already produces, and structural sanity on contracts. Momentary
 * over-cap states (dead money, pending restructures) are explicitly allowed.
 */
import { pass, fail, skip, isFiniteNumber, isUnsafeNumber } from './helpers.js';
import { CAP } from './bounds.js';
import { viewTeams, rosteredPlayersFromView } from './derive.js';

export const id = 'cap';

const CAP_FIELDS = ['capUsed', 'capRoom', 'capTotal'];

export function check(ctx) {
  const out = [];
  const teams = viewTeams(ctx);
  if (!teams.length) {
    out.push(skip(ctx, 'cap.present', 'No teams in view state at this checkpoint'));
    return out;
  }

  // ── team cap aggregates are finite ───────────────────────────────────────
  const badCap = [];
  for (const team of teams) {
    for (const f of CAP_FIELDS) {
      const v = team[f];
      if (v === undefined) continue;
      if (isUnsafeNumber(v) || (typeof v === 'number' === false && v !== undefined)) {
        badCap.push({ teamId: team.id, field: f, value: String(v) });
      } else if (typeof v === 'number' && Math.abs(v) > CAP.MAX_REASONABLE_USED) {
        badCap.push({ teamId: team.id, field: f, value: v, reason: 'exceeds reasonable envelope' });
      }
    }
  }
  if (badCap.length) {
    for (const b of badCap.slice(0, 12)) {
      out.push(fail(ctx, 'cap.aggregates-finite', {
        entityType: 'team', entityId: b.teamId,
        message: `Team ${b.teamId} ${b.field}=${b.value} is not a safe finite cap value`,
        details: b,
      }));
    }
  } else {
    out.push(pass(ctx, 'cap.aggregates-finite', `All team cap aggregates finite across ${teams.length} teams`));
  }

  // ── contract numeric safety on rostered players ──────────────────────────
  const contractFields = ['salary', 'amount', 'years', 'yearsTotal', 'signingBonus', 'baseAnnual', 'guaranteedPct'];
  const badContracts = [];
  for (const { player, teamId } of rosteredPlayersFromView(ctx)) {
    const c = player?.contract;
    // Check both the contract object and player-level contract mirrors.
    const sources = [c, player];
    for (const src of sources) {
      if (!src || typeof src !== 'object') continue;
      for (const f of contractFields) {
        if (!(f in src)) continue;
        const v = src[f];
        if (v == null) continue;
        if (isUnsafeNumber(v)) {
          badContracts.push({ playerId: player.id, teamId, field: f, value: String(v), kind: 'non-finite' });
        } else if (f === 'years' && typeof v === 'number' && v < 0) {
          badContracts.push({ playerId: player.id, teamId, field: f, value: v, kind: 'negative-years' });
        }
      }
    }
  }
  if (badContracts.length) {
    for (const b of badContracts.slice(0, 12)) {
      out.push(fail(ctx, 'cap.contract-values-safe', {
        entityType: 'contract', entityId: b.playerId,
        message: `Player ${b.playerId} contract.${b.field}=${b.value} (${b.kind})`,
        details: b,
      }));
    }
  } else {
    out.push(pass(ctx, 'cap.contract-values-safe', 'All rostered contract values finite with non-negative years'));
  }

  // ── contract years are never impossibly negative ─────────────────────────
  // (covered above but reported as its own invariant id for traceability)
  const negYears = badContracts.filter((b) => b.kind === 'negative-years');
  if (!negYears.length) {
    out.push(pass(ctx, 'cap.contract-years-non-negative', 'No contract has negative remaining years'));
  }

  return out;
}
