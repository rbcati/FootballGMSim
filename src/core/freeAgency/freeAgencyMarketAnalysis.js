import { buildRosterBuildingAnalysis } from '../rosterBuildingAnalysis.js';

const num = (v, fb = null) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
const COST_KEYS = [
  { key: 'contractDemand.baseAnnual', source: 'contractDemand' },
  { key: 'contractDemand.annual', source: 'contractDemand' },
  { key: 'desiredContract.baseAnnual', source: 'desiredContract' },
  { key: 'desiredContract.annual', source: 'desiredContract' },
  { key: 'askingPrice', source: 'ask' },
  { key: 'ask', source: 'ask' },
  { key: 'contract.baseAnnual', source: 'staleContract' },
  { key: 'baseAnnual', source: 'unknown' },
];

const getPath = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
const getCostInfo = (player) => {
  for (const { key, source } of COST_KEYS) {
    const value = num(getPath(player, key));
    if (value != null && value > 0) return { value, source };
  }
  return { value: null, source: 'unknown' };
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
  const recommendationRankMap = { pursue: 4, consider: 3, watch: 2, avoid: 1 };
  const capFitRankMap = { affordable: 4, tight: 3, expensive: 2, unknown: 1 };

  const marketRows = freeAgents.map((p) => {
    const group = needMap.get(p?.pos);
    const needScore = num(group?.needScore, 0);
    const needLevel = group?.needLevel ?? 'stable';
    const schemeFit = num(p?.schemeFit, num(p?._eval?.schemeFit?.score, null));
    const age = num(p?.age, null);
    const ovr = num(p?.ovr, 0);
    const potential = num(p?.potential, ovr);
    const { value: cost, source: costSource } = getCostInfo(p);
    const starter = starterByPos[p?.pos];
    const replacementDelta = starter ? ovr - num(starter?.ovr, 0) : null;
    const projectedCapRoomAfterSigning = cost != null && capRoom != null ? Number((capRoom - cost).toFixed(1)) : null;
    const replacementDeltaLabel = starter
      ? `${replacementDelta >= 0 ? "+" : ""}${replacementDelta} vs starter`
      : "No current starter";
    const capImpactLabel = projectedCapRoomAfterSigning == null ? "cost unknown" : `$${projectedCapRoomAfterSigning.toFixed(1)}M after signing`;

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
    const marketTier = recommendation === 'avoid'
      ? 'avoid'
      : ovr >= 88
        ? 'premium'
        : ovr >= 80
          ? 'starter'
          : ovr >= 73
            ? 'rotation'
            : age != null && age <= 24 && potential > ovr
              ? 'stash'
              : 'depth';
    const valueTag = cost == null
      ? 'unknown'
      : fitScore >= 74 && cost <= 6
        ? 'bargain'
        : fitScore >= 60 && cost <= 12
          ? 'fair'
          : 'expensive';
    const needFitTag = ['K', 'P'].includes(p?.pos) && !isUrgentNeed
      ? 'low_priority'
      : isUrgentNeed
        ? 'urgent_need'
        : needScore >= 35
          ? 'team_need'
          : fitScore >= 75
            ? 'luxury'
            : 'low_priority';
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
      costSource,
      years: num(p?.contractDemand?.years ?? p?.desiredContract?.years ?? p?.years, null),
      currentTeamNeedLevel: needLevel,
      currentTeamNeedScore: needScore,
      replacementDelta,
      replacementDeltaLabel,
      currentStarterName: starter?.name ?? null,
      currentStarterOVR: starter ? num(starter?.ovr, null) : null,
      currentStarterAge: starter ? num(starter?.age, null) : null,
      currentUnitOVR: group ? num(group?.currentUnitOvr ?? group?.unitOvr, null) : null,
      capFit,
      projectedCapRoomAfterSigning,
      capImpactLabel,
      roleFit,
      marketTier,
      valueTag,
      needFitTag,
      riskFlags,
      fitScore,
      recommendation,
      sortKeys: {
        fitScore,
        ovr,
        age: age ?? null,
        cost: cost ?? null,
        replacementDelta: replacementDelta ?? null,
        schemeFit: schemeFit ?? null,
        recommendationRank: recommendationRankMap[recommendation] ?? 0,
        capFitRank: capFitRankMap[capFit] ?? 0,
      },
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
