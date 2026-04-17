function safeNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getWinPct(team) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  const games = wins + losses + ties;
  if (games <= 0) return 0.5;
  return (wins + 0.5 * ties) / games;
}

function getDivisionPosition(team, league) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const sameDivision = teams.filter((candidate) => candidate?.conf === team?.conf && candidate?.div === team?.div);
  if (sameDivision.length <= 1) return { rank: 1, teams: sameDivision };
  const sorted = [...sameDivision].sort((a, b) => getWinPct(b) - getWinPct(a));
  const index = sorted.findIndex((candidate) => Number(candidate?.id) === Number(team?.id));
  return { rank: index >= 0 ? index + 1 : null, teams: sorted };
}

function getPlayoffSeed(team, league) {
  const standings = Array.isArray(league?.standings) ? league.standings : [];
  const userStanding = standings.find((row) => Number(row?.id) === Number(team?.id));
  const fromStanding = safeNum(userStanding?.seed ?? userStanding?.playoffSeed, null);
  if (fromStanding != null) return fromStanding;
  const fromTeam = safeNum(team?.seed ?? team?.playoffSeed, null);
  return fromTeam;
}

function ownerPressureState(league, weekly) {
  const pressureState = weekly?.ownerContext?.pressureState;
  if (pressureState === 'urgent_demand') return 'urgent';
  if (pressureState === 'warning') return 'warning';
  const approval = safeNum(weekly?.pressurePoints?.ownerApproval ?? league?.ownerApproval ?? league?.ownerMood, null);
  if (approval == null) return 'stable';
  if (approval < 40) return 'urgent';
  if (approval < 55) return 'warning';
  return 'stable';
}

export function getTeamStatusLine(team, league, weekly) {
  if (!team || !league) return 'Season in progress';

  const phase = String(league?.phase ?? 'regular');
  if (phase === 'preseason') return 'Finalize depth chart before Week 1';
  if (phase === 'playoffs') return 'Win-or-go-home postseason football';
  if (phase === 'offseason' || phase === 'draft' || phase === 'free_agency' || phase === 'offseason_resign') {
    return 'Build next season\'s core';
  }

  const pressure = ownerPressureState(league, weekly);
  const winPct = getWinPct(team);
  const week = safeNum(league?.week, 1);
  const ovr = safeNum(team?.ovr, 0);
  const seed = getPlayoffSeed(team, league);
  const { rank: divisionRank, teams: divisionTeams } = getDivisionPosition(team, league);
  const gamesBackDivision = divisionTeams.length > 1 ? getWinPct(divisionTeams[0]) - winPct : 0;

  if (pressure === 'urgent' && week >= 8) return 'Owner pressure: results needed now';

  const lateSeason = week >= 13;
  const inPlayoffPosition = seed != null ? seed <= 7 : winPct >= 0.58;
  const bubbleRecord = winPct >= 0.45 && winPct < 0.58;

  if (lateSeason && !inPlayoffPosition && bubbleRecord) return 'Must-win stretch to stay alive';
  if (inPlayoffPosition && (divisionRank === 1 || winPct >= 0.64)) return 'Contender track: protect playoff seed';
  if (divisionRank != null && divisionRank <= 2 && gamesBackDivision <= 0.08 && week >= 6) return 'Division race tightening';
  if (bubbleRecord && week >= 7) return 'Playoff bubble: every week swings odds';
  if (ovr >= 84 && winPct < 0.45 && week >= 5) return 'Underachieving relative to roster talent';
  if ((weekly?.direction === 'rebuilding' || ovr < 77) && week >= 5) return 'Rebuild lane: prioritize long-term value';
  if (pressure === 'warning') return 'Owner expectations rising';

  return 'Weekly prep window is open';
}

export function getActionContext(type, weekly, nextGame) {
  const injuries = safeNum(weekly?.pressurePoints?.injuriesCount, 0);
  const offers = safeNum(weekly?.pressurePoints?.incomingTradeCount ?? weekly?.incomingOffers?.length, 0);
  const opp = nextGame?.opp ?? null;

  switch (type) {
    case 'lineup':
      if (injuries >= 4) return `${injuries} injuries active — re-balance depth chart now`;
      if (injuries > 0) return `${injuries} injury impact${injuries > 1 ? 's' : ''} to cover`;
      return 'Confirm starters and situational packages';
    case 'gameplan':
      if (opp) {
        const offense = safeNum(opp?.offenseRating ?? opp?.offRating ?? opp?.offense);
        const defense = safeNum(opp?.defenseRating ?? opp?.defRating ?? opp?.defense);
        if (offense >= 85) return `Limit ${opp.abbr ?? opp.name} explosive offense`;
        if (defense >= 85) return `Attack ${opp.abbr ?? opp.name} elite defense with matchup calls`;
        return `Install plan for ${opp.abbr ?? opp.name}`;
      }
      return 'Set weekly strategy and tempo';
    case 'news':
      if (injuries > 0) return `Injury report updated (${injuries} active)`;
      if (offers > 0) return `${offers} trade conversation${offers > 1 ? 's' : ''} needs review`;
      return 'Review team headlines and health updates';
    case 'opponent':
      if (opp) {
        return `${nextGame?.isHome ? 'Home' : 'Road'} matchup vs ${opp.abbr ?? opp.name}`;
      }
      return 'Scout upcoming matchup windows';
    default:
      return null;
  }
}

export function getActionDestination(type, nextGame) {
  switch (type) {
    case 'lineup':
      return 'Roster:depth|ALL';
    case 'gameplan':
      return 'Game Plan';
    case 'news':
      return nextGame ? 'Injuries' : 'News';
    case 'opponent':
      return nextGame ? 'Game Plan' : 'Schedule';
    default:
      return 'HQ';
  }
}

export function rankHqPriorityItems(team, league, weekly, nextGame) {
  const items = [];
  const pressure = ownerPressureState(league, weekly);
  const injuries = safeNum(weekly?.pressurePoints?.injuriesCount, 0);
  const expiring = safeNum(weekly?.pressurePoints?.expiringCount, 0);
  const capRoom = safeNum(team?.capRoom ?? team?.capSpace, 0);
  const week = safeNum(league?.week, 1);

  if (pressure === 'urgent') {
    items.push({ level: 'urgent', rank: 97, label: 'Owner mandate active', detail: 'Franchise confidence is falling — deliver a result this week.', verb: 'Address pressure', tab: '🤖 GM Advisor' });
  } else if (pressure === 'warning') {
    items.push({ level: 'recommended', rank: 82, label: 'Owner confidence slipping', detail: 'Recent trend has increased scrutiny on weekly decisions.', verb: 'Review priorities', tab: '🤖 GM Advisor' });
  }

  if (injuries >= 4) {
    items.push({ level: 'urgent', rank: 95, label: 'Depth chart stress test', detail: `${injuries} injuries are impacting lineup stability.`, verb: 'Set emergency lineup', tab: 'Roster:depth|ALL' });
  } else if (injuries >= 2) {
    items.push({ level: 'recommended', rank: 74, label: 'Injury coverage needed', detail: `${injuries} active injuries require role adjustments.`, verb: 'Reassign roles', tab: 'Injuries' });
  }

  if (expiring >= 4 && week >= 8) {
    items.push({ level: 'recommended', rank: 84, label: 'Core contracts nearing expiry', detail: `${expiring} rotation players are in contract-year windows.`, verb: 'Start extension talks', tab: 'Financials' });
  }

  if (capRoom < 0) {
    items.push({ level: 'urgent', rank: 92, label: 'Cap overage risk', detail: `Current cap room is ${capRoom.toFixed(1)}M.`, verb: 'Open cap view', tab: 'Financials' });
  } else if (capRoom < 3) {
    items.push({ level: 'recommended', rank: 72, label: 'Cap flexibility is tight', detail: `Only ${capRoom.toFixed(1)}M available for emergency moves.`, verb: 'Protect flexibility', tab: 'Financials' });
  }

  if (league?.phase === 'preseason') {
    const rosterCount = Array.isArray(team?.roster) ? team.roster.length : safeNum(team?.rosterCount, 0);
    if (rosterCount > 53) {
      items.push({ level: 'urgent', rank: 93, label: 'Roster cutdown required', detail: `${rosterCount} players rostered before regular-season limit.`, verb: 'Complete cuts', tab: 'Roster Hub' });
    }
  }

  const deadlineWeek = safeNum(league?.tradeDeadline, null);
  if (deadlineWeek != null && league?.phase === 'regular') {
    const weeksLeft = deadlineWeek - week;
    if (weeksLeft >= 0 && weeksLeft <= 2) {
      items.push({ level: weeksLeft === 0 ? 'urgent' : 'recommended', rank: weeksLeft === 0 ? 91 : 79, label: 'Trade deadline pressure', detail: weeksLeft === 0 ? 'Deadline closes after this week.' : `Deadline closes in ${weeksLeft} week${weeksLeft > 1 ? 's' : ''}.`, verb: 'Review trade options', tab: 'Trades' });
    }
  }

  if (nextGame?.opp) {
    const ovrGap = safeNum(team?.ovr) - safeNum(nextGame.opp?.ovr);
    if (ovrGap <= -4) {
      items.push({ level: 'recommended', rank: 76, label: 'Upset prep opportunity', detail: `Underdog matchup vs ${nextGame.opp?.abbr ?? nextGame.opp?.name}.`, verb: 'Tune game plan', tab: 'Game Plan' });
    } else if (ovrGap >= 5) {
      items.push({ level: 'info', rank: 58, label: 'Execution week', detail: 'Talent edge exists — avoid turnovers and penalties.', verb: 'Lock focus points', tab: 'Game Plan' });
    }
  }

  const merged = [...items, ...((weekly?.urgentItems ?? []).map((item) => ({
    ...item,
    level: item?.level === 'blocker' ? 'urgent' : item?.level === 'recommendation' ? 'recommended' : (item?.level ?? 'info'),
  })))];

  const deduped = [];
  const seen = new Set();
  for (const item of merged) {
    const key = `${item?.label}|${item?.tab}`;
    if (!item?.label || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  const ranked = deduped
    .sort((a, b) => {
      const rankDiff = safeNum(b?.rank, 0) - safeNum(a?.rank, 0);
      if (rankDiff !== 0) return rankDiff;
      return String(a?.label ?? '').localeCompare(String(b?.label ?? ''));
    })
    .slice(0, 4);

  return {
    featured: ranked[0] ?? null,
    secondary: ranked.slice(1, 4),
  };
}

export function getTeamSnapshotNotes(team, weekly, capRoom) {
  const injuries = safeNum(weekly?.pressurePoints?.injuriesCount, 0);
  const expiring = safeNum(weekly?.pressurePoints?.expiringCount, 0);
  const rosterSize = Array.isArray(team?.roster) ? team.roster.length : safeNum(team?.rosterCount, 0);
  const ovr = safeNum(team?.ovr, 0);

  const ovrNote = weekly?.direction === 'rebuilding'
    ? 'Rebuild phase'
    : ovr >= 86
      ? 'Championship-caliber'
      : ovr >= 80
        ? 'Playoff-caliber'
        : ovr >= 74
          ? 'Transitioning roster'
          : 'Long-term build';

  const capNote = capRoom < 0
    ? 'Over cap pressure'
    : capRoom < 5
      ? 'Near cap ceiling'
      : capRoom < 14
        ? 'Manageable room'
        : 'Flexible cap outlook';

  const rosterNote = injuries >= 5
    ? 'Injury-strained depth'
    : injuries >= 2
      ? 'Minor injury stress'
      : rosterSize > 53
        ? 'Cutdown required'
        : rosterSize < 48
          ? 'Thin active roster'
          : 'Depth in healthy range';

  const expiringNote = expiring >= 5
    ? 'Multiple core contracts expiring'
    : expiring >= 2
      ? 'Several rotation deals expiring'
      : 'Core contracts relatively stable';

  return {
    ovrNote,
    capNote,
    rosterNote,
    expiringNote,
  };
}
