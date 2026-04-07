const TONE_RANK = {
  danger: 4,
  warning: 3,
  info: 2,
  ok: 1,
};

export function buildNeedsAttentionItems(weeklyContext, { limit = 5 } = {}) {
  const pool = Array.isArray(weeklyContext?.urgentItems) ? weeklyContext.urgentItems : [];
  const sorted = [...pool]
    .sort((a, b) => {
      const levelDelta = (b.level === 'blocker') - (a.level === 'blocker');
      if (levelDelta !== 0) return levelDelta;
      const toneDelta = (TONE_RANK[b.tone] ?? 0) - (TONE_RANK[a.tone] ?? 0);
      if (toneDelta !== 0) return toneDelta;
      return (b.rank ?? 0) - (a.rank ?? 0);
    })
    .slice(0, limit);

  if (sorted.length) return sorted;

  return [{
    tone: 'ok',
    level: 'recommendation',
    label: 'No urgent blockers',
    detail: 'You are clear to prep and advance.',
    why: 'Use this week to optimize depth and game plan edges.',
    tab: 'Weekly Hub',
  }];
}

export function buildPrimaryAction({ league, nextGame, topNeeds = [], topOffer, latestUserGameId }) {
  const blocker = topNeeds.find((item) => item?.level === 'blocker');
  if (blocker) {
    return {
      label: blocker.label,
      detail: blocker.detail,
      tab: blocker.tab,
      cta: 'Resolve now',
      type: 'navigate',
    };
  }

  if (topOffer?.id) {
    return {
      label: 'Incoming trade offer',
      detail: topOffer.reason ?? 'A team is waiting on your response.',
      tab: 'Trades',
      cta: 'Review offer',
      type: 'navigate',
    };
  }

  if (latestUserGameId) {
    return {
      label: 'Review last game',
      detail: 'Use box score trends before finalizing this week.',
      cta: 'Open box score',
      type: 'boxscore',
      gameId: latestUserGameId,
    };
  }

  if (nextGame) {
    return {
      label: `Prepare ${nextGame.isHome ? 'vs' : '@'} ${nextGame.opp?.abbr ?? 'next opponent'}`,
      detail: 'Finalize depth and plan before simulation.',
      tab: 'Game Plan',
      cta: 'Set lineup',
      type: 'navigate',
    };
  }

  return {
    label: `Advance ${league?.phase ?? 'week'}`,
    detail: 'No urgent blockers are active.',
    cta: 'Advance week',
    type: 'advance',
  };
}

export function buildTeamSnapshot({ user, weeklyContext, cap, nextGame, userLastGameStory }) {
  const streak = Array.isArray(user?.recentResults) && user.recentResults.length
    ? `${user.recentResults[user.recentResults.length - 1]} streak context`
    : 'No streak signal';

  return [
    { label: 'Record', value: `${user?.wins ?? 0}-${user?.losses ?? 0}${(user?.ties ?? 0) ? `-${user.ties}` : ''}`, context: weeklyContext?.direction ?? 'balanced' },
    { label: 'Cap Room', value: cap, context: `${weeklyContext?.pressurePoints?.expiringCount ?? 0} expiring` },
    { label: 'Last Game', value: userLastGameStory?.headline ?? 'No game recap', context: userLastGameStory?.detail ?? 'No recent result available' },
    { label: 'Next Up', value: nextGame ? `W${nextGame.week} ${nextGame.isHome ? 'vs' : '@'} ${nextGame.opp?.abbr ?? 'TBD'}` : 'No scheduled game', context: weeklyContext?.phasePriority ?? '' },
    { label: 'Chemistry', value: weeklyContext?.chemistry?.state ?? 'Steady', context: weeklyContext?.chemistry?.reasons?.[0] ?? 'Locker room stable' },
    { label: 'Streak', value: streak, context: weeklyContext?.marketPulse ?? '' },
  ];
}

export function getDefaultExpandedSections() {
  return {
    happened: true,
    attention: true,
    snapshot: true,
    frontOffice: false,
    insights: false,
  };
}
