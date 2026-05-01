import { buildRosterBuildingAnalysis } from '../rosterBuildingAnalysis.js';

const PREMIUM_POS = new Set(['QB', 'WR', 'OL', 'DL', 'CB']);
const num = (v, fb = null) => (Number.isFinite(Number(v)) ? Number(v) : fb);
const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));

function deriveDraftNeeds(teamBuilder, rosterAnalysis) {
  const source = teamBuilder?.positionGroups ?? rosterAnalysis?.positionGroups ?? [];
  return source.map((g) => {
    const level = g.needLevel === 'urgent' ? 'urgent' : g.needLevel === 'thin' ? 'thin' : 'stable';
    const targetRoundRange = ['QB', 'WR', 'OL', 'DL', 'CB'].includes(g.key)
      ? (level === 'urgent' ? 'Rounds 1-2' : 'Rounds 2-4')
      : (['K', 'P'].includes(g.key) ? 'Rounds 6-7' : 'Rounds 3-5');
    return {
      pos: g.key,
      needLevel: level,
      needScore: num(g.needScore, 0),
      reason: g.reason ?? 'Needs more data',
      targetRoundRange,
      priority: level === 'urgent' ? 'high' : level === 'thin' ? 'medium' : 'low',
    };
  }).sort((a, b) => b.needScore - a.needScore);
}

function buildPickAssets(draftPicks = [], teamId) {
  return draftPicks
    .filter((p) => Number(p?.teamId ?? teamId) === Number(teamId))
    .map((p) => {
      const round = num(p?.round, Math.ceil(num(p?.overall, 1) / 32));
      const pickValue = clamp(Math.round(100 - ((round - 1) * 13) - (num(p?.pick, 1) * 0.7)), 5, 100);
      return {
        pickId: p?.id ?? `${p?.year ?? 'y'}-${round}-${p?.pick ?? p?.overall ?? 1}`,
        year: p?.year ?? null,
        round,
        originalTeamId: p?.originalTid ?? p?.originalTeamId ?? null,
        label: `R${round}${p?.pick ? ` Pick ${p.pick}` : ''}`,
        pickValue,
        targetTier: round <= 1 ? 'premium' : round <= 3 ? 'starter' : round <= 5 ? 'rotation' : round === 6 ? 'depth' : 'stash',
        reason: round <= 2 ? 'Early pick can target premium impact roles.' : 'Later pick best used for depth/development value.',
      };
    })
    .sort((a, b) => a.round - b.round);
}

export function buildDraftBoardAnalysis({ team, roster = [], prospects = [], draftPicks = [], teamBuilder = null }) {
  const rosterAnalysis = !teamBuilder ? buildRosterBuildingAnalysis({ team, roster, draftPicks }) : null;
  const draftNeeds = deriveDraftNeeds(teamBuilder, rosterAnalysis);
  const needMap = new Map(draftNeeds.map((n) => [n.pos, n]));
  const pickAssets = buildPickAssets(draftPicks, team?.id);
  const firstPickRound = pickAssets[0]?.round ?? null;

  const prospectRows = prospects.map((p) => {
    const need = needMap.get(p?.pos) ?? { needLevel: 'stable', needScore: 15 };
    const ovr = num(p?.ovr, null);
    const potential = num(p?.potential ?? p?.truePotential, null);
    const age = num(p?.age, null);
    const projectedRound = num(p?.projectedRound ?? p?.mockRound, null);
    const confidenceRaw = num(p?.scoutingConfidence ?? p?.scouting?.confidence, null);
    const scoutingConfidence = confidenceRaw == null ? 'unknown' : confidenceRaw >= 75 ? 'high' : confidenceRaw >= 55 ? 'medium' : 'low';
    const schemeFit = num(p?.schemeFit, null);
    const riskFlags = [];
    if (age != null && age >= 24) riskFlags.push('old_prospect');
    if (schemeFit != null && schemeFit < 50) riskFlags.push('low_scheme_fit');
    if (num(p?.injuryRisk, 0) >= 65 || p?.injuryTag) riskFlags.push('injury');
    if (ovr != null && potential != null && potential - ovr <= 3) riskFlags.push('low_floor');
    if (scoutingConfidence === 'unknown' || (ovr == null && potential == null)) riskFlags.push('unknown_eval');
    if (num(p?.rawness, 0) >= 60 || p?.developmental) riskFlags.push('raw');

    const posWeight = PREMIUM_POS.has(p?.pos) ? 10 : (['K', 'P'].includes(p?.pos) ? -10 : 0);
    const needBoost = need.needLevel === 'urgent' ? 32 : need.needLevel === 'thin' ? 18 : 6;
    const upsideBoost = potential == null || ovr == null ? 0 : clamp((potential - ovr) * 1.6, 0, 20);
    const ratingBase = (ovr ?? 60) * 0.55 + (potential ?? (ovr ?? 60)) * 0.25;
    const schemeBoost = schemeFit == null ? 0 : (schemeFit - 50) * 0.3;
    const riskPenalty = riskFlags.includes('injury') ? 10 : 0;
    const fitScore = Math.round(clamp(ratingBase + needBoost + upsideBoost + schemeBoost + posWeight - riskPenalty, 1, 100));

    const pickValueFit = projectedRound == null || firstPickRound == null ? 'unknown' : projectedRound >= firstPickRound + 2 ? 'reach' : projectedRound <= firstPickRound - 1 ? 'bargain' : 'fair_value';
    const roleProjection = fitScore >= 80 ? 'starter_path' : fitScore >= 65 ? 'depth_patch' : upsideBoost >= 12 ? 'development_stash' : p?.pos === 'K' || p?.pos === 'P' ? 'special_teams' : 'low_fit';
    const recommendation = fitScore >= 82 && !riskFlags.includes('unknown_eval') ? 'target' : fitScore >= 68 ? 'consider' : fitScore >= 55 ? 'watch' : 'avoid';

    return {
      prospectId: p?.id,
      name: p?.name ?? 'Unknown prospect',
      pos: p?.pos ?? 'UNK',
      age,
      projectedRound,
      ovr,
      potential,
      scoutGrade: p?.scoutGrade ?? p?.scoutingGrade ?? null,
      scoutingConfidence,
      schemeFit,
      combineSummary: p?.combineSummary ?? null,
      currentTeamNeedLevel: need.needLevel,
      currentTeamNeedScore: need.needScore,
      pickValueFit,
      roleProjection,
      riskFlags,
      fitScore,
      recommendation,
      reason: `${need.needLevel} ${p?.pos ?? ''} need${pickValueFit !== 'unknown' ? ` · ${pickValueFit} value` : ''}`.trim(),
    };
  }).sort((a, b) => b.fitScore - a.fitScore);

  const topFits = prospectRows.slice(0, 10);
  const safePicks = prospectRows.filter((p) => !p.riskFlags.some((f) => ['injury', 'raw', 'unknown_eval'].includes(f))).slice(0, 5);
  const upsidePicks = prospectRows.filter((p) => (num(p.potential, 0) - num(p.ovr, 0) >= 10) && num(p.age, 99) <= 22).slice(0, 5);
  const riskFlags = prospectRows.filter((p) => p.riskFlags.length > 0).slice(0, 8);

  return {
    summary: {
      biggestNeed: draftNeeds[0] ?? null,
      bestProspectFit: topFits[0] ?? null,
      safestPick: safePicks[0] ?? null,
      highestUpsidePick: upsidePicks[0] ?? null,
      nextPick: pickAssets[0] ?? null,
    },
    draftNeeds,
    pickAssets,
    prospectRows,
    topFits,
    safePicks,
    upsidePicks,
    riskFlags,
    filters: ['all', 'need', 'starter_path', 'young_upside', 'safe_pick', 'high_risk', 'bargain'],
  };
}
