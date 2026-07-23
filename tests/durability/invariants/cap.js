/**
 * Salary-cap & contract-integrity invariants.
 *
 * The harness does NOT establish any new cap-legality rule. It only asserts
 * numeric SAFETY (finite, non-absurd) on the values the production cap
 * calculator already produces, and structural sanity on contracts. Momentary
 * over-cap states (dead money, pending restructures) are explicitly allowed.
 */
import { pass, fail, skip, gamePhase, isRosterStablePhase, isUnsafeNumber } from './helpers.js';
import { CAP } from './bounds.js';
import { viewTeams, rosteredPlayersFromView } from './derive.js';
import { resolveLiveSalaryCap } from './durableSnapshot.js';

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

  // ── stable-phase legal cap equation ─────────────────────────────────────
  if (!isRosterStablePhase(gamePhase(ctx))) {
    out.push(skip(ctx, 'cap.stable-phase-legal', `Cap legality skipped in transitional phase ${gamePhase(ctx) ?? 'unknown'}`));
  } else {
    const snaps = teams.map((team) => buildTeamCapSnapshot(team, ctx));
    const illegal = snaps.filter((s) => s.totalCommitted > s.liveLimit + 0.0005);
    if (illegal.length) {
      for (const snap of illegal.slice(0, 12)) out.push(fail(ctx, 'cap.stable-phase-legal', { entityType: 'team', entityId: snap.teamId, message: `Team ${snap.teamId} exceeds live cap by ${snap.overage.toFixed(3)}`, details: snap }));
    } else {
      out.push(pass(ctx, 'cap.stable-phase-legal', `All ${teams.length} teams legal against live cap`, { snapshots: snaps.slice(0, 2) }));
    }
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

export function buildTeamCapSnapshot(team, ctx = {}) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const rosterCap = roster.reduce((sum, p) => sum + capHitFor(p), 0);
  const deadCap = num(team?.deadCap ?? team?.deadMoney ?? team?.currentDeadCap);
  const pendingCommitments = pendingCountedCommitments(team, ctx);
  const liveLimit = num(resolveLiveSalaryCap({ view: ctx.view, db: ctx.db })) || num(team?.capTotal);
  const totalCommitted = round(rosterCap + deadCap + pendingCommitments);
  return { teamId: team?.id, rosterCap: round(rosterCap), deadCap: round(deadCap), pendingCommitments: round(pendingCommitments), totalCommitted, liveLimit: round(liveLimit), overage: round(totalCommitted - liveLimit) };
}
function capHitFor(p) { return num(p?.capHit ?? p?.contract?.capHit ?? p?.contract?.salary ?? p?.salary); }
function pendingCountedCommitments(team) { return num(team?.pendingCommitments ?? team?.pendingCapCommitments ?? 0); }
function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
function round(v) { return Math.round(v * 1000) / 1000; }
