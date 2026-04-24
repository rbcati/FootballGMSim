function safeNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatRecord(team) {
  if (!team) return '—';
  const ties = safeNum(team?.ties, 0);
  return `${safeNum(team?.wins, 0)}-${safeNum(team?.losses, 0)}${ties ? `-${ties}` : ''}`;
}

function lastResult(team) {
  const recent = Array.isArray(team?.recentResults) ? team.recentResults : [];
  const latest = String(recent[recent.length - 1] ?? '').toUpperCase();
  if (latest === 'W') return 'Won last week';
  if (latest === 'L') return 'Lost last week';
  if (latest === 'T') return 'Tied last week';
  return null;
}

function routeLabel(route) {
  if (!route) return 'HQ';
  if (route.includes('Depth')) return 'Roster / Depth';
  if (route.includes('Game Plan')) return 'Game Plan';
  if (route.includes('Training')) return 'Training';
  if (route.includes('Weekly Prep')) return 'Weekly Prep';
  if (route.includes('Injur')) return 'Injuries';
  return route;
}

export function buildWeeklyIntelligence({ league, team, nextGame, prep }) {
  const opponent = nextGame?.opp ?? null;
  if (!team || !opponent) {
    return {
      heading: 'Coordinator Brief',
      insights: [{ id: 'intel-fallback', tone: 'info', text: 'No opponent is locked yet. Review lineup, training, and game plan readiness before advancing.' }],
    };
  }

  const insights = [];
  const userOff = safeNum(team?.offenseRating ?? team?.offRating ?? team?.offense, null);
  const userDef = safeNum(team?.defenseRating ?? team?.defRating ?? team?.defense, null);
  const oppOff = safeNum(opponent?.offenseRating ?? opponent?.offRating ?? opponent?.offense, null);
  const oppDef = safeNum(opponent?.defenseRating ?? opponent?.defRating ?? opponent?.defense, null);

  insights.push({
    id: 'intel-record',
    tone: 'info',
    text: `${nextGame?.isHome ? 'Home' : 'Road'} matchup vs ${opponent?.abbr ?? opponent?.name ?? 'TBD'} (${formatRecord(opponent)}).`,
  });

  if (Number.isFinite(userOff) && Number.isFinite(oppDef)) {
    if (userOff >= oppDef + 4) insights.push({ id: 'intel-off-edge', tone: 'ok', text: `Your offense has the edge (${userOff} vs ${oppDef}). Prioritize passing efficiency and tempo control.` });
    else if (oppDef >= userOff + 4) insights.push({ id: 'intel-off-risk', tone: 'warning', text: `Their defense has the edge (${oppDef} vs ${userOff}). Protect possessions and avoid long-yardage situations.` });
  }

  if (Number.isFinite(userDef) && Number.isFinite(oppOff)) {
    if (userDef >= oppOff + 4) insights.push({ id: 'intel-def-edge', tone: 'ok', text: `Your defense has a matchup advantage (${userDef} vs ${oppOff}). Aggressive coverage can force mistakes.` });
    else if (oppOff >= userDef + 4) insights.push({ id: 'intel-def-risk', tone: 'warning', text: `Opponent offense is the pressure point (${oppOff} vs ${userDef}). Keep explosive plays contained.` });
  }

  if (insights.length < 3) {
    insights.push({ id: 'intel-ratings-fallback', tone: 'info', text: 'Ratings are tightly clustered this week. Situational execution should decide the matchup.' });
  }

  const oppForm = prep?.opponentSnapshot?.recentForm?.summary;
  if (oppForm) {
    insights.push({ id: 'intel-form', tone: 'info', text: `${opponent?.abbr ?? opponent?.name ?? 'Opponent'} form: ${oppForm}.` });
  } else {
    const note = lastResult(opponent);
    if (note) insights.push({ id: 'intel-last-result', tone: 'info', text: `${opponent?.abbr ?? opponent?.name ?? 'Opponent'} ${note.toLowerCase()}.` });
  }

  const injuries = safeNum(prep?.lineupIssues?.filter((issue) => String(issue?.label ?? '').toLowerCase().includes('injur')).length, 0);
  if (injuries > 0) {
    insights.push({ id: 'intel-injuries', tone: injuries >= 2 ? 'warning' : 'info', text: `${injuries} injury-related lineup concern${injuries > 1 ? 's' : ''} flagged for this week.` });
  }

  const week = safeNum(league?.week, 1);
  if (week >= 10) {
    insights.push({ id: 'intel-implication', tone: 'warning', text: 'Late-season standings pressure: this week can shift playoff position.' });
  }

  return {
    heading: 'Coordinator Brief',
    insights: insights.slice(0, 5),
  };
}

export function buildActionableWeeklyPriorities({ team, nextGame, prep, weeklyAgenda = [] }) {
  const lineupWarnings = safeNum(team?.depthChartWarnings?.missingStarters ?? team?.missingStarters ?? prep?.lineupIssues?.length, 0);
  const opp = nextGame?.opp;
  const oppDef = safeNum(opp?.defenseRating ?? opp?.defRating ?? opp?.defense, null);
  const oppOff = safeNum(opp?.offenseRating ?? opp?.offRating ?? opp?.offense, null);

  const base = [
    {
      id: 'priority-lineup',
      icon: '🧩',
      title: 'Set Lineup',
      description: lineupWarnings > 0
        ? `${lineupWarnings} depth chart warning${lineupWarnings > 1 ? 's could' : ' could'} affect sim performance.`
        : 'Confirm starters before kickoff to avoid hidden mismatch penalties.',
      severity: lineupWarnings > 1 ? 'warning' : 'info',
      ctaLabel: 'Open Roster / Depth',
      targetRoute: 'Team:Roster / Depth',
    },
    {
      id: 'priority-training',
      icon: '🎯',
      title: 'Training',
      description: 'Allocate reps before kickoff to influence player growth and readiness.',
      severity: 'info',
      ctaLabel: 'Open Training',
      targetRoute: 'Training',
    },
    {
      id: 'priority-game-plan',
      icon: '📋',
      title: 'Game Plan',
      description: Number.isFinite(oppDef)
        ? `Opponent defense rates ${oppDef}. Tune your offensive approach before advance.`
        : 'Review your offensive and defensive approach before kickoff.',
      severity: Number.isFinite(oppOff) && Number.isFinite(safeNum(team?.defenseRating ?? team?.defRating ?? team?.defense, null)) && oppOff >= safeNum(team?.defenseRating ?? team?.defRating ?? team?.defense, 0) + 4 ? 'warning' : 'info',
      ctaLabel: 'Open Game Plan',
      targetRoute: 'Game Plan',
    },
    {
      id: 'priority-scout',
      icon: '🔎',
      title: 'Scout Opponent',
      description: opp ? `Review the ${opp?.abbr ?? opp?.name} matchup report before advancing.` : 'Review the upcoming matchup report before advancing.',
      severity: 'info',
      ctaLabel: 'Open Weekly Prep',
      targetRoute: 'Weekly Prep',
    },
  ];

  const merged = [...base, ...weeklyAgenda]
    .map((item, index) => ({
      ...item,
      id: item?.id ?? `agenda-${index}`,
      ctaLabel: item?.ctaLabel || `Open ${routeLabel(item?.targetRoute ?? item?.tab)}`,
      description: item?.description ?? item?.detail ?? 'Review this weekly item before simming forward.',
      targetRoute: item?.targetRoute ?? item?.tab ?? 'HQ',
    }));

  const deduped = [];
  const seen = new Set();
  for (const item of merged) {
    const key = String(item?.title ?? '').toLowerCase();
    if (!item?.title || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, 5);
}
