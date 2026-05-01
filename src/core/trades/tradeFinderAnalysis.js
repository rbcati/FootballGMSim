import { calculatePlayerValue } from '../trade-logic.js';
import { FOOTBALL_ROSTER_CONFIG } from '../sports/footballRosterConfig.js';

const PREMIUM_POS = new Set(['QB', 'WR', 'OL', 'DL', 'CB']);
const PREMIUM_PICK_WARNING = 'Premium pick included; verify before submitting.';
const OVERPAY_WARNING = 'Package may overpay relative to target value.';
const PICK_INFO_WARNING = 'Pick asset is informational if Trade Center cannot submit picks.';

const num = (v, fb = 0) => Number.isFinite(Number(v)) ? Number(v) : fb;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const tierForValue = (v) => (v >= 190 ? 'premium' : v >= 145 ? 'starter' : v >= 110 ? 'rotation' : v >= 80 ? 'depth' : 'low');

function getPlayerSalary(player = {}) { return num(player?.contract?.baseAnnual, null); }
function getYearsRemaining(player = {}) { return num(player?.contract?.yearsRemaining ?? player?.contract?.years, 0); }
function estimateTradeValue(player = {}) {
  return Math.max(1, Math.round(((num(player.ovr, 60) * 1.1) + (num(player.potential, player.ovr) * 0.8))
    * (PREMIUM_POS.has(player.pos) ? 1.15 : 1)
    * (num(player.age) <= 24 ? 1.15 : num(player.age) >= 31 ? 0.8 : 1)
    - (String(player?.status ?? '').toLowerCase().includes('inj') ? 12 : 0)
    - (getPlayerSalary(player) != null && getPlayerSalary(player) >= 16 ? 8 : 0)));
}
function getPlayerValueSafe(player = {}) {
  try { return num(calculatePlayerValue(player), 0); } catch { return estimateTradeValue(player); }
}
function buildTradeChip(player = {}) {
  const salary = getPlayerSalary(player);
  const valueScore = getPlayerValueSafe(player);
  return {
    assetType: 'player', playerId: player.id, name: player.name, pos: player.pos, age: player.age,
    ovr: player.ovr, potential: player.potential ?? player.ovr, salary, baseAnnual: salary,
    yearsRemaining: getYearsRemaining(player), valueScore, valueTier: tierForValue(valueScore), riskFlags: [],
  };
}

function getTeamDraftPicks(team = {}, league = {}) {
  if (Array.isArray(team?.draftPicks)) return team.draftPicks;
  if (Array.isArray(team?.picks)) return team.picks;
  const all = Array.isArray(league?.draftPicks) ? league.draftPicks : [];
  return all.filter((pick) => Number(pick?.ownerTeamId ?? pick?.teamId ?? pick?.tid) === Number(team?.id));
}
function classifyPickTier(valueScore = 0) {
  if (valueScore >= 170) return 'premium';
  if (valueScore >= 130) return 'starter';
  if (valueScore >= 95) return 'rotation';
  if (valueScore >= 70) return 'depth';
  return 'low';
}
function formatDraftPickLabel(pick = {}) {
  const year = pick?.year ?? pick?.season;
  const round = pick?.round;
  if (year != null && round != null) return `${year} Round ${round}`;
  if (round != null) return `Round ${round} pick`;
  if (year != null) return `${year} draft pick`;
  return 'Unknown draft pick';
}
function estimateDraftPickValue(pick = {}) {
  const round = Number(pick?.round);
  const year = Number(pick?.year ?? pick?.season);
  const nowYear = new Date().getUTCFullYear();
  const baseByRound = Number.isFinite(round)
    ? (round === 1 ? 175 : round === 2 ? 135 : round <= 4 ? 98 : round <= 7 ? 64 : 52)
    : 50;
  const yearAdj = Number.isFinite(year)
    ? (year <= nowYear + 1 ? 16 : year === nowYear + 2 ? 8 : Math.max(-14, -6 * (year - (nowYear + 2))))
    : -8;
  return Math.max(20, Math.round(baseByRound + yearAdj));
}
function normalizeDraftPickAsset(pick = {}, ownerTeamId) {
  const pickId = pick?.id ?? pick?.pickId ?? `${ownerTeamId}-${pick?.year ?? pick?.season ?? 'x'}-${pick?.round ?? 'r'}`;
  const valueScore = estimateDraftPickValue(pick);
  const year = pick?.year ?? pick?.season ?? null;
  const round = pick?.round ?? null;
  return { assetType: 'pick', pickId, ownerTeamId: pick?.ownerTeamId ?? pick?.teamId ?? ownerTeamId, originalTeamId: pick?.originalTeamId ?? null, year, round, label: formatDraftPickLabel({ year, round }), valueScore, valueTier: classifyPickTier(valueScore), riskFlags: [] };
}
function buildDraftPickChip(pick = {}, ownerTeamId) { return normalizeDraftPickAsset(pick, ownerTeamId); }

function buildNeedMap(roster = [], cfg = FOOTBALL_ROSTER_CONFIG) {
  const map = {};
  for (const pos of cfg.positionGroups) {
    const expectedStarters = cfg.groupConfig?.[pos]?.starterCountExpected ?? 1;
    const players = roster.filter((p) => p.pos === pos).sort((a, b) => num(b.ovr) - num(a.ovr));
    const starters = players.slice(0, expectedStarters);
    const avgStarterOvr = starters.length ? starters.reduce((sum, p) => sum + num(p.ovr), 0) / starters.length : 0;
    const missingStarters = Math.max(0, expectedStarters - starters.length);
    const needScore = clamp(Math.round((78 - avgStarterOvr) + (missingStarters * 25)), 0, 100);
    map[pos] = { pos, needLevel: needScore >= 55 ? 'urgent' : needScore >= 35 ? 'thin' : 'stable', needScore, roleFit: needScore >= 55 ? 'starter_upgrade' : needScore >= 35 ? 'depth_patch' : 'youth_upside' };
  }
  return map;
}
function buildUserSurplus(userRoster = [], footballConfig = FOOTBALL_ROSTER_CONFIG) {
  const userSurplus = []; const chips = []; const nonStarterIds = new Set();
  for (const pos of footballConfig.positionGroups) {
    const expectedStarters = footballConfig.groupConfig?.[pos]?.starterCountExpected ?? 1;
    const players = userRoster.filter((p) => p.pos === pos).sort((a, b) => num(b.ovr) - num(a.ovr));
    const depth = players.slice(expectedStarters);
    depth.forEach((p) => nonStarterIds.add(p.id));
    const posChips = depth.filter((p) => num(p.ovr) >= 66).map((p) => buildTradeChip(p));
    if (!posChips.length) continue;
    userSurplus.push({ pos, players: players.map((p) => p.id), bestTradeChip: [...posChips].sort((a, b) => b.valueScore - a.valueScore)[0] ?? null, surplusScore: clamp((depth.length * 22) + (num(depth[0]?.ovr) - 68), 0, 100) });
    chips.push(...posChips);
  }
  return { userSurplus, chipPool: chips.sort((a, b) => b.valueScore - a.valueScore), nonStarterIds };
}
function getTargetCandidatesForNeed({ need, leaguePlayers, userTeamId }) {
  return leaguePlayers.filter((p) => num(p.teamId) !== userTeamId && num(p.teamId, -1) >= 0 && p.pos === need.pos).sort((a, b) => getPlayerValueSafe(b) - getPlayerValueSafe(a)).slice(0, 5);
}
const classifyValueMatch = (delta) => (delta <= -35 ? 'favorable' : delta <= 25 ? 'fair' : delta <= 75 ? 'expensive' : 'unrealistic');
const buildValueDeltaLabel = (d) => d <= -35 ? 'package may overpay' : d <= 25 ? 'near fair value' : d <= 75 ? 'slightly short on value' : 'far short on value';
const buildOutgoingAssetSummary = (assets = []) => assets.map((a) => a.assetType === 'player' ? `${a.pos} ${a.name}` : a.label).join(' + ');
const calculateOutgoingPackageValue = (assets = []) => assets.reduce((s, a) => s + num(a.valueScore), 0);

function calculatePackageCapImpact({ target, outgoingAssets, cap }) {
  const incomingSalary = getPlayerSalary(target);
  const outgoingPlayerAssets = outgoingAssets.filter((a) => a.assetType === 'player');
  const outgoingKnown = outgoingPlayerAssets.every((a) => Number.isFinite(Number(a.salary)));
  const outgoingSalary = outgoingKnown ? outgoingPlayerAssets.reduce((sum, a) => sum + num(a.salary, 0), 0) : null;
  if (!Number.isFinite(incomingSalary) || outgoingSalary == null) return { incomingSalary, outgoingSalary, capImpact: null, capImpactLabel: 'cap impact unknown', projectedCapRoomAfterTrade: null, projectedCapLabel: null };
  const capImpact = incomingSalary - outgoingSalary;
  const capImpactLabel = capImpact > 0 ? `cap cost $${capImpact.toFixed(1)}M` : capImpact < 0 ? `cap relief +$${Math.abs(capImpact).toFixed(1)}M` : 'cap neutral';
  const projectedCapRoomAfterTrade = Number.isFinite(Number(cap?.capRoom)) ? Number(cap.capRoom) - capImpact : null;
  const projectedCapLabel = projectedCapRoomAfterTrade == null ? null : `projected cap room $${projectedCapRoomAfterTrade.toFixed(1)}M`;
  return { incomingSalary, outgoingSalary, capImpact, capImpactLabel, projectedCapRoomAfterTrade, projectedCapLabel };
}
function classifyPackageType(packageType, outgoingAssets) {
  if (packageType) return packageType;
  const picks = outgoingAssets.filter((a) => a.assetType === 'pick').length;
  const players = outgoingAssets.filter((a) => a.assetType === 'player').length;
  if (picks >= 2) return 'pick_heavy';
  if (players >= 2) return 'two_players';
  if (picks && players) return 'player_plus_pick';
  return 'one_for_one';
}
function shouldUsePremiumPick({ target, need, valueDelta, baseValueMatch }) {
  if (target.pos === 'K' || target.pos === 'P') return false;
  if (baseValueMatch === 'fair') return false;
  if (!(target.pos === 'QB' || PREMIUM_POS.has(target.pos) || num(target.ovr) >= 82 || ['urgent', 'thin'].includes(need.needLevel))) return false;
  return valueDelta > 0;
}
function choosePickForPackage({ picks, valueDelta, target, need, baseValueMatch }) {
  if (!picks.length || valueDelta <= 0) return null;
  const allowPremium = shouldUsePremiumPick({ target, need, valueDelta, baseValueMatch });
  const eligible = picks.filter((p) => allowPremium ? true : p.valueTier !== 'premium');
  if (!eligible.length) return null;
  return [...eligible].sort((a, b) => Math.abs((valueDelta - a.valueScore)) - Math.abs((valueDelta - b.valueScore)))[0] ?? null;
}
function buildPackageWarnings({ outgoingAssets, valueMatch }) {
  const warnings = [];
  if (valueMatch === 'favorable') warnings.push(OVERPAY_WARNING);
  if (outgoingAssets.some((a) => a.assetType === 'pick')) warnings.push(PICK_INFO_WARNING);
  if (outgoingAssets.some((a) => a.assetType === 'pick' && a.valueTier === 'premium')) warnings.push(PREMIUM_PICK_WARNING);
  return warnings;
}
function classifyFeasibility({ valueMatch, warnings, capImpact }) {
  if (warnings.includes(OVERPAY_WARNING)) return 'overpay_risk';
  if (capImpact != null && capImpact > 12) return 'cap_constrained';
  if (valueMatch === 'fair') return 'likely_reasonable';
  if (valueMatch === 'expensive') return 'needs_more_value';
  if (valueMatch === 'unrealistic') return 'long_shot';
  return 'unknown';
}
function scorePackageIdea({ need, valueDelta, valueMatch, warnings, capImpact }) {
  let score = 100 - Math.abs(valueDelta) + need.needScore;
  if (valueMatch === 'fair') score += 8;
  if (capImpact != null && capImpact <= 0) score += 6;
  score -= warnings.length * 6;
  return clamp(score, 1, 99);
}
function classifyValueMatchDetail(v){return buildValueDeltaLabel(v);}
function buildIdea({ need, target, outgoingAssets, teams, cap, packageType }) {
  const targetValue = getPlayerValueSafe(target);
  const outgoingValue = calculateOutgoingPackageValue(outgoingAssets);
  const valueDelta = Math.round(targetValue - outgoingValue);
  const valueMatch = classifyValueMatch(valueDelta);
  const capData = calculatePackageCapImpact({ target, outgoingAssets, cap });
  const warnings = buildPackageWarnings({ outgoingAssets, valueMatch });
  const feasibilityLabel = classifyFeasibility({ valueMatch, warnings, capImpact: capData.capImpact });
  const confidenceReasons = [];
  if (valueMatch === 'fair') confidenceReasons.push('Near fair value package.');
  if (need.needLevel === 'urgent') confidenceReasons.push(`Addresses urgent ${need.pos} need.`);
  if (capData.capImpact != null && capData.capImpact > 6) confidenceReasons.push('Cap cost is significant.');
  if (warnings.includes(PREMIUM_PICK_WARNING)) confidenceReasons.push('Premium pick included.');
  if (valueMatch === 'expensive' || valueMatch === 'unrealistic') confidenceReasons.push('Package remains short on value.');
  const confidence = feasibilityLabel === 'likely_reasonable' && !warnings.includes(PREMIUM_PICK_WARNING) ? 'high' : feasibilityLabel === 'long_shot' || feasibilityLabel === 'cap_constrained' || feasibilityLabel === 'overpay_risk' ? 'low' : 'medium';
  return {
    id: `${need.pos}-${target.id}-${outgoingAssets.map((a) => a.playerId ?? a.pickId).join('-')}`,
    targetPlayerId: target.id, targetPlayerName: target.name, targetTeamId: target.teamId,
    targetTeamAbbr: teams.find((x) => num(x.id) === num(target.teamId))?.abbr ?? `T${target.teamId}`,
    targetPos: target.pos, targetAge: target.age, targetOVR: target.ovr, targetPotential: target.potential ?? target.ovr,
    outgoingAssets, outgoingPlayerIds: outgoingAssets.filter((a) => a.assetType === 'player').map((a) => a.playerId), outgoingPickIds: outgoingAssets.filter((a) => a.assetType === 'pick').map((a) => a.pickId),
    outgoingSummary: buildOutgoingAssetSummary(outgoingAssets), outgoingValue, valueDelta, valueDeltaLabel: buildValueDeltaLabel(valueDelta), valueMatch, valueMatchDetail: classifyValueMatchDetail(valueDelta),
    packageType: classifyPackageType(packageType, outgoingAssets), packageAssetCount: outgoingAssets.length,
    confidence, confidenceReasons: confidenceReasons.length ? confidenceReasons : ['Exploratory package only.'], warnings,
    feasibilityLabel, frameworkType: classifyPackageType(packageType, outgoingAssets),
    ...capData,
    fitScore: scorePackageIdea({ need, valueDelta, valueMatch, warnings, capImpact: capData.capImpact }),
    roleFit: need.roleFit,
    needFitTag: need.needLevel === 'urgent' ? 'urgent_need' : 'team_need',
    recommendation: valueMatch === 'unrealistic' ? 'avoid' : 'consider',
    reason: `Possible package to address ${need.pos}.`,
  };
}

function generatePackageVariants({ need, target, chipPool, picks, nonStarterIds, teams, cap }) {
  const ideas = [];
  const base = chipPool.find((c) => c.pos === target.pos) ?? chipPool[0];
  if (!base) return ideas;
  const oneForOne = buildIdea({ need, target, outgoingAssets: [base], teams, cap, packageType: 'one_for_one' });
  ideas.push(oneForOne);
  const smallestPick = choosePickForPackage({ picks, valueDelta: oneForOne.valueDelta, target, need, baseValueMatch: oneForOne.valueMatch });
  if (smallestPick && ['expensive', 'unrealistic'].includes(oneForOne.valueMatch)) ideas.push(buildIdea({ need, target, outgoingAssets: [base, smallestPick], teams, cap, packageType: 'player_plus_pick' }));
  const extra = chipPool.find((c) => c.playerId !== base.playerId && nonStarterIds.has(c.playerId));
  if (extra && oneForOne.valueMatch === 'unrealistic') ideas.push(buildIdea({ need, target, outgoingAssets: [base, extra], teams, cap, packageType: 'two_players' }));
  if (Number(base.salary) > Number(getPlayerSalary(target))) ideas.push(buildIdea({ need, target, outgoingAssets: [base], teams, cap, packageType: 'cap_relief' }));
  return ideas.filter((i) => i.packageAssetCount <= 3 && !(target.pos === 'K' || target.pos === 'P') || i.outgoingAssets.every((a)=>a.assetType!=='pick'||a.valueTier!=='premium'));
}

function sortAndCapTradeIdeas(ideas = [], userTeamId) { return ideas.filter((i) => num(i.targetTeamId) !== userTeamId).sort((a, b) => b.fitScore - a.fitScore).slice(0, 15); }

export function buildTradeFinderAnalysis({ userTeam, league = {}, teams = [], userRoster = [], leaguePlayers = [], cap = {}, footballConfig = FOOTBALL_ROSTER_CONFIG }) {
  const userTeamId = num(userTeam?.id, -1);
  const targetNeeds = Object.values(buildNeedMap(userRoster, footballConfig)).sort((a, b) => b.needScore - a.needScore).slice(0, 6);
  const { userSurplus, chipPool, nonStarterIds } = buildUserSurplus(userRoster, footballConfig);
  const userPickChips = getTeamDraftPicks(userTeam, league).map((p) => buildDraftPickChip(p, userTeamId)).filter((p) => p?.pickId).sort((a,b)=>b.valueScore-a.valueScore);
  const userAssets = [...chipPool, ...userPickChips];
  const ideas = [];
  for (const need of targetNeeds.slice(0, 4)) {
    for (const target of getTargetCandidatesForNeed({ need, leaguePlayers, userTeamId })) {
      ideas.push(...generatePackageVariants({ need, target, chipPool, picks: userPickChips, nonStarterIds, teams, cap }));
    }
  }
  const tradeIdeas = sortAndCapTradeIdeas(ideas, userTeamId);
  return { summary: { biggestNeed: targetNeeds[0] ?? null, strongestSurplus: userSurplus.sort((a, b) => b.surplusScore - a.surplusScore)[0] ?? null, bestTradeChip: chipPool[0] ?? null, topTarget: tradeIdeas[0] ?? null, capWarning: cap?.capRoom != null && num(cap.capRoom) < 0 ? 'Over cap: prioritize cap-neutral frameworks.' : null }, userSurplus, userTradeChips: chipPool.slice(0, 10), userPickChips: userPickChips.slice(0, 10), userAssets: userAssets.slice(0, 20), targetNeeds, tradeIdeas, filters: ['all', 'team_need', 'starter_upgrade', 'youth_upside', 'fair_value', 'high_confidence', 'needs_more_value', 'cap_safe', 'long_shot', 'selected', 'cap_relief', 'avoid_risks', 'player_plus_pick', 'pick_included', 'multi_asset', 'overpay_risk', 'premium_pick'] };
}
