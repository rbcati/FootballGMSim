import { buildRosterBuildingAnalysis } from '../rosterBuildingAnalysis.js';

const num = (v, fb = null) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const COST_KEYS = ['contractDemand.baseAnnual', 'contractDemand.annual', 'desiredContract.baseAnnual', 'desiredContract.annual', 'askingPrice', 'ask', 'contract.baseAnnual', 'baseAnnual'];

const getPath = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
const getCost = (player) => {
  for (const key of COST_KEYS) {
    const value = num(getPath(player, key));
    if (value != null && value > 0) return value;
  }
  return null;
};

export function buildFreeAgencyMarketAnalysis({ team = {}, roster = [], freeAgents = [], cap = {}, teamBuilder = null } = {}) {
  const fallbackAnalysis = buildRosterBuildingAnalysis({ team, roster, freeAgents, cap });
  const base = teamBuilder ?? fallbackAnalysis;
  const positionGroups = base?.positionGroups ?? [];
  const urgentNeeds = positionGroups.filter((g) => g.needLevel === 'urgent' || g.needLevel === 'thin').sort((a, b) => (b.needScore ?? 0) - (a.needScore ?? 0));
  const biggestNeed = urgentNeeds[0] ?? positionGroups.sort((a, b) => (b.needScore ?? 0) - (a.needScore ?? 0))[0] ?? null;
  const capRoom = num(cap?.capRoom ?? team?.capRoom, null);
  const capPressure = base?.capSummary?.payrollPressure ?? (capRoom == null ? 'unknown' : capRoom < 0 ? 'critical' : capRoom < 8 ? 'high' : capRoom < 20 ? 'medium' : 'low');
  const starterByPos = Object.fromEntries((Object.entries(roster.reduce((acc, p) => {
    const pos = p?.pos;
    if (!pos) return acc;
    acc[pos] ??= [];
    acc[pos].push(p);
    return acc;
  }, {}))).map(([pos, players]) => [pos, [...players].sort((a, b) => (num(b?.ovr, 0) - num(a?.ovr, 0)))[0]]));

  const needMap = new Map(positionGroups.map((g) => [g.key, g]));

  const marketRows = freeAgents.map((p) => {
    const group = needMap.get(p?.pos);
    const needScore = num(group?.needScore, 0);
    const needLevel = group?.needLevel ?? 'stable';
    const schemeFit = num(p?.schemeFit, num(p?._eval?.schemeFit?.score, null));
    const age = num(p?.age, null);
    const ovr = num(p?.ovr, 0);
    const potential = num(p?.potential, ovr);
    const cost = getCost(p);
    const starter = starterByPos[p?.pos];
    const replacementDelta = starter ? ovr - num(starter?.ovr, 0) : null;

    const isUrgentNeed = needLevel === 'urgent' || needLevel === 'thin';
    const needBoost = isUrgentNeed ? 18 : needScore >= 35 ? 8 : 0;
    const replacementBoost = replacementDelta == null ? 4 : replacementDelta >= 6 ? 22 : replacementDelta >= 1 ? 12 : replacementDelta >= -3 ? 4 : 0;
    const upsideBoost = age != null && age <= 25 && potential >= ovr + 4 ? 10 : 0;
    const schemeBoost = schemeFit == null ? 0 : Math.round((schemeFit - 50) * 0.25);
    const agePenalty = age == null ? 0 : age >= 33 ? 20 : age >= 30 ? 12 : 0;
    const rbAgePenalty = p?.pos === 'RB' && age != null && age >= 30 ? 10 : 0;
    const expensive = cost != null && capRoom != null && cost > Math.max(3, capRoom * 0.5);
    const capPenalty = cost == null || capRoom == null ? 0 : expensive ? (capPressure === 'high' || capPressure === 'critical' ? 22 : 12) : 0;
    const lowFitPenalty = schemeFit != null && schemeFit < 45 ? 12 : 0;
    const stPenalty = ['K', 'P'].includes(p?.pos) && !isUrgentNeed ? 12 : 0;

    const fitScore = Math.round(clamp(50 + needBoost + replacementBoost + upsideBoost + schemeBoost - agePenalty - rbAgePenalty - capPenalty - lowFitPenalty - stPenalty, 0, 100));

    const capFit = cost == null || capRoom == null ? 'unknown' : cost <= capRoom * 0.33 ? 'affordable' : cost <= capRoom ? 'tight' : 'expensive';
    const roleFit = replacementDelta != null && replacementDelta >= 5 ? 'starter_upgrade' : isUrgentNeed && replacementDelta != null && replacementDelta >= 0 ? 'depth_patch' : age != null && age <= 25 && potential >= ovr + 4 ? 'development_stash' : ['K', 'P'].includes(p?.pos) ? 'special_teams' : 'low_fit';
    const riskFlags = [
      age != null && age >= 30 ? 'old' : null,
      capFit === 'expensive' ? 'expensive' : null,
      schemeFit != null && schemeFit < 45 ? 'low_fit' : null,
      String(p?.status ?? '').toLowerCase().includes('inj') ? 'injury' : null,
      potential <= ovr ? 'low_upside' : null,
    ].filter(Boolean);

    const recommendation = fitScore >= 78 ? 'pursue' : fitScore >= 62 ? 'consider' : fitScore >= 45 ? 'watch' : 'avoid';
    const reason = replacementDelta != null && replacementDelta >= 5
      ? `Possible starter upgrade at ${p?.pos}.`
      : isUrgentNeed
        ? `Helps address ${p?.pos} need depth.`
        : age != null && age <= 25 && potential > ovr
          ? 'Young upside option for development.'
          : 'Market depth option with moderate fit.';

    return {
      playerId: p?.id,
      name: p?.name ?? 'Unknown',
      pos: p?.pos ?? 'UNK',
      age,
      ovr,
      potential,
      schemeFit,
      baseAnnual: cost,
      estimatedCost: cost,
      years: num(p?.contractDemand?.years ?? p?.desiredContract?.years ?? p?.years, null),
      currentTeamNeedLevel: needLevel,
      currentTeamNeedScore: needScore,
      replacementDelta,
      capFit,
      roleFit,
      riskFlags,
      fitScore,
      recommendation,
      reason,
      _player: p,
    };
  }).sort((a, b) => b.fitScore - a.fitScore);

  const topFits = marketRows.slice(0, 5);
  const bargainOptions = marketRows.filter((r) => (r.capFit === 'affordable' || (r.baseAnnual != null && r.baseAnnual <= 3)) && r.recommendation !== 'avoid').slice(0, 5);
  const shortTermPatches = marketRows.filter((r) => r.roleFit === 'depth_patch' || r.roleFit === 'starter_upgrade').slice(0, 5);
  const avoidRisks = marketRows.filter((r) => r.riskFlags.includes('old') || r.riskFlags.includes('expensive') || r.riskFlags.includes('low_fit')).slice(0, 5);

  return {
    summary: {
      capRoom,
      capPressure,
      biggestNeed,
      topFit: topFits[0] ?? null,
      bargainOption: bargainOptions[0] ?? null,
      totalFreeAgents: marketRows.length,
    },
    needs: urgentNeeds,
    marketRows,
    topFits,
    bargainOptions,
    shortTermPatches,
    avoidRisks,
    filters: {
      fitsTeamNeed: (row) => ['urgent', 'thin'].includes(row.currentTeamNeedLevel),
      affordable: (row) => row.capFit === 'affordable',
      starterUpgrades: (row) => row.roleFit === 'starter_upgrade',
      youngUpside: (row) => (row.age ?? 99) <= 25 && (row.potential ?? 0) > (row.ovr ?? 0),
      avoidRisks: (row) => row.recommendation === 'avoid' || row.riskFlags.length > 0,
    },
  };
}
