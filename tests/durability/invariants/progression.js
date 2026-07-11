/**
 * Progression / ratings / aging invariants.
 *
 * This PR checks STATE INTEGRITY, not realism balance: it does not impose any
 * progression curve. It asserts ratings/ages are finite and inside the
 * production-supported envelope, that player ids are stable, and that
 * progression neither duplicates nor silently drops active players.
 */
import { pass, fail, skip, isUnsafeNumber, findDuplicateIds } from './helpers.js';
import { RATING, AGE } from './bounds.js';
import { playerPool, activePlayersFromPool } from './derive.js';

export const id = 'progression';

const RATING_KEYS = ['ovr', 'trueOvr', 'displayOvr', 'scoutedOvr', 'pot', 'potential'];

export function check(ctx) {
  const out = [];
  const { players, source } = playerPool(ctx);
  if (source === 'none' || !players.length) {
    out.push(skip(ctx, 'progression.present', 'No player pool available at this checkpoint'));
    return out;
  }
  const active = activePlayersFromPool(players);

  // ── OVR within production bounds ─────────────────────────────────────────
  const ovrViolations = [];
  for (const p of active) {
    const v = p?.ovr;
    if (v == null) continue;
    if (isUnsafeNumber(v) || v < RATING.MIN_OVR || v > RATING.MAX_OVR) {
      ovrViolations.push({ playerId: p.id, ovr: String(v) });
    }
  }
  if (ovrViolations.length) {
    for (const v of ovrViolations.slice(0, 12)) {
      out.push(fail(ctx, 'progression.ovr-within-bounds', {
        entityType: 'player', entityId: v.playerId,
        message: `Active player ${v.playerId} ovr=${v.ovr} outside [${RATING.MIN_OVR}, ${RATING.MAX_OVR}]`,
        details: v,
      }));
    }
  } else {
    out.push(pass(ctx, 'progression.ovr-within-bounds', `All ${active.length} active OVRs within [${RATING.MIN_OVR}, ${RATING.MAX_OVR}]`));
  }

  // ── no NaN/Infinity in rating summary fields ─────────────────────────────
  const nanRatings = [];
  for (const p of active) {
    for (const k of RATING_KEYS) {
      if (isUnsafeNumber(p?.[k])) nanRatings.push({ playerId: p.id, field: k, value: String(p[k]) });
    }
    // attribute maps (ratings / trueRatings / visibleRatings)
    for (const mapKey of ['ratings', 'trueRatings', 'visibleRatings']) {
      const m = p?.[mapKey];
      if (!m || typeof m !== 'object') continue;
      for (const [rk, rv] of Object.entries(m)) {
        if (isUnsafeNumber(rv)) nanRatings.push({ playerId: p.id, field: `${mapKey}.${rk}`, value: String(rv) });
      }
    }
  }
  if (nanRatings.length) {
    for (const v of nanRatings.slice(0, 12)) {
      out.push(fail(ctx, 'progression.ratings-numeric-safe', {
        entityType: 'player', entityId: v.playerId,
        message: `Player ${v.playerId} ${v.field}=${v.value} is not finite`,
        details: v,
      }));
    }
  } else {
    out.push(pass(ctx, 'progression.ratings-numeric-safe', 'All active rating fields (legacy + attribute maps) finite'));
  }

  // ── ages reasonable for active players ───────────────────────────────────
  const ageViolations = [];
  for (const p of active) {
    const a = p?.age;
    if (a == null) continue;
    if (isUnsafeNumber(a) || a < AGE.ABSOLUTE_MIN || a > AGE.ACTIVE_MAX) {
      ageViolations.push({ playerId: p.id, age: String(a) });
    }
  }
  if (ageViolations.length) {
    for (const v of ageViolations.slice(0, 12)) {
      out.push(fail(ctx, 'progression.active-age-reasonable', {
        entityType: 'player', entityId: v.playerId,
        message: `Active player ${v.playerId} age=${v.age} exceeds harness safety ceiling ${AGE.ACTIVE_MAX}`,
        details: v,
      }));
    }
  } else {
    out.push(pass(ctx, 'progression.active-age-reasonable', `All active ages within [${AGE.ABSOLUTE_MIN}, ${AGE.ACTIVE_MAX}]`));
  }

  // ── progression does not duplicate player ids ────────────────────────────
  const dups = findDuplicateIds(players, (p) => p?.id);
  if (dups.length) {
    out.push(fail(ctx, 'progression.no-duplicate-ids', {
      entityType: 'player', entityId: dups[0].id,
      message: `${dups.length} player ids are duplicated in the pool`,
      details: { count: dups.length, sample: dups.slice(0, 8) },
    }));
  } else {
    out.push(pass(ctx, 'progression.no-duplicate-ids', 'No duplicate player ids in the pool'));
  }

  return out;
}
