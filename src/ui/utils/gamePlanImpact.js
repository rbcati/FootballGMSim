function safeNum(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readRating(team, type) {
  if (!team || typeof team !== 'object') return null;
  if (type === 'offense') return safeNum(team?.offenseRating ?? team?.offRating ?? team?.offense ?? team?.offOvr, null);
  if (type === 'defense') return safeNum(team?.defenseRating ?? team?.defRating ?? team?.defense ?? team?.defOvr, null);
  return safeNum(team?.ovr, null);
}

function countLineupRisk({ team, prep }) {
  const prepIssues = Array.isArray(prep?.lineupIssues) ? prep.lineupIssues : [];
  const injuryIssues = prepIssues.filter((issue) => String(issue?.label ?? issue?.detail ?? '').toLowerCase().includes('injur')).length;
  const missingStarters = safeNum(team?.depthChartWarnings?.missingStarters ?? team?.missingStarters, 0) ?? 0;
  const rosterInjuries = Array.isArray(team?.roster)
    ? team.roster.filter((player) => safeNum(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injury?.gamesRemaining, 0) > 0).length
    : 0;
  return Math.max(injuryIssues, missingStarters, rosterInjuries > 0 ? Math.min(2, rosterInjuries) : 0);
}

function buildRatingDeltaSummary(delta, strongerLabel, weakerLabel) {
  const gap = Math.abs(delta);
  if (gap < 3) return `${strongerLabel} and ${weakerLabel} are tightly matched.`;
  if (gap < 7) return `${strongerLabel} has a slight edge.`;
  return `${strongerLabel} has a clear ratings edge.`;
}

function toTag(riskLevel, confidenceLevel) {
  if (riskLevel === 'high') return { tone: 'warning', label: `High risk · ${confidenceLevel} confidence` };
  if (riskLevel === 'medium') return { tone: 'warning', label: `Manage risk · ${confidenceLevel} confidence` };
  return { tone: 'ok', label: `${confidenceLevel} confidence` };
}

export function buildGamePlanImpact({ league, team, nextGame, prep }) {
  const opponent = nextGame?.opp ?? null;
  const week = safeNum(league?.week, 1) ?? 1;
  if (!team || !opponent) {
    return {
      heading: 'Game Plan Impact',
      summary: 'No matchup lock yet. Keep the roster and plan board ready before advancing.',
      pressurePoint: 'Matchup awaiting opponent assignment.',
      riskLevel: 'medium',
      confidenceLevel: 'low',
      recommendedAdjustments: [
        {
          id: 'impact-fallback-plan',
          title: 'Attack Plan',
          explanation: 'No opponent data yet. Confirm your base game plan and avoid empty prep steps.',
          riskLevel: 'medium',
          confidenceLevel: 'low',
          targetRoute: 'Game Plan',
          ctaLabel: 'Tune Game Plan',
          tag: toTag('medium', 'low'),
        },
        {
          id: 'impact-fallback-lineup',
          title: 'Lineup Risk',
          explanation: 'Lock starters and depth assignments now so sim penalties do not surprise you.',
          riskLevel: 'medium',
          confidenceLevel: 'medium',
          targetRoute: 'Team:Roster / Depth',
          ctaLabel: 'Set Lineup',
          tag: toTag('medium', 'medium'),
        },
      ],
    };
  }

  const userOff = readRating(team, 'offense');
  const userDef = readRating(team, 'defense');
  const oppOff = readRating(opponent, 'offense');
  const oppDef = readRating(opponent, 'defense');

  const offDelta = Number.isFinite(userOff) && Number.isFinite(oppDef) ? userOff - oppDef : null;
  const defDelta = Number.isFinite(userDef) && Number.isFinite(oppOff) ? userDef - oppOff : null;
  const lineupRisk = countLineupRisk({ team, prep });
  const playoffPressure = week >= 12;

  const offensiveAdjustment = {
    id: 'impact-attack',
    title: 'Attack Plan',
    explanation: 'Ratings are tight. Stay on schedule and avoid empty possessions.',
    riskLevel: 'medium',
    confidenceLevel: 'medium',
    targetRoute: 'Game Plan',
    ctaLabel: 'Tune Game Plan',
  };
  if (Number.isFinite(offDelta)) {
    if (offDelta <= -4) {
      offensiveAdjustment.explanation = `Their defense has the edge (${oppDef} vs ${userOff}). Shorten the passing game and avoid long-yardage downs.`;
      offensiveAdjustment.riskLevel = 'high';
      offensiveAdjustment.confidenceLevel = 'high';
    } else if (offDelta >= 4) {
      offensiveAdjustment.explanation = `Your offense has the edge (${userOff} vs ${oppDef}). Lean into tempo and scripted early throws.`;
      offensiveAdjustment.riskLevel = 'low';
      offensiveAdjustment.confidenceLevel = 'high';
    } else {
      offensiveAdjustment.explanation = buildRatingDeltaSummary(offDelta, 'Their defense', 'your offense');
    }
  }

  const defensiveAdjustment = {
    id: 'impact-defense',
    title: 'Defensive Priority',
    explanation: 'Force long drives and keep field position clean.',
    riskLevel: 'medium',
    confidenceLevel: 'medium',
    targetRoute: 'Weekly Prep',
    ctaLabel: 'Scout Opponent',
  };
  if (Number.isFinite(defDelta)) {
    if (defDelta <= -4) {
      defensiveAdjustment.explanation = `Opponent offense is the pressure point (${oppOff} vs ${userDef}). Limit explosives and protect field position.`;
      defensiveAdjustment.riskLevel = 'high';
      defensiveAdjustment.confidenceLevel = 'high';
      defensiveAdjustment.targetRoute = 'Game Plan';
      defensiveAdjustment.ctaLabel = 'Adjust Defense';
    } else if (defDelta >= 4) {
      defensiveAdjustment.explanation = `Your defense has a ratings edge (${userDef} vs ${oppOff}). Consider more aggressive coverage.`;
      defensiveAdjustment.riskLevel = 'low';
      defensiveAdjustment.confidenceLevel = 'high';
      defensiveAdjustment.targetRoute = 'Game Plan';
      defensiveAdjustment.ctaLabel = 'Set Coverage';
    } else {
      defensiveAdjustment.explanation = buildRatingDeltaSummary(defDelta, 'Your defense', 'their offense');
    }
  }

  const adjustments = [offensiveAdjustment, defensiveAdjustment];

  if (lineupRisk > 0) {
    adjustments.push({
      id: 'impact-lineup',
      title: 'Lineup Risk',
      explanation: lineupRisk > 1
        ? 'Injuries are affecting starter depth. Confirm replacements before kickoff.'
        : 'Starter availability shifted this week. Verify depth chart replacements.',
      riskLevel: lineupRisk > 1 ? 'high' : 'medium',
      confidenceLevel: 'medium',
      targetRoute: 'Team:Roster / Depth',
      ctaLabel: 'Set Lineup',
    });
  }

  if (playoffPressure && adjustments.length < 3) {
    adjustments.push({
      id: 'impact-late-season',
      title: 'Late-Season Pressure',
      explanation: 'Standings leverage is rising. Finish prep before advancing so this week does not swing your race.',
      riskLevel: 'medium',
      confidenceLevel: 'medium',
      targetRoute: 'Weekly Prep',
      ctaLabel: 'Finish Weekly Prep',
    });
  }

  const enriched = adjustments.slice(0, 3).map((item) => ({ ...item, tag: toTag(item.riskLevel, item.confidenceLevel) }));

  const highRiskCount = enriched.filter((item) => item.riskLevel === 'high').length;
  const riskLevel = highRiskCount >= 2 ? 'high' : highRiskCount === 1 ? 'medium' : 'low';
  const confidenceLevel = enriched.some((item) => item.confidenceLevel === 'low')
    ? 'low'
    : enriched.filter((item) => item.confidenceLevel === 'high').length >= 2 ? 'high' : 'medium';

  const pressurePoint = defensiveAdjustment.riskLevel === 'high'
    ? 'Opponent offense is the pressure point this week.'
    : offensiveAdjustment.riskLevel === 'high'
      ? 'Opponent defense is driving the matchup pressure.'
      : 'This matchup should hinge on execution and prep detail.';

  return {
    heading: 'Game Plan Impact',
    summary: `${nextGame?.isHome ? 'Home' : 'Road'} setup vs ${opponent?.abbr ?? opponent?.name ?? 'TBD'}. ${pressurePoint}`,
    pressurePoint,
    riskLevel,
    confidenceLevel,
    recommendedAdjustments: enriched,
  };
}

export function buildPostGameReview({ lastGame, userTeamId, latestNews }) {
  if (!lastGame) {
    return {
      heading: 'Review Last Week',
      result: 'No completed game yet',
      takeaway: 'Result will appear after the next advance.',
      nextAction: 'Finalize prep before you simulate forward.',
      actions: [{ label: 'Open Weekly Prep', targetRoute: 'Weekly Prep' }],
    };
  }

  const homeId = Number(lastGame?.homeId ?? lastGame?.home?.id ?? lastGame?.home);
  const awayId = Number(lastGame?.awayId ?? lastGame?.away?.id ?? lastGame?.away);
  const isHome = homeId === Number(userTeamId);
  const userScore = safeNum(isHome ? (lastGame?.score?.home ?? lastGame?.homeScore) : (lastGame?.score?.away ?? lastGame?.awayScore), 0) ?? 0;
  const oppScore = safeNum(isHome ? (lastGame?.score?.away ?? lastGame?.awayScore) : (lastGame?.score?.home ?? lastGame?.homeScore), 0) ?? 0;
  const oppAbbr = isHome ? (lastGame?.awayAbbr ?? lastGame?.away?.abbr ?? 'TBD') : (lastGame?.homeAbbr ?? lastGame?.home?.abbr ?? 'TBD');
  const resultPrefix = userScore > oppScore ? 'W' : userScore < oppScore ? 'L' : 'T';

  let takeaway = 'Result recorded. Open box score for full drive details.';
  let nextAction = 'Use this result to tune this week’s prep and game plan.';

  if (userScore <= 17 && userScore < oppScore) {
    takeaway = 'Offense needs attention after a low-scoring result.';
    nextAction = 'Tune Game Plan before advancing again.';
  } else if (oppScore <= 17 && userScore >= oppScore) {
    takeaway = 'Defense held up on the scoreboard.';
    nextAction = 'Carry forward your defensive emphasis in Weekly Prep.';
  }

  return {
    heading: 'Review Last Week',
    result: `${resultPrefix} ${userScore}-${oppScore} ${isHome ? 'vs' : '@'} ${oppAbbr}`,
    takeaway,
    nextAction,
    newsNote: latestNews?.headline ?? 'No new league bulletin yet.',
    actions: [
      { label: 'Open Weekly Results', targetRoute: 'Weekly Results' },
      { label: 'Open News', targetRoute: 'News' },
    ],
  };
}
