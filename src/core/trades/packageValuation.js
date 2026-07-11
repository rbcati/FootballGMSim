import { getAssetValue, LOW_PREMIUM_POSITIONS } from './assetValuation.js';
import { evaluateMultiAssetPackageValue } from './tradeValuationModifiers.js';
import { TEAM_STRATEGIC_POSTURE, applyStrategicValuationModifiers } from './teamStrategicDirection.js';
import { applyPositionalNeedModifiers } from './tradePositionalNeeds.js';
import { applyContractCapBurdenModifiers } from './tradeFinancialModifiers.js';

/**
 * RawAssetValue: Canonical context-light player or pick value returned by getAssetValue.
 * PackageAdjustedValue: Raw asset values after trade-context modifiers and package diminishing returns.
 * AcquisitionWillingnessValue: AI-specific target reflecting need, aggression, persona, deadline, or trade request.
 * DisplayedEstimateValue: UI-only heuristic used for directional comparison. Never an acceptance value.
 */

export function applyPackagePickContext(rawPickValue, pick = {}, context = {}) {
  const projectedRange = pick?.projectedRange ?? context?.projectedRange ?? 'mid';
  const rangeAdj = projectedRange === 'early' ? 1.22 : projectedRange === 'late' ? 0.88 : 1.0;
  const week = Number(context?.week ?? 1);
  const stageAdj = week >= 10 ? 1.1 : week >= 6 ? 1.05 : 1.0;
  const teamDirection = context?.teamDirection ?? 'balanced';
  const directionAdj = teamDirection === 'rebuilding' ? 1.15 : teamDirection === 'contender' ? 0.92 : 1.0;
  const draftBoardAdj = context?.marketMode === 'draft_board' ? 1.2 : 1.0;
  const compensatoryAdj = pick?.isCompensatory ? 0.84 : 1.0;
  return rawPickValue * rangeAdj * stageAdj * directionAdj * draftBoardAdj * compensatoryAdj;
}

export function calculatePackageAdjustedValue({ players = [], picks = [] } = {}, context = {}, dependencies = {}) {
  const {
    getRawAssetValue = getAssetValue,
    packageValue = evaluateMultiAssetPackageValue,
  } = dependencies;
  const isDraftBoardMode = context?.marketMode === 'draft_board';
  const teamPosture = context?.teamPosture ?? TEAM_STRATEGIC_POSTURE.NEUTRAL;
  const currentSeason = Number(context?.currentSeason ?? 0) || null;
  const rawPickCurrentSeason = Object.prototype.hasOwnProperty.call(context, 'rawPickCurrentSeason')
    ? context.rawPickCurrentSeason
    : null;
  const depthNeedsMap = context?.depthNeedsMap ?? null;
  const effectiveIncomingCapRoom = Number.isFinite(Number(context?.effectiveIncomingCapRoom))
    ? Number(context.effectiveIncomingCapRoom)
    : null;
  const adjustedAssetValues = [];

  for (const player of players) {
    let value = getRawAssetValue(player, null, context);
    if (isDraftBoardMode && player) {
      const age = Number(player?.age ?? 27);
      const yearsRemaining = Number(player?.contract?.yearsRemaining ?? player?.contract?.years ?? 1);
      const veteranPenalty = age >= 30 ? 0.72 : age >= 28 ? 0.84 : 0.95;
      const lowPremiumPenalty = (context?.lowPremiumPositions ?? LOW_PREMIUM_POSITIONS).has?.(player?.pos) ? 0.78 : 1.0;
      const expiringPenalty = yearsRemaining <= 1 ? 0.78 : 1.0;
      value *= veteranPenalty * lowPremiumPenalty * expiringPenalty;
    }
    const playerAsset = { assetType: 'player', ...player };
    let adjusted = applyStrategicValuationModifiers(playerAsset, value, teamPosture, { currentSeason });
    if (depthNeedsMap && player) adjusted = applyPositionalNeedModifiers(playerAsset, adjusted, depthNeedsMap, teamPosture);
    if (effectiveIncomingCapRoom != null && player) adjusted = applyContractCapBurdenModifiers(playerAsset, adjusted, effectiveIncomingCapRoom, teamPosture);
    adjustedAssetValues.push(adjusted);
  }

  for (const pick of picks) {
    const rawPickValue = getRawAssetValue({ assetType: 'pick', ...pick }, null, { ...context, currentSeason: rawPickCurrentSeason });
    const value = applyPackagePickContext(rawPickValue, pick, context);
    const adjusted = applyStrategicValuationModifiers({ assetType: 'pick', ...pick }, value, teamPosture, { currentSeason });
    adjustedAssetValues.push(adjusted);
  }

  const result = packageValue(adjustedAssetValues);
  return Number.isFinite(result) ? Math.max(0, result) : 0;
}
