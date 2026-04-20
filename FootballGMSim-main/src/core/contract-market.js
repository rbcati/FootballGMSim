import { buildPlayerMotivationProfile } from './mood/playerMood.js';

const SCARCITY_BASELINE = {
  QB: 8,
  WR: 18,
  RB: 14,
  TE: 10,
  OL: 24,
  DL: 24,
  LB: 20,
  CB: 18,
  S: 14,
  K: 8,
  P: 8,
};

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function seeded(playerId, salt = 0) {
  const raw = String(playerId ?? '0');
  let h = 2166136261 ^ salt;
  for (let i = 0; i < raw.length; i += 1) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 1000) / 1000;
}

export function inferTeamDirection(team, week = 1) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  const games = wins + losses + ties;
  const pct = games > 0 ? (wins + ties * 0.5) / games : 0.5;

  if (week <= 4) {
    if (pct >= 0.68) return 'contender';
    if (pct <= 0.32) return 'rebuilding';
    return 'middling';
  }
  if (pct >= 0.6) return 'contender';
  if (pct <= 0.38) return 'rebuilding';
  return 'middling';
}

export function buildContractProfile(player = {}, teamContext = {}) {
  const base = buildPlayerMotivationProfile(player, teamContext);
  let headline = 'Balanced priorities';
  if (base.moneyPriority >= Math.max(base.contenderPriority, base.rolePriority, base.loyalty)) headline = 'Money-focused';
  else if (base.contenderPriority >= Math.max(base.rolePriority, base.loyalty)) headline = 'Seeking contender';
  else if (base.rolePriority >= base.loyalty) headline = 'Wants a bigger role';
  else headline = 'Open to hometown discount';

  return {
    ...base,
    loyaltyPriority: base.loyalty,
    schemePriority: base.schemeFitPreference,
    negotiationFlex: Math.max(0.05, Math.min(0.9, 0.28 + base.patience * 0.5 + base.loyalty * 0.22 - base.moneyPriority * 0.2)),
    headline,
  };
}

export function computeMarketHeat(position, freeAgents = []) {
  const pool = freeAgents.filter((p) => p?.pos === position);
  const baseline = SCARCITY_BASELINE[position] ?? 12;
  const quality = pool.filter((p) => safeNum(p?.ovr) >= 75).length;
  const pressure = Math.max(0, 1 - pool.length / baseline);
  const qualityBoost = Math.max(0, 1 - quality / Math.max(2, Math.round(baseline / 6)));
  return Math.max(0.1, Math.min(2, 0.8 + pressure * 0.8 + qualityBoost * 0.5));
}

function ageYearsRequest(age, securityPriority) {
  if (age <= 24) return securityPriority > 0.5 ? 5 : 4;
  if (age <= 28) return securityPriority > 0.6 ? 4 : 3;
  if (age <= 31) return securityPriority > 0.7 ? 3 : 2;
  return 1;
}

export function buildDemandFromProfile(player, profile, { marketHeat = 1, morale = 70, fit = 65, teamSuccess = 0.5 } = {}) {
  const baseAnnual = safeNum(player?.contract?.baseAnnual, 4);
  const talentAnchor = Math.max(baseAnnual, Math.max(0.8, (safeNum(player.ovr, 65) - 58) * 0.65));
  const leverage = 1
    + (profile.moneyPriority - 0.5) * 0.18
    + (marketHeat - 1) * 0.2
    + (safeNum(player.ovr, 70) >= 82 ? 0.08 : 0)
    - (morale >= 80 ? profile.loyaltyPriority * 0.09 : 0)
    - (fit >= 80 ? 0.04 : 0)
    - (teamSuccess >= 0.6 ? profile.loyaltyPriority * 0.04 : 0);

  const requestedBaseAnnual = Math.max(0.8, Math.round(talentAnchor * leverage * 10) / 10);
  const years = ageYearsRequest(safeNum(player.age, 26), profile.securityPriority);
  const signingBonus = Math.round(requestedBaseAnnual * years * (0.08 + profile.securityPriority * 0.16) * 10) / 10;
  const willingness = Math.max(0.05, Math.min(0.95, profile.negotiationFlex + (morale - 65) / 250));

  return {
    years,
    yearsTotal: years,
    baseAnnual: requestedBaseAnnual,
    signingBonus,
    guaranteedPct: Math.max(0.35, Math.min(0.95, 0.45 + profile.securityPriority * 0.35)),
    willingness,
  };
}

function contractValue(contract = {}) {
  return safeNum(contract.baseAnnual) * Math.max(1, safeNum(contract.yearsTotal, contract.years, 1)) + safeNum(contract.signingBonus);
}

export function evaluateReSignPriority(player, context = {}) {
  const teamDirection = context.teamDirection ?? 'middling';
  const capRoom = safeNum(context.capRoom, 0);
  const profile = context.profile ?? buildContractProfile(player);
  const demand = context.demand ?? buildDemandFromProfile(player, profile, {
    marketHeat: context.marketHeat ?? 1,
    morale: safeNum(player.morale, 70),
    fit: safeNum(player.schemeFit, 65),
    teamSuccess: context.teamSuccess ?? 0.5,
  });
  const ovr = safeNum(player.ovr, 65);
  const pot = safeNum(player.potential, ovr);
  const age = safeNum(player.age, 26);
  const morale = safeNum(player.morale, 70);
  const fit = safeNum(player.schemeFit, 65);
  const ask = contractValue(demand);
  const scarcity = safeNum(context.marketHeat, 1);
  const currentHit = safeNum(player?.contract?.baseAnnual, 0);
  const valueScore = ovr * 1.15 + (pot - ovr) * 0.55 + (fit - 60) * 0.2 + (morale - 65) * 0.12;
  const agePenalty = age >= 32 ? (age - 31) * 5 : 0;
  const pricePenalty = Math.max(0, demand.baseAnnual - Math.max(2, currentHit * 1.25)) * 3.4;
  const directionAdj = teamDirection === 'contender' ? (ovr >= 78 ? 8 : -2) : teamDirection === 'rebuilding' ? (age <= 27 ? 8 : -6) : 0;

  const score = valueScore + scarcity * 10 + directionAdj - agePenalty - pricePenalty;

  let recommendationTier = 'replaceable_depth';
  let shortReason = 'Replaceable depth if the market stays soft';
  if (score >= 96) {
    recommendationTier = 'priority_resign';
    shortReason = scarcity > 1.2
      ? 'Priority Re-sign: productive starter at a thin position'
      : 'Priority Re-sign: foundational contributor worth keeping';
  } else if (score >= 78) {
    recommendationTier = 'resign_if_price';
    shortReason = 'Re-sign if price holds: useful player, but not at premium money';
  } else if (score <= 42) {
    recommendationTier = 'let_walk';
    shortReason = 'Let walk: age and contract demands outpace value';
  }

  if (ovr >= 84 && demand.baseAnnual >= Math.max(18, capRoom * 0.55) && teamDirection !== 'contender') {
    recommendationTier = 'trade_or_tag';
    shortReason = 'Trade/Tag candidate: valuable but difficult extension path';
  }

  const urgencyLevel = recommendationTier === 'priority_resign' ? 'high' : recommendationTier === 'resign_if_price' ? 'medium' : 'low';
  const negotiationRisk = morale < 58 || profile.moneyPriority > 0.7 ? 'high' : profile.negotiationFlex > 0.55 ? 'low' : 'medium';
  const likelyReplacementDifficulty = scarcity >= 1.35 || ovr >= 80 ? 'high' : scarcity >= 1.1 ? 'medium' : 'low';

  return {
    recommendationTier,
    shortReason,
    urgencyLevel,
    negotiationRisk,
    likelyReplacementDifficulty,
    profileHeadline: profile.headline,
    score: Math.round(score),
  };
}

export function scoreOffer(player, offer, teamContext = {}, market = {}) {
  const profile = market.profile ?? buildContractProfile(player);
  const team = teamContext.team;
  const teamQuality = safeNum(team?.wins, 8) / 17;
  const roleOpportunity = safeNum(teamContext.roleOpportunity, 0.5);
  const fit = safeNum(teamContext.fit, 60) / 100;
  const direction = teamContext.direction ?? 'middling';
  const moneyScore = Math.min(1.2, contractValue(offer.contract) / Math.max(1, market.askTotalValue || contractValue(offer.contract)));
  const contenderScore = direction === 'contender' ? 1 : direction === 'middling' ? 0.65 : 0.35;

  const total =
    moneyScore * (0.45 + profile.moneyPriority * 0.35) +
    contenderScore * profile.contenderPriority +
    roleOpportunity * profile.rolePriority +
    fit * profile.schemePriority +
    teamQuality * 0.18 +
    (teamContext.loyaltyBoost ?? 0) * profile.loyaltyPriority;

  return total;
}

export function buildDecisionTiming(
  player,
  marketHeat,
  offerCount,
  phase = 'free_agency',
  context = {},
) {
  const age = safeNum(player?.age, 26);
  const ovr = safeNum(player?.ovr, 70);
  const waitCycles = safeNum(context.waitCycles, 0);
  const moneyGapRatio = safeNum(context.moneyGapRatio, 0);
  const bidderPressure = Math.max(0, offerCount - 1);
  const isOffseason = phase === 'free_agency' || phase === 'offseason_resign';
  const eliteMarket = ovr >= 90 && offerCount >= 3 && (marketHeat >= 1.25 || moneyGapRatio >= 0.08);
  const maxWaitCycles = eliteMarket ? 2 : 1;
  const atWaitCap = waitCycles >= maxWaitCycles;

  const patienceBase = 0.12
    + (ovr >= 92 ? 0.16 : ovr >= 86 ? 0.09 : ovr >= 80 ? 0.03 : 0)
    + (age <= 25 ? 0.04 : age >= 31 ? -0.06 : 0)
    + (marketHeat - 1) * 0.14
    + bidderPressure * 0.035
    + (isOffseason ? 0.03 : -0.03);

  const fatigue = Math.min(0.5, waitCycles * 0.24);
  const leverage = Math.min(0.18, moneyGapRatio * 0.32);
  const holdOut = Math.max(0.04, Math.min(0.95, patienceBase + leverage - fatigue));

  let state = 'decision_imminent';
  let reason = 'Decision next week';
  if (offerCount <= 1 && holdOut < 0.3) {
    state = 'decision_imminent';
    reason = 'Ready to decide now';
  } else if (holdOut >= 0.58 && offerCount >= 2 && (ovr >= 84 || marketHeat >= 1.2)) {
    state = 'holding_for_improvement';
    reason = 'Reviewing final offers';
  } else if (holdOut >= 0.45 && offerCount >= 2) {
    state = 'evaluating_market';
    reason = 'Counter expected';
  } else if (holdOut >= 0.35) {
    state = 'leaning_to_leader';
    reason = 'Leaning toward current top offer';
  } else {
    state = 'close_to_deciding';
    reason = 'Decision next week';
  }

  if (waitCycles >= 1 && offerCount <= 1 && marketHeat < 1.12) {
    state = 'market_cooling';
    reason = 'Market cooling';
  }
  if (waitCycles >= 1 && holdOut < 0.55) {
    state = 'decision_imminent';
    reason = 'Decision next week';
  }
  if (atWaitCap) {
    state = 'decision_imminent';
    reason = eliteMarket ? 'Final review window ending' : 'Market cooling';
  }

  const resolveNow = state === 'decision_imminent' || atWaitCap;
  const risk = holdOut >= 0.66 ? 'high' : holdOut >= 0.48 ? 'medium' : 'low';
  const patienceWeeks = atWaitCap ? 0 : Math.max(0, Math.min(maxWaitCycles, Math.round(maxWaitCycles - waitCycles)));

  return {
    resolveNow,
    reason,
    state,
    risk,
    patienceWeeks,
    holdOut: Math.round(holdOut * 1000) / 1000,
    maxWaitCycles,
    eliteMarket,
    atWaitCap,
  };
}

export function marketHeatLabel(v) {
  if (v >= 1.45) return 'Hot';
  if (v >= 1.15) return 'Warm';
  return 'Soft';
}
