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
  return {
    assetType: 'pick',
    pickId,
    ownerTeamId: pick?.ownerTeamId ?? pick?.teamId ?? ownerTeamId,
    originalTeamId: pick?.originalTeamId ?? pick?.origTeamId ?? null,
    year,
    round,
    label: formatDraftPickLabel({ year, round }),
    valueScore,
    valueTier: classifyPickTier(valueScore),
    reason: 'Draft capital can help bridge value gaps in exploratory packages.',
    riskFlags: [],
  };
}

function buildDraftPickChip(pick = {}, ownerTeamId) {
  return normalizeDraftPickAsset(pick, ownerTeamId);
}

function buildNeedMap(roster = [], cfg = FOOTBALL_ROSTER_CONFIG) { /* unchanged */
  const map = {};
  for (const pos of cfg.positionGroups) {
    const expectedStarters = cfg.groupConfig?.[pos]?.starterCountExpected ?? 1;
    const players = roster.filter((p) => p.pos === pos).sort((a, b) => num(b.ovr) - num(a.ovr));
    const starters = players.slice(0, expectedStarters);
    const avgStarterOvr = starters.length ? starters.reduce((sum, p) => sum + num(p.ovr), 0) / starters.length : 0;
    const missingStarters = Math.max(0, expectedStarters - starters.length);
    const needScore = clamp(Math.round((78 - avgStarterOvr) + (missingStarters * 25)), 0, 100);
    map[pos] = { pos, needLevel: needScore >= 55 ? 'urgent' : needScore >= 35 ? 'thin' : 'stable', needScore, reason: missingStarters > 0 ? `${missingStarters} starter slot(s) missing.` : `Starter quality ${Math.round(avgStarterOvr)} OVR.`, recommendedTargetType: needScore >= 55 ? 'starter_upgrade' : needScore >= 35 ? 'depth_patch' : 'luxury' };
  }
  return map;
}
function buildUserSurplus(userRoster = [], footballConfig = FOOTBALL_ROSTER_CONFIG) {
  const userSurplus = []; const chips = []; const nonStarterIds = new Set();
  for (const pos of footballConfig.positionGroups) {
    const expectedStarters = footballConfig.groupConfig?.[pos]?.starterCountExpected ?? 1;
    const players = userRoster.filter((p) => p.pos === pos).sort((a, b) => num(b.ovr) - num(a.ovr));
    const depth = players.slice(expectedStarters); depth.forEach((p) => nonStarterIds.add(p.id));
    const surplusScore = clamp((depth.length * 22) + (num(depth[0]?.ovr) - 68), 0, 100); if (surplusScore < 25) continue;
    const posChips = depth.filter((p) => num(p.ovr) >= 66).map((p) => buildTradeChip(p));
    userSurplus.push({ pos, surplusScore, reason: `Depth behind ${expectedStarters} starter(s).`, players: players.map((p) => p.id), bestTradeChip: [...posChips].sort((a, b) => b.valueScore - a.valueScore)[0] ?? null });
    chips.push(...posChips);
  }
  return { userSurplus, chipPool: chips.sort((a, b) => b.valueScore - a.valueScore), nonStarterIds };
}
function buildTradeChip(player = {}) { const salary = getPlayerSalary(player); const valueScore = getPlayerValueSafe(player); return { assetType: 'player', playerId: player.id, name: player.name, pos: player.pos, age: player.age, ovr: player.ovr, potential: player.potential ?? player.ovr, salary, baseAnnual: salary, yearsRemaining: getYearsRemaining(player), schemeFit: player.schemeFit, valueScore, valueTier: tierForValue(valueScore), reason: 'Depth/surplus at position makes this a movable asset.', riskFlags: [] }; }
function getTargetCandidatesForNeed({ need, leaguePlayers, userTeamId }) { return leaguePlayers.filter((p) => num(p.teamId) !== userTeamId && num(p.teamId, -1) >= 0 && p.pos === need.pos).sort((a, b) => getPlayerValueSafe(b) - getPlayerValueSafe(a)).slice(0, 5); }
const classifyValueMatch = (delta) => (delta <= -35 ? 'favorable' : delta <= 25 ? 'fair' : delta <= 75 ? 'expensive' : 'unrealistic');
const valueDeltaLabel = (d) => d <= -35 ? 'overpay risk' : d <= 25 ? 'near fair value' : d <= 75 ? 'slightly short on value' : 'far short on value';
function buildIdea({ need, target, outgoingAssets, teams, userRoster, packageType }) {
  const targetValue = getPlayerValueSafe(target); const outgoingValue = outgoingAssets.reduce((s, a) => s + num(a.valueScore), 0); const valueDelta = Math.round(targetValue - outgoingValue);
  const valueMatch = classifyValueMatch(valueDelta); const capImpact = null; const warnings = [];
  return {
    id: `${need.pos}-${target.id}-${outgoingAssets.map((a) => a.playerId ?? a.pickId).join('-')}`,
    targetPlayerId: target.id, targetPlayerName: target.name, targetTeamId: target.teamId,
    targetTeamAbbr: teams.find((x) => num(x.id) === num(target.teamId))?.abbr ?? `T${target.teamId}`,
    targetPos: target.pos, targetAge: target.age, targetOVR: target.ovr, targetPotential: target.potential ?? target.ovr,
    outgoingAssets,
    outgoingPlayerIds: outgoingAssets.filter((a) => a.assetType === 'player').map((a) => a.playerId),
    outgoingPickIds: outgoingAssets.filter((a) => a.assetType === 'pick').map((a) => a.pickId),
    outgoingSummary: outgoingAssets.map((a) => a.assetType === 'player' ? `${a.pos} ${a.name}` : a.label).join(' + '),
    outgoingValue, valueDelta, valueDeltaLabel: valueDeltaLabel(valueDelta), valueMatch, valueMatchDetail: valueDeltaLabel(valueDelta),
    packageType, packageAssetCount: outgoingAssets.length, confidence: valueMatch === 'fair' ? 'medium' : 'low', confidenceReasons: ['Exploratory package only; AI acceptance is not guaranteed.'],
    warnings, feasibilityLabel: valueMatch === 'fair' ? 'likely_reasonable' : valueMatch === 'expensive' ? 'needs_more_value' : 'long_shot', frameworkType: packageType,
    capImpact, capImpactLabel: 'cap impact unknown', fitScore: clamp(100 - Math.abs(valueDelta) + need.needScore, 1, 99), recommendation: valueMatch === 'unrealistic' ? 'avoid' : 'consider', reason: `Possible package to address ${need.pos}.`,
  };
}

const sortAndCapTradeIdeas = (ideas = [], userTeamId) => ideas.filter((i) => num(i.targetTeamId) !== userTeamId).sort((a, b) => b.fitScore - a.fitScore).slice(0, 15);

export function buildTradeFinderAnalysis({ userTeam, league = {}, teams = [], userRoster = [], leaguePlayers = [], cap = {}, footballConfig = FOOTBALL_ROSTER_CONFIG }) {
  const userTeamId = num(userTeam?.id, -1); const targetNeeds = Object.values(buildNeedMap(userRoster, footballConfig)).sort((a, b) => b.needScore - a.needScore).slice(0, 6);
  const { userSurplus, chipPool, nonStarterIds } = buildUserSurplus(userRoster, footballConfig);
  const userPickChips = getTeamDraftPicks(userTeam, league).map((p) => buildDraftPickChip(p, userTeamId)).filter((p) => p?.pickId);
  const userAssets = [...chipPool, ...userPickChips];
  const ideas = [];
  for (const need of targetNeeds.slice(0, 4)) for (const target of getTargetCandidatesForNeed({ need, leaguePlayers, userTeamId })) {
    const targetValue = getPlayerValueSafe(target);
    const base = chipPool.find((c) => c.pos === target.pos) ?? chipPool[0]; if (!base) continue;
    ideas.push(buildIdea({ need, target, outgoingAssets: [base], teams, userRoster, packageType: 'one_for_one' }));
    if (targetValue - base.valueScore > 25 && userPickChips.length) ideas.push(buildIdea({ need, target, outgoingAssets: [base, userPickChips[0]], teams, userRoster, packageType: 'player_plus_pick' }));
    const extra = chipPool.find((c) => c.playerId !== base.playerId && nonStarterIds.has(c.playerId));
    if (targetValue - base.valueScore > 60 && extra) ideas.push(buildIdea({ need, target, outgoingAssets: [base, extra], teams, userRoster, packageType: 'two_players' }));
    if (num(base.salary,0) >= 10 && userPickChips.length) ideas.push(buildIdea({ need, target, outgoingAssets: [base, userPickChips[userPickChips.length - 1]], teams, userRoster, packageType: 'cap_relief' }));
  }
  const tradeIdeas = sortAndCapTradeIdeas(ideas.filter((i) => i.packageAssetCount <= 3 && !(i.targetPos === 'K' || i.targetPos === 'P') || i.outgoingAssets.length <= 1), userTeamId);
  return { summary: { biggestNeed: targetNeeds[0] ?? null, strongestSurplus: userSurplus.sort((a, b) => b.surplusScore - a.surplusScore)[0] ?? null, bestTradeChip: chipPool[0] ?? null, topTarget: tradeIdeas[0] ?? null, capWarning: cap?.capRoom != null && num(cap.capRoom) < 0 ? 'Over cap: prioritize cap-neutral frameworks.' : null }, userSurplus, userTradeChips: chipPool.slice(0, 10), userPickChips: userPickChips.slice(0, 10), userAssets: userAssets.slice(0, 20), targetNeeds, tradeIdeas, filters: ['all', 'team_need', 'starter_upgrade', 'depth_patch', 'cap_relief', 'youth_upside', 'fair_value', 'avoid_risks', 'player_plus_pick', 'pick_included', 'multi_asset', 'high_confidence'] };
}
