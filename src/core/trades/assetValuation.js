/**
 * Unified asset valuation.
 *
 * Historically the codebase carried THREE incompatible value scales:
 *   - AI-to-AI `calculatePlayerValue`  (~120–180 for a 75-OVR player)
 *   - User-facing `_tradeValue`         (ovr^1.55 ≈ ~800 for the same player)
 *   - Draft picks `DEFAULT_PICK_VALUE_MATRIX` (R1 = 950)
 * Any consumer mixing the AI-to-AI player scale with the pick matrix valued a
 * first-round pick at ~5× an elite player.
 *
 * `getAssetValue` is the single source of truth. Players and picks are scored on
 * ONE consistent scale (the ovr^1.55 / 950-pick family), so a player and a pick
 * can be compared directly anywhere in the trade system.
 */

import { Constants } from '../constants.js';
import {
  getPickBaseValueFromMatrix,
  applyFuturePickDecayToPickValue,
} from './tradeValuationModifiers.js';

// Single definition of the positional market/pay weights, shared by every
// trade consumer (previously duplicated inside worker.js).
export const PREMIUM_POSITIONS = new Set(['QB', 'EDGE', 'DE', 'OT', 'WR', 'CB']);
export const LOW_PREMIUM_POSITIONS = new Set(['RB', 'TE', 'S', 'LB']);
export const POSITION_MARKET_WEIGHTS = {
  QB: 1.5, EDGE: 1.24, DE: 1.2, OT: 1.2, WR: 1.15, CB: 1.14,
  DL: 1.0, OL: 0.98, LB: 0.9, S: 0.86, TE: 0.82, RB: 0.74,
};
export const POSITION_PAY_SCALARS = {
  QB: 1.45, EDGE: 1.2, DE: 1.16, OT: 1.18, WR: 1.12, CB: 1.08,
  DL: 0.94, OL: 0.95, LB: 0.86, S: 0.78, TE: 0.76, RB: 0.66,
};

/**
 * Explicit contract penalty weight. On the unified (~800–1400) scale this makes
 * a $30M cap hit cost ~45 points on top of the multiplicative surplus drag —
 * i.e. dumping a bloated veteran contract no longer comes for free. (The legacy
 * 180-scale `* 200` penalty was far too weak.)
 */
export const CONTRACT_PENALTY_WEIGHT = 450;

function isPickAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  if (asset.assetType === 'pick') return true;
  // A pick has a round and no player position.
  return asset.round != null && asset.pos == null && asset.ovr == null;
}

/**
 * Score a single player on the unified scale. Mirrors the tuned user-trade model
 * so existing AI acceptance thresholds keep working, plus an explicit contract
 * penalty so expensive contracts are properly discounted everywhere.
 */
export function getPlayerAssetValue(player, context = {}) {
  if (!player) return 0;
  const ovr = Number(player.ovr ?? 70);
  const pot = Number(player.potential ?? ovr);
  const age = Number(player.age ?? 27);
  const yearsRemaining = Number(player?.contract?.yearsRemaining ?? player?.contract?.years ?? 1);
  const baseAnnual = Number(player?.contract?.baseAnnual ?? 0);
  const signingBonus = Number(player?.contract?.signingBonus ?? 0);
  const yearsTotal = Math.max(1, Number(player?.contract?.yearsTotal ?? yearsRemaining ?? 1));
  const schemeFit = Number(player?.schemeFit ?? 65);
  const morale = Number(player?.morale ?? 70);
  const posMult = POSITION_MARKET_WEIGHTS[player.pos] ?? 0.9;
  const payScalar = POSITION_PAY_SCALARS[player.pos] ?? 0.92;
  const direction = context?.teamDirection ?? 'balanced';
  const needPositions = context?.needPositions ?? [];
  const scarcityBonus = needPositions.includes(player?.pos) ? 1.06 : 1.0;
  const ageFactor = age <= 24
    ? 1.09
    : age <= 27
      ? 1.02
      : age <= 29
        ? 0.95
        : age <= 31
          ? 0.78
          : age <= 33
            ? 0.62
            : 0.48;
  const potentialFactor = 0.9 + Math.max(0, Math.min(0.22, (pot - ovr) / 70));
  const expectedAav = Math.max(1.5, ((ovr - 58) * 0.72) * payScalar);
  const contractLoad = baseAnnual / expectedAav;
  const surplusFactor = contractLoad <= 0.9 ? 1.15 : contractLoad <= 1.15 ? 1.0 : contractLoad <= 1.4 ? 0.82 : 0.62;
  const controlFactor = yearsRemaining >= 3 ? 1.12 : yearsRemaining === 2 ? 1.02 : yearsRemaining === 1 ? 0.8 : 0.72;
  const veteranContractDrag = (age >= 30 && contractLoad >= 1.2) ? 0.78 : 1.0;
  const fitFactor = 0.9 + Math.max(0, Math.min(0.18, schemeFit / 500));
  const moraleFactor = morale < 52 ? 0.92 : morale >= 80 ? 1.02 : 1.0;
  const directionFactor = direction === 'contender'
    ? (age <= 30 ? 1.04 : 0.86)
    : direction === 'rebuilding'
      ? (age <= 27 ? 1.1 : 0.8)
      : 1.0;
  const draftModePenalty = context?.marketMode === 'draft_board' && !PREMIUM_POSITIONS.has(player?.pos) ? 0.88 : 1.0;
  const baseTalent = Math.pow(Math.max(45, ovr), 1.55);
  const value = baseTalent * posMult * ageFactor * potentialFactor * surplusFactor * controlFactor
    * veteranContractDrag * fitFactor * moraleFactor * directionFactor * scarcityBonus * draftModePenalty;

  // Explicit contract penalty (true cap hit = base + prorated bonus).
  const hardCap = Constants?.SALARY_CAP?.HARD_CAP ?? 301.2;
  const capHit = baseAnnual + (signingBonus / yearsTotal);
  const contractPenalty = (capHit / hardCap) * CONTRACT_PENALTY_WEIGHT;

  return Math.max(0, value - contractPenalty);
}

/** Score a draft pick on the unified scale (matrix base × future-pick decay). */
export function getPickAssetValue(pick, currentSeason = null) {
  const base = getPickBaseValueFromMatrix(pick?.round);
  return applyFuturePickDecayToPickValue(pick, base, currentSeason);
}

/**
 * Single asset valuation entry point. Handles both players and draft picks on
 * one consistent scale.
 *
 * @param {object} asset   – a player or a draft pick
 * @param {object} league  – league context (used for currentSeason on picks)
 * @param {object} context – optional player valuation context (teamDirection, needPositions, …)
 * @returns {number}
 */
export function getAssetValue(asset, league = null, context = {}) {
  if (!asset) return 0;
  if (isPickAsset(asset)) {
    const currentSeason = context?.currentSeason
      ?? league?.seasonId
      ?? league?.year
      ?? null;
    return getPickAssetValue(asset, currentSeason);
  }
  return getPlayerAssetValue(asset, context);
}
