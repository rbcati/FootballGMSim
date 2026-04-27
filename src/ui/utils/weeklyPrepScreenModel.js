import { deriveWeeklyPrepState } from './weeklyPrep.js';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toneFromSeverity(severity = 'ok') {
  if (severity === 'major_risk') return 'danger';
  if (severity === 'minor_risk') return 'warning';
  return 'success';
}

function mapRoute(route = 'HQ') {
  if (route === 'Injuries') return 'Team:Injuries';
  if (route === 'Roster Hub') return 'Team:Roster / Depth';
  return route;
}

function buildPriorityActions(prep) {
  const actions = [];
  if (!prep) return actions;

  const push = (item) => {
    if (!item?.title || !item?.route) return;
    if (actions.some((entry) => entry.route === item.route)) return;
    actions.push(item);
  };

  if (!prep.completion?.planReviewed || safeNum(prep.matchup?.ovrGap, 0) <= -3) {
    push({
      id: 'plan',
      title: 'Tune Game Plan',
      reason: prep.recommendations?.[0]?.reason ?? 'Lock your tactical script before kickoff.',
      statusTone: prep.completion?.planReviewed ? 'info' : 'warning',
      statusLabel: prep.completion?.planReviewed ? 'Reviewed' : 'Needs review',
      ctaLabel: 'Open Game Plan',
      route: 'Game Plan',
      completionStep: 'planReviewed',
    });
  }

  if (!prep.completion?.lineupChecked || prep.lineupIssues?.length) {
    const lineupIssue = prep.lineupIssues?.[0];
    push({
      id: 'lineup',
      title: 'Set Lineup',
      reason: lineupIssue?.detail ?? 'Confirm starters and depth chart assignments.',
      statusTone: lineupIssue?.level === 'urgent' ? 'danger' : prep.completion?.lineupChecked ? 'info' : 'warning',
      statusLabel: lineupIssue?.level === 'urgent' ? 'Blocker' : prep.completion?.lineupChecked ? 'Checked' : 'Pending',
      ctaLabel: 'Open Roster / Depth',
      route: 'Team:Roster / Depth',
      completionStep: 'lineupChecked',
    });
  }

  if (!prep.completion?.injuriesReviewed || prep.lineupIssues?.some((issue) => issue.actionTab === 'Injuries')) {
    const injuryIssue = prep.lineupIssues?.find((issue) => issue.actionTab === 'Injuries');
    push({
      id: 'injuries',
      title: 'Review Injuries',
      reason: injuryIssue?.detail ?? 'Check injury timelines and replacement readiness.',
      statusTone: injuryIssue?.level === 'urgent' ? 'danger' : prep.completion?.injuriesReviewed ? 'info' : 'warning',
      statusLabel: prep.completion?.injuriesReviewed ? 'Reviewed' : 'Pending',
      ctaLabel: 'Open Injuries',
      route: 'Team:Injuries',
      completionStep: 'injuriesReviewed',
    });
  }

  if (!prep.completion?.opponentScouted || !(prep.opponentStrengths?.length || prep.opponentWeaknesses?.length)) {
    push({
      id: 'scout',
      title: 'Scout Opponent',
      reason: prep.keyMatchupNote ?? 'Review strengths, weaknesses, and pressure points.',
      statusTone: prep.completion?.opponentScouted ? 'info' : 'warning',
      statusLabel: prep.completion?.opponentScouted ? 'Scouted' : 'Pending',
      ctaLabel: 'Review Matchup Intel',
      route: 'Weekly Prep',
      completionStep: 'opponentScouted',
    });
  }

  return actions.slice(0, 4);
}

export function buildWeeklyPrepScreenModel({ league } = {}) {
  const prep = deriveWeeklyPrepState(league);
  const fallbackWeek = safeNum(league?.week, 1);
  const week = safeNum(prep?.nextGame?.week, fallbackWeek);
  const opponentAbbr = prep?.opponent?.abbr ?? prep?.opponent?.name ?? 'TBD';
  const homeAway = prep?.nextGame ? (prep.nextGame.isHome ? 'Home' : 'Away') : 'TBD';
  const matchupHeadline = prep?.nextGame
    ? `${homeAway} matchup ${prep.nextGame.isHome ? 'vs' : '@'} ${opponentAbbr}`
    : 'No opponent locked yet';

  const completionValues = Object.values(prep?.completion ?? {});
  const completedCount = completionValues.filter(Boolean).length;
  const totalCount = completionValues.length || 4;
  const readinessScore = Math.round((completedCount / totalCount) * 100);
  const severity = prep?.prepSummary?.severity ?? 'minor_risk';
  const readinessStatus = severity === 'major_risk'
    ? 'Major Risk'
    : readinessScore >= 100
      ? 'Ready to Advance'
      : readinessScore >= 50
        ? 'Needs Attention'
        : 'Major Risk';

  const keyRiskLabel = prep?.pressurePoints?.[0]
    ?? prep?.lineupIssues?.[0]?.label
    ?? prep?.prepSummary?.reasons?.[0]
    ?? 'No major matchup risk flagged yet.';

  const matchupEdges = [
    ...(prep?.opponentWeaknesses ?? []).map((item) => ({ type: 'weakness', text: item })),
    ...(prep?.opponentStrengths ?? []).map((item) => ({ type: 'threat', text: item })),
  ].slice(0, 3);

  const lineupBlockers = (prep?.lineupIssues ?? []).filter((issue) => issue.level === 'urgent').slice(0, 2);
  const priorityActions = buildPriorityActions(prep);
  const topPrepTasks = priorityActions.slice(0, 3);

  const recommendedNextAction = priorityActions[0]
    ? {
      label: priorityActions[0].ctaLabel,
      route: mapRoute(priorityActions[0].route),
      reason: priorityActions[0].reason,
    }
    : {
      label: 'Back to HQ',
      route: 'HQ',
      reason: 'No blocking tasks detected.',
    };

  const readyToAdvance = readinessScore >= 100 && severity !== 'major_risk' && lineupBlockers.length === 0;

  return {
    prep,
    week,
    opponentAbbr,
    homeAway,
    matchupHeadline,
    readinessScore,
    readinessStatus,
    readinessTone: toneFromSeverity(severity),
    keyRiskLabel,
    topPrepTasks,
    matchupEdges,
    lineupBlockers,
    recommendedNextAction,
    readyToAdvance,
    routeTargets: {
      gamePlan: 'Game Plan',
      lineup: 'Team:Roster / Depth',
      injuries: 'Team:Injuries',
      scout: 'Weekly Prep',
      hq: 'HQ',
    },
    priorityActions: priorityActions.map((item) => ({ ...item, route: mapRoute(item.route) })),
  };
}
