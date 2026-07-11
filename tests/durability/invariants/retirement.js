/**
 * Retirement-integrity invariants.
 *
 * Age thresholds here are HARNESS SAFETY BOUNDS (see bounds.js), not
 * gameplay-balancing recommendations. Retired players are permitted to be older
 * than the active ceiling; the checks assert only that retirement transitions
 * are coherent and the retired ledger is structurally valid.
 */
import { pass, fail, skip, findDuplicateIds, hasId } from './helpers.js';
import { AGE } from './bounds.js';
import { playerPool, activePlayersFromPool } from './derive.js';

export const id = 'retirement';

export function check(ctx) {
  const out = [];
  const retired = Array.isArray(ctx?.view?.retiredPlayers)
    ? ctx.view.retiredPlayers
    : Array.isArray(ctx?.db?.meta?.retiredPlayers)
      ? ctx.db.meta.retiredPlayers
      : null;

  const { players, source } = playerPool(ctx);

  // ── retired players are not active free agents / rostered ────────────────
  if (source === 'db' && Array.isArray(retired)) {
    const retiredIds = new Set(retired.map((r) => String(r?.id ?? r?.playerId)).filter(Boolean));
    const active = activePlayersFromPool(players);
    const ghosts = active.filter((p) => retiredIds.has(String(p.id)));
    if (ghosts.length) {
      out.push(fail(ctx, 'retirement.retired-not-active', {
        entityType: 'player', entityId: ghosts[0].id,
        message: `${ghosts.length} retired players still appear active in the pool`,
        details: { count: ghosts.length, sample: ghosts.slice(0, 5).map((p) => p.id) },
      }));
    } else {
      out.push(pass(ctx, 'retirement.retired-not-active', `${retiredIds.size} retired players; none remain active`));
    }
  } else {
    out.push(skip(ctx, 'retirement.retired-not-active', 'Retired ledger or full pool not available at this checkpoint'));
  }

  // ── retired ledger structural sanity ─────────────────────────────────────
  if (Array.isArray(retired)) {
    const missingId = retired.filter((r) => !hasId(r?.id ?? r?.playerId));
    const dups = findDuplicateIds(retired, (r) => r?.id ?? r?.playerId);
    if (missingId.length) {
      out.push(fail(ctx, 'retirement.ledger-valid-ids', {
        entityType: 'player', entityId: null,
        message: `${missingId.length} retired-player records lack a valid id`,
        details: { count: missingId.length },
      }));
    } else if (dups.length) {
      out.push(fail(ctx, 'retirement.ledger-valid-ids', {
        entityType: 'player', entityId: dups[0].id,
        message: `${dups.length} duplicated ids in the retired ledger`,
        details: { sample: dups.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'retirement.ledger-valid-ids', `Retired ledger structurally valid (${retired.length} entries)`));
    }
  } else {
    out.push(skip(ctx, 'retirement.ledger-valid-ids', 'No retired ledger at this checkpoint'));
  }

  // ── active population never exceeds harness age ceiling (dup of progression
  //    but scoped to retirement's "very old active players remain bounded") ──
  if (source === 'db') {
    const tooOld = activePlayersFromPool(players).filter((p) => typeof p?.age === 'number' && p.age > AGE.ABSOLUTE_MAX);
    if (tooOld.length) {
      out.push(fail(ctx, 'retirement.no-impossibly-old-actives', {
        entityType: 'player', entityId: tooOld[0].id,
        message: `${tooOld.length} active players exceed absolute age ${AGE.ABSOLUTE_MAX}`,
        details: { count: tooOld.length, sample: tooOld.slice(0, 5).map((p) => ({ id: p.id, age: p.age })) },
      }));
    } else {
      out.push(pass(ctx, 'retirement.no-impossibly-old-actives', `No active player exceeds absolute age ${AGE.ABSOLUTE_MAX}`));
    }
  } else {
    out.push(skip(ctx, 'retirement.no-impossibly-old-actives', 'Full pool not available at this checkpoint'));
  }

  return out;
}
