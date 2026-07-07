/**
 * draftVariance.js — Hidden draft variance & development traits (V1)
 *
 * Makes draft outcomes less linear: a prospect's visible draft-time OVR
 * (scoutedOvr) and his hidden long-term talent anchor (hiddenTrueOvr) diverge
 * by a round-dependent amount, and a hidden development trait (hiddenDevTrait)
 * scales positive progression so gems and busts emerge over seasons.
 *
 * Field naming: the codebase already uses `player.trueOvr` to mean "actual
 * current OVR" (scouting-fog target, revealed in draft-pick news, reset by
 * minicamp) and `player.devTrait` for the Normal/Star/Superstar/X-Factor
 * system consumed by the sim and progression engine. The hidden anchor and
 * trait therefore live in the distinct fields `hiddenTrueOvr` and
 * `hiddenDevTrait` so neither existing system is disturbed or revealed.
 *
 * All helpers are pure. RNG is injected (defaults to the seeded Utils.random
 * stream used by the rest of draft generation) — never Math.random.
 *
 * Hidden data only in this PR: no UI reads these fields.
 */

import { Utils } from '../utils.js';

const TRUE_OVR_MIN = 40;
const TRUE_OVR_MAX = 99;

// Bounds for the combined coach × trait development modifier applied to
// positive growth in progression-logic.js.
export const DEV_FINAL_MOD_MIN = 0.4;
export const DEV_FINAL_MOD_MAX = 2.5;

export const HIDDEN_DEV_TRAITS = ['normal', 'late_bloomer', 'superstar', 'bust'];

// Cumulative distribution for rollDevTrait: 60% / 20% / 10% / 10%.
const DEV_TRAIT_CDF = [
  [0.60, 'normal'],
  [0.80, 'late_bloomer'],
  [0.90, 'superstar'],
  [1.00, 'bust'],
];

/** Integer in [min, max] inclusive from an injected rng() → [0, 1). */
function randIntFrom(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Round-dependent spread between scouted OVR and the hidden talent anchor.
 * Early picks are safer bets; late rounds carry both bigger bust risk and
 * bigger gem upside.
 *
 * @param {number} round - draft round (1–7)
 * @returns {{ min: number, max: number }} inclusive delta range
 */
export function getDraftVarianceRange(round) {
  const r = Number(round);
  if (r === 1) return { min: -5, max: 8 };
  if (r >= 4 && r <= 7) return { min: -10, max: 18 };
  // Rounds 2–3, plus anything unrecognized (defensive default per spec).
  return { min: -8, max: 12 };
}

/**
 * Infer a prospect's draft round from available metadata. Checks explicit
 * round fields first; with no reliable round, treats a clearly late prospect
 * (visible OVR ≤ 60) as round 4–7, otherwise as round 2–3.
 */
export function inferProspectRound(prospect) {
  const candidates = [
    prospect?.round,
    prospect?.draftRound,
    prospect?.projectedRound,
    prospect?.mockRound,
    prospect?.draft?.round,
    prospect?.draftPick?.round,
  ];
  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n >= 1 && n <= 7) return Math.round(n);
  }
  const visible = Number(prospect?.scoutedOvr ?? prospect?.ovr);
  if (Number.isFinite(visible) && visible <= 60) return 5;
  return 3;
}

/**
 * Roll the hidden long-term talent anchor from the visible scouted OVR,
 * clamped to [40, 99].
 *
 * @param {number} scoutedOvr - visible OVR at draft time
 * @param {number} round      - draft round (1–7)
 * @param {function} rng      - () → [0, 1), seeded
 * @returns {number|null} anchor OVR, or null if scoutedOvr isn't numeric
 */
export function rollTrueOvrFromScoutedOvr(scoutedOvr, round, rng = Utils.random) {
  const base = Number(scoutedOvr);
  if (!Number.isFinite(base)) return null;
  const { min, max } = getDraftVarianceRange(round);
  const delta = randIntFrom(rng, min, max);
  return Utils.clamp(Math.round(base + delta), TRUE_OVR_MIN, TRUE_OVR_MAX);
}

/**
 * Roll a hidden development trait: normal 60%, late_bloomer 20%,
 * superstar 10%, bust 10%.
 */
export function rollDevTrait(rng = Utils.random) {
  const r = rng();
  for (const [threshold, trait] of DEV_TRAIT_CDF) {
    if (r < threshold) return trait;
  }
  return 'normal';
}

/**
 * Age-dependent growth multiplier for a player's hidden dev trait.
 * Missing or unknown trait (including all legacy devTrait values) → 1.0.
 * Applied to positive growth only — callers must not use it on regression.
 */
export function getDevTraitMultiplier(player, age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return 1.0;
  switch (player?.hiddenDevTrait) {
    case 'late_bloomer':
      return a <= 24 ? 1.0 : a <= 27 ? 1.3 : 1.1;
    case 'superstar':
      return a <= 27 ? 1.2 : a <= 30 ? 1.5 : 0.9;
    case 'bust':
      return a <= 23 ? 0.9 : 0.7;
    default:
      return 1.0;
  }
}

/**
 * Combine the sanitized coach development modifier with the hidden dev-trait
 * multiplier, clamped to [0.4, 2.5]. Non-finite inputs are treated as 1.0.
 */
export function combineDevModifiers(coachModifier, traitModifier) {
  const coach = Number.isFinite(Number(coachModifier)) ? Number(coachModifier) : 1.0;
  const trait = Number.isFinite(Number(traitModifier)) ? Number(traitModifier) : 1.0;
  return Utils.clamp(coach * trait, DEV_FINAL_MOD_MIN, DEV_FINAL_MOD_MAX);
}

/**
 * Small extra positive growth for a player still below his hidden talent
 * anchor. Returns 0 unless the player has a hiddenTrueOvr, is below it, and
 * already rolled positive growth — being above the anchor never nerfs him.
 *
 * @param {object} player   - player with optional hiddenTrueOvr and ovr
 * @param {number} ovrDelta - growth delta after coach/trait modifiers
 * @returns {number} bonus to add to the delta (0, 1, or 2)
 */
export function getTrueOvrGrowthBonus(player, ovrDelta) {
  if (!(ovrDelta > 0)) return 0;
  const anchor = Number(player?.hiddenTrueOvr);
  const ovr = Number(player?.ovr);
  if (!Number.isFinite(anchor) || !Number.isFinite(ovr)) return 0;
  const gap = anchor - ovr;
  if (gap >= 6) return 2;
  if (gap >= 2) return 1;
  return 0;
}

/**
 * Normalization hook: stamp hidden variance fields onto a prospect, each only
 * if missing. Safe to call on legacy prospects/players — existing fields are
 * never overwritten, and a prospect with no usable OVR just gets no anchor.
 * Mutates and returns the prospect.
 */
export function applyDraftHiddenVariance(prospect, rng = Utils.random) {
  if (!prospect || typeof prospect !== 'object') return prospect;
  if (prospect.scoutedOvr == null) {
    const visible = Number(prospect.ovr);
    if (Number.isFinite(visible)) {
      prospect.scoutedOvr = Utils.clamp(Math.round(visible), TRUE_OVR_MIN, TRUE_OVR_MAX);
    }
  }
  if (prospect.hiddenDevTrait == null) {
    prospect.hiddenDevTrait = rollDevTrait(rng);
  }
  if (prospect.hiddenTrueOvr == null) {
    const anchor = rollTrueOvrFromScoutedOvr(
      prospect.scoutedOvr ?? prospect.ovr,
      inferProspectRound(prospect),
      rng
    );
    if (anchor != null) prospect.hiddenTrueOvr = anchor;
  }
  return prospect;
}
