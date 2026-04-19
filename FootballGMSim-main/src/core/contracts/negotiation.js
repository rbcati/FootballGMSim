import { buildPlayerMotivationProfile, summarizePlayerMood } from '../mood/playerMood.js';

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function contractValue(contract = {}) {
  const years = safeNum(contract?.yearsTotal ?? contract?.years, 1);
  return safeNum(contract?.baseAnnual) * Math.max(1, years) + safeNum(contract?.signingBonus);
}

export function summarizeNegotiationStance(result = {}) {
  const stance = result?.negotiationStance ?? 'testing_market';
  const map = {
    eager_to_stay: 'Player is motivated to stay if structure is fair.',
    testing_market: 'Likely to test outside offers before deciding.',
    wants_larger_role: 'Role expectation is the biggest blocker right now.',
    seeking_contender: 'Contender fit is heavily weighted in this decision.',
    chasing_top_dollar: 'Money is driving this negotiation.',
    open_to_discount: 'Open to a slight discount for fit and continuity.',
    far_apart: 'Current package is materially below target.',
    close_to_done: 'Offer is close; minor adjustments could finish the deal.',
  };
  return map[stance] ?? map.testing_market;
}

export function evaluateContractOffer(player = {}, teamContext = {}, offer = {}, currentMarket = {}) {
  const profile = currentMarket?.profile ?? buildPlayerMotivationProfile(player, teamContext);
  const askTotalValue = safeNum(currentMarket?.askTotalValue, contractValue(offer?.contract));
  const offerValue = contractValue(offer?.contract);
  const annual = safeNum(offer?.contract?.baseAnnual, 0);
  const years = safeNum(offer?.contract?.yearsTotal ?? offer?.contract?.years, 1);

  const scoreBreakdown = {
    salary: Math.max(0, Math.min(100, Math.round((annual / Math.max(1, safeNum(currentMarket?.askAnnual, annual))) * 100))),
    years: Math.max(0, Math.min(100, Math.round((years / Math.max(1, safeNum(currentMarket?.askYears, years))) * 100))),
    contender: safeNum(teamContext?.contenderScore, 50),
    role: safeNum(teamContext?.roleOpportunityScore, 50),
    relationship: safeNum(teamContext?.relationshipScore, 50),
    development: safeNum(teamContext?.developmentScore, 50),
    schemeFit: safeNum(teamContext?.schemeFitScore, 60),
    franchiseDirection: safeNum(teamContext?.franchiseDirectionScore, 50),
  };

  const weighted =
    scoreBreakdown.salary * (0.35 + profile.moneyPriority * 0.25) +
    scoreBreakdown.years * (0.12 + profile.securityPriority * 0.14) +
    scoreBreakdown.contender * (0.1 + profile.contenderPriority * 0.15) +
    scoreBreakdown.role * (0.12 + profile.rolePriority * 0.14) +
    scoreBreakdown.relationship * (0.08 + profile.loyalty * 0.12) +
    scoreBreakdown.development * 0.08 +
    scoreBreakdown.schemeFit * (0.05 + profile.schemeFitPreference * 0.08) +
    scoreBreakdown.franchiseDirection * 0.06;

  const normalized = weighted / 1.25;
  const valueGap = askTotalValue > 0 ? (offerValue - askTotalValue) / askTotalValue : 0;

  let negotiationStance = 'testing_market';
  if (normalized >= 77 && valueGap >= -0.03) negotiationStance = 'close_to_done';
  if (normalized >= 84 && profile.loyalty >= 0.58) negotiationStance = 'eager_to_stay';
  if (profile.rolePriority >= 0.7 && scoreBreakdown.role < 60) negotiationStance = 'wants_larger_role';
  if (profile.contenderPriority >= 0.7 && scoreBreakdown.contender < 62) negotiationStance = 'seeking_contender';
  if (profile.moneyPriority >= 0.72 && valueGap < -0.05) negotiationStance = 'chasing_top_dollar';
  if (profile.loyalty >= 0.65 && valueGap > -0.08) negotiationStance = 'open_to_discount';
  if (normalized < 64 || valueGap < -0.12) negotiationStance = 'far_apart';

  const tendency = normalized >= 80 ? 'accept' : normalized >= 68 ? 'counter' : 'reject';
  const moodSummary = summarizePlayerMood(profile, teamContext);

  return {
    tendency,
    negotiationStance,
    score: Math.round(normalized),
    scoreBreakdown,
    explanationSummary: `${moodSummary.summary}. ${summarizeNegotiationStance({ negotiationStance })}`,
    fitSummary: moodSummary,
    valueGap,
  };
}
