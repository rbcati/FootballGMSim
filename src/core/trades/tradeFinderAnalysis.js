import { calculatePlayerValue } from '../trade-logic.js';
import { FOOTBALL_ROSTER_CONFIG } from '../sports/footballRosterConfig.js';

const PREMIUM_POS = new Set(['QB', 'WR', 'OL', 'DL', 'CB']);
const num = (v, fb = 0) => Number.isFinite(Number(v)) ? Number(v) : fb;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const tierForValue = (v) => (v >= 190 ? 'premium' : v >= 145 ? 'starter' : v >= 110 ? 'rotation' : v >= 80 ? 'depth' : 'low');

const getPlayerSalary = (p = {}) => num(p?.contract?.baseAnnual, null);
const getYearsRemaining = (p = {}) => num(p?.contract?.yearsRemaining ?? p?.contract?.years, 0);

const estimateTradeValue = (p = {}) => Math.max(1, Math.round(((num(p.ovr, 60) * 1.1) + (num(p.potential, p.ovr) * 0.8))
  * (PREMIUM_POS.has(p.pos) ? 1.15 : 1)
  * (num(p.age) <= 24 ? 1.15 : num(p.age) >= 31 ? 0.8 : 1)
  - (String(p?.status ?? '').toLowerCase().includes('inj') ? 12 : 0)
  - (getPlayerSalary(p) != null && getPlayerSalary(p) >= 16 ? 8 : 0)));

const getPlayerValueSafe = (player = {}) => {
  try { return num(calculatePlayerValue(player), 0); } catch { return estimateTradeValue(player); }
};

function buildNeedMap(roster = [], cfg = FOOTBALL_ROSTER_CONFIG) {
  const map = {};
  for (const pos of cfg.positionGroups) {
    const expectedStarters = cfg.groupConfig?.[pos]?.starterCountExpected ?? 1;
    const players = roster.filter((p) => p.pos === pos).sort((a, b) => num(b.ovr) - num(a.ovr));
    const starters = players.slice(0, expectedStarters);
    const avgStarterOvr = starters.length ? starters.reduce((sum, p) => sum + num(p.ovr), 0) / starters.length : 0;
    const missingStarters = Math.max(0, expectedStarters - starters.length);
    const needScore = clamp(Math.round((78 - avgStarterOvr) + (missingStarters * 25)), 0, 100);
    map[pos] = {
      pos,
      needLevel: needScore >= 55 ? 'urgent' : needScore >= 35 ? 'thin' : 'stable',
      needScore,
      reason: missingStarters > 0 ? `${missingStarters} starter slot(s) missing.` : `Starter quality ${Math.round(avgStarterOvr)} OVR.`,
      recommendedTargetType: needScore >= 55 ? 'starter_upgrade' : needScore >= 35 ? 'depth_patch' : 'luxury',
    };
  }
  return map;
}

function buildUserSurplus(userRoster = [], footballConfig = FOOTBALL_ROSTER_CONFIG) {
  const userSurplus = [];
  const chips = [];
  for (const pos of footballConfig.positionGroups) {
    const expectedStarters = footballConfig.groupConfig?.[pos]?.starterCountExpected ?? 1;
    const players = userRoster.filter((p) => p.pos === pos).sort((a, b) => num(b.ovr) - num(a.ovr));
    const depth = players.slice(expectedStarters);
    const surplusScore = clamp((depth.length * 22) + (num(depth[0]?.ovr) - 68), 0, 100);
    if (surplusScore < 25) continue;

    const posChips = depth.filter((p) => num(p.ovr) >= 66).map((p) => buildTradeChip(p));
    const bestTradeChip = [...posChips].sort((a, b) => b.valueScore - a.valueScore)[0] ?? null;

    userSurplus.push({
      pos,
      surplusScore,
      reason: `Depth behind ${expectedStarters} starter(s).`,
      players: players.map((p) => p.id),
      bestTradeChip,
    });
    chips.push(...posChips);
  }
  return { userSurplus, chipPool: chips.sort((a, b) => b.valueScore - a.valueScore) };
}

function buildTradeChip(player = {}) {
  const salary = getPlayerSalary(player);
  const riskFlags = [];
  if (num(player.age) >= 30) riskFlags.push('aging_curve');
  if (salary != null && salary >= 14) riskFlags.push('high_salary');
  if (num(player.schemeFit, 60) < 50) riskFlags.push('low_scheme_fit');

  const valueScore = getPlayerValueSafe(player);
  return {
    playerId: player.id,
    name: player.name,
    pos: player.pos,
    age: player.age,
    ovr: player.ovr,
    potential: player.potential ?? player.ovr,
    salary,
    baseAnnual: salary,
    yearsRemaining: getYearsRemaining(player),
    schemeFit: player.schemeFit,
    valueScore,
    valueTier: tierForValue(valueScore),
    reason: 'Depth/surplus at position makes this a movable asset.',
    riskFlags,
  };
}

function getTargetCandidatesForNeed({ need, leaguePlayers, userTeamId }) {
  return leaguePlayers
    .filter((p) => num(p.teamId) !== userTeamId && num(p.teamId, -1) >= 0 && p.pos === need.pos)
    .sort((a, b) => getPlayerValueSafe(b) - getPlayerValueSafe(a))
    .slice(0, 5);
}

const classifyValueMatch = (delta) => (delta <= 25 ? 'fair' : delta <= 75 ? 'expensive' : 'unrealistic');

function classifyRoleFit(target, need) {
  if (num(target.age) <= 24 && (num(target.potential, target.ovr) - num(target.ovr)) >= 5) return 'youth_upside';
  if (need.needLevel === 'urgent' && num(target.ovr) >= 78) return 'starter_upgrade';
  return num(target.ovr) >= 72 ? 'depth_patch' : 'luxury';
}

const classifyNeedFitTag = (need) => (need.needLevel === 'urgent' ? 'urgent_need' : 'team_need');

function buildCapImpact(target, outgoingChip, userRoster) {
  const inSalary = getPlayerSalary(target);
  const outgoingPlayer = userRoster.find((p) => p.id === outgoingChip.playerId);
  const outSalary = getPlayerSalary(outgoingPlayer);
  const capImpact = inSalary == null || outSalary == null ? null : Number((outSalary - inSalary).toFixed(1));
  const capImpactLabel = capImpact == null ? 'cap impact unknown' : capImpact >= 0 ? `cap relief +$${capImpact}M` : `cap cost $${Math.abs(capImpact)}M`;
  return { capImpact, capImpactLabel, inSalary, outSalary };
}

function scoreTradeIdea({ need, valueDelta, roleFit, capImpact }) {
  return clamp(Math.round((need.needScore * 0.45)
    + ((100 - Math.abs(valueDelta)) * 0.25)
    + (roleFit === 'starter_upgrade' ? 20 : roleFit === 'youth_upside' ? 14 : 8)
    + (capImpact == null ? 3 : capImpact > 0 ? 8 : -6)), 1, 99);
}

function addFeasibility(idea) {
  const reasons = [];
  const warnings = [];
  let confidence = 'medium';
  let feasibilityLabel = 'unknown';

  if (idea.valueMatch === 'fair') {
    feasibilityLabel = 'likely_reasonable';
    reasons.push('Value match is in a fair range.');
  } else if (idea.valueMatch === 'expensive') {
    feasibilityLabel = 'needs_more_value';
    reasons.push('Framework likely needs more outgoing value.');
    confidence = 'low';
  } else {
    feasibilityLabel = 'long_shot';
    reasons.push('Target valuation is a long shot for this package.');
    confidence = 'low';
  }

  if (idea.needFitTag === 'urgent_need') reasons.push('Addresses an urgent roster need.');
  if (idea.roleFit === 'youth_upside') reasons.push('Adds developmental upside.');

  if (idea.capImpact == null) {
    reasons.push('Cap impact is unknown.');
    if (num(idea.targetSalary, 0) >= 14 && idea.valueMatch !== 'fair') confidence = 'low';
  } else if (idea.capImpact < 0 && Math.abs(idea.capImpact) >= 8) {
    warnings.push('Cap hit is significant for this framework.');
    feasibilityLabel = 'cap_constrained';
    confidence = 'low';
  }

  if (num(idea.targetSalary, 0) >= 16) warnings.push('Target salary is high.');
  if (num(idea.targetAge, 0) >= 31) warnings.push('Target is on the older side.');
  if (idea.valueMatch !== 'fair') warnings.push('Package likely needs additional value.');

  if (idea.valueMatch === 'fair' && idea.capImpactLabel !== 'cap impact unknown' && idea.needFitTag === 'urgent_need') {
    confidence = 'high';
  }

  if (idea.valueMatch === 'fair' && confidence === 'low' && feasibilityLabel !== 'cap_constrained') {
    confidence = 'medium';
  }

  return {
    ...idea,
    confidence,
    confidenceReasons: reasons,
    warnings,
    feasibilityLabel,
    frameworkType: idea.roleFit === 'youth_upside'
      ? 'youth_upside'
      : idea.valueMatch === 'fair' && idea.outgoingPlayerIds.length === 1
        ? 'one_for_one'
        : idea.capImpact > 0
          ? 'cap_relief'
          : idea.roleFit === 'starter_upgrade'
            ? 'upgrade_attempt'
            : 'depth_patch',
  };
}

function buildTradeIdea({ need, target, outgoingChip, teams, userRoster }) {
  const targetValue = getPlayerValueSafe(target);
  const valueDelta = Math.round(targetValue - outgoingChip.valueScore);
  const valueMatch = classifyValueMatch(valueDelta);
  const roleFit = classifyRoleFit(target, need);
  const cap = buildCapImpact(target, outgoingChip, userRoster);
  const fitScore = scoreTradeIdea({ need, valueDelta, roleFit, capImpact: cap.capImpact });
  const riskFlags = [];
  if (num(target.age) >= 31) riskFlags.push('aging_curve');
  if (num(target?.contract?.baseAnnual) >= 16) riskFlags.push('high_salary');
  if (num(target.schemeFit, 60) < 50) riskFlags.push('low_scheme_fit');

  return addFeasibility({
    id: `${need.pos}-${target.teamId}-${target.id}-${outgoingChip.playerId}`,
    targetPlayerId: target.id,
    targetPlayerName: target.name,
    targetTeamId: target.teamId,
    targetTeamAbbr: teams.find((x) => num(x.id) === num(target.teamId))?.abbr ?? `T${target.teamId}`,
    targetPos: target.pos,
    targetAge: target.age,
    targetOVR: target.ovr,
    targetPotential: target.potential ?? target.ovr,
    targetSalary: cap.inSalary ?? undefined,
    targetValue,
    outgoingPlayerIds: [outgoingChip.playerId],
    outgoingSummary: `${outgoingChip.pos} ${outgoingChip.name}`,
    outgoingValue: outgoingChip.valueScore,
    valueDelta,
    valueMatch,
    capImpact: cap.capImpact,
    capImpactLabel: cap.capImpactLabel,
    roleFit,
    needFitTag: classifyNeedFitTag(need),
    riskFlags,
    fitScore,
    recommendation: valueMatch === 'unrealistic' ? 'avoid' : fitScore >= 75 ? 'pursue' : fitScore >= 62 ? 'consider' : 'watch',
    reason: `Possible framework to address ${need.pos} with ${target.name}.`,
  });
}

const sortAndCapTradeIdeas = (ideas = [], userTeamId) => ideas
  .filter((i) => num(i.targetTeamId) !== userTeamId)
  .sort((a, b) => b.fitScore - a.fitScore)
  .slice(0, 15);

export function buildTradeFinderAnalysis({ userTeam, teams = [], userRoster = [], leaguePlayers = [], cap = {}, footballConfig = FOOTBALL_ROSTER_CONFIG }) {
  const userTeamId = num(userTeam?.id, -1);
  const targetNeeds = Object.values(buildNeedMap(userRoster, footballConfig)).sort((a, b) => b.needScore - a.needScore).slice(0, 6);
  const { userSurplus, chipPool } = buildUserSurplus(userRoster, footballConfig);

  const urgentNeeds = targetNeeds.filter((n) => n.needLevel !== 'stable');
  const rankedNeeds = urgentNeeds.length ? urgentNeeds : targetNeeds.slice(0, 3);
  const ideas = [];

  for (const need of rankedNeeds) {
    const candidates = getTargetCandidatesForNeed({ need, leaguePlayers, userTeamId });
    for (const target of candidates) {
      const targetValue = getPlayerValueSafe(target);
      const outgoingChip = chipPool.find((c) => c.pos === target.pos && c.valueScore >= targetValue * 0.6)
        ?? chipPool.find((c) => c.valueScore >= targetValue * 0.75)
        ?? chipPool[0];
      if (!outgoingChip) continue;
      ideas.push(buildTradeIdea({ need, target, outgoingChip, teams, userRoster }));
    }
  }

  const tradeIdeas = sortAndCapTradeIdeas(ideas, userTeamId);
  return {
    summary: {
      biggestNeed: targetNeeds[0] ?? null,
      strongestSurplus: userSurplus.sort((a, b) => b.surplusScore - a.surplusScore)[0] ?? null,
      bestTradeChip: chipPool[0] ?? null,
      topTarget: tradeIdeas[0] ?? null,
      capWarning: cap?.capRoom != null && num(cap.capRoom) < 0 ? 'Over cap: prioritize cap-neutral frameworks.' : null,
    },
    userSurplus,
    userTradeChips: chipPool.slice(0, 10),
    targetNeeds,
    tradeIdeas,
    filters: ['all', 'team_need', 'starter_upgrade', 'depth_patch', 'cap_relief', 'youth_upside', 'fair_value', 'avoid_risks'],
  };
}
