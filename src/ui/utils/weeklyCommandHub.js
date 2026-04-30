function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const PRIORITY_WEIGHT = { critical: 0, high: 1, medium: 2, low: 3 };

function byPriority(a, b) {
  const pa = PRIORITY_WEIGHT[a?.priority] ?? 9;
  const pb = PRIORITY_WEIGHT[b?.priority] ?? 9;
  if (pa !== pb) return pa - pb;
  return String(a?.label ?? '').localeCompare(String(b?.label ?? ''));
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

export function buildWeeklyCommandHub({
  league,
  userTeam,
  command,
  teamBuilder,
  weeklyDecisionImpact,
  gamePlanImpact,
  weeklyIntelligence,
  nextGame,
  lastGame,
} = {}) {
  const team = userTeam ?? (league?.teams ?? []).find((t) => Number(t?.id) === Number(league?.userTeamId)) ?? null;
  const prepState = team?.weeklyPrep ?? {};
  const actions = [];

  const injuredStarters = Array.isArray(team?.roster)
    ? team.roster.filter((player) => {
      const weeks = safeNum(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining ?? player?.injury?.weeksRemaining, 0);
      const starter = hasValue(player?.depthChart?.rowKey) || player?.depthChart?.isStarter === true;
      return weeks > 0 && starter;
    })
    : [];

  if (injuredStarters.length) {
    actions.push({
      id: 'injured-starters',
      label: `${injuredStarters.length} injured starter${injuredStarters.length > 1 ? 's' : ''}`,
      detail: 'Availability risk can impact this week’s lineup and game plan.',
      priority: injuredStarters.length > 1 ? 'critical' : 'high',
      route: 'Team:Injuries',
      ctaLabel: 'Review injuries',
      source: 'injury',
      blocking: injuredStarters.length > 1,
      completed: false,
      section: 'must_handle',
    });
  }

  const weekly = weeklyIntelligence ?? command?.weeklyIntelligence ?? {};
  const urgentNeed = teamBuilder?.urgentNeed ?? teamBuilder?.biggestNeed ?? weekly?.urgentNeed ?? null;
  if (urgentNeed) {
    actions.push({
      id: 'urgent-roster-need',
      label: `Roster need: ${urgentNeed}`,
      detail: 'Team Builder flagged this as the top personnel issue for upcoming games.',
      priority: 'high',
      route: 'Team:Roster / Team Builder',
      ctaLabel: 'Open Team Builder',
      source: 'roster',
      blocking: false,
      completed: false,
      section: 'must_handle',
    });
  }

  const depthBlocked = Array.isArray(weekly?.insights) && weekly.insights.some((i) => /depth|starter|lineup/i.test(String(i?.text ?? '')) && (i?.tone === 'danger' || i?.tone === 'warning'));
  if (depthBlocked) {
    actions.push({
      id: 'depth-watch',
      label: 'Depth chart risk detected',
      detail: 'Review lineup/depth before kickoff to prevent avoidable drop-off.',
      priority: 'high',
      route: 'Team:Roster / Depth',
      ctaLabel: 'Open depth chart',
      source: 'depth',
      blocking: true,
      completed: false,
      section: 'must_handle',
    });
  }

  const planReviewed = prepState.planReviewed === true;
  if (!planReviewed) {
    actions.push({
      id: 'game-plan-review',
      label: 'Review game plan',
      detail: gamePlanImpact?.summary ?? 'Adjust approach using this week’s opponent profile.',
      priority: 'high',
      route: 'Game Plan',
      ctaLabel: 'Open Game Plan',
      source: 'gamePlan',
      blocking: false,
      completed: false,
      section: 'tactical_edge',
    });
  }

  if (prepState.trainingCompleted !== true) {
    actions.push({
      id: 'training-focus',
      label: 'Set training focus',
      detail: 'Lock weekly development priorities before advancing.',
      priority: 'medium',
      route: 'Training',
      ctaLabel: 'Open Training',
      source: 'training',
      blocking: false,
      completed: false,
      section: 'tactical_edge',
    });
  }

  if (prepState.opponentScouted !== true) {
    actions.push({
      id: 'scout-opponent',
      label: 'Scout opponent',
      detail: nextGame?.opp?.abbr ? `Build report for ${nextGame.opp.abbr}.` : 'Build this week’s scouting report.',
      priority: 'medium',
      route: 'Weekly Prep',
      ctaLabel: 'Open scouting',
      source: 'scout',
      blocking: false,
      completed: false,
      section: 'tactical_edge',
    });
  }

  const hasCompletedGame = Boolean(lastGame?.played || weeklyDecisionImpact?.metadata?.gameId || command?.lastGameSummary?.played);
  if (hasCompletedGame) {
    const gameBookRoute = weeklyDecisionImpact?.metadata?.gameId ? `Game Book:${weeklyDecisionImpact.metadata.gameId}` : 'Weekly Results';
    actions.push({
      id: 'postgame-film-room',
      label: 'Review Postgame Film Room',
      detail: 'Use Game Book and result review before locking next week.',
      priority: 'medium',
      route: gameBookRoute,
      ctaLabel: 'Open Game Book',
      source: 'results',
      blocking: false,
      completed: false,
      section: 'after_action',
    });
  }

  if ((command?.leagueNews ?? []).length) {
    actions.push({
      id: 'league-news',
      label: 'Scan league headlines',
      detail: 'Optional context for market and standings movement.',
      priority: 'low',
      route: 'News',
      ctaLabel: 'Open news',
      source: 'news',
      blocking: false,
      completed: false,
      section: 'after_action',
    });
  }

  const sections = [
    { key: 'must_handle', title: 'Must Handle', tone: 'danger', actions: actions.filter((a) => a.section === 'must_handle').sort(byPriority) },
    { key: 'tactical_edge', title: 'Tactical Edge', tone: 'info', actions: actions.filter((a) => a.section === 'tactical_edge').sort(byPriority) },
    { key: 'after_action', title: 'After Action', tone: 'neutral', actions: actions.filter((a) => a.section === 'after_action').sort(byPriority) },
  ];

  const ranked = [...actions].sort(byPriority);
  const criticalOpen = ranked.filter((a) => a.priority === 'critical' && !a.completed).length;
  const recommendedOpen = ranked.filter((a) => (a.priority === 'high' || a.priority === 'medium') && !a.completed).length;

  return {
    status: ranked.length ? (criticalOpen ? 'needs-attention' : 'ready') : 'ready',
    primaryAction: ranked[0] ?? null,
    sections,
    readiness: {
      criticalOpen,
      recommendedOpen,
      readyToAdvance: criticalOpen === 0,
      lastCompletedAction: weeklyDecisionImpact?.recommendedAction?.label ?? null,
    },
    actions: ranked,
  };
}
