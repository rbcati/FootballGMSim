/*
 * Math Helpers (shared simulation utilities)
 * ───────────────────────────────────────────
 * Pure math functions shared across simulation domain modules.
 * No RNG, no side effects, safe to import from any module.
 */

import { Utils as U } from '../utils.js';

/**
 * NFL passer rating (0–158.3 scale).
 * Returns null when att <= 0 so callers can distinguish "no attempts" from a
 * real zero rating; avoids rendering null in box score by keeping the sentinel
 * distinct from the number 0.
 *
 * @param {{ comp?:number, att?:number, yds?:number, td?:number, ints?:number }} _
 * @returns {number|null}
 */
export function passerRating({ comp = 0, att = 0, yds = 0, td = 0, ints = 0 } = {}) {
  if (att <= 0) return null;
  const a = U.clamp(((comp / att) - 0.3) * 5, 0, 2.375);
  const b = U.clamp(((yds / att) - 3) * 0.25, 0, 2.375);
  const c = U.clamp((td / att) * 20, 0, 2.375);
  const d = U.clamp(2.375 - ((ints / att) * 25), 0, 2.375);
  return U.round(((a + b + c + d) / 6) * 100, 1);
}
