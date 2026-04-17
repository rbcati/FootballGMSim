import { autoBuildDepthChart, depthWarnings, DEPTH_CHART_ROWS } from '../../core/depthChart.js';

const PREP_STORAGE_KEY = 'footballgm_weekly_prep_v1';

function safeNum(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getTeam(league, teamId) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  return teams.find((team) => Number(team?.id) === Number(teamId)) ?? null;
}

export function getNextGame(league) {
  const uid = Number(league?.userTeamId);
  for (const week of league?.schedule?.weeks ?? []) {
    for (const game of week?.games ?? []) {
      if (game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== uid && awayId !== uid) continue;
      const isHome = homeId === uid;
      const oppId = isHome ? awayId : homeId;
      return {
        week: safeNum(week?.week, safeNum(league?.week, 1)),
        isHome,
        oppId,
        opp: getTeam(league, oppId),
        game,
      };
    }
  }
  return null;
}

function getTeamRating(team, type = 'ovr') {
  if (type === 'offense') return safeNum(team?.offenseRating ?? team?.offRating ?? team?.offense ?? team?.offOvr);
  if (type === 'defense') return safeNum(team?.defenseRating ?? team?.defRating ?? team?.defense ?? team?.defOvr);
  return safeNum(team?.ovr);
}

function getRecord(team) {
  const wins = safeNum(team?.wins);
  const losses = safeNum(team?.losses);
  const ties = safeNum(team?.ties);
  return `${wins}-${losses}${ties ? `-${ties}` : ''}`;
}

function getRecentForm(team, league) {
  const explicit = Array.isArray(team?.recentResults)
    ? team.recentResults.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim().charAt(0).toUpperCase())
    : [];
  const sample = explicit.slice(-5);
  if (sample.length > 0) {
    const wins = sample.filter((value) => value === 'W').length;
    const losses = sample.filter((value) => value === 'L').length;
    return { sample, summary: `${wins}-${losses} in last ${sample.length}` };
  }

  const uid = Number(team?.id);
  const results = [];
  for (const week of [...(league?.schedule?.weeks ?? [])].sort((a, b) => safeNum(a?.week) - safeNum(b?.week))) {
    for (const game of week?.games ?? []) {
      if (!game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== uid && awayId !== uid) continue;
      const homeScore = safeNum(game?.homeScore ?? game?.score?.home);
      const awayScore = safeNum(game?.awayScore ?? game?.score?.away);
      if (homeScore === awayScore) results.push('T');
      else if ((homeId === uid && homeScore > awayScore) || (awayId === uid && awayScore > homeScore)) results.push('W');
      else results.push('L');
    }
  }
  const tail = results.slice(-5);
  if (!tail.length) return { sample: [], summary: 'No form sample yet' };
  const wins = tail.filter((value) => value === 'W').length;
  const losses = tail.filter((value) => value === 'L').length;
  return { sample: tail, summary: `${wins}-${losses} in last ${tail.length}` };
}

function isPlayerInjured(player) {
  return safeNum(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injuryDuration ?? 0) > 0
    || ['injured', 'ir'].includes(String(player?.status ?? '').toLowerCase());
}

function getExistingAssignments(roster) {
  const assignments = {};
  for (const player of roster) {
    const rowKey = player?.depthChart?.rowKey;
    if (!rowKey) continue;
    if (!assignments[rowKey]) assignments[rowKey] = [];
    assignments[rowKey].push(Number(player.id));
  }
  return assignments;
}

function getPositionGroup(pos) {
  const normalized = String(pos ?? '').toUpperCase();
  const row = DEPTH_CHART_ROWS.find((entry) => entry.match.includes(normalized));
  return row?.key ?? normalized;
}

function buildLineupReadiness(userTeam, league) {
  const roster = Array.isArray(userTeam?.roster) ? userTeam.roster : [];
  const assignments = autoBuildDepthChart(roster, getExistingAssignments(roster));
  const issues = [];

  for (const warning of depthWarnings(assignments, roster)) {
    issues.push({
      id: `depth-${warning.rowKey}-${warning.message}`,
      level: warning.severity === 'error' ? 'urgent' : 'warning',
      label: warning.severity === 'error' ? 'Depth chart blocker' : 'Depth risk',
      detail: warning.message,
      actionLabel: 'Fix depth chart',
      actionTab: 'Roster:depth|ALL',
    });
  }

  const byId = new Map(roster.map((player) => [Number(player.id), player]));
  for (const row of DEPTH_CHART_ROWS) {
    const starterId = assignments?.[row.key]?.[0];
    const starter = byId.get(Number(starterId));
    if (!starter) continue;
    if (safeNum(starter?.ovr, 99) <= 62) {
      issues.push({
        id: `starter-low-${row.key}`,
        level: 'warning',
        label: 'Low-rated starter in key slot',
        detail: `${row.label} is led by a low-rated starter (${safeNum(starter?.ovr)} OVR).`,
        actionLabel: 'Adjust lineup',
        actionTab: 'Roster:depth|ALL',
      });
    }
  }

  const injured = roster.filter(isPlayerInjured);
  const injuredByGroup = injured.reduce((acc, player) => {
    const group = getPositionGroup(player?.pos);
    acc[group] = (acc[group] ?? 0) + 1;
    return acc;
  }, {});

  for (const [group, count] of Object.entries(injuredByGroup)) {
    if (count < 2) continue;
    const row = DEPTH_CHART_ROWS.find((entry) => entry.key === group);
    issues.push({
      id: `inj-group-${group}`,
      level: count >= 3 ? 'urgent' : 'warning',
      label: 'Position group injury stack',
      detail: `${count} injuries in ${row?.label ?? group} this week.`,
      actionLabel: 'Review injuries',
      actionTab: 'Injuries',
    });
  }

  if (String(league?.phase) === 'preseason' && roster.length > 53) {
    issues.push({
      id: 'roster-cutdown',
      level: 'urgent',
      label: 'Roster cutdown required',
      detail: `${roster.length} players rostered before regular-season cap.`,
      actionLabel: 'Open roster',
      actionTab: 'Roster Hub',
    });
  }

  const seen = new Set();
  return issues.filter((issue) => {
    const key = `${issue.label}|${issue.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

function createRecommendationCards({ userTeam, opponent, matchup }) {
  if (!userTeam || !opponent) return [];
  const cards = [];
  const userOff = getTeamRating(userTeam, 'offense');
  const userDef = getTeamRating(userTeam, 'defense');
  const oppOff = getTeamRating(opponent, 'offense');
  const oppDef = getTeamRating(opponent, 'defense');

  if (oppDef >= 85) {
    cards.push({
      title: 'Protect against elite pass rush',
      reason: `${opponent.abbr ?? opponent.name} grades ${oppDef} on defense; limit long-developing dropbacks.`,
      actionLabel: 'Tune game plan',
      actionTab: 'Game Plan',
    });
  }

  if (oppDef <= 76 || userOff - oppDef >= 6) {
    cards.push({
      title: 'Attack weak secondary',
      reason: `Your offense (${userOff}) has a favorable efficiency window against their defense (${oppDef}).`,
      actionLabel: 'Open game plan',
      actionTab: 'Game Plan',
    });
  }

  if (oppOff >= 84 && userDef - oppOff <= -2) {
    cards.push({
      title: 'Contain explosive offense',
      reason: `${opponent.abbr ?? opponent.name} offense (${oppOff}) can force shootouts if tempo gets loose.`,
      actionLabel: 'Adjust defense',
      actionTab: 'Game Plan',
    });
  }

  if (matchup.ovrGap <= -5) {
    cards.push({
      title: 'Shorten the game',
      reason: `You are an underdog by ${Math.abs(matchup.ovrGap)} OVR. Reduce possessions and avoid variance spikes.`,
      actionLabel: 'Set conservative plan',
      actionTab: 'Game Plan',
    });
  }

  if (matchup.ovrGap >= 5) {
    cards.push({
      title: 'Stay aggressive with talent edge',
      reason: `You hold a +${matchup.ovrGap} OVR edge. Press advantages instead of playing passive.`,
      actionLabel: 'Lock plan',
      actionTab: 'Game Plan',
    });
  }

  if (!cards.length) {
    cards.push({
      title: 'Balanced script recommended',
      reason: 'Ratings are close. Win with situational football and clean execution.',
      actionLabel: 'Review game plan',
      actionTab: 'Game Plan',
    });
  }

  return cards.slice(0, 3);
}

function readStoredPrepProgress() {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREP_STORAGE_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function prepProgressKey(league) {
  return `${league?.seasonId ?? league?.year ?? 'season'}:${league?.week ?? 1}:${league?.userTeamId ?? 'user'}`;
}

function writeStoredPrepProgress(allProgress) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREP_STORAGE_KEY, JSON.stringify(allProgress));
  } catch {
    // no-op on quota/permission issues
  }
}

export function getWeeklyPrepProgress(league) {
  const all = readStoredPrepProgress();
  const key = prepProgressKey(league);
  return {
    lineupChecked: false,
    injuriesReviewed: false,
    opponentScouted: false,
    planReviewed: false,
    ...(all?.[key] ?? {}),
  };
}

export function markWeeklyPrepStep(league, step, value = true) {
  if (!league || !step) return;
  const key = prepProgressKey(league);
  const all = readStoredPrepProgress();
  all[key] = {
    lineupChecked: false,
    injuriesReviewed: false,
    opponentScouted: false,
    planReviewed: false,
    ...(all?.[key] ?? {}),
    [step]: value,
  };
  writeStoredPrepProgress(all);
}

export function deriveWeeklyPrepState(league) {
  const userTeam = getTeam(league, league?.userTeamId);
  const nextGame = getNextGame(league);
  const opponent = nextGame?.opp ?? null;
  const userOff = getTeamRating(userTeam, 'offense');
  const userDef = getTeamRating(userTeam, 'defense');
  const oppOff = getTeamRating(opponent, 'offense');
  const oppDef = getTeamRating(opponent, 'defense');

  const matchup = {
    ovrGap: getTeamRating(userTeam, 'ovr') - getTeamRating(opponent, 'ovr'),
    offenseGap: userOff - oppDef,
    defenseGap: userDef - oppOff,
  };

  const opponentStrengths = [];
  if (oppOff >= 84) opponentStrengths.push(`Top-tier offense (${oppOff}) can create explosive drives.`);
  if (oppDef >= 84) opponentStrengths.push(`Defensive unit (${oppDef}) forces difficult down-and-distance situations.`);
  if (safeNum(opponent?.wins) - safeNum(opponent?.losses) >= 3) opponentStrengths.push(`Winning profile (${getRecord(opponent)}) indicates consistent execution.`);

  const opponentWeaknesses = [];
  if (oppDef <= 76) opponentWeaknesses.push(`Defense rating (${oppDef}) is vulnerable to sustained drives.`);
  if (oppOff <= 76) opponentWeaknesses.push(`Offense rating (${oppOff}) struggles to finish possessions.`);
  if (safeNum(opponent?.ptsAgainst) - safeNum(opponent?.ptsFor) >= 20) opponentWeaknesses.push('Point differential trend suggests late-game leakage.');

  const lineupIssues = buildLineupReadiness(userTeam, league);
  const recommendations = createRecommendationCards({ userTeam, opponent, matchup });

  const pressurePoints = [];
  if (matchup.defenseGap <= -4) pressurePoints.push('Defensive front must limit explosive passing downs.');
  if (matchup.offenseGap <= -4) pressurePoints.push('Offense needs efficient early-down execution to avoid third-and-long.');
  if (lineupIssues.some((issue) => issue.level === 'urgent')) pressurePoints.push('Current lineup issues can materially swing this matchup.');

  const progress = getWeeklyPrepProgress(league);
  const completion = {
    lineupChecked: progress.lineupChecked || lineupIssues.length === 0,
    injuriesReviewed: progress.injuriesReviewed || !lineupIssues.some((issue) => issue.actionTab === 'Injuries'),
    opponentScouted: progress.opponentScouted,
    planReviewed: progress.planReviewed,
  };

  const remaining = Object.values(completion).filter((done) => !done).length;
  const readinessLabel = remaining === 0 ? 'Ready for kickoff' : `${remaining} prep item${remaining > 1 ? 's' : ''} remaining`;

  return {
    userTeam,
    nextGame,
    opponent,
    matchup,
    opponentSnapshot: opponent
      ? {
        record: getRecord(opponent),
        homeAway: nextGame?.isHome ? 'Home' : 'Away',
        overall: getTeamRating(opponent, 'ovr'),
        offense: oppOff,
        defense: oppDef,
        recentForm: getRecentForm(opponent, league),
      }
      : null,
    teamSnapshot: userTeam
      ? {
        record: getRecord(userTeam),
        overall: getTeamRating(userTeam, 'ovr'),
        offense: userOff,
        defense: userDef,
        recentForm: getRecentForm(userTeam, league),
      }
      : null,
    opponentStrengths: opponentStrengths.slice(0, 2),
    opponentWeaknesses: opponentWeaknesses.slice(0, 2),
    pressurePoints: pressurePoints.slice(0, 2),
    lineupIssues,
    recommendations,
    completion,
    remaining,
    readinessLabel,
    keyMatchupNote: recommendations?.[0]?.title ?? 'No clear tactical edge identified yet.',
  };
}
