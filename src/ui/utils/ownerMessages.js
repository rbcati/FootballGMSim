const OWNER_MESSAGE_POOL = {
  losing_streak: {
    warning: [
      "Three straight losses is not a blip. Stop the slide this week.",
      "This is a losing streak, not bad luck. Fix the weak spots now.",
    ],
    urgent_demand: [
      "We have dropped too many in a row. Change personnel or change approach immediately.",
      "I will not watch this streak continue. I expect decisive action before next kickoff.",
    ],
  },
  low_owner_approval: {
    disappointment: [
      "Confidence in this direction is fading. Show me a plan that wins games.",
      "The building feels flat right now. I need to see a response, not excuses.",
    ],
    urgent_demand: [
      "Owner confidence is in the red. This has to turn now.",
      "Patience is almost gone. Deliver wins and visible roster improvement.",
    ],
  },
  below_expectation: {
    warning: [
      "We are under the pace this season demanded. Raise the standard immediately.",
      "This record is below where this roster should be. Correct course now.",
    ],
    disappointment: [
      "This season is slipping under expectation. I expect urgency from the front office.",
      "The results are behind target. I need a sharper plan this week.",
    ],
  },
  cap_unused_while_losing: {
    urgent_demand: [
      "You are falling behind with cap room untouched. Use our flexibility now.",
      "We left money idle while losses mounted. Add help and show intent.",
    ],
    warning: [
      "Cap space is a tool, not a trophy. Spend it to address clear holes.",
      "Unused space does not win games. Reinforce the roster while we can.",
    ],
  },
  missed_owner_goals: {
    disappointment: [
      "Owner goals are off track. I expect a direct recovery plan.",
      "We committed to specific goals and missed key marks. That has to change.",
    ],
    urgent_demand: [
      "Our goals were missed. I need immediate accountability and correction.",
      "This franchise set goals for a reason. Start hitting them now.",
    ],
  },
  inaction_during_decline: {
    warning: [
      "Losses are mounting and our response has been passive. I need action.",
      "Standing still during a decline is not acceptable. Adjust this roster.",
    ],
    urgent_demand: [
      "We are sliding and doing nothing about it. Make moves before next week.",
      "No more waiting. Change the roster and coaching approach now.",
    ],
  },
  steady_progress: {
    cautious_encouragement: [
      "Stay disciplined. Keep building week to week and do not lose focus.",
      "Good response lately. Keep pressure on and finish stronger.",
    ],
  },
  expiring_core_ignored: {
    warning: [
      "Core expiring talent is stacking up. I expect a re-signing plan this week.",
      "Do not let priority starters drift into open bidding without a response.",
    ],
    urgent_demand: [
      "We cannot lose this core by inaction. Resolve these contracts immediately.",
      "Priority starters are close to walking. Take decisive contract action now.",
    ],
  },
};

const TONE_PRIORITY = {
  urgent_demand: 4,
  disappointment: 3,
  warning: 2,
  cautious_encouragement: 1,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function computeStreak(recentResults) {
  if (!Array.isArray(recentResults) || recentResults.length === 0) return null;
  let streakType = null;
  let count = 0;
  for (let i = recentResults.length - 1; i >= 0; i -= 1) {
    const result = recentResults[i];
    if (result !== "W" && result !== "L") continue;
    if (streakType === null) {
      streakType = result;
      count = 1;
      continue;
    }
    if (result === streakType) {
      count += 1;
      continue;
    }
    break;
  }
  return streakType ? { type: streakType, count } : null;
}

function pickMessage(triggerKey, tone, seed) {
  const options = OWNER_MESSAGE_POOL?.[triggerKey]?.[tone] ?? [];
  if (options.length === 0) return "I expect a clear, immediate response from the front office.";
  const idx = Math.abs(seed) % options.length;
  return options[idx];
}

function inferExpectedWinPct(season) {
  if (season <= 1) return 0.43;
  if (season === 2) return 0.5;
  return 0.56;
}

export function evaluateOwnerMessageContext({ league, userTeam, currentWeek, currentSeason }) {
  if (!league || !userTeam) return null;

  const wins = Number(userTeam?.wins ?? 0);
  const losses = Number(userTeam?.losses ?? 0);
  const gamesPlayed = wins + losses;
  const winPct = gamesPlayed > 0 ? wins / gamesPlayed : 0.5;
  const streak = computeStreak(userTeam?.recentResults ?? []);

  const approval = clamp(Math.round(league?.ownerApproval ?? userTeam?.ownerApproval ?? 75), 0, 100);
  const season = Number(currentSeason ?? league?.year ?? league?.season ?? 1);
  const week = Number(currentWeek ?? league?.week ?? 1);

  const capSpaceFromTeam = Number(userTeam?.capSpace ?? userTeam?.capRoom);
  const capUsedFromTeam = Number(userTeam?.capUsed);
  const capLimit = 200;
  const derivedCapSpace = Number.isFinite(capSpaceFromTeam)
    ? capSpaceFromTeam
    : Number.isFinite(capUsedFromTeam)
      ? Math.max(0, capLimit - capUsedFromTeam)
      : Math.max(
          0,
          capLimit -
            (Array.isArray(userTeam?.roster)
              ? userTeam.roster.reduce((sum, p) => sum + Number(p?.contract?.salary ?? 2), 0)
              : 0),
        );

  const expectedWinPct = inferExpectedWinPct(season);
  const expectedWinsToDate = gamesPlayed * expectedWinPct;
  const winDeficit = expectedWinsToDate - wins;

  const ownerGoals = Array.isArray(league?.ownerGoals) ? league.ownerGoals : [];
  const goalProgress = ownerGoals.map((goal) => {
    const target = Math.max(1, Number(goal?.target ?? 1));
    const current = Number(goal?.current ?? 0);
    return { ...goal, progress: current / target };
  });

  const failedGoals = goalProgress.filter((goal) => {
    if (goal?.complete) return false;
    if (league?.phase === "offseason" || league?.phase === "offseason_resign") return true;
    return week >= 12 && goal.progress < 0.7;
  });

  const onTradeBlockCount = Array.isArray(userTeam?.roster)
    ? userTeam.roster.filter((p) => p?.onTradeBlock).length
    : 0;
  const contractMarket = league?.contractMarket ?? null;

  const candidates = [];

  if (streak?.type === "L" && streak.count >= 3) {
    candidates.push({
      triggerKey: "losing_streak",
      tone: streak.count >= 4 ? "urgent_demand" : "warning",
      severity: streak.count >= 5 ? 94 : streak.count >= 4 ? 86 : 74,
      stateLabel: `L${streak.count}`,
      checkpoint: `wk${week}`,
    });
  }

  if (approval <= 55) {
    candidates.push({
      triggerKey: "low_owner_approval",
      tone: approval <= 40 ? "urgent_demand" : "disappointment",
      severity: approval <= 30 ? 93 : approval <= 40 ? 85 : 72,
      stateLabel: `approval-${approval}`,
      checkpoint: `wk${week}`,
    });
  }

  if (gamesPlayed >= 6 && winDeficit >= 1.8) {
    candidates.push({
      triggerKey: "below_expectation",
      tone: winDeficit >= 3 ? "disappointment" : "warning",
      severity: winDeficit >= 3.5 ? 88 : 70,
      stateLabel: `deficit-${Math.round(winDeficit * 10)}`,
      checkpoint: `wk${week}`,
    });
  }

  if (gamesPlayed >= 5 && winPct < 0.45 && derivedCapSpace >= 25) {
    candidates.push({
      triggerKey: "cap_unused_while_losing",
      tone: derivedCapSpace >= 35 ? "urgent_demand" : "warning",
      severity: derivedCapSpace >= 35 ? 90 : 76,
      stateLabel: `cap-${Math.round(derivedCapSpace)}`,
      checkpoint: `wk${week}`,
    });
  }

  if (failedGoals.length > 0) {
    candidates.push({
      triggerKey: "missed_owner_goals",
      tone: failedGoals.length >= 2 ? "urgent_demand" : "disappointment",
      severity: failedGoals.length >= 2 ? 89 : 75,
      stateLabel: `goals-${failedGoals.length}`,
      checkpoint: league?.phase === "offseason" ? `season-${season}-closeout` : `wk${week}`,
    });
  }

  if (streak?.type === "L" && streak.count >= 3 && onTradeBlockCount === 0 && derivedCapSpace >= 18) {
    candidates.push({
      triggerKey: "inaction_during_decline",
      tone: streak.count >= 4 ? "urgent_demand" : "warning",
      severity: streak.count >= 4 ? 87 : 73,
      stateLabel: `quiet-${streak.count}-cap-${Math.round(derivedCapSpace)}`,
      checkpoint: `wk${week}`,
    });
  }
  const marketBidRisk = Number(contractMarket?.bidRiskCount ?? 0);
  const closeToDecisionCount = Number(contractMarket?.closeToDecisionCount ?? 0);
  if ((contractMarket?.priorityExpiring ?? 0) >= 2 && week >= 8 && marketBidRisk === 0) {
    candidates.push({
      triggerKey: "expiring_core_ignored",
      tone: (contractMarket?.priorityExpiring ?? 0) >= 3 ? "urgent_demand" : "warning",
      severity: (contractMarket?.priorityExpiring ?? 0) >= 3 ? 88 : 74,
      stateLabel: `expiring-${contractMarket?.priorityExpiring ?? 0}`,
      checkpoint: `wk${week}`,
    });
  }
  if (marketBidRisk >= 2 || closeToDecisionCount >= 2) {
    candidates.push({
      triggerKey: "inaction_during_decline",
      tone: marketBidRisk >= 3 ? "urgent_demand" : "warning",
      severity: marketBidRisk >= 3 ? 89 : 76,
      stateLabel: `contract-risk-${marketBidRisk}-close-${closeToDecisionCount}`,
      checkpoint: `wk${week}`,
    });
  }

  if (candidates.length === 0 && gamesPlayed >= 4 && winPct >= 0.5 && approval >= 65) {
    candidates.push({
      triggerKey: "steady_progress",
      tone: "cautious_encouragement",
      severity: 40,
      stateLabel: `steady-${wins}-${losses}`,
      checkpoint: `wk${week}`,
    });
  }

  if (candidates.length === 0) return null;

  const top = [...candidates].sort((a, b) => {
    if (b.severity !== a.severity) return b.severity - a.severity;
    return (TONE_PRIORITY[b.tone] ?? 0) - (TONE_PRIORITY[a.tone] ?? 0);
  })[0];

  const seed = season * 31 + week * 17 + top.severity;
  const pressureState = top.tone === "urgent_demand"
    ? "urgent_demand"
    : top.tone === "disappointment" || top.tone === "warning"
      ? "warning"
      : "cooling";
  let expectedAction = null;
  if (top.triggerKey === "cap_unused_while_losing") expectedAction = "Use cap flexibility to add impact help.";
  else if (top.triggerKey === "inaction_during_decline") expectedAction = "Make a roster move this week.";
  else if (top.triggerKey === "missed_owner_goals") expectedAction = "Commit to a clear franchise direction now.";
  else if (top.triggerKey === "steady_progress") expectedAction = "Stay disciplined and continue current plan.";
  else if (top.triggerKey === "expiring_core_ignored") expectedAction = "Re-sign or tag priority expiring starters.";

  return {
    ...top,
    key: `${top.triggerKey}:${top.tone}:${top.stateLabel}:${top.checkpoint}`,
    message: pickMessage(top.triggerKey, top.tone, seed),
    pressureState,
    expectedAction,
    diagnostics: {
      wins,
      losses,
      approval,
      capSpace: Number(derivedCapSpace.toFixed(1)),
      failedGoals: failedGoals.length,
      winDeficit: Number(winDeficit.toFixed(2)),
      streak,
    },
  };
}

export function ownerToneLabel(tone) {
  switch (tone) {
    case "urgent_demand":
      return "Urgent demand";
    case "disappointment":
      return "Disappointment";
    case "warning":
      return "Warning";
    case "cautious_encouragement":
      return "Cautious encouragement";
    default:
      return "Owner message";
  }
}
