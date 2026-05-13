import { Constants } from './constants.js';

const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

export const PREMIUM_POSITIONS = Object.freeze(['QB', 'OT', 'EDGE', 'DE', 'CB', 'WR', 'DL']);
const LOW_PREMIUM_POSITIONS = Object.freeze(['RB', 'K', 'P']);
const REBUILD_ARCHETYPES = Object.freeze(['rebuild', 'development', 'rebuilding']);
const WIN_NOW_ARCHETYPES = Object.freeze(['contender', 'playoff_hunt', 'desperate']);

export function normalizePositionGroup(pos = '') {
  const p = String(pos || '').toUpperCase();
  if (['OT', 'OG', 'C', 'G', 'T'].includes(p)) return 'OL';
  if (['DE', 'DT', 'EDGE', 'NT', 'DL'].includes(p)) return 'DL_EDGE';
  if (['MLB', 'OLB'].includes(p)) return 'LB';
  if (['SS', 'FS'].includes(p)) return 'S';
  if (['K', 'P'].includes(p)) return 'KP';
  return p;
}

export function getAnnualContractCost(player = {}, explicitAnnual = null) {
  if (explicitAnnual != null && Number.isFinite(Number(explicitAnnual))) return num(explicitAnnual);
  const contract = player?.contract ?? {};
  const base = num(contract.baseAnnual ?? player.baseAnnual, 0);
  const bonus = num(contract.signingBonus, 0);
  const years = Math.max(1, num(contract.yearsTotal ?? contract.years ?? player.years, 1));
  return Math.round((base + bonus / years) * 10) / 10;
}

export function getPositionalPremium(pos = '') {
  const p = String(pos || '').toUpperCase();
  if (p === 'QB') return 100;
  if (['OT', 'EDGE', 'DE', 'CB', 'WR'].includes(p)) return 82;
  if (['DL', 'DT'].includes(p)) return 72;
  if (['OL', 'TE', 'S'].includes(p)) return 58;
  if (['LB'].includes(p)) return 50;
  if (p === 'RB') return 34;
  if (['K', 'P'].includes(p)) return 16;
  return 45;
}

function inferNeedScore({ positionalNeed = 1, strategy = {}, player = {} }) {
  const group = normalizePositionGroup(player.pos);
  const matchingNeed = Array.isArray(strategy?.positionalNeeds)
    ? strategy.positionalNeeds.find((row) => normalizePositionGroup(row?.positionGroup) === group)
    : null;
  const priority = matchingNeed ? num(matchingNeed.priority, 0) : clamp((num(positionalNeed, 1) - 1) * 100, 0, 100);
  return clamp(Math.max(priority, clamp((num(positionalNeed, 1) - 1) * 110, 0, 100)), 0, 100);
}

function inferCapRoom({ team = {}, capRoom = null }) {
  if (capRoom != null && Number.isFinite(Number(capRoom))) return num(capRoom);
  return num(team?.capRoom, 0);
}

export function evaluatePlayerMarketRealism({
  player = {},
  team = {},
  roster = [],
  strategy = {},
  positionalNeed = 1,
  capRoom = null,
  proposedAnnual = null,
  action = 'free_agency',
} = {}) {
  const pos = String(player?.pos ?? '').toUpperCase();
  const positionGroup = normalizePositionGroup(pos);
  const archetype = String(strategy?.archetype ?? strategy?.teamArchetype ?? team?.archetype ?? 'middle');
  const ovr = num(player?.ovr, 60);
  const potential = num(player?.potential, ovr);
  const age = num(player?.age, 27);
  const annualCost = getAnnualContractCost(player, proposedAnnual);
  const room = inferCapRoom({ team, capRoom });
  const capTotal = Math.max(1, num(team?.capTotal ?? Constants?.SALARY_CAP?.HARD_CAP, 255));
  const capPct = annualCost / capTotal;
  const roomPct = room <= 0 ? 1 : annualCost / Math.max(1, room);
  const positionalPremium = getPositionalPremium(pos);
  const premiumPosition = PREMIUM_POSITIONS.includes(pos);
  const lowPremiumPosition = LOW_PREMIUM_POSITIONS.includes(pos);
  const needScore = inferNeedScore({ positionalNeed, strategy, player });
  const rosterAtPos = Array.isArray(roster) ? roster.filter((p) => normalizePositionGroup(p?.pos) === positionGroup) : [];
  const expensiveSameGroup = rosterAtPos.filter((p) => getAnnualContractCost(p) >= 10).length;

  const ageRisk = pos === 'QB'
    ? clamp((age - 32) * 12, 0, 100)
    : pos === 'RB'
      ? clamp((age - 26) * 18, 0, 100)
      : clamp((age - 29) * 12, 0, 100);
  const capRisk = clamp(roomPct * 72 + capPct * 120 + (room < 8 ? 16 : 0), 0, 100);
  const contractBurden = clamp(annualCost * (premiumPosition ? 1.35 : lowPremiumPosition ? 2.25 : 1.75), 0, 100);
  const youthUpside = clamp((26 - age) * 8 + Math.max(0, potential - ovr) * 4, 0, 100);
  const quality = clamp((ovr - 58) * 2.2 + Math.max(0, potential - ovr) * (age <= 25 ? 2.8 : 0.9), 0, 100);

  let marketDemandScore = clamp(quality * 0.48 + positionalPremium * 0.26 + youthUpside * 0.18 - ageRisk * 0.22 - contractBurden * 0.14, 0, 100);
  if (pos === 'QB' && ovr >= 74) marketDemandScore += 10;
  if (pos === 'RB' && age >= 29) marketDemandScore -= 16;
  if (ovr < 66) marketDemandScore -= 18;
  marketDemandScore = clamp(Math.round(marketDemandScore), 0, 100);

  let archetypeFit = 50;
  if (WIN_NOW_ARCHETYPES.includes(archetype)) {
    archetypeFit += ovr >= 76 ? 16 : 0;
    archetypeFit += needScore >= 60 ? 14 : 0;
    archetypeFit -= ageRisk >= 70 ? 10 : 0;
  } else if (REBUILD_ARCHETYPES.includes(archetype)) {
    archetypeFit += youthUpside * 0.32;
    archetypeFit += premiumPosition && age <= 26 ? 12 : 0;
    archetypeFit -= ageRisk * 0.35;
    archetypeFit -= contractBurden * 0.18;
  } else if (archetype === 'retool') {
    archetypeFit += youthUpside * 0.22;
    archetypeFit -= ageRisk * 0.25;
    archetypeFit -= contractBurden * 0.12;
  } else {
    archetypeFit += quality * 0.12 + needScore * 0.12 - capRisk * 0.14;
  }

  let fitScore = clamp(
    marketDemandScore * 0.34 + needScore * 0.3 + archetypeFit * 0.24 + positionalPremium * 0.12 - capRisk * 0.28,
    0,
    100,
  );

  const reasons = [];
  const flags = [];
  if (premiumPosition) { reasons.push('premium position tax'); flags.push('premium_position'); }
  if (needScore >= 70) { reasons.push('need match'); flags.push('severe_need'); }
  if (capRisk >= 70) { reasons.push('cap burden'); flags.push('cap_burden'); }
  if (ageRisk >= 70) { reasons.push('age risk'); flags.push('age_risk'); }
  if (REBUILD_ARCHETYPES.includes(archetype) && age <= 26 && premiumPosition) { reasons.push('rebuild fit'); flags.push('rebuild_fit'); }
  if (WIN_NOW_ARCHETYPES.includes(archetype) && age >= 30 && needScore >= 60) { reasons.push('contender rental'); flags.push('contender_rental'); }
  if (expensiveSameGroup > 0 && annualCost >= 10 && pos !== 'QB') { reasons.push('duplicate expensive position spend'); flags.push('duplicate_expensive_position'); }

  const oldExpensiveVeteran = age >= (pos === 'QB' ? 34 : 31) && annualCost >= (pos === 'QB' ? 18 : 10);
  const lowNeedDepthSplash = needScore < 35 && annualCost >= 8 && ovr < 82;
  const capStressedSplash = capRisk >= 78 && annualCost >= 8 && !(pos === 'QB' && needScore >= 75);
  const rebuildVetAvoid = REBUILD_ARCHETYPES.includes(archetype) && oldExpensiveVeteran;
  const duplicateAvoid = action === 'free_agency' && flags.includes('duplicate_expensive_position') && needScore < 78;
  const qbNeedException = pos === 'QB' && needScore >= 75 && ovr >= 70 && capRisk < 92;
  const contenderVeteranException = WIN_NOW_ARCHETYPES.includes(archetype) && needScore >= 65 && age >= 30 && capRisk < 78;

  let shouldAvoid = rebuildVetAvoid || lowNeedDepthSplash || capStressedSplash || duplicateAvoid;
  if (qbNeedException || contenderVeteranException) shouldAvoid = false;
  const shouldPursue = !shouldAvoid && fitScore >= 46 && (needScore >= 45 || marketDemandScore >= 68 || qbNeedException);

  if (shouldAvoid && rebuildVetAvoid) reasons.push('rebuild avoids old expensive veteran');
  if (shouldAvoid && capStressedSplash) reasons.push('cap-stressed team avoids non-QB splash');
  if (qbNeedException) { reasons.push('severe QB need exception'); flags.push('qb_need_exception'); }

  if (shouldAvoid) fitScore = clamp(fitScore - 22, 0, 100);

  const teamFitTier = fitScore >= 78 ? 'strong' : fitScore >= 60 ? 'good' : fitScore >= 42 ? 'borderline' : 'poor';

  return {
    marketDemandScore,
    fitScore: Math.round(fitScore),
    capRisk: Math.round(capRisk),
    ageRisk: Math.round(ageRisk),
    contractBurden: Math.round(contractBurden),
    positionalPremium,
    premiumPosition,
    teamFitTier,
    shouldPursue,
    shouldAvoid,
    reasons: [...new Set(reasons)],
    flags: [...new Set(flags)],
    positionGroup,
    needScore: Math.round(needScore),
    annualCost,
  };
}

export function adjustTradeValueForMarketRealism(player = {}, baseValue = 0) {
  const age = num(player?.age, 27);
  const ovr = num(player?.ovr, 60);
  const potential = num(player?.potential, ovr);
  const pos = String(player?.pos ?? '').toUpperCase();
  const premium = getPositionalPremium(pos);
  let adjusted = num(baseValue, 0);
  if (premium >= 80 && age <= 26) adjusted += 18 + Math.max(0, potential - ovr) * 2.5;
  if (pos === 'QB' && age <= 28 && ovr >= 74) adjusted += 28;
  if (pos === 'RB' && age >= 28) adjusted -= (age - 27) * 8;
  adjusted -= Math.max(0, getAnnualContractCost(player) - (premium >= 80 ? 22 : 12)) * (premium >= 80 ? 1.3 : 2.2);
  return Math.max(0, Math.round(adjusted * 10) / 10);
}

export function evaluateTradeActionRealism({ acquiringTeam = {}, acquiringRoster = [], acquiringStrategy = {}, player = {}, positionalNeed = 1 } = {}) {
  return evaluatePlayerMarketRealism({
    player,
    team: acquiringTeam,
    roster: acquiringRoster,
    strategy: acquiringStrategy,
    positionalNeed,
    capRoom: acquiringTeam?.capRoom,
    action: 'trade',
  });
}

export function buildTradeRealismReasonTags(realism = {}) {
  return (realism?.reasons ?? []).filter((reason) => [
    'cap burden',
    'rebuild fit',
    'contender rental',
    'premium position tax',
    'age risk',
    'need match',
  ].includes(reason));
}
