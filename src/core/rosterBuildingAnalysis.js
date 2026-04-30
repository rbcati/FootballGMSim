const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];

const avg = (arr = []) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
const num = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);

function yearsRemaining(player) {
  return num(player?.contract?.yearsRemaining ?? player?.contract?.years ?? player?.years ?? 0, 0);
}

export function buildRosterBuildingAnalysis({ team, roster = [], cap = {}, freeAgents = [], draftPicks = [] } = {}) {
  const positionGroups = POSITION_GROUPS.map((key) => {
    const players = roster.filter((p) => p?.pos === key);
    const sorted = [...players].sort((a, b) => num(b?.schemeAdjustedOVR ?? b?.ovr) - num(a?.schemeAdjustedOVR ?? a?.ovr));
    const starterOVR = num(sorted[0]?.schemeAdjustedOVR ?? sorted[0]?.ovr, 0);
    const topThreeOVR = avg(sorted.slice(0, 3).map((p) => num(p?.schemeAdjustedOVR ?? p?.ovr, 0)));
    const depthScore = Math.round(topThreeOVR);
    const ageRisk = Math.round(avg(players.map((p) => Math.max(0, num(p?.age, 26) - 26) * 4)));
    const injuryRisk = Math.round(avg(players.map((p) => (String(p?.status ?? '').toLowerCase().includes('inj') ? 70 : 20))));
    const schemeFit = Math.round(avg(players.map((p) => num(p?.schemeFit, 50))));
    const expiringCount = players.filter((p) => yearsRemaining(p) <= 1).length;
    const contractRisk = players.length ? Math.round((expiringCount / players.length) * 100) : 0;
    const needScore = (starterOVR < 68 ? 3 : 0) + (depthScore < 65 ? 3 : 0) + (players.length <= 1 ? 4 : 0) + (ageRisk > 45 ? 1 : 0);
    const needLevel = needScore >= 7 ? 'urgent' : needScore >= 5 ? 'thin' : starterOVR >= 84 && depthScore >= 78 ? 'elite' : starterOVR >= 78 ? 'strong' : 'stable';
    const reason = players.length === 0 ? 'Needs more data' : `Starter ${starterOVR} • depth ${depthScore} • ${expiringCount} expiring soon`;
    return { key, starterOVR, topThreeOVR: Math.round(topThreeOVR), depthScore, ageRisk, injuryRisk, schemeFit, contractRisk, needLevel, reason };
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

  const urgent = positionGroups.find((g) => g.needLevel === 'urgent') ?? positionGroups.find((g) => g.needLevel === 'thin');
  const recommendedActions = [
    urgent ? { label: `Find ${urgent.key} depth before advancing`, priority: 'high', targetArea: 'depth', route: 'Team:Roster / Depth', reason: urgent.reason } : null,
    expiringContracts[0] ? { label: `Review ${expiringContracts[0].pos} extension decision`, priority: 'high', targetArea: 'extension', route: 'Team:Roster / Depth', reason: expiringContracts[0].reason } : null,
    payrollPressure === 'high' || payrollPressure === 'critical' ? { label: 'Audit cap pressure and restructure options', priority: 'high', targetArea: 'trade', route: 'Cap Manager', reason: 'Limited cap room may block near-term moves.' } : null,
    developmentTargets[0] ? { label: `Train ${developmentTargets[0].pos} group this week`, priority: 'medium', targetArea: 'training', route: 'Training', reason: developmentTargets[0].reason } : null,
    freeAgents.length > 0 && urgent ? { label: `Check free agency for ${urgent.key}`, priority: 'medium', targetArea: 'freeAgency', route: 'Free Agency', reason: 'Need flagged and market appears available.' } : null,
    draftPicks.length > 0 && urgent ? { label: `Prioritize ${urgent.key} on draft board`, priority: 'low', targetArea: 'draft', route: 'Draft', reason: 'Roster pressure can be buffered with rookie contracts.' } : null,
  ].filter(Boolean).slice(0, 6);

  return { positionGroups, capSummary, expiringContracts, valueRisks, developmentTargets, recommendedActions };
}
