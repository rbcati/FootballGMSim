/**
 * entityId.js — Type-safe normalization for roster / player / team entity IDs.
 *
 * Background
 * ----------
 * Entity IDs in saved leagues are inconsistent: the live engine generates
 * base-36 string IDs via U.id(), but seeded fixtures, legacy saves, and some
 * worker code paths use plain numbers. UI helpers that call string methods
 * directly on an ID (e.g. `(player.id ?? "x").split("")`) crash with
 * "split is not a function" the moment a numeric or object ID flows through.
 *
 * This module is the single, defensive choke point: it coerces any ID-ish
 * value into a safe, non-empty string before the UI touches it, and never
 * throws on malformed/missing input.
 */

/**
 * Coerce an arbitrary ID-ish value into a safe string.
 *
 * Handles: strings (trimmed), finite numbers, bigints, and objects exposing an
 * `id`/`pid`/`tid` field. Anything else (null, undefined, NaN, empty string,
 * functions, plain objects without an id) falls back to `fallback`.
 *
 * @param {unknown} value
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function toEntityId(value, fallback = "") {
  // Unwrap common nested-id object shapes ({ id }, { pid }, { tid }).
  if (value && typeof value === "object") {
    const nested = value.id ?? value.pid ?? value.tid;
    if (nested != null && nested !== value) {
      return toEntityId(nested, fallback);
    }
    return fallback;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }

  if (typeof value === "bigint") {
    return String(value);
  }

  return fallback;
}

/**
 * Resolve a player's stable ID, checking the common id/pid aliases.
 *
 * @param {{ id?: unknown, pid?: unknown }} player
 * @param {string} [fallback=""]
 * @returns {string}
 */
export function toPlayerId(player, fallback = "") {
  if (!player || typeof player !== "object") return fallback;
  return toEntityId(player.id ?? player.pid, fallback);
}

/**
 * Build a guaranteed-unique, safe React key for a list of entities, even when
 * IDs are missing or duplicated. Falls back to the row index so React never
 * receives an empty/duplicate key.
 *
 * @param {unknown} value   Raw id-ish value.
 * @param {number} index    Position in the list (uniqueness backstop).
 * @param {string} [prefix="row"]
 * @returns {string}
 */
export function toEntityKey(value, index, prefix = "row") {
  const id = toEntityId(value);
  return id !== "" ? id : `${prefix}-${index}`;
}
