import { evaluateContractMarket } from '../../core/contractModel.js';
import { formatMoneyM, toFiniteNumber } from './numberFormatting.js';

const MARKET_TIER_LABELS = Object.freeze({
  'elite starter': 'Elite starter',
  'quality starter': 'Quality starter',
  'bridge starter': 'Bridge starter',
  'rotation / depth': 'Rotation / depth',
  'prospect upside': 'Prospect upside',
  'aging veteran': 'Aging veteran',
  'replacement level': 'Replacement level',
});

const CAP_FIT_LABELS = Object.freeze({
  safe: 'Good cap fit',
  manageable: 'Manageable cap fit',
  tight: 'Tight cap fit',
  risky: 'Risky cap fit',
  over_cap: 'Over cap',
});

const CAP_FIT_TONES = Object.freeze({
  safe: 'ok',
  manageable: 'ok',
  tight: 'warning',
  risky: 'warning',
  over_cap: 'danger',
});

const RISK_TAG_LABELS = Object.freeze({
  'aging RB decline risk': 'Short-term RB risk',
  'age/decline risk': 'Age decline risk',
  'large cap share': 'Cap squeeze',
  'long veteran commitment': 'Long veteran commitment',
  'low-premium spend': 'Low-premium spend',
  'outside safe cap band': 'Outside safe cap band',
});

function cleanLabel(value) {
  return String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function normalizeCapFit(value, annualCapHit, capRoom) {
  const raw = String(value ?? '').toLowerCase();
  if (CAP_FIT_LABELS[raw]) return raw;
  const hit = toFiniteNumber(annualCapHit, null);
  const room = toFiniteNumber(capRoom, null);
  if (hit != null && room != null) {
    if (hit > room) return 'over_cap';
    if (hit >= Math.max(10, room * 0.5)) return 'risky';
    if (hit >= Math.max(6, room * 0.32)) return 'tight';
    return 'safe';
  }
  return 'manageable';
}

function normalizeTerm(years) {
  const y = Math.max(1, Math.round(toFiniteNumber(years, 1)));
  if (y === 1) return '1 yr · short-term';
  if (y <= 2) return `${y} yrs · short-term`;
  if (y <= 3) return `${y} yrs · bridge/upside`;
  return `${y} yrs · long-term`;
}

function normalizeRiskTags(tags) {
  const raw = Array.isArray(tags) ? tags : [];
  return raw
    .filter(Boolean)
    .map((tag) => RISK_TAG_LABELS[tag] ?? cleanLabel(tag))
    .filter(Boolean)
    .slice(0, 4);
}

function getOfferMetadata(player = {}, offer = {}) {
  const offersSummary = player?.offers ?? {};
  return offer?.contractModel
    ?? player?.contractModel
    ?? player?.market?.contractModel
    ?? offersSummary?.topContractModel
    ?? offersSummary?.topOfferContractModel
    ?? offersSummary?.userContractModel
    ?? offersSummary?.userOfferContractModel
    ?? null;
}

function getAnnualValue(player = {}, offer = {}, model = {}) {
  return toFiniteNumber(
    offer?.contract?.baseAnnual
      ?? offer?.baseAnnual
      ?? model?.suggestedAnnual
      ?? model?.annualSalary
      ?? model?.annualCapHit
      ?? player?.demandProfile?.askAnnual
      ?? player?._ask
      ?? player?.contractDemand?.baseAnnual
      ?? player?.contract?.baseAnnual,
    null,
  );
}

function getYears(player = {}, offer = {}, model = {}) {
  return toFiniteNumber(
    offer?.contract?.yearsTotal
      ?? offer?.contract?.years
      ?? offer?.yearsTotal
      ?? offer?.years
      ?? model?.suggestedYears
      ?? model?.years
      ?? player?.demandProfile?.askYears
      ?? player?.contractDemand?.yearsTotal
      ?? player?.contract?.yearsTotal
      ?? player?.contract?.years,
    null,
  );
}

function contextForMarket(player = {}, context = {}) {
  return {
    teamArchetype: context?.teamArchetype ?? context?.teamIntel?.direction ?? context?.teamIntel?.archetype ?? context?.direction ?? 'middle',
    teamCapRoom: context?.teamCapRoom ?? context?.capRoom ?? context?.team?.capRoom,
    capHealth: context?.capHealth ?? context?.teamIntel?.capHealth,
    positionalNeed: context?.positionalNeed ?? context?.needMultiplier,
  };
}

export function buildContractOfferInsight(player = {}, context = {}, offer = {}) {
  const providedModel = getOfferMetadata(player, offer);
  let model = providedModel;
  let source = providedModel ? 'metadata' : 'estimate';
  try {
    if (!model) model = evaluateContractMarket(player, contextForMarket(player, context));
  } catch {
    model = null;
    source = 'missing';
  }

  const annualValue = getAnnualValue(player, offer, model ?? {});
  const years = getYears(player, offer, model ?? {});
  const annualCapHit = toFiniteNumber(model?.annualCapHit ?? annualValue, annualValue);
  const capFit = normalizeCapFit(model?.capFit, annualCapHit, context?.capRoom ?? context?.teamCapRoom ?? context?.team?.capRoom);
  const marketTier = model?.marketTier ?? null;
  const riskTags = normalizeRiskTags(model?.riskTags);
  const reasons = Array.isArray(model?.reasons) ? model.reasons.filter(Boolean).map(String) : [];

  if (model?.premiumPosition && !riskTags.includes('Premium position cost')) riskTags.unshift('Premium position cost');
  if (model?.shouldAvoid && !riskTags.includes('Avoid unless price drops')) riskTags.push('Avoid unless price drops');
  if (model?.shouldPursue && riskTags.length === 0) riskTags.push('Clean market fit');

  const fallback = !model || source === 'missing';
  return {
    marketTierLabel: marketTier ? (MARKET_TIER_LABELS[marketTier] ?? cleanLabel(marketTier)) : 'Market estimate unavailable',
    capFit,
    capFitLabel: CAP_FIT_LABELS[capFit] ?? 'Manageable cap fit',
    capFitTone: CAP_FIT_TONES[capFit] ?? 'neutral',
    riskTags: riskTags.slice(0, 4),
    reasonBullets: reasons.slice(0, 3),
    termLabel: years != null ? normalizeTerm(years) : 'Term unavailable',
    annualValueLabel: annualValue != null ? `${formatMoneyM(annualValue, '—')}/yr` : 'AAV unavailable',
    confidence: model?.confidence ?? (fallback ? 'fallback' : 'medium'),
    source,
    fallback,
    hasMetadata: !!providedModel,
  };
}

export function toneToContractInsightColor(tone) {
  if (tone === 'ok') return 'var(--success)';
  if (tone === 'warning') return 'var(--warning)';
  if (tone === 'danger') return 'var(--danger)';
  return 'var(--text-subtle)';
}
