const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

const GROUP_CONFIG = {
  QB: { label: 'Quarterbacks', starterCountExpected: 1, depthSlots: 2, weights: { starter: 0.65, depth: 0.2, age: 0.05, injury: 0.05, scheme: 0.05 }, priority: 1.2 },
  RB: { label: 'Running Backs', starterCountExpected: 1, depthSlots: 3, weights: { starter: 0.35, depth: 0.35, age: 0.15, injury: 0.1, scheme: 0.05 }, priority: 0.95, ageThreshold: 27 },
  WR: { label: 'Wide Receivers', starterCountExpected: 3, depthSlots: 5, weights: { starter: 0.45, depth: 0.35, age: 0.05, injury: 0.1, scheme: 0.05 }, priority: 1.05 },
  TE: { label: 'Tight Ends', starterCountExpected: 1, depthSlots: 2, weights: { starter: 0.45, depth: 0.35, age: 0.05, injury: 0.1, scheme: 0.05 }, priority: 0.9 },
  OL: { label: 'Offensive Line', starterCountExpected: 5, depthSlots: 7, weights: { starter: 0.4, depth: 0.35, age: 0.08, injury: 0.1, scheme: 0.07 }, priority: 1.15 },
  DL: { label: 'Defensive Line', starterCountExpected: 4, depthSlots: 6, weights: { starter: 0.45, depth: 0.3, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1.0 },
  LB: { label: 'Linebackers', starterCountExpected: 3, depthSlots: 5, weights: { starter: 0.45, depth: 0.3, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1.0 },
  CB: { label: 'Cornerbacks', starterCountExpected: 3, depthSlots: 5, weights: { starter: 0.45, depth: 0.3, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1.05 },
  S: { label: 'Safeties', starterCountExpected: 2, depthSlots: 4, weights: { starter: 0.5, depth: 0.25, age: 0.08, injury: 0.12, scheme: 0.05 }, priority: 1.0 },
  K: { label: 'Kickers', starterCountExpected: 1, depthSlots: 1, weights: { starter: 0.8, depth: 0.05, age: 0.05, injury: 0.05, scheme: 0.05 }, priority: 0.5 },
  P: { label: 'Punters', starterCountExpected: 1, depthSlots: 1, weights: { starter: 0.8, depth: 0.05, age: 0.05, injury: 0.05, scheme: 0.05 }, priority: 0.5 },
};

const avg = (arr = []) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

function yearsRemaining(player) {
  return num(player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.years ?? 0, 0);
}

function toRoute(type) {
  return type === 'freeAgency' ? 'Free Agency' : type === 'trade' ? 'Trade Center' : type === 'draft' ? 'Draft' : type === 'training' ? 'Training' : type === 'extension' ? 'Contract Center' : 'Team:Roster / Depth';
}

export function buildRosterBuildingAnalysis({ team, roster = [], cap = {}, freeAgents = [], draftPicks = [] } = {}) {
  const positionGroups = POSITION_GROUPS.map((key) => {
    const cfg = GROUP_CONFIG[key];
    const players = roster.filter((p) => p?.pos === key);
    const sorted = [...players].sort((a, b) => num(b?.schemeAdjustedOVR ?? b?.ovr) - num(a?.schemeAdjustedOVR ?? a?.ovr));
    const topWindow = sorted.slice(0, cfg.starterCountExpected);
    const depthWindow = sorted.slice(0, cfg.depthSlots);
    const unitOVR = Math.round(avg(depthWindow.map((p) => num(p?.schemeAdjustedOVR ?? p?.ovr, 0))));
    const starterOVR = Math.round(avg(topWindow.map((p) => num(p?.schemeAdjustedOVR ?? p?.ovr, 0))));
    const starterCountAvailable = Math.min(cfg.starterCountExpected, sorted.length);
    const depthScore = Math.round(avg(depthWindow.map((p) => num(p?.schemeAdjustedOVR ?? p?.ovr, 0))));
    const ageThreshold = cfg.ageThreshold ?? 28;
    const ageRisk = Math.round(avg(players.map((p) => clamp((num(p?.age, ageThreshold) - ageThreshold) * 8, 0, 100))));
    const injuryRisk = Math.round(avg(players.map((p) => (String(p?.status ?? '').toLowerCase().includes('inj') ? 70 : 18))));
    const schemeFit = Math.round(avg(players.map((p) => num(p?.schemeFit, 55))));
    const expiringCount = players.filter((p) => yearsRemaining(p) <= 1).length;
    const contractRisk = players.length ? Math.round((expiringCount / players.length) * 100) : 0;

    const starterNeed = clamp(80 - starterOVR);
    const depthNeed = clamp(76 - depthScore + ((cfg.starterCountExpected - starterCountAvailable) * 8));
    const schemeNeed = clamp(60 - schemeFit);
    let needScore = Math.round(clamp((starterNeed * cfg.weights.starter + depthNeed * cfg.weights.depth + ageRisk * cfg.weights.age + injuryRisk * cfg.weights.injury + schemeNeed * cfg.weights.scheme + contractRisk * 0.08) * cfg.priority));
    if (key === 'QB' && starterOVR <= 66) needScore = Math.max(needScore, 68);
    if (key === 'OL' && depthScore <= 66) needScore = Math.max(needScore, 50);

    const issues = [
      { key: 'starter_quality', score: starterNeed },
      { key: 'depth', score: depthNeed },
      { key: 'age', score: ageRisk },
      { key: 'injury', score: injuryRisk },
      { key: 'scheme_fit', score: schemeNeed },
      { key: 'contract', score: contractRisk },
    ].sort((a, b) => b.score - a.score);
    const primaryIssue = players.length === 0 ? 'none' : (issues[0]?.score > 20 ? issues[0].key : 'none');
    const secondaryIssues = issues.filter((i) => i.key !== primaryIssue && i.score > 18).slice(0, 2).map((i) => i.key);
    const needLevel = needScore >= 60 ? 'urgent' : needScore >= 45 ? 'thin' : needScore <= 18 && starterOVR >= 83 ? 'elite' : needScore <= 28 ? 'strong' : 'stable';
    const reason = players.length === 0 ? 'Needs more data' : `Starter ${starterOVR} • depth ${depthScore} • ${expiringCount} expiring soon`;
    const recommendedTargetType = primaryIssue === 'contract' ? 'extension' : primaryIssue === 'age' ? 'draft' : primaryIssue === 'scheme_fit' ? 'training' : primaryIssue === 'depth' ? 'internal_depth' : 'free_agent';

    return { key, label: cfg.label, unitOVR, starterOVR, starterCountExpected: cfg.starterCountExpected, starterCountAvailable, depthScore, ageRisk, injuryRisk, schemeFit, contractRisk, needLevel, needScore, primaryIssue, secondaryIssues, reason, recommendedTargetType };
  });

  const capRoom = num(cap?.capRoom ?? team?.capRoom, 0);
  const capUsed = num(cap?.capUsed ?? team?.capUsed, 0);
  const deadCap = num(cap?.deadCap ?? team?.deadCap, 0);
  const pressureRatio = capUsed > 0 ? deadCap / Math.max(capUsed, 1) : 0;
  const payrollPressure = capRoom < 0 ? 'critical' : capRoom < 8 || pressureRatio > 0.2 ? 'high' : capRoom < 20 ? 'medium' : 'low';
  const capSummary = { capRoom, capUsed, deadCap, payrollPressure, summary: `Cap room ${capRoom.toFixed(1)}M with ${deadCap.toFixed(1)}M dead cap.` };

  const expiringContracts = roster.filter((p) => yearsRemaining(p) <= 1).sort((a, b) => num(b?.ovr) - num(a?.ovr)).slice(0, 5).map((p) => {
    const highValue = num(p?.ovr) >= 82 || (num(p?.potential) - num(p?.ovr) >= 4);
    return { id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, potential: p.potential ?? null, baseAnnual: num(p?.contract?.baseAnnual ?? p?.baseAnnual, null), yearsRemaining: yearsRemaining(p), priority: highValue ? 'must_keep' : num(p?.ovr) >= 74 ? 'consider' : 'replaceable', reason: highValue ? 'Core contributor approaching expiry.' : 'Evaluate market alternatives before re-signing.' };
  });
  const valueRisks = roster.filter((p) => num(p?.age) >= 30 && (num(p?.contract?.baseAnnual ?? p?.baseAnnual) >= 12 || num(p?.schemeFit, 50) < 45 || num(p?.ovr) < 72)).slice(0, 5).map((p) => ({ id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, capHit: num(p?.contract?.baseAnnual ?? p?.baseAnnual, 0), reason: 'Possible value risk: age/cost/fit profile may reduce return.' }));
  const developmentTargets = roster.filter((p) => num(p?.age) <= 24 && num(p?.potential) > num(p?.ovr) && num(p?.schemeFit, 50) >= 55).sort((a, b) => (num(b?.potential) - num(b?.ovr)) - (num(a?.potential) - num(a?.ovr))).slice(0, 5).map((p) => ({ id: p.id, name: p.name, pos: p.pos, age: p.age, ovr: p.ovr, potential: p.potential, recommendedTrainingGroup: p.pos, reason: 'Young upside with scheme-compatible development path.' }));

  const candidateActions = [];
  positionGroups.filter((g) => g.needLevel === 'urgent' || g.needLevel === 'thin').slice(0, 3).forEach((group) => {
    const bench = roster.filter((p) => p?.pos === group.key).sort((a, b) => num(b.ovr) - num(a.ovr))[group.starterCountExpected] ?? null;
    if (bench) candidateActions.push({ label: `Promote ${bench.name} for ${group.key} depth`, type: 'internal', priority: 'high', playerId: bench.id, playerName: bench.name, pos: bench.pos, ovr: bench.ovr, potential: bench.potential ?? null, age: bench.age ?? null, route: toRoute('internal'), reason: 'Possible internal depth adjustment before external spending.' });
    const fa = freeAgents.filter((p) => p?.pos === group.key).sort((a, b) => num(b.ovr) - num(a.ovr))[0] ?? null;
    if (fa) candidateActions.push({ label: `Review best available FA at ${group.key}`, type: 'freeAgency', priority: 'medium', playerId: fa.id, playerName: fa.name, pos: fa.pos, ovr: fa.ovr, potential: fa.potential ?? null, age: fa.age ?? null, baseAnnual: num(fa?.contract?.baseAnnual ?? fa?.baseAnnual, null), route: toRoute('freeAgency'), reason: 'Possible short-term patch if fit and budget align.' });
    if (!fa && (payrollPressure === 'high' || payrollPressure === 'critical' || valueRisks.length > 0)) candidateActions.push({ label: `Scan trade market for ${group.key}`, type: 'trade', priority: 'medium', pos: group.key, route: toRoute('trade'), reason: 'No clear FA option in cache; trade exploration may be required.' });
    if (draftPicks.length > 0) candidateActions.push({ label: `Queue ${group.key} for draft board`, type: 'draft', priority: 'low', pos: group.key, route: toRoute('draft'), reason: 'Rookie contracts can stabilize medium-term roster depth.' });
    const dev = developmentTargets.find((p) => p.pos === group.key);
    if (dev) candidateActions.push({ label: `Boost ${group.key} development reps`, type: 'training', priority: 'medium', playerId: dev.id, playerName: dev.name, pos: dev.pos, ovr: dev.ovr, potential: dev.potential, age: dev.age, route: toRoute('training'), reason: 'Young player upside can address need internally over time.' });
  });

  if (!candidateActions.some((a) => a.type === 'training') && developmentTargets[0]) {
    const dev = developmentTargets[0];
    candidateActions.push({ label: `Develop ${dev.pos} pipeline reps`, type: 'training', priority: 'low', playerId: dev.id, playerName: dev.name, pos: dev.pos, ovr: dev.ovr, potential: dev.potential, age: dev.age, route: toRoute('training'), reason: 'Possible internal growth path from current development targets.' });
  }

  const urgent = positionGroups.find((g) => g.needLevel === 'urgent') ?? positionGroups.find((g) => g.needLevel === 'thin');
  const recommendedActions = [
    ...candidateActions.slice(0, 3),
    expiringContracts[0] ? { label: `Review ${expiringContracts[0].pos} extension decision`, priority: 'high', targetArea: 'extension', route: 'Contract Center', reason: expiringContracts[0].reason } : null,
    payrollPressure === 'high' || payrollPressure === 'critical' ? { label: 'Audit cap pressure and restructure options', priority: 'high', targetArea: 'trade', route: 'Cap Manager', reason: 'Limited cap room may block near-term moves.' } : null,
    developmentTargets[0] ? { label: `Train ${developmentTargets[0].pos} group this week`, priority: 'medium', targetArea: 'training', route: 'Training', reason: developmentTargets[0].reason } : null,
    draftPicks.length > 0 && urgent ? { label: `Prioritize ${urgent.key} on draft board`, priority: 'low', targetArea: 'draft', route: 'Draft', reason: 'Roster pressure can be buffered with rookie contracts.' } : null,
  ].filter(Boolean).slice(0, 6);

  return { positionGroups, capSummary, expiringContracts, valueRisks, developmentTargets, candidateActions: candidateActions.slice(0, 12), recommendedActions };
}
