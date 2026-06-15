/**
 * moraleSimModifier.js — V1 Morale → Sim OVR Modifier
 *
 * Provides a bounded, deterministic OVR modifier derived from player.morale.
 * Applied to effective OVR at the player-attribute-lookup point inside the sim.
 * Never mutates player.ovr. No new randomness introduced.
 *
 * Exported for soak audit: getMoraleOvrModifier, applyMoraleToEffectiveOvr,
 * MORALE_MODIFIER_TABLE are all importable by engineSoak.js if needed.
 */

// Modifier bands, evaluated highest-first (iterate until morale >= band.min).
export const MORALE_MODIFIER_TABLE = Object.freeze([
  { min: 85, modifier:  2, label: 'Thriving' },
  { min: 70, modifier:  0, label: 'Settled' },
  { min: 55, modifier:  0, label: 'Neutral' },
  { min: 40, modifier: -2, label: 'Frustrated' },
  { min:  0, modifier: -4, label: 'Disgruntled' },
]);

const OVR_CLAMP_MIN = 1;
const OVR_CLAMP_MAX = 99;

/**
 * Return the OVR modifier for a player based on their morale.
 * Returns 0 when player.morale is absent (old-save safe).
 *
 * @param {{ morale?: number } | null | undefined} player
 * @returns {number} modifier in range [-4, +2]
 */
export function getMoraleOvrModifier(player) {
  const raw = player?.morale;
  if (raw == null) return 0;
  const morale = Number(raw);
  if (!Number.isFinite(morale)) return 0;
  for (const band of MORALE_MODIFIER_TABLE) {
    if (morale >= band.min) return band.modifier;
  }
  return 0;
}

/**
 * Apply the morale modifier to a base OVR value and clamp to valid range.
 * Does NOT mutate the player object.
 *
 * @param {number} baseOvr  - stored/base OVR (e.g. player.ovr ?? 70)
 * @param {{ morale?: number } | null | undefined} player
 * @returns {number} effective OVR clamped to [1, 99]
 */
export function applyMoraleToEffectiveOvr(baseOvr, player) {
  const modifier = getMoraleOvrModifier(player);
  return Math.min(OVR_CLAMP_MAX, Math.max(OVR_CLAMP_MIN, baseOvr + modifier));
}
