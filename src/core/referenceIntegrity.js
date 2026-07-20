/**
 * Reference-integrity ID semantics.
 *
 * One canonical, deterministic contract for comparing and ordering the mixed
 * numeric/string entity IDs used across the franchise lifecycle:
 *   - team IDs are small non-negative integers (0..31 — team 0 is a real team);
 *   - player IDs are numeric for veterans and opaque strings for generated
 *     rookies (e.g. "hbot8q4lum1u");
 *   - draft-pick IDs are composite strings (e.g. "safe-pick-0-2026-1").
 *
 * The two defects this module exists to prevent:
 *   1. A team ID of 0 must NEVER be treated as "missing". `0` and `"0"` are
 *      valid references and map to the same canonical key.
 *   2. Sorting mixed numeric/string IDs with `Number(a) - Number(b)` returns
 *      NaN for any non-numeric ID, producing an implementation-defined order
 *      that diverges across a save/DB round-trip. `stableIdCompare` is a total
 *      order that never returns NaN and is reflexive, so identical membership
 *      always yields an identical fingerprint.
 *
 * This helper does NOT change entity identity; it only normalizes at
 * comparison / fingerprint / reference-resolution boundaries.
 */

/**
 * Canonical string key for an id, or null when the id is not a valid reference.
 * `0` and `"0"` are valid and map to `"0"`; null/undefined/empty/NaN/objects/
 * booleans are null (invalid).
 * @param {*} id
 * @returns {string|null}
 */
export function canonicalIdKey(id) {
  if (id === 0) return '0';
  if (id == null) return null;
  if (typeof id === 'number') return Number.isFinite(id) ? String(id) : null;
  if (typeof id === 'string') {
    const s = id.trim();
    return s === '' ? null : s;
  }
  return null;
}

/**
 * Numeric value of an id when it is a pure canonical integer reference, else
 * null. Strings like "007" are NOT treated as numeric (avoids merging "007"
 * with 7), so only "0" and "[1-9][0-9]*" qualify.
 * @param {*} id
 * @returns {number|null}
 */
function numericIdValue(id) {
  if (typeof id === 'number') return Number.isFinite(id) ? id : null;
  if (typeof id === 'string') {
    const s = id.trim();
    if (/^(0|[1-9][0-9]*)$/.test(s)) return Number(s);
    return null;
  }
  return null;
}

/**
 * True when a and b denote the same entity under the persistence contract
 * (numeric 5 and string "5" are the same entity; 0 and "0" are the same).
 * Invalid references are never "the same" as anything.
 */
export function sameEntityId(a, b) {
  const ka = canonicalIdKey(a);
  const kb = canonicalIdKey(b);
  return ka !== null && ka === kb;
}

/** True when an id is a valid (present) reference — 0 counts, null does not. */
export function isValidIdRef(id) {
  return canonicalIdKey(id) !== null;
}

/**
 * Deterministic total order over mixed numeric/string ids. Never returns NaN.
 *
 * Order:
 *   1. valid numeric ids ascending by numeric value,
 *   2. then non-numeric (opaque string) ids lexicographically by canonical key,
 *   3. then invalid ids (null/undefined/…) last.
 *
 * Reflexive and antisymmetric, so a stable sort is unnecessary for determinism:
 * identical membership always produces an identical ordering.
 */
export function stableIdCompare(a, b) {
  const ka = canonicalIdKey(a);
  const kb = canonicalIdKey(b);
  if (ka === null && kb === null) return 0;
  if (ka === null) return 1; // invalid ids sort last
  if (kb === null) return -1;
  const na = numericIdValue(a);
  const nb = numericIdValue(b);
  const aNum = na !== null;
  const bNum = nb !== null;
  if (aNum && bNum) {
    if (na !== nb) return na < nb ? -1 : 1;
    return 0;
  }
  if (aNum !== bNum) return aNum ? -1 : 1; // numeric ids before opaque strings
  return ka < kb ? -1 : ka > kb ? 1 : 0; // both opaque: lexicographic
}

/** Return a new array of ids sorted with the canonical total order. */
export function sortIdsStable(ids) {
  return [...(ids || [])].sort(stableIdCompare);
}

/**
 * Resolve a team reference — a scalar id, or an object carrying an id under one
 * of the established field names — to a canonical id key, or null when it
 * cannot be resolved. Used to normalize champion/team references at read
 * boundaries so a snapshot object is never mistaken for an id.
 *
 * Field precedence favors explicit *TeamId fields over a generic `id`.
 */
export function resolveTeamRefId(ref) {
  if (ref == null) return null;
  if (typeof ref === 'number' || typeof ref === 'string') return canonicalIdKey(ref);
  if (typeof ref === 'object') {
    const candidates = [
      ref.championTeamId,
      ref.champTeamId,
      ref.teamId,
      ref.tid,
      ref.id,
    ];
    for (const c of candidates) {
      const key = canonicalIdKey(c);
      if (key !== null) return key;
    }
  }
  return null;
}
