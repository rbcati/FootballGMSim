/**
 * Draft-integrity invariants.
 *
 * Phase-aware: pick-ownership/structure checks run at every checkpoint, but
 * "draft completed / class produced" expectations only apply once at least one
 * offseason has run (season >= 2 at rollover). Pick counts are validated against
 * the ACTUAL production league format (DRAFT.ROUNDS x DRAFT.TEAMS + comp slack),
 * never a hardcoded NFL assumption.
 */
import { pass, fail, skip, findDuplicateIds, hasId, isUnsafeNumber } from './helpers.js';
import { DRAFT } from './bounds.js';
import { draftPicks, teamIdSet, playerPool } from './derive.js';

export const id = 'draft';

export function check(ctx) {
  const out = [];
  const { picks, source } = draftPicks(ctx);
  const validTeamIds = teamIdSet(ctx);

  if (source === 'none') {
    out.push(skip(ctx, 'draft.picks-present', 'No draft picks visible at this checkpoint'));
  } else {
    // ── no pick id owned by multiple teams simultaneously ──────────────────
    const byId = new Map(); // pickId -> Set(owner)
    for (const pk of picks) {
      if (!hasId(pk?.id)) continue;
      const k = String(pk.id);
      if (!byId.has(k)) byId.set(k, new Set());
      byId.get(k).add(String(pk.currentOwner));
    }
    const multiOwned = [...byId.entries()].filter(([, owners]) => owners.size > 1);
    if (multiOwned.length) {
      for (const [pid, owners] of multiOwned.slice(0, 12)) {
        out.push(fail(ctx, 'draft.pick-single-owner', {
          entityType: 'pick', entityId: pid,
          message: `Pick ${pid} claimed by multiple owners: ${[...owners].join(', ')}`,
          details: { pickId: pid, owners: [...owners] },
        }));
      }
    } else {
      out.push(pass(ctx, 'draft.pick-single-owner', 'No draft pick is owned by more than one team'));
    }

    // ── every active pick references a valid team & plausible round/season ──
    const badRef = [];
    const badShape = [];
    for (const pk of picks) {
      if (pk?.currentOwner != null && !validTeamIds.has(String(pk.currentOwner))) {
        badRef.push({ pickId: pk.id, currentOwner: pk.currentOwner });
      }
      const round = Number(pk?.round);
      if (pk?.round != null && (isUnsafeNumber(round) || round < 1 || round > DRAFT.ROUNDS + 1)) {
        badShape.push({ pickId: pk.id, round: pk.round, field: 'round' });
      }
      if (pk?.season != null && isUnsafeNumber(Number(pk.season))) {
        badShape.push({ pickId: pk.id, season: pk.season, field: 'season' });
      }
    }
    if (badRef.length) {
      out.push(fail(ctx, 'draft.pick-references-valid-team', {
        entityType: 'pick', entityId: badRef[0].pickId,
        message: `${badRef.length} picks reference an unknown owning team`,
        details: { count: badRef.length, sample: badRef.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'draft.pick-references-valid-team', 'All picks reference a valid owning team'));
    }
    if (badShape.length) {
      out.push(fail(ctx, 'draft.pick-round-season-valid', {
        entityType: 'pick', entityId: badShape[0].pickId,
        message: `${badShape.length} picks have an impossible round/season`,
        details: { count: badShape.length, sample: badShape.slice(0, 5), maxRound: DRAFT.ROUNDS },
      }));
    } else {
      out.push(pass(ctx, 'draft.pick-round-season-valid', `All picks within round 1..${DRAFT.ROUNDS}(+comp) with finite season`));
    }

    // ── pick population bounded (no runaway pick growth) ────────────────────
    // Picks are typically tracked per upcoming draft; a single future-year set
    // should never exceed the format envelope by an order of magnitude.
    const perSeason = new Map();
    for (const pk of picks) {
      const s = String(pk?.season ?? 'unknown');
      perSeason.set(s, (perSeason.get(s) || 0) + 1);
    }
    const bloated = [...perSeason.entries()].filter(([, n]) => n > DRAFT.MAX_PICKS_ENVELOPE);
    if (bloated.length) {
      out.push(fail(ctx, 'draft.pick-population-bounded', {
        entityType: 'pick', entityId: null,
        message: `Draft-year pick population exceeds envelope (${DRAFT.MAX_PICKS_ENVELOPE})`,
        details: { perSeason: Object.fromEntries(perSeason), envelope: DRAFT.MAX_PICKS_ENVELOPE },
      }));
    } else {
      out.push(pass(ctx, 'draft.pick-population-bounded', 'Per-draft pick population within format envelope'));
    }
  }

  // ── draft class size bounded (from GET_DRAFT_CLASSES probe, when present) ─
  const classes = ctx?.probes?.draftClasses?.classes;
  if (Array.isArray(classes) && classes.length) {
    const dups = findDuplicateIds(classes, (c) => c?.seasonId);
    if (dups.length) {
      out.push(fail(ctx, 'draft.no-duplicate-class-seasons', {
        entityType: 'season', entityId: dups[0].id,
        message: `${dups.length} draft-class season ids are duplicated`,
        details: { sample: dups.slice(0, 5) },
      }));
    } else {
      out.push(pass(ctx, 'draft.no-duplicate-class-seasons', `${classes.length} archived draft classes, unique season ids`));
    }
  } else {
    out.push(skip(ctx, 'draft.no-duplicate-class-seasons', 'No draft-class archive probed at this checkpoint'));
  }

  return out;
}
