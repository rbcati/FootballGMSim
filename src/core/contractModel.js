import { Constants } from './constants.js';

const round1 = (v) => Math.round(Number(v || 0) * 10) / 10;
const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

const PREMIUM_POSITIONS = new Set(['QB', 'DE', 'EDGE', 'DL', 'OL', 'OT', 'T', 'WR', 'CB']);
const LOW_PREMIUM_POSITIONS = new Set(['RB', 'LB', 'MLB', 'OLB', 'S', 'SS', 'FS', 'K', 'P']);

const POSITION_MULTIPLIER = Object.freeze({
  QB: 1.75,
  DE: 1.22,
  EDGE: 1.22,
  DL: 1.16,
  OT: 1.16,
  T: 1.16,
  OL: 1.12,
  WR: 1.14,
  CB: 1.12,
  TE: 0.92,
  RB: 0.78,
  LB: 0.86,
  MLB: 0.86,
  OLB: 0.9,
  S: 0.84,
  SS: 0.84,
  FS: 0.84,
  K: 0.34,
  P: 0.34,
});

const ARCHETYPE_AGGRESSION = Object.freeze({
  contender: { annual: 1.06, years: 0, risk: 1.16, capBand: 0.7 },
  playoff_hunt: { annual: 1.02, years: 0, risk: 1.0, capBand: 0.62 },
  middle: { annual: 0.98, years: 0, risk: 0.86, capBand: 0.54 },
  retool: { annual: 0.94, years: -1, risk: 0.68, capBand: 0.48 },
  rebuild: { annual: 0.9, years: -1, risk: 0.48, capBand: 0.42 },
  development: { annual: 0.88, years: -1, risk: 0.46, capBand: 0.4 },
});

function classifyMarketTier({ ovr, potential, age, pos }) {
  if (age >= 30 && (pos === 'RB' || ovr < 86)) return 'aging veteran';
  if (ovr >= 88 || (pos === 'QB' && ovr >= 84)) return 'elite starter';
  if (ovr >= 80) return 'quality starter';
  if (ovr >= 73) return 'bridge starter';
  if (age <= 24 && potential >= ovr + 6 && ovr >= 66) return 'prospect upside';
  if (ovr >= 64) return 'rotation / depth';
  return 'replacement level';
}

function baseAnnualByTier(tier, ovr) {
  const over = Math.max(0, ovr - 60);
  if (tier === 'elite starter') return 18 + Math.max(0, ovr - 84) * 2.3;
  if (tier === 'quality starter') return 10.5 + Math.max(0, ovr - 80) * 1.25;
  if (tier === 'bridge starter') return 5.2 + Math.max(0, ovr - 73) * 0.85;
  if (tier === 'prospect upside') return 3.2 + Math.max(0, ovr - 66) * 0.45;
  if (tier === 'aging veteran') return 4.8 + Math.max(0, ovr - 72) * 0.7;
  if (tier === 'rotation / depth') return 1.8 + Math.max(0, over - 4) * 0.22;
  return 0.75 + Math.max(0, ovr - 55) * 0.08;
}

function ageAnnualMultiplier(pos, age, ovr) {
  if (pos === 'QB') {
    if (age >= 36) return 0.82;
    if (age >= 33) return 0.92;
    if (age <= 25 && ovr >= 74) return 1.08;
    return 1;
  }
  if (pos === 'RB') {
    if (age >= 31) return 0.56;
    if (age >= 29) return 0.68;
    if (age >= 27) return 0.84;
    if (age <= 24) return 1.05;
    return 1;
  }
  if (age >= 34) return 0.64;
  if (age >= 32) return 0.78;
  if (age >= 30) return 0.9;
  if (age <= 25 && ovr >= 74) return 1.06;
  return 1;
}

function chooseYears({ tier, pos, age, potential, ovr, archetype }) {
  let years = 1;
  if (tier === 'elite starter') years = pos === 'QB' ? 5 : 4;
  else if (tier === 'quality starter') years = age <= 27 ? 4 : 3;
  else if (tier === 'bridge starter') years = age <= 28 ? 3 : 2;
  else if (tier === 'prospect upside') years = 3;
  else if (tier === 'rotation / depth') years = age <= 25 && potential > ovr + 5 ? 2 : 1;

  if (pos === 'RB' && age >= 27) years = Math.min(years, age >= 30 ? 1 : 2);
  else if (pos !== 'QB' && age >= 31) years = Math.min(years, 2);
  else if (pos === 'QB' && age >= 34) years = Math.min(years, 2);

  const adj = ARCHETYPE_AGGRESSION[archetype]?.years ?? 0;
  years += adj;

  if (['rebuild', 'development', 'retool'].includes(archetype) && age >= 30) years = Math.min(years, 1);
  if (['contender', 'playoff_hunt'].includes(archetype) && age >= 30 && ovr >= 76) years = Math.max(years, 1);

  return Math.round(clamp(years, 1, 6));
}

export function getPremiumPositionInfo(pos) {
  const normalized = String(pos ?? '').toUpperCase();
  return {
    pos: normalized,
    isPremium: PREMIUM_POSITIONS.has(normalized),
    isLowPremium: LOW_PREMIUM_POSITIONS.has(normalized),
    multiplier: POSITION_MULTIPLIER[normalized] ?? 1,
  };
}

export function evaluateContractMarket(player = {}, context = {}) {
  const pos = String(player?.pos ?? 'UNK').toUpperCase();
  const ovr = clamp(num(player?.ovr, 60), 35, 99);
  const potential = clamp(num(player?.potential, ovr), 35, 99);
  const age = clamp(num(player?.age, 27), 18, 45);
  const archetype = context?.teamArchetype ?? context?.strategy?.archetype ?? 'middle';
  const capRoom = num(context?.teamCapRoom ?? context?.capRoom ?? context?.team?.capRoom, 999);
  const capHealth = clamp(num(context?.capHealth ?? context?.strategy?.capHealth, capRoom >= 20 ? 65 : 35), 0, 100);
  const needMultiplier = clamp(num(context?.positionalNeed ?? context?.needMultiplier, 1), 0.5, 2.2);
  const severeNeed = needMultiplier >= 1.7;
  const premium = getPremiumPositionInfo(pos);
  const tier = classifyMarketTier({ ovr, potential, age, pos });
  const arch = ARCHETYPE_AGGRESSION[archetype] ?? ARCHETYPE_AGGRESSION.middle;

  const upsideDelta = Math.max(0, potential - ovr);
  let annual = baseAnnualByTier(tier, ovr);
  annual *= premium.multiplier;
  annual *= ageAnnualMultiplier(pos, age, ovr);
  annual *= 1 + Math.min(0.16, upsideDelta * (age <= 25 ? 0.022 : 0.008));
  annual *= 0.94 + Math.min(0.16, Math.max(0, needMultiplier - 1) * 0.16);
  annual *= arch.annual;

  if (capHealth < 25) annual *= 0.84;
  else if (capHealth < 40) annual *= 0.92;
  else if (capHealth >= 72 && ['contender', 'playoff_hunt'].includes(archetype)) annual *= 1.04;

  if (['rebuild', 'development'].includes(archetype) && age >= 30 && pos !== 'QB') annual *= 0.78;
  if (['contender', 'playoff_hunt'].includes(archetype) && age >= 30 && severeNeed) annual *= 1.04;

  annual = round1(clamp(annual, Constants.SALARY_CAP.MIN_CONTRACT, Constants.SALARY_CAP.MAX_CONTRACT));
  const years = chooseYears({ tier, pos, age, potential, ovr, archetype });
  const signingBonusPct = tier === 'elite starter' ? 0.18 : tier === 'quality starter' ? 0.14 : tier === 'bridge starter' ? 0.1 : 0.06;
  const signingBonus = round1(annual * years * signingBonusPct);
  const annualCapHit = round1(annual + signingBonus / Math.max(1, years));
  const safeCapBand = Math.max(2.5, capRoom * arch.capBand * (capHealth < 30 ? 0.72 : capHealth < 45 ? 0.88 : 1));
  const exceedsSafeCapBand = annualCapHit > safeCapBand;
  const hardCapAffordable = annualCapHit <= capRoom - 0.5;

  const riskTags = [];
  if (age >= 30) riskTags.push(pos === 'RB' ? 'aging RB decline risk' : 'age/decline risk');
  if (annualCapHit >= Math.max(10, capRoom * 0.5)) riskTags.push('large cap share');
  if (years >= 4 && age >= 29) riskTags.push('long veteran commitment');
  if (premium.isLowPremium && annual >= 10) riskTags.push('low-premium spend');
  if (exceedsSafeCapBand) riskTags.push('outside safe cap band');

  const reasons = [
    `${tier} based on ${ovr} OVR${potential > ovr ? ` / ${potential} POT` : ''}.`,
    premium.isPremium ? `${pos} receives premium-position weighting.` : premium.isLowPremium ? `${pos} is treated as a lower-premium market.` : `${pos} uses neutral positional weighting.`,
    age >= 30 ? `Age ${age} keeps term conservative.` : age <= 25 && potential > ovr ? `Age ${age} with upside supports added term/value.` : `Age ${age} supports normal term.`,
    capHealth < 40 ? `Cap health ${capHealth} tightens the offer band.` : `Cap health ${capHealth} leaves normal offer room.`,
  ];
  if (needMultiplier >= 1.2) reasons.push(`Team need multiplier ${needMultiplier.toFixed(2)} improves fit.`);
  if (['rebuild', 'development'].includes(archetype)) reasons.push('Rebuild/development plan values youth and cap flexibility.');
  if (archetype === 'contender') reasons.push('Contender plan can tolerate more short-term spend.');

  const oldExpensiveVeteran = age >= 30 && annualCapHit >= 10 && pos !== 'QB';
  const controlledQbException = pos === 'QB' && severeNeed && annualCapHit <= Math.max(safeCapBand * 1.28, capRoom - 1) && capHealth >= 18;
  const avoid = !hardCapAffordable
    || (exceedsSafeCapBand && !controlledQbException && !(archetype === 'contender' && severeNeed && age < 34 && years <= 2))
    || (['rebuild', 'development'].includes(archetype) && oldExpensiveVeteran)
    || (['retool'].includes(archetype) && oldExpensiveVeteran && years > 1);

  return {
    annualSalary: annual,
    suggestedAnnual: annual,
    suggestedYears: years,
    years,
    signingBonus,
    totalValue: round1(annual * years + signingBonus),
    annualCapHit,
    marketTier: tier,
    confidence: capHealth < 30 || riskTags.length >= 3 ? 'low' : riskTags.length ? 'medium' : 'high',
    premiumPosition: premium.isPremium,
    lowPremiumPosition: premium.isLowPremium,
    riskTags,
    reasons,
    capFit: !hardCapAffordable ? 'over_cap' : exceedsSafeCapBand ? 'risky' : 'safe',
    safeCapBand: round1(safeCapBand),
    exceedsSafeCapBand,
    shouldPursue: !avoid,
    shouldAvoid: avoid,
    controlledException: controlledQbException,
  };
}

export function buildContractFromMarket(market = {}, extras = {}) {
  const years = Math.max(1, Math.round(num(market?.suggestedYears ?? market?.years, 1)));
  return {
    years,
    yearsTotal: years,
    baseAnnual: round1(num(market?.suggestedAnnual ?? market?.annualSalary, Constants.SALARY_CAP.MIN_CONTRACT)),
    signingBonus: round1(num(market?.signingBonus, 0)),
    guaranteedPct: market?.marketTier === 'elite starter' ? 0.55 : market?.marketTier === 'quality starter' ? 0.45 : 0.3,
    ...extras,
  };
}
