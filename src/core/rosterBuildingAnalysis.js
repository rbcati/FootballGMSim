import { FOOTBALL_ROSTER_CONFIG } from './sports/footballRosterConfig.js';

const avg = (arr = []) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

const getPlayerOVR = (player) => num(player?.schemeAdjustedOVR ?? player?.ovr, 0);
const getPlayerSalary = (player) => num(player?.contract?.baseAnnual ?? player?.baseAnnual, null);
const getYearsRemaining = (player) => num(player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.years ?? 0, 0);
const getPlayersForPositionGroup = (roster, key) => roster.filter((p) => p?.pos === key);

const scoreReplacementCandidate = ({ player, group, needScore }) => {
  const ovr = getPlayerOVR(player);
  const potential = num(player?.potential, ovr);
  const fit = num(player?.schemeFit, 55);
  const age = num(player?.age, 27);
  const upside = clamp((potential - ovr) * 8, 0, 30);
  const ageAdj = age <= 26 ? 8 : age >= 31 ? -8 : 0;
  const urgencyAdj = group.needLevel === 'urgent' ? 0 : 4;
  return Math.round(clamp((ovr * 0.6) + (fit * 0.25) + upside + ageAdj - (needScore * 0.08) + urgencyAdj, 1, 99));
};

const buildCandidateAction = (type, payload) => ({ type, ...payload });

function buildReplacementBoardForGroup({ group, roster, freeAgents, draftPicks, developmentTargets, capSummary }) {
  const samePos = getPlayersForPositionGroup(roster, group.key).sort((a, b) => getPlayerOVR(b) - getPlayerOVR(a));
  const internalPool = samePos.slice(group.starterCountExpected, group.starterCountExpected + 3);
  const internalOptions = internalPool.map((p) => ({
    id: p.id,
    name: p.name,
    pos: p.pos,
    age: p.age ?? null,
    ovr: getPlayerOVR(p),
    potential: p.potential ?? null,
    schemeFit: num(p?.schemeFit, 55),
    contract: getPlayerSalary(p) != null ? `$${getPlayerSalary(p)}M` : 'Unknown cost',
    reason: 'Internal depth option for role promotion or rotational usage.',
    fitScore: scoreReplacementCandidate({ player: p, group, needScore: group.needScore }),
  }));

  const freeAgentOptions = freeAgents.filter((p) => p?.pos === group.key).sort((a, b) => getPlayerOVR(b) - getPlayerOVR(a)).slice(0, 3).map((p, idx) => ({
    id: p.id,
    name: p.name,
    pos: p.pos,
    age: p.age ?? null,
    ovr: getPlayerOVR(p),
    potential: p.potential ?? null,
    baseAnnual: getPlayerSalary(p),
    schemeFit: num(p?.schemeFit, 55),
    reason: idx === 0 ? 'Best available FA option in current market cache.' : 'Possible short-term patch depending on fit and cap.',
    fitScore: scoreReplacementCandidate({ player: p, group, needScore: group.needScore }),
  }));

  const dev = developmentTargets.find((d) => d.pos === group.key);
  const trainingOptions = dev ? [{
    playerId: dev.id,
    playerName: dev.name,
    recommendedTrainingGroup: group.key,
    reason: 'Development target aligns with current roster need.',
    expectedPath: group.needLevel === 'urgent' ? 'depth_growth' : 'long_term_project',
  }] : [];

  const draftPriority = draftPicks.length === 0
    ? { priority: 'none', reason: 'No draft picks available to assign.', targetRoundRange: null }
    : group.key === 'QB' && group.needLevel === 'urgent'
      ? { priority: 'high', reason: 'Urgent QB weakness; rookie pipeline should be prioritized.', targetRoundRange: 'Rounds 1-2' }
      : ['OL', 'CB', 'WR', 'DL'].includes(group.key) && (group.needLevel === 'urgent' || group.needLevel === 'thin')
        ? { priority: 'medium', reason: 'Core unit depth can be stabilized via rookie contracts.', targetRoundRange: 'Rounds 2-4' }
        : ['K', 'P'].includes(group.key)
          ? { priority: 'low', reason: 'Special teams are lower draft priority unless starter quality collapses.', targetRoundRange: 'Rounds 6-7' }
          : { priority: 'medium', reason: 'Need exists but immediate starter replacement is uncertain.', targetRoundRange: 'Rounds 3-5' };

  const bestInternal = internalOptions[0] ?? null;
  const bestFA = freeAgentOptions[0] ?? null;
  const capTight = capSummary?.payrollPressure === 'high' || capSummary?.payrollPressure === 'critical';
  const tradeSearch = {
    enabled: group.needLevel === 'urgent' && !bestInternal && !bestFA,
    reason: group.needLevel === 'urgent' && !bestInternal && !bestFA ? 'No internal/FA path found for urgent need.' : 'Current board has at least one immediate non-trade option.',
    targetType: !bestFA && !bestInternal ? 'starter_upgrade' : 'depth_patch',
    warning: capTight ? 'Cap pressure is high; trade flexibility may be constrained.' : undefined,
  };

  let bestAction = { type: 'draft', label: 'Long-term fix: add to draft board.' };
  if (bestInternal && bestInternal.fitScore >= 62) bestAction = { type: 'internal', label: 'Internal fix: promote backup before spending.' };
  else if (bestFA && (!capTight || bestFA.fitScore >= 78) && bestFA.fitScore >= (bestInternal?.fitScore ?? 0) + 5) bestAction = { type: 'freeAgency', label: 'Short-term fix: review FA market.' };
  else if (trainingOptions.length > 0 && group.needLevel !== 'urgent') bestAction = { type: 'training', label: 'Development fix: train this group this week.' };
  else if (tradeSearch.enabled) bestAction = { type: 'trade', label: 'Trade search: no FA/internal fix found.' };

  return {
    key: group.key,
    label: group.label,
    needLevel: group.needLevel,
    primaryIssue: group.primaryIssue,
    summary: group.reason,
    internalOptions,
    freeAgentOptions,
    draftPriority,
    trainingOptions,
    tradeSearch,
    bestAction,
  };
}

function toRoute(type) {
  return type === 'freeAgency' ? 'Free Agency' : type === 'trade' ? 'Trade Center' : type === 'draft' ? 'Draft' : type === 'training' ? 'Training' : type === 'extension' ? 'Contract Center' : 'Team:Roster / Depth';
}

export function buildRosterBuildingAnalysis({ team, roster = [], cap = {}, freeAgents = [], draftPicks = [] } = {}) {
  const { positionGroups: positions, groupConfig } = FOOTBALL_ROSTER_CONFIG;
  const positionGroups = positions.map((key) => {
    const cfg = groupConfig[key];
    const players = getPlayersForPositionGroup(roster, key);
    const sorted = [...players].sort((a, b) => getPlayerOVR(b) - getPlayerOVR(a));
    const topWindow = sorted.slice(0, cfg.starterCountExpected);
    const depthWindow = sorted.slice(0, cfg.depthSlots);
    const unitOVR = Math.round(avg(depthWindow.map((p) => getPlayerOVR(p))));
    const starterOVR = Math.round(avg(topWindow.map((p) => getPlayerOVR(p))));
    const starterCountAvailable = Math.min(cfg.starterCountExpected, sorted.length);
    const depthScore = Math.round(avg(depthWindow.map((p) => getPlayerOVR(p))));
    const ageThreshold = cfg.ageThreshold ?? 28;
    const ageRisk = Math.round(avg(players.map((p) => clamp((num(p?.age, ageThreshold) - ageThreshold) * 8, 0, 100))));
    const injuryRisk = Math.round(avg(players.map((p) => (String(p?.status ?? '').toLowerCase().includes('inj') ? 70 : 18))));
    const schemeFit = Math.round(avg(players.map((p) => num(p?.schemeFit, 55))));
    const expiringCount = players.filter((p) => getYearsRemaining(p) <= 1).length;
    const contractRisk = players.length ? Math.round((expiringCount / players.length) * 100) : 0;
    const starterNeed = clamp(80 - starterOVR);
    const depthNeed = clamp(76 - depthScore + ((cfg.starterCountExpected - starterCountAvailable) * 8));
    const schemeNeed = clamp(60 - schemeFit);
    let needScore = Math.round(clamp((starterNeed * cfg.weights.starter + depthNeed * cfg.weights.depth + ageRisk * cfg.weights.age + injuryRisk * cfg.weights.injury + schemeNeed * cfg.weights.scheme + contractRisk * 0.08) * cfg.priority));
    if (key === 'QB' && starterOVR <= 66) needScore = Math.max(needScore, 68);
    if (key === 'OL' && depthScore <= 66) needScore = Math.max(needScore, 50);
    const issues = [{ key: 'starter_quality', score: starterNeed }, { key: 'depth', score: depthNeed }, { key: 'age', score: ageRisk }, { key: 'injury', score: injuryRisk }, { key: 'scheme_fit', score: schemeNeed }, { key: 'contract', score: contractRisk }].sort((a, b) => b.score - a.score);
    const primaryIssue = players.length === 0 ? 'none' : (issues[0]?.score > 20 ? issues[0].key : 'none');
    const secondaryIssues = issues.filter((i) => i.key !== primaryIssue && i.score > 18).slice(0, 2).map((i) => i.key);
    const needLevel = needScore >= 60 ? 'urgent' : needScore >= 45 ? 'thin' : needScore <= 18 && starterOVR >= 83 ? 'elite' : needScore <= 28 ? 'strong' : 'stable';
    return { key, label: cfg.label, unitOVR, starterOVR, starterCountExpected: cfg.starterCountExpected, starterCountAvailable, depthScore, ageRisk, injuryRisk, schemeFit, contractRisk, needLevel, needScore, primaryIssue, secondaryIssues, reason: players.length === 0 ? 'Needs more data' : `Starter ${starterOVR} • depth ${depthScore} • ${expiringCount} expiring soon` };
  });

  const capRoom = num(cap?.capRoom ?? team?.capRoom, 0);
  const capUsed = num(cap?.capUsed ?? team?.capUsed, 0);
  const deadCap = num(cap?.deadCap ?? team?.deadCap, 0);
  const pressureRatio = capUsed > 0 ? deadCap / Math.max(capUsed, 1) : 0;
  const payrollPressure = capRoom < 0 ? 'critical' : capRoom < 8 || pressureRatio > 0.2 ? 'high' : capRoom < 20 ? 'medium' : 'low';
  const capSummary = { capRoom, capUsed, deadCap, payrollPressure, summary: `Cap room ${capRoom.toFixed(1)}M with ${deadCap.toFixed(1)}M dead cap.` };

  const developmentTargets = roster.filter((p) => num(p?.age) <= 24 && num(p?.potential) > num(p?.ovr) && num(p?.schemeFit, 50) >= 55).sort((a, b) => (num(b?.potential) - num(b?.ovr)) - (num(a?.potential) - num(a?.ovr))).slice(0, 5).map((p) => ({ id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, potential: p.potential, recommendedTrainingGroup: p.pos, reason: 'Young upside with scheme-compatible development path.' }));
  const expiringContracts = roster.filter((p) => getYearsRemaining(p) <= 1).sort((a, b) => num(b?.ovr) - num(a?.ovr)).slice(0, 5).map((p) => ({ id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, potential: p.potential ?? null, baseAnnual: getPlayerSalary(p), yearsRemaining: getYearsRemaining(p), priority: num(p?.ovr) >= 82 ? 'must_keep' : 'consider', reason: 'Evaluate market alternatives before re-signing.' }));
  const valueRisks = roster.filter((p) => num(p?.age) >= 30 && (num(getPlayerSalary(p)) >= 12 || num(p?.schemeFit, 50) < 45 || num(p?.ovr) < 72)).slice(0, 5).map((p) => ({ id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, capHit: num(getPlayerSalary(p), 0), reason: 'Possible value risk: age/cost/fit profile may reduce return.' }));

  const replacementBoards = positionGroups.map((group) => buildReplacementBoardForGroup({ group, roster, freeAgents, draftPicks, developmentTargets, capSummary }));

  const candidateActions = replacementBoards.flatMap((board) => {
    const actions = [];
    if (board.internalOptions[0]) actions.push(buildCandidateAction('internal', { label: `Promote ${board.internalOptions[0].name} for ${board.key} depth`, priority: 'high', playerId: board.internalOptions[0].id, playerName: board.internalOptions[0].name, pos: board.key, route: toRoute('internal'), reason: board.internalOptions[0].reason }));
    if (board.freeAgentOptions[0]) actions.push(buildCandidateAction('freeAgency', { label: `Review best available FA at ${board.key}`, priority: 'medium', playerId: board.freeAgentOptions[0].id, playerName: board.freeAgentOptions[0].name, pos: board.key, route: toRoute('freeAgency'), reason: board.freeAgentOptions[0].reason }));
    if (board.draftPriority.priority !== 'none') actions.push(buildCandidateAction('draft', { label: `Queue ${board.key} for draft board`, priority: 'low', pos: board.key, route: toRoute('draft'), reason: board.draftPriority.reason }));
    if (board.trainingOptions[0]) actions.push(buildCandidateAction('training', { label: `Boost ${board.key} development reps`, priority: 'medium', playerId: board.trainingOptions[0].playerId, playerName: board.trainingOptions[0].playerName, pos: board.key, route: toRoute('training'), reason: board.trainingOptions[0].reason }));
    if (board.tradeSearch.enabled) actions.push(buildCandidateAction('trade', { label: `Scan trade market for ${board.key}`, priority: 'medium', pos: board.key, route: toRoute('trade'), reason: board.tradeSearch.reason }));
    return actions;
  });

  const urgent = positionGroups.find((g) => g.needLevel === 'urgent') ?? positionGroups.find((g) => g.needLevel === 'thin');
  const recommendedActions = [...candidateActions.slice(0, 3), draftPicks.length > 0 && urgent ? { label: `Prioritize ${urgent.key} on draft board`, priority: 'low', targetArea: 'draft', route: 'Draft', reason: 'Roster pressure can be buffered with rookie contracts.' } : null].filter(Boolean).slice(0, 6);

  return { positionGroups, capSummary, expiringContracts, valueRisks, developmentTargets, replacementBoards, candidateActions: candidateActions.slice(0, 12), recommendedActions };
}
