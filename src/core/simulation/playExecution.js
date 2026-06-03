/*
 * Play Execution Domain Module
 * ────────────────────────────
 * Owns individual-play resolution primitives for the live play-by-play loop:
 * starter-weighted player selection, play-type classification from an
 * already-drawn roll, and compact player-name formatting.
 *
 * Selection helpers take the seeded Utils PRNG (`U`) as a parameter so the
 * orchestrator controls the RNG stream; classification is pure (the roll is
 * drawn by the caller). Math/branch boundaries are identical to the monolith.
 */

/**
 * Format a compact display name; guards against double position prefixes and
 * placeholder names (e.g. "H QB1", "Player #3", "Unknown").
 */
export function formatPlayerName(p) {
  if (!p) return null;
  const name = String(p.name || '').trim();
  const pos = String(p.pos || '').trim();
  const isPlaceholder = !name
    || /\bstarter\b/i.test(name)
    || /^[HA]\s+(QB|RB|WR|TE|OL|DL|LB|CB|S|K|P|EDGE|DE|DT|FS|SS|FB|OT|OG|C)\d+$/i.test(name)
    || /^player\s*#?\s*\d+$/i.test(name)
    || /^unknown(\s+player)?$/i.test(name);
  if (isPlaceholder) return pos ? `${pos} #${p.id ?? '?'}` : `#${p.id ?? '?'}`;
  const parts = name.split(/\s+/);
  return parts.length >= 2 ? `${parts[0][0]}. ${parts[parts.length - 1]}` : name;
}

function weightedPick(pool, weights, U) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = U.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

/** Pick a starter-weighted player from a position group. */
export function pickStarterWeighted(groups, pos, U) {
  if (!groups) return null;
  const pool = (groups[pos] || []).filter((p) => !p.injured);
  if (!pool.length) return null;
  const weights = pool.map((p, i) => {
    let w = (p.ovr || 70) + (p.weeklyTrainingBoost || 0);
    if (i === 0) w *= 2.2;
    else if (i === 1) w *= 1.3;
    return Math.max(1, w);
  });
  return weightedPick(pool, weights, U);
}

/** Pick a pass-catcher weighted by awareness/speed/OVR (WR > TE > RB). */
export function pickReceiver(groups, U) {
  if (!groups) return null;
  const wrs = (groups['WR'] || []).slice(0, 4).filter((p) => !p.injured);
  const tes = (groups['TE'] || []).slice(0, 2).filter((p) => !p.injured);
  const rbs = (groups['RB'] || []).slice(0, 2).filter((p) => !p.injured);
  const pool = [...wrs, ...tes, ...rbs];
  if (!pool.length) return null;
  const weights = pool.map((p) => {
    const r = p.ratings || {};
    let w = ((r.awareness || 60) * 0.4) + ((r.speed || 60) * 0.3) + ((p.ovr || 70) * 0.3);
    if (p.pos === 'WR') w *= (wrs.indexOf(p) === 0 ? 1.6 : 1.2);
    return Math.max(1, w);
  });
  return weightedPick(pool, weights, U);
}

/** Pick a pass-rusher (DL/LB) for sacks. */
export function pickRusher(groups, U) {
  if (!groups) return null;
  const dl = (groups['DL'] || []).slice(0, 3).filter((p) => !p.injured);
  const lb = (groups['LB'] || []).slice(0, 3).filter((p) => !p.injured);
  const pool = [...dl, ...lb];
  if (!pool.length) return null;
  const weights = pool.map((p) => Math.max(1, p.ovr || 70));
  return weightedPick(pool, weights, U);
}

/** Pick a DB (CB/S) for interceptions; falls back to a pass-rusher. */
export function pickDefBack(groups, U) {
  if (!groups) return null;
  const cb = (groups['CB'] || []).slice(0, 3).filter((p) => !p.injured);
  const s = (groups['S'] || []).slice(0, 2).filter((p) => !p.injured);
  const pool = [...cb, ...s];
  if (!pool.length) return pickRusher(groups, U);
  const weights = pool.map((p) => Math.max(1, p.ovr || 70));
  return weightedPick(pool, weights, U);
}

/** Pick a tackler (LB/S/DL) for run stops and open-field tackles. */
export function pickTackler(groups, U) {
  if (!groups) return null;
  const lb = (groups['LB'] || []).slice(0, 3).filter((p) => !p.injured);
  const s = (groups['S'] || []).slice(0, 2).filter((p) => !p.injured);
  const dl = (groups['DL'] || []).slice(0, 2).filter((p) => !p.injured);
  const pool = [...lb, ...s, ...dl];
  if (!pool.length) return null;
  const weights = pool.map((p, i) => {
    const r = p.ratings || {};
    let w = ((r.tackle || r.strength || 60) * 0.5) + ((p.ovr || 70) * 0.5);
    if (i === 0) w *= 1.8;
    return Math.max(1, w);
  });
  return weightedPick(pool, weights, U);
}

/** Pick a coverage defender (CB/S) for pass deflections / broken-up passes. */
export function pickCoverage(groups, U) {
  if (!groups) return null;
  const cb = (groups['CB'] || []).slice(0, 3).filter((p) => !p.injured);
  const s = (groups['S'] || []).slice(0, 2).filter((p) => !p.injured);
  const pool = [...cb, ...s];
  if (!pool.length) return null;
  const weights = pool.map((p) => {
    const r = p.ratings || {};
    let w = ((r.awareness || r.speed || 60) * 0.4) + ((p.ovr || 70) * 0.6);
    if (p.pos === 'CB' && cb.indexOf(p) === 0) w *= 1.7;
    return Math.max(1, w);
  });
  return weightedPick(pool, weights, U);
}

/**
 * Classify an offensive play from an already-drawn roll against ordered bands.
 * Returns the `type` of the first band whose `limit` the roll falls under, or
 * `fallbackType` if it clears every band. Pure — no RNG draw here.
 *
 * @param {number} playRoll - U.random() draw in [0,1)
 * @param {Array<{limit:number, type:string}>} bands - ascending by limit
 * @param {string} fallbackType - type when roll clears all bands
 */
export function classifyOffensivePlay(playRoll, bands, fallbackType) {
  for (let i = 0; i < bands.length; i++) {
    if (playRoll < bands[i].limit) return bands[i].type;
  }
  return fallbackType;
}
