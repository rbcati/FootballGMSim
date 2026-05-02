function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function resolveStatus(player, league) {
  if (!player) return 'unknown';
  if (player.isRetired || player.retired) return 'retired';
  if (player.isProspect || player.prospect || player.draftEligible || league?.draftClass?.some((p) => (p.id ?? p.prospectId) === (player.id ?? player.prospectId))) return 'draft_prospect';
  if (player.teamId == null || player.teamId === 'FA') return 'free_agent';
  return 'roster';
}

function contractValueLabel(contract, ovr) {
  if (!contract) return 'unknown';
  const annual = toNum(contract.baseAnnual ?? contract.salary ?? contract.avgPerYear ?? contract.valuePerYear);
  if (annual == null || ovr == null) return 'unknown';
  const expected = Math.max(1, ovr) * 0.18;
  if (annual < expected * 0.85) return 'bargain';
  if (annual > expected * 1.15) return 'expensive';
  return 'fair';
}

function buildPositionStatSummary(pos, stats) {
  if (!stats) return { label: 'No tracked stats yet.', stats: [] };
  const p = (pos || '').toUpperCase();
  if (p === 'QB') return { label: 'QB production', stats: [
    ['Passing Yards', stats.passYd], ['TD', stats.passTD], ['INT', stats.interceptions], ['Completion %', stats.passAtt ? ((stats.passComp || 0) / stats.passAtt * 100).toFixed(1) : null], ['Sacks', stats.sacks],
  ] };
  if (p === 'RB' || p === 'FB') return { label: 'Rushing production', stats: [
    ['Rush Yards', stats.rushYd], ['TD', stats.rushTD], ['Yards/Carry', stats.rushAtt ? ((stats.rushYd || 0) / stats.rushAtt).toFixed(1) : null], ['Rec Yards', stats.recYd],
  ] };
  if (p === 'WR' || p === 'TE') return { label: 'Receiving production', stats: [
    ['Receptions', stats.receptions], ['Rec Yards', stats.recYd], ['TD', stats.recTD], ['Yards/Catch', stats.receptions ? ((stats.recYd || 0) / stats.receptions).toFixed(1) : null],
  ] };
  if (p === 'K') return { label: 'Kicking production', stats: [['FG', stats.fgMade], ['XP', stats.xpMade]] };
  if (p === 'P') return { label: 'Punting production', stats: [['Punts', stats.punts], ['Punt Avg', stats.punts ? ((stats.puntYards || 0) / stats.punts).toFixed(1) : null]] };
  return { label: 'Defensive production', stats: [['Tackles', stats.tackles], ['Sacks', stats.sacks], ['INT', stats.interceptions], ['Forced Fumbles', stats.forcedFumbles]] };
}

export function buildPlayerProfileAnalysis({ player, team, league, recentGames = [], userTeam, context }) {
  if (!player) return { identity: null, warnings: ['unknown_eval'] };
  const seasonStats = player.seasonStats ?? player.stats ?? null;
  const careerStats = player.careerStats ?? null;
  const status = resolveStatus(player, league);
  const ovr = toNum(player.ovr ?? player.ratings?.ovr);
  const potential = toNum(player.potential ?? player.ratings?.potential ?? player.pot);
  const schemeFit = toNum(player.schemeFit ?? player.ratings?.schemeFit);
  const potentialGap = potential != null && ovr != null ? potential - ovr : null;
  const contract = player.contract ?? null;

  const warnings = [];
  const contextRiskFlags = Array.isArray(context?.riskFlags) ? context.riskFlags.filter(Boolean) : [];
  if (!seasonStats && !careerStats) warnings.push('missing_stats');
  if (!contract && status === 'roster') warnings.push('missing_contract');
  if (schemeFit != null && schemeFit < 50) warnings.push('low_scheme_fit');
  if (player.injury?.status && player.injury.status !== 'Healthy') warnings.push('injury');
  if (player.age >= 30) warnings.push('age_decline');
  contextRiskFlags.forEach((flag) => { if (!warnings.includes(flag)) warnings.push(flag); });

  const summary = buildPositionStatSummary(player.pos, seasonStats);

  return {
    identity: {
      playerId: player.id ?? player.prospectId ?? null,
      name: player.name ?? 'Unknown Player',
      pos: player.pos ?? 'UNK',
      age: player.age ?? null,
      teamId: player.teamId ?? null,
      teamName: team?.name ?? null,
      teamAbbr: team?.abbr ?? null,
      status,
    },
    snapshot: {
      headline: `${player.name ?? 'Unknown'} · ${player.pos ?? 'UNK'}`,
      subheadline: status === 'draft_prospect' ? 'Draft prospect evaluation' : 'Player evaluation',
      roleLabel: player.role ?? (status === 'free_agent' ? 'free_agent' : 'unknown'),
      profileTags: [status, player.archetype].filter(Boolean),
    },
    ratings: { ovr, potential, schemeFit, archetype: player.archetype ?? null, strengths: player.strengths ?? [], weaknesses: player.weaknesses ?? [], trend: player.devTrend ?? 'unknown' },
    role: { label: player.role ?? 'unknown', depthRank: player.depthRank ?? null },
    contract: contract ? {
      baseAnnual: contract.baseAnnual ?? contract.salary ?? null,
      yearsRemaining: contract.yearsRemaining ?? contract.years ?? null,
      capHit: contract.capHit ?? null,
      valueLabel: contractValueLabel(contract, ovr),
      extensionRisk: player.extensionRisk ?? null,
    } : null,
    health: {
      injuryStatus: player.injury?.status ?? 'Healthy',
      injuryWeeksRemaining: player.injury?.weeksRemaining ?? null,
      riskLabel: player.injury?.status && player.injury.status !== 'Healthy' ? 'elevated' : 'normal',
    },
    morale: player.morale ? { ...player.morale } : null,
    development: {
      ageCurveLabel: player.age != null ? (player.age < 25 ? 'ascending' : player.age < 30 ? 'prime' : 'declining') : 'unknown',
      potentialGap,
      developmentPriority: potentialGap != null && potentialGap >= 8 ? 'high' : potentialGap != null && potentialGap >= 4 ? 'medium' : 'low',
      recentTrainingFocus: player.trainingFocus ?? null,
    },
    stats: {
      seasonStats,
      careerStats,
      keyStats: summary,
    },
    gameLog: Array.isArray(recentGames) ? recentGames : [],
    career: { seasons: Array.isArray(careerStats) ? careerStats.length : 0 },
    transactionHistory: Array.isArray(player.transactionHistory) ? player.transactionHistory : [],
    awards: Array.isArray(player.awards) ? player.awards : [],
    fitSummary: {
      whyFits: context?.whyFits ?? context?.reason ?? null,
      whyRisky: context?.whyRisky ?? (Array.isArray(context?.warnings) ? context.warnings.join(' · ') : null),
      action: context?.action ?? 'watch',
      summaryLine: context?.comparisonReceipt ?? context?.reason ?? null,
    },
    recommendationContext: {
      source: context?.source ?? 'unknown',
      sourceLabel: context?.sourceLabel ?? null,
      action: context?.action ?? null,
      reason: context?.reason ?? null,
      comparisonReceipt: context?.comparisonReceipt ?? null,
      recommendation: context?.recommendation ?? null,
      roleFit: context?.roleFit ?? null,
      needFit: context?.needFit ?? null,
      fitScore: context?.fitScore ?? null,
      capImpactLabel: context?.capImpactLabel ?? null,
      valueLabel: context?.valueLabel ?? null,
    },
    warnings,
  };
}

export { buildPositionStatSummary, contractValueLabel };
