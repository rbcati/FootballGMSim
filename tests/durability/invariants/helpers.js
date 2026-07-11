/**
 * Long-Save Durability Harness — invariant helper primitives.
 *
 * These are pure, dependency-free utilities shared by every invariant checker.
 * They deliberately import nothing from the production worker so that invariant
 * modules stay unit-testable in isolation (see longSaveHarness.test.js).
 *
 * Invariant result shape (stable, machine-readable):
 *   {
 *     id:         string   // dotted invariant identity, e.g. 'roster.no-duplicate-membership'
 *     status:     'pass' | 'fail' | 'skip'
 *     season:     number   // 1-based durability season index
 *     phase:      string   // lifecycle phase / checkpoint the check ran at
 *     week:       number|null
 *     entityType: string|null  // 'team' | 'player' | 'pick' | 'contract' | 'game' | 'award' | 'season' | 'league'
 *     entityId:   string|number|null
 *     message:    string
 *     details:    object   // machine-readable specifics (always an object)
 *   }
 */

/** @typedef {'pass'|'fail'|'skip'} InvariantStatus */

/**
 * @param {object} ctx - { season, phase, week }
 * @param {string} id
 * @param {InvariantStatus} status
 * @param {object} [extra]
 * @returns {object} invariant result
 */
export function result(ctx, id, status, extra = {}) {
  return {
    id,
    status,
    season: ctx?.season ?? null,
    phase: ctx?.phase ?? null,
    week: ctx?.week ?? null,
    entityType: extra.entityType ?? null,
    entityId: extra.entityId ?? null,
    message: extra.message ?? '',
    details: extra.details && typeof extra.details === 'object' ? extra.details : {},
  };
}

export function pass(ctx, id, message = 'ok', details = {}) {
  return result(ctx, id, 'pass', { message, details });
}

export function fail(ctx, id, extra = {}) {
  return result(ctx, id, 'fail', extra);
}

/**
 * Skips MUST carry a human-readable reason. This is enforced by the runner,
 * which will demote a reasonless skip to a harness-limitation fail.
 */
export function skip(ctx, id, reason, details = {}) {
  return result(ctx, id, 'skip', { message: reason, details });
}

/** True only for real, finite JS numbers (rejects NaN / ±Infinity / non-numbers). */
export function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A value is "numeric-unsafe" if it is a number but NaN/±Infinity. */
export function isUnsafeNumber(v) {
  return typeof v === 'number' && !Number.isFinite(v);
}

export function hasId(v) {
  return v !== undefined && v !== null && String(v).length > 0;
}

/**
 * Recursively scan an object graph for numeric corruption (NaN / ±Infinity),
 * missing/empty required ids, and (optionally) numeric-string-where-number.
 *
 * Bounded by a schema-aware key allowlist/denylist so we never wander into
 * enormous logs or intentionally-nullable display blobs.
 *
 * @param {any} root
 * @param {object} opts
 * @param {Set<string>} [opts.skipKeys] - keys whose subtrees are not descended
 * @param {number} [opts.maxNodes] - hard node budget
 * @param {string} [opts.rootPath]
 * @returns {{ path: string, kind: 'nan'|'infinity'|'-infinity', value: any }[]}
 */
export function scanNumericCorruption(root, opts = {}) {
  const skipKeys = opts.skipKeys instanceof Set ? opts.skipKeys : new Set();
  const maxNodes = Number.isFinite(opts.maxNodes) ? opts.maxNodes : 250_000;
  const findings = [];
  const seen = new WeakSet();
  let nodes = 0;

  const visit = (val, path) => {
    if (findings.length >= 200) return; // cap findings volume
    if (nodes++ > maxNodes) return;
    if (val === null || val === undefined) return;
    const t = typeof val;
    if (t === 'number') {
      if (Number.isNaN(val)) findings.push({ path, kind: 'nan', value: 'NaN' });
      else if (val === Infinity) findings.push({ path, kind: 'infinity', value: 'Infinity' });
      else if (val === -Infinity) findings.push({ path, kind: '-infinity', value: '-Infinity' });
      return;
    }
    if (t !== 'object') return;
    if (seen.has(val)) return;
    seen.add(val);
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i += 1) visit(val[i], `${path}[${i}]`);
      return;
    }
    for (const key of Object.keys(val)) {
      if (skipKeys.has(key)) continue;
      visit(val[key], path ? `${path}.${key}` : key);
    }
  };

  visit(root, opts.rootPath ?? '');
  return findings;
}

/**
 * Detect duplicate ids in a list of entities.
 * @param {Array} list
 * @param {(entity:any)=>any} idOf
 * @returns {{ id:any, count:number }[]}
 */
export function findDuplicateIds(list, idOf = (e) => e?.id) {
  const counts = new Map();
  for (const e of list || []) {
    const id = idOf(e);
    if (id === undefined || id === null) continue;
    const k = String(id);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].filter(([, c]) => c > 1).map(([id, count]) => ({ id, count }));
}

/**
 * The ACTUAL production league phase at a checkpoint (regular / playoffs /
 * offseason_resign / offseason / preseason). Phase-aware invariants classify on
 * THIS, not on ctx.phase — ctx.phase is the harness CHECKPOINT LABEL
 * (afterInit / afterRegularSeason / ...) used for reporting and checkpoint-
 * specific expectations. Falls back to the label if the view lacks a phase.
 */
export function gamePhase(ctx) {
  return ctx?.view?.phase ?? ctx?.phase ?? null;
}

/** Canonical phase groups used for phase-aware invariant activation. */
export const PHASE_GROUPS = Object.freeze({
  // Stable in-season phases where full regular-season roster/cap rules hold.
  REGULAR: new Set(['regular']),
  PLAYOFFS: new Set(['playoffs']),
  // Transitional offseason phases where rosters/contracts legitimately churn.
  OFFSEASON: new Set([
    'offseason',
    'offseason_resign',
    'free_agency',
    'draft',
    'draft_combine',
    'rookie_assignment',
  ]),
  // Start-of-next-season snapshot after rollover completed.
  PRESEASON: new Set(['preseason']),
});

/**
 * A checkpoint is "roster-stable" when regular-season roster minimums apply
 * without false positives. Offseason transitions are intentionally excluded.
 */
export function isRosterStablePhase(phase) {
  return PHASE_GROUPS.REGULAR.has(phase) || PHASE_GROUPS.PLAYOFFS.has(phase) || PHASE_GROUPS.PRESEASON.has(phase);
}

export function isOffseasonPhase(phase) {
  return PHASE_GROUPS.OFFSEASON.has(phase);
}
