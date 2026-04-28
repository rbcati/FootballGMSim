function safeNum(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hasAnyValue(values = []) {
  return values.some((value) => value !== null && value !== undefined && value !== '');
}

function formatResultLine({ userScore, oppScore, opponentAbbr, isHome }) {
  if (!Number.isFinite(userScore) || !Number.isFinite(oppScore)) {
    return 'Final score is unavailable for this game.';
  }
  const outcome = userScore > oppScore ? 'W' : userScore < oppScore ? 'L' : 'T';
  return `${outcome} ${userScore}-${oppScore} ${isHome ? 'vs' : '@'} ${opponentAbbr ?? 'TBD'}`;
}

function normalizeResult({ lastGame, userTeamId }) {
  const homeId = Number(lastGame?.homeId ?? lastGame?.home?.id ?? lastGame?.home);
  const awayId = Number(lastGame?.awayId ?? lastGame?.away?.id ?? lastGame?.away);
  const isHome = homeId === Number(userTeamId);
  const isAway = awayId === Number(userTeamId);
  if (!isHome && !isAway) return null;

  const userScore = safeNum(isHome ? (lastGame?.score?.home ?? lastGame?.homeScore) : (lastGame?.score?.away ?? lastGame?.awayScore));
  const oppScore = safeNum(isHome ? (lastGame?.score?.away ?? lastGame?.awayScore) : (lastGame?.score?.home ?? lastGame?.homeScore));
  const opponentAbbr = isHome
    ? (lastGame?.awayAbbr ?? lastGame?.away?.abbr ?? lastGame?.away?.name)
    : (lastGame?.homeAbbr ?? lastGame?.home?.abbr ?? lastGame?.home?.name);

  const teamStats = isHome ? lastGame?.teamStats?.home ?? null : lastGame?.teamStats?.away ?? null;
  const oppStats = isHome ? lastGame?.teamStats?.away ?? null : lastGame?.teamStats?.home ?? null;

  return {
    isHome,
    userScore,
    oppScore,
    opponentAbbr: opponentAbbr ?? 'TBD',
    resultLine: formatResultLine({ userScore, oppScore, opponentAbbr, isHome }),
    teamStats,
    oppStats,
    week: safeNum(lastGame?.week, null),
    gameId: lastGame?.gameId ?? lastGame?.id ?? null,
  };
}

function buildOffensiveTakeaway({ result }) {
  const points = result?.userScore;
  const yards = safeNum(result?.teamStats?.totalYards);
  const successRate = safeNum(result?.teamStats?.successRate);

  if (successRate != null) {
    if (successRate >= 0.5) return 'Offense posted efficient down-to-down success. Keep the current attack structure unless matchup health changed.';
    if (successRate <= 0.38) return 'Offensive efficiency lagged. Revisit your attack plan and check if your scripted balance fits this opponent profile.';
  }

  if (yards != null && yards <= 275) {
    return 'Total offense was limited. Review Game Plan and compare your call sheet to drive-by-drive outcomes in Game Book.';
  }

  if (Number.isFinite(points) && points <= 17) {
    return 'Low offensive output suggests revisiting your attack plan before the next kickoff.';
  }

  if (Number.isFinite(points) && points >= 30) {
    return 'Scoring output was strong. Preserve your base offensive structure and only adjust for new injuries.';
  }

  return 'Open Game Book to review your offense by quarter before making major plan changes.';
}

function buildDefensiveTakeaway({ result }) {
  const allowed = result?.oppScore;
  const oppSuccess = safeNum(result?.oppStats?.successRate);

  if (oppSuccess != null) {
    if (oppSuccess <= 0.4) return 'Defense held opponent efficiency down. Keep your defensive structure unless availability changed.';
    if (oppSuccess >= 0.5) return 'Opponent moved the ball efficiently. Re-check coverage pressure and situational calls in Game Plan.';
  }

  if (Number.isFinite(allowed) && allowed <= 17) {
    return 'Defense held opponent scoring down; keep current defensive structure unless injuries changed.';
  }

  if (Number.isFinite(allowed) && allowed >= 30) {
    return 'Points allowed were high. Review defensive priorities and lineup assignments before advancing again.';
  }

  return 'Inspect Game Book defensive splits before changing your base structure.';
}

function parseStamp(stamp) {
  if (typeof stamp !== 'string') return { season: null, week: null };
  const [season, week] = stamp.split(':');
  return { season, week: safeNum(week, null) };
}

function hasSavedGamePlan(strategies = {}) {
  const gamePlan = strategies?.gamePlan ?? {};
  return hasAnyValue([
    strategies?.offPlanId,
    strategies?.defPlanId,
    strategies?.riskId,
    gamePlan?.runPassBalance,
    gamePlan?.aggressionLevel,
    gamePlan?.deepShortBalance,
    gamePlan?.blitzFrequency,
  ]);
}

function buildContextTakeaway({ result, userTeam, seasonId, injuryRiskCount }) {
  const bullets = [];

  if (hasSavedGamePlan(userTeam?.strategies)) {
    bullets.push({
      id: 'game-plan',
      text: 'Game plan was saved before kickoff. Open Game Book to inspect whether your script held up in live drives.',
      route: 'Game Book',
      targetRoute: result?.gameId ? `Game Book:${result.gameId}` : 'Game Plan',
    });
  }

  if (injuryRiskCount > 0) {
    bullets.push({
      id: 'lineup-injury',
      text: 'Injury/availability risk was active entering the week. Review Availability and depth replacements before next kickoff.',
      route: 'Team:Injuries',
      targetRoute: 'Team:Injuries',
    });
  }

  const focus = userTeam?.weeklyDevelopmentFocus;
  const stamp = parseStamp(focus?.stamp);
  if (stamp.week != null && (stamp.week === result?.week || stamp.week === (result?.week != null ? result.week - 1 : null))) {
    const focusLabel = Array.isArray(focus?.positionGroups) && focus.positionGroups.length
      ? ` (${focus.positionGroups.join('/').toUpperCase()})`
      : '';
    bullets.push({
      id: 'training',
      text: `Practice effects were logged this week${focusLabel}, but box score attribution is not detailed enough to assign direct credit.`,
      route: 'Training',
      targetRoute: 'Training',
    });
  } else if (stamp.week != null && seasonId != null && String(stamp.season) === String(seasonId)) {
    bullets.push({
      id: 'training-stale',
      text: 'A prior practice plan exists, but no matching weekly practice stamp was found for this game week.',
      route: 'Training',
      targetRoute: 'Training',
    });
  }

  return bullets;
}

function chooseRecommendation({ result, contextBullets }) {
  if (!result) {
    return {
      label: 'Open Weekly Prep',
      reason: 'No completed user game is available yet.',
      route: 'Weekly Prep',
    };
  }

  if (Number.isFinite(result.userScore) && result.userScore <= 17) {
    return { label: 'Tune Game Plan', reason: 'Low offensive output needs a plan review.', route: 'Game Plan' };
  }
  if (Number.isFinite(result.oppScore) && result.oppScore >= 28) {
    return { label: 'Review Injuries', reason: 'High opponent scoring and availability risk can compound quickly.', route: 'Team:Injuries' };
  }

  const lineupBullet = contextBullets.find((bullet) => bullet.id === 'lineup-injury');
  if (lineupBullet) {
    return { label: 'Review Availability', reason: 'Injury risk was already present.', route: lineupBullet.targetRoute };
  }

  return {
    label: 'Review Game Book',
    reason: 'Review drive detail before making next-week changes.',
    route: result?.gameId ? `Game Book:${result.gameId}` : 'Weekly Results',
  };
}

export function buildWeeklyDecisionImpact({ league, userTeam, lastGame } = {}) {
  const team = userTeam ?? (league?.teams ?? []).find((entry) => Number(entry?.id) === Number(league?.userTeamId)) ?? null;
  const result = normalizeResult({ lastGame, userTeamId: league?.userTeamId });

  if (!result) {
    return {
      heading: 'Decision Review',
      resultSummary: 'No completed user game available yet.',
      offensiveTakeaway: 'Advance the week to generate a game result and decision review.',
      defensiveTakeaway: 'No defensive snapshot yet.',
      gamePlanTakeaway: 'No saved game result to evaluate this week.',
      lineupInjuryTakeaway: 'Injury and lineup context appears after a completed game.',
      trainingTakeaway: 'Practice logs will appear after a completed game week.',
      preparationBullets: ['No completed user game available yet.'],
      bullets: [
        'Advance the week to generate a game result and decision review.',
      ],
      recommendedAction: {
        label: 'Open Weekly Prep',
        reason: 'Finish prep steps before kickoff.',
        route: 'Weekly Prep',
      },
      routeTarget: 'Weekly Prep',
    };
  }

  const injuryRiskCount = Array.isArray(team?.roster)
    ? team.roster.filter((player) => safeNum(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injury?.weeksRemaining ?? player?.injury?.gamesRemaining, 0) > 0).length
    : 0;

  const offensiveTakeaway = buildOffensiveTakeaway({ result });
  const defensiveTakeaway = buildDefensiveTakeaway({ result });

  const contextBullets = buildContextTakeaway({
    result,
    userTeam: team,
    seasonId: league?.seasonId ?? league?.year ?? null,
    injuryRiskCount,
  });

  const gamePlanTakeaway = contextBullets.find((item) => item.id === 'game-plan')?.text
    ?? 'No saved game-plan snapshot was found for this matchup.';
  const lineupInjuryTakeaway = contextBullets.find((item) => item.id === 'lineup-injury')?.text
    ?? 'No pregame injury-risk marker was found in this review window.';
  const trainingTakeaway = contextBullets.find((item) => item.id.startsWith('training'))?.text
    ?? 'No weekly practice log was matched to this game week.';

  const recommendedAction = chooseRecommendation({ result, contextBullets });

  return {
    heading: 'Decision Review',
    resultSummary: result.resultLine,
    offensiveTakeaway,
    defensiveTakeaway,
    gamePlanTakeaway,
    lineupInjuryTakeaway,
    trainingTakeaway,
    bullets: [offensiveTakeaway, defensiveTakeaway, gamePlanTakeaway, lineupInjuryTakeaway].slice(0, 4),
    preparationBullets: [gamePlanTakeaway, trainingTakeaway, lineupInjuryTakeaway].filter((text) => typeof text === 'string' && text.trim()),
    contextRoutes: contextBullets,
    recommendedAction,
    routeTarget: recommendedAction?.route ?? 'Weekly Prep',
    metadata: {
      hasStrategyContext: hasSavedGamePlan(team?.strategies),
      hasTrainingContext: contextBullets.some((item) => item.id.startsWith('training')),
      injuryRiskCount,
      hasTeamStats: Boolean(result?.teamStats || result?.oppStats),
      gameId: result?.gameId ?? null,
      week: result?.week ?? null,
    },
  };
}
