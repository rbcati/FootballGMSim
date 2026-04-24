function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asTeamId(raw) {
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

function gameSortKey(game, fallbackWeek = 0, index = 0) {
  const week = safeNum(game?.week, fallbackWeek);
  const slot = safeNum(game?.slot ?? game?.gameNumber, index);
  return week * 1000 + slot;
}

export function getLatestUserCompletedGame(league) {
  const weeks = Array.isArray(league?.schedule?.weeks) ? league.schedule.weeks : [];
  const userTeamId = asTeamId(league?.userTeamId);
  if (userTeamId == null || weeks.length === 0) return null;

  const completed = [];
  for (const week of weeks) {
    const weekNum = safeNum(week?.week, safeNum(league?.week, 1));
    for (const [idx, game] of (week?.games ?? []).entries()) {
      if (!game?.played) continue;
      const homeId = asTeamId(game?.homeId ?? game?.home?.id ?? game?.home);
      const awayId = asTeamId(game?.awayId ?? game?.away?.id ?? game?.away);
      if (homeId !== userTeamId && awayId !== userTeamId) continue;
      completed.push({ ...game, homeId, awayId, week: weekNum, __sortKey: gameSortKey({ ...game, week: weekNum }, weekNum, idx) });
    }
  }

  if (!completed.length) return null;
  completed.sort((a, b) => a.__sortKey - b.__sortKey);
  const latest = completed[completed.length - 1];
  delete latest.__sortKey;
  return latest;
}

function getResultLabel({ userScore, oppScore, overtimePeriods }) {
  if (userScore === oppScore) return overtimePeriods > 0 ? 'T (OT)' : 'T';
  const outcome = userScore > oppScore ? 'W' : 'L';
  return overtimePeriods > 0 ? `${outcome} (OT)` : outcome;
}

function getScorePair(game) {
  return {
    home: safeNum(game?.score?.home ?? game?.homeScore),
    away: safeNum(game?.score?.away ?? game?.awayScore),
  };
}

export function getLastGameDisplay(lastGame, userTeamId) {
  if (!lastGame) {
    return {
      heroLine: 'No final yet — your season opener is still ahead.',
      overviewLine: 'No completed game yet',
      oppAbbr: 'TBD',
    };
  }

  const userId = asTeamId(userTeamId);
  const homeId = asTeamId(lastGame?.homeId ?? lastGame?.home?.id ?? lastGame?.home);
  const awayId = asTeamId(lastGame?.awayId ?? lastGame?.away?.id ?? lastGame?.away);
  const userIsHome = userId != null && homeId === userId;
  const userIsAway = userId != null && awayId === userId;

  const scores = getScorePair(lastGame);
  const userScore = userIsHome ? scores.home : userIsAway ? scores.away : scores.home;
  const oppScore = userIsHome ? scores.away : userIsAway ? scores.home : scores.away;

  const overtimePeriods = safeNum(lastGame?.overtimePeriods ?? lastGame?.ot, 0);
  const overtimeLabel = overtimePeriods > 1 ? ` ${overtimePeriods}OT` : overtimePeriods === 1 ? ' OT' : '';

  const opponentAbbr = userIsHome
    ? (lastGame?.awayAbbr ?? lastGame?.away?.abbr ?? 'TBD')
    : (lastGame?.homeAbbr ?? lastGame?.home?.abbr ?? 'TBD');
  const location = userIsHome ? 'vs' : userIsAway ? '@' : 'vs';

  const resultLabel = getResultLabel({ userScore, oppScore, overtimePeriods });
  const scoreLine = `${userScore}-${oppScore}${overtimeLabel}`;

  return {
    heroLine: `${resultLabel} · ${scoreLine} ${location} ${opponentAbbr}`.trim(),
    overviewLine: `${resultLabel} ${scoreLine} ${location} ${opponentAbbr}`.trim(),
    oppAbbr: opponentAbbr,
  };
}

export function getNextOpponentDisplay(nextGame) {
  if (!nextGame) {
    return {
      heading: 'No opponent locked in yet',
      detail: 'No upcoming game on the schedule.',
      opponentAbbr: 'TBD',
      isHome: true,
    };
  }
  const opponentAbbr = nextGame?.opp?.abbr ?? nextGame?.opp?.name ?? 'TBD';
  const homeAway = nextGame?.isHome ? 'vs' : '@';
  const opponentRecord = nextGame?.opp
    ? `${safeNum(nextGame.opp?.wins, 0)}-${safeNum(nextGame.opp?.losses, 0)}${safeNum(nextGame.opp?.ties, 0) ? `-${safeNum(nextGame.opp?.ties, 0)}` : ''}`
    : '—';

  return {
    heading: `Next Assignment ${homeAway} ${opponentAbbr}`,
    detail: `Prepare for kickoff ${homeAway} ${opponentAbbr} (${opponentRecord}).`,
    opponentAbbr,
    isHome: Boolean(nextGame?.isHome),
  };
}
