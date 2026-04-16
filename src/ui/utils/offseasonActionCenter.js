const PHASE_SEQUENCE = ['offseason_resign', 'free_agency', 'trades', 'draft', 'post_draft', 'preseason'];

const PHASE_LABELS = {
  offseason_resign: 'Re-signing',
  free_agency: 'Free Agency',
  trades: 'Trades',
  draft: 'Draft',
  post_draft: 'Post-Draft',
  preseason: 'Preseason',
};

const PHASE_ACTIONS = {
  offseason_resign: [
    { label: 'Open Re-sign table', tab: 'Free Agency' },
    { label: 'Review cap outlook', tab: 'Financials' },
  ],
  free_agency: [
    { label: 'Open market board', tab: 'Free Agency' },
    { label: 'Open FA Hub', tab: 'FA Hub' },
  ],
  trades: [
    { label: 'Open Trade Workspace', tab: 'Trades' },
    { label: 'Review roster surplus', tab: 'Roster' },
  ],
  draft: [
    { label: 'Open Draft Room', tab: 'Draft Room' },
    { label: 'Open Mock Draft', tab: 'Mock Draft' },
  ],
  post_draft: [
    { label: 'Review Draft Class', tab: '🎓 Draft' },
    { label: 'Open Roster', tab: 'Roster' },
    { label: 'Open Depth Chart', tab: 'Roster:depth|ALL' },
  ],
  preseason: [
    { label: 'Run final cuts', tab: 'Roster' },
    { label: 'Set depth chart', tab: 'Roster:depth|ALL' },
  ],
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function summarizePerformanceNeeds(userTeam) {
  const summary = [];
  const offense = toNumber(userTeam?.seasonTeamStats?.offenseYardsPerPlay ?? userTeam?.offenseYardsPerPlay, 0);
  const defense = toNumber(userTeam?.seasonTeamStats?.defenseYardsPerPlayAllowed ?? userTeam?.defenseYardsPerPlayAllowed, 0);
  const rushRate = toNumber(userTeam?.seasonTeamStats?.rushRate, 0);
  const passSuccess = toNumber(userTeam?.seasonTeamStats?.passSuccessRate, 0);

  if (offense > 0 && offense < 5.2) summary.push('Offense lacked efficient drive production');
  if (defense > 6.0) summary.push('Defense allowed explosive drives');
  if (rushRate > 0 && rushRate < 0.38) summary.push('Rushing identity was too one-dimensional');
  if (passSuccess > 0 && passSuccess < 0.45) summary.push('Passing game efficiency lagged league pace');

  const digest = Array.isArray(userTeam?.seasonEventDigest) ? userTeam.seasonEventDigest : [];
  if (digest.length) {
    const weakness = digest.find((item) => String(item?.tone ?? '').toLowerCase() === 'warning' || /allowed|struggled|weak/i.test(String(item?.summary ?? '')));
    if (weakness?.summary) summary.push(String(weakness.summary));
  }

  return summary.slice(0, 3);
}

function deriveExpiringPriority(expiring = []) {
  const key = expiring
    .filter((p) => toNumber(p?.ovr, 0) >= 74 || ['QB', 'LT', 'EDGE', 'CB'].includes(String(p?.pos ?? '').toUpperCase()))
    .filter((p) => !p?.extensionDecision || p.extensionDecision === 'pending');
  return {
    total: expiring.length,
    unresolved: expiring.filter((p) => !p?.extensionDecision || p.extensionDecision === 'pending').length,
    keyUnresolved: key.length,
  };
}

function deriveDraftPickCount(userTeam) {
  const picks = userTeam?.picksOwned ?? userTeam?.draftPicks ?? userTeam?.picks ?? [];
  return Array.isArray(picks) ? picks.length : toNumber(userTeam?.numDraftPicks, 0);
}

export function buildOffseasonActionCenter(league) {
  const phase = String(league?.phase ?? 'regular');
  const userTeam = (league?.teams ?? []).find((team) => Number(team?.id) === Number(league?.userTeamId));
  if (!userTeam) {
    return {
      phase,
      phaseLabel: PHASE_LABELS[phase] ?? phase,
      isOffseasonLoop: false,
      blockers: ['User team context is still loading.'],
      priorities: [],
      actions: [],
      metrics: { capRoom: 0, rosterCount: 0, draftPickCount: 0, expiringContracts: 0 },
    };
  }

  const capRoom = toNumber(userTeam?.capRoom, toNumber(userTeam?.capTotal, 255) - toNumber(userTeam?.capUsed, 0) - toNumber(userTeam?.deadCap, 0));
  const rosterCount = Array.isArray(userTeam?.roster) ? userTeam.roster.length : toNumber(userTeam?.rosterCount, 0);
  const expiring = Array.isArray(userTeam?.roster)
    ? userTeam.roster.filter((p) => toNumber(p?.contract?.years, 0) <= 1)
    : [];
  const expiringPriority = deriveExpiringPriority(expiring);
  const draftPickCount = deriveDraftPickCount(userTeam);
  const phaseIndex = PHASE_SEQUENCE.indexOf(phase);

  const priorities = [];
  const blockers = [];

  if (phase === 'offseason_resign' && expiringPriority.keyUnresolved > 0) {
    blockers.push(`${expiringPriority.keyUnresolved} key expiring contracts still unresolved.`);
    priorities.push('Resolve core re-sign decisions before market opens.');
  }
  if (phase === 'free_agency' && capRoom <= 0) {
    blockers.push('No cap room remaining for competitive offers.');
  }
  if (phase === 'draft' && !Array.isArray(league?.draftClass)) {
    blockers.push('Draft board is not hydrated yet.');
  }
  if (phase === 'preseason' && rosterCount > 53) {
    blockers.push(`Roster cutdown required (${rosterCount}/53).`);
  }

  if (capRoom < 8) priorities.push('Cap flexibility is thin; focus on value signings or restructures.');
  if (draftPickCount < 5) priorities.push('Limited draft capital; prioritize trade-back opportunities.');

  const productionNeeds = summarizePerformanceNeeds(userTeam);
  for (const need of productionNeeds) priorities.push(need);

  return {
    phase,
    phaseLabel: PHASE_LABELS[phase] ?? phase,
    isOffseasonLoop: phaseIndex >= 0,
    blockers,
    priorities: priorities.slice(0, 6),
    unresolved: {
      expiringContracts: expiringPriority.unresolved,
      keyExpiringContracts: expiringPriority.keyUnresolved,
    },
    metrics: {
      capRoom,
      rosterCount,
      draftPickCount,
      expiringContracts: expiringPriority.total,
    },
    actions: PHASE_ACTIONS[phase] ?? [],
    canSkipPhase: blockers.length === 0,
    nextPhaseLabel: PHASE_LABELS[PHASE_SEQUENCE[phaseIndex + 1]] ?? 'Regular Season',
  };
}

export function formatDemandTier(player) {
  const ask = toNumber(player?.demandProfile?.askAnnual ?? player?.askingPrice, 0);
  if (ask >= 18) return 'premium';
  if (ask >= 8) return 'starter';
  return 'value';
}
