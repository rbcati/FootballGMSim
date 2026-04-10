import { buildContractProfile, buildDemandFromProfile, computeMarketHeat, inferTeamDirection } from '../contract-market.js';
import { evaluateContractOffer } from '../contracts/negotiation.js';
import { getTeamContextForNegotiation } from '../teamContext/negotiationContext.js';

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function contractYearsLeft(player = {}) {
  return safeNum(player?.contract?.years ?? player?.contract?.yearsRemaining ?? player?.contract?.yearsLeft, 0);
}

function demandValue(demand = {}) {
  const years = Math.max(1, safeNum(demand?.yearsTotal ?? demand?.years, 1));
  return safeNum(demand?.baseAnnual) * years + safeNum(demand?.signingBonus);
}

function replacementDifficulty(pos, roster = []) {
  const atPos = roster.filter((p) => p?.pos === pos && (p?.status ?? 'active') === 'active').length;
  if (atPos <= 2) return 'high';
  if (atPos <= 4) return 'medium';
  return 'low';
}

function recommendationFromScore(score = 0, { expiring = false, star = false, expensive = false } = {}) {
  if (score >= 88 && expiring) return 'cornerstone_priority';
  if (score >= 82) return expiring ? 'strong_keep' : 'extension_candidate';
  if (score >= 70) return 'keep_if_price_is_right';
  if (expensive && star) return 'franchise_tag_candidate';
  if (score >= 58) return 'replaceable_depth';
  if (expiring && score < 46) return 'likely_to_walk';
  return 'move_on';
}

export function getExtensionReadiness(player = {}, context = {}) {
  const yearsLeft = contractYearsLeft(player);
  const profile = context.profile ?? buildContractProfile(player, context.teamContext ?? {});
  const inSeason = ['regular', 'playoffs', 'preseason'].includes(String(context.phase ?? ''));
  const relationship = safeNum(context.relationshipScore, 60);

  if (yearsLeft <= 1) return 'open_to_extension_now';
  if (inSeason && profile.moneyPriority >= 0.72) return 'prefers_to_wait';
  if (profile.moneyPriority >= 0.76 && yearsLeft >= 2) return 'wants_market_reset';
  if (profile.loyalty >= 0.66 && profile.securityPriority >= 0.58) return 'willing_to_discount_for_security';
  if (profile.moneyPriority >= 0.68 && relationship < 58) return 'likely_to_test_free_agency';
  return yearsLeft <= 2 ? 'open_to_extension_now' : 'prefers_to_wait';
}

export function evaluateReSigningPriority(player = {}, team = {}, league = {}) {
  const roster = (league?.players ?? []).filter((p) => Number(p?.teamId) === Number(team?.id));
  const freeAgents = (league?.players ?? []).filter((p) => !p?.teamId || p?.status === 'free_agent');
  const teamDirection = inferTeamDirection(team, Number(league?.week ?? 1));
  const profile = buildContractProfile(player, { tenureYears: safeNum(player?.tenureYears, 0) });
  const marketHeat = computeMarketHeat(player?.pos, freeAgents);
  const demand = buildDemandFromProfile(player, profile, {
    marketHeat,
    morale: safeNum(player?.morale, 68),
    fit: safeNum(player?.schemeFit, 65),
    teamSuccess: ((team?.wins ?? 0) + (team?.ties ?? 0) * 0.5) / Math.max(1, (team?.wins ?? 0) + (team?.losses ?? 0) + (team?.ties ?? 0)),
  });

  const yearsLeft = contractYearsLeft(player);
  const expiring = yearsLeft <= 1;
  const replacement = replacementDifficulty(player?.pos, roster);
  const ovr = safeNum(player?.ovr, 65);
  const pot = safeNum(player?.potential, ovr);
  const age = safeNum(player?.age, 26);

  const developmentOutlook = pot - ovr >= 4 && age <= 25 ? 'ascending' : age >= 30 ? 'declining' : 'stable';
  const roleImportance = ovr >= 84 ? 'core_starter' : ovr >= 75 ? 'starter' : ovr >= 70 ? 'rotation' : 'depth';
  const askAnnual = safeNum(demand?.baseAnnual, safeNum(player?.contract?.baseAnnual, 4));
  const capRoom = safeNum(team?.capRoom, 0);

  let score =
    ovr * 0.9 +
    (pot - ovr) * 1.2 +
    (safeNum(player?.schemeFit, 65) - 60) * 0.5 +
    (safeNum(player?.morale, 68) - 60) * 0.4 +
    (marketHeat - 1) * 13;

  if (replacement === 'high') score += 12;
  if (replacement === 'medium') score += 6;
  if (teamDirection === 'contender' && ovr >= 78) score += 8;
  if (teamDirection === 'rebuilding' && age <= 26) score += 8;
  if (age >= 31) score -= (age - 30) * 6;
  if (askAnnual > Math.max(6, capRoom * 0.55)) score -= 10;

  const recommendation = recommendationFromScore(score, {
    expiring,
    star: ovr >= 84,
    expensive: askAnnual >= Math.max(14, capRoom * 0.6),
  });

  return {
    recommendation,
    score: Math.round(score),
    roleImportance,
    developmentOutlook,
    replacementDifficulty: replacement,
    expectedMarketDifficulty: marketHeat >= 1.35 ? 'high' : marketHeat >= 1.12 ? 'medium' : 'low',
    teamDirection,
    profile,
    demand,
    yearsLeft,
    expiring,
    extensionReadiness: getExtensionReadiness(player, { profile, phase: league?.phase }),
  };
}

export function classifyContractDecision(player = {}, context = {}) {
  const recommendation = context?.recommendation ?? 'keep_if_price_is_right';
  if (recommendation === 'cornerstone_priority' || recommendation === 'strong_keep') return 'priority_re_signing';
  if (recommendation === 'extension_candidate') return 'extension_candidate';
  if (recommendation === 'franchise_tag_candidate') return 'franchise_tag_candidate';
  if (recommendation === 'likely_to_walk' || recommendation === 'move_on') return 'let_walk_candidate';
  if (context?.expiring && safeNum(player?.ovr, 0) >= 76) return 'expiring_starter';
  return 'depth_low_urgency';
}

export function summarizeRetentionRecommendation(recommendation = '') {
  const map = {
    cornerstone_priority: 'Cornerstone priority. Keep at almost any reasonable price.',
    strong_keep: 'Strong keep. Important starter with manageable risk.',
    keep_if_price_is_right: 'Keep if price is right. Useful, but avoid overpay.',
    extension_candidate: 'Extension candidate before leverage increases.',
    franchise_tag_candidate: 'Tag candidate if long-term talks stall.',
    replaceable_depth: 'Replaceable depth. Retain only on team-friendly terms.',
    likely_to_walk: 'Likely to walk unless market-level offer is made now.',
    move_on: 'Move on. Reallocate resources to replacements.',
  };
  return map[recommendation] ?? 'Evaluate with market context.';
}

export function summarizeContractRisk(player = {}, team = {}, league = {}, priority = null) {
  const p = priority ?? evaluateReSigningPriority(player, team, league);
  const riskScore =
    (p.expectedMarketDifficulty === 'high' ? 35 : p.expectedMarketDifficulty === 'medium' ? 22 : 10) +
    (p.replacementDifficulty === 'high' ? 22 : p.replacementDifficulty === 'medium' ? 12 : 4) +
    (p.extensionReadiness === 'likely_to_test_free_agency' ? 25 : p.extensionReadiness === 'prefers_to_wait' ? 14 : 6);

  return {
    riskScore,
    riskBand: riskScore >= 70 ? 'high' : riskScore >= 46 ? 'medium' : 'low',
    summary: `${p.profile.headline}. ${summarizeRetentionRecommendation(p.recommendation)}`,
  };
}

export function summarizeRetentionPlan(player = {}, context = {}) {
  const priority = context.priority ?? evaluateReSigningPriority(player, context.team, context.league);
  const decisionClass = classifyContractDecision(player, { ...priority, recommendation: priority.recommendation, expiring: priority.expiring });
  const risk = summarizeContractRisk(player, context.team, context.league, priority);

  return {
    decisionClass,
    recommendation: priority.recommendation,
    recommendationSummary: summarizeRetentionRecommendation(priority.recommendation),
    risk,
    extensionReadiness: priority.extensionReadiness,
    expectedMarketBehavior: priority.profile.headline,
  };
}

export function getCapOutlookForRetention(team = {}, board = []) {
  const capRoom = safeNum(team?.capRoom, 0);
  const nextYearCapRoom = safeNum(team?.projectedCapRoomNextYear, capRoom);
  const priorityRows = board.filter((r) => ['cornerstone_priority', 'strong_keep', 'extension_candidate'].includes(r.priority.recommendation));
  const projectedPriorityCost = priorityRows.reduce((sum, row) => sum + safeNum(row.priority?.demand?.baseAnnual, 0), 0);
  let running = 0;
  let affordableCount = 0;
  priorityRows.forEach((row) => {
    running += safeNum(row.priority?.demand?.baseAnnual, 0);
    if (running <= capRoom) affordableCount += 1;
  });

  let summary = 'Cap runway is healthy enough to retain your core.';
  if (projectedPriorityCost > capRoom * 1.35) summary = `You can likely retain ${Math.max(0, affordableCount)} of your top ${priorityRows.length} priorities.`;
  else if (priorityRows.some((r) => safeNum(r.priority?.demand?.baseAnnual, 0) >= capRoom * 0.55)) summary = 'One star extension will tighten your flexibility.';

  return {
    capRoom,
    projectedCapRoomNextYear: nextYearCapRoom,
    projectedPriorityCost: Math.round(projectedPriorityCost * 10) / 10,
    likelyRetentionCount: affordableCount,
    summary,
  };
}

export function buildRetentionBoard(team = {}, league = {}) {
  const roster = (league?.players ?? []).filter((p) => Number(p?.teamId) === Number(team?.id) && (p?.status ?? 'active') === 'active');
  const board = roster.map((player) => {
    const priority = evaluateReSigningPriority(player, team, league);
    const teamContext = getTeamContextForNegotiation(player, team, null, {
      teamDirection: priority.teamDirection,
      rosterAtPosition: roster.filter((p) => p?.pos === player?.pos),
      needsAtPosition: priority.replacementDifficulty === 'high' ? 1.7 : priority.replacementDifficulty === 'medium' ? 1.2 : 0.8,
    });
    const offerPreview = { contract: priority.demand };
    const negotiation = evaluateContractOffer(player, {
      ...teamContext,
      contenderScore: priority.teamDirection === 'contender' ? 78 : priority.teamDirection === 'rebuilding' ? 45 : 60,
      roleOpportunityScore: priority.roleImportance === 'core_starter' ? 83 : priority.roleImportance === 'starter' ? 72 : 58,
    }, offerPreview, {
      profile: priority.profile,
      askTotalValue: demandValue(priority.demand),
      askAnnual: safeNum(priority.demand?.baseAnnual, 0),
      askYears: safeNum(priority.demand?.yearsTotal ?? priority.demand?.years, 1),
    });

    const plan = summarizeRetentionPlan(player, { team, league, priority });
    return {
      player,
      priority,
      plan,
      negotiation,
      section: classifyContractDecision(player, { recommendation: priority.recommendation, expiring: priority.expiring }),
    };
  });

  board.sort((a, b) => (b.priority.score - a.priority.score) || ((b.player?.ovr ?? 0) - (a.player?.ovr ?? 0)));
  const capOutlook = getCapOutlookForRetention(team, board);

  return { board, capOutlook };
}
