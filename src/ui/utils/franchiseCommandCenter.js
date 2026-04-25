import { evaluateWeeklyContext } from './weeklyContext.js';
import { deriveWeeklyPrepState, getNextGame as getPrepNextGame } from './weeklyPrep.js';
import { deriveTeamCapSnapshot, formatMoneyM } from './numberFormatting.js';
import { getHQViewModel } from '../../state/selectors.js';
import { rankHqPriorityItems, getActionContext } from './hqHelpers.js';
import { buildCompletedGamePresentation } from './boxScoreAccess.js';
import { getRecentGames as getArchivedRecentGames } from '../../core/archive/gameArchive.ts';
import { logChronicleEvent, syncFranchiseChronicle } from './franchiseChronicle.js';
import { applyEventDecision, pickWorstEventChoice, resolveWeeklyEvent } from './franchiseEvents.js';
import { buildWeeklyIntelligence, buildActionableWeeklyPriorities } from './weeklyIntelligence.js';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getScoreDiffs(teamId, scheduleWeeks = []) {
  const diffs = [];
  for (const week of [...scheduleWeeks].sort((a, b) => safeNum(a?.week) - safeNum(b?.week))) {
    for (const game of week?.games ?? []) {
      if (!game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== Number(teamId) && awayId !== Number(teamId)) continue;
      const homeScore = safeNum(game?.homeScore ?? game?.score?.home);
      const awayScore = safeNum(game?.awayScore ?? game?.score?.away);
      diffs.push(homeId === Number(teamId) ? homeScore - awayScore : awayScore - homeScore);
    }
  }
  return diffs;
}

function deriveMomentum(teamId, scheduleWeeks = []) {
  const recent = getScoreDiffs(teamId, scheduleWeeks).slice(-3);
  const total = recent.reduce((sum, value) => sum + value, 0);
  if (!recent.length) return { icon: '→', label: 'No trend yet' };
  if (total > 0) return { icon: '↗', label: `Trending up (${total > 9 ? '+' : ''}${total} in last ${recent.length})` };
  if (total < 0) return { icon: '↘', label: `Trending down (${total} in last ${recent.length})` };
  return { icon: '→', label: `Flat trend (last ${recent.length})` };
}

function parsePlayLogMoment(raw, fallback = 'Key swing play') {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const compact = raw.replace(/\s+/g, ' ').trim();
  const quarterMatch = compact.match(/Q[1-4]|OT/i);
  const quarter = quarterMatch ? quarterMatch[0].toUpperCase() : null;
  const clipped = compact.length > 88 ? `${compact.slice(0, 85).trimEnd()}…` : compact;
  return quarter ? `${clipped} (${quarter})` : clipped;
}

function deriveLastGameMoments(lastGameSummary) {
  const logs = lastGameSummary?.boxScore?.playLogs;
  if (!Array.isArray(logs) || !logs.length) return [];
  const picks = [logs[0], logs[Math.floor(logs.length / 2)], logs[logs.length - 1]].filter(Boolean);
  return picks.map((entry, idx) => ({
    id: `moment-${idx}`,
    text: parsePlayLogMoment(typeof entry === 'string' ? entry : entry?.text),
  }));
}

function toMandateDelta({ ownerApproval, capRoom, expiringStarters, incomingTradeCount }) {
  const deltas = [];
  deltas.push({ label: 'Win this week', delta: ownerApproval < 55 ? +15 : +10 });
  deltas.push({ label: 'Trade for a starter', delta: incomingTradeCount > 0 ? +10 : +8 });
  deltas.push({ label: 'Ignore expiring contracts', delta: expiringStarters >= 4 ? -20 : -12 });
  if (capRoom < 0) deltas.push({ label: 'Stay over cap', delta: -18 });
  return deltas;
}

function estimateResignCost(player) {
  const annual = safeNum(player?.contract?.baseAnnual ?? player?.contract?.salary ?? player?.contract?.amount, 0);
  const ovr = safeNum(player?.ovr, 70);
  const baseline = annual > 0 ? annual : Math.max(1.5, (ovr - 55) * 0.35);
  return Math.round(baseline * 10) / 10;
}

function getDisplayName(player) {
  const composed = `${player?.firstName ?? ''} ${player?.lastName ?? ''}`.trim();
  if (player?.name) return player.name;
  if (composed) return composed;
  return `Player ${player?.id ?? ''}`.trim();
}

function formatStreak(recentResults = []) {
  const tail = Array.isArray(recentResults) ? recentResults.slice().reverse() : [];
  if (!tail.length) return '—';
  const first = String(tail[0] ?? '').toUpperCase();
  if (!['W', 'L', 'T'].includes(first)) return '—';
  let count = 0;
  for (const value of tail) {
    if (String(value ?? '').toUpperCase() !== first) break;
    count += 1;
  }
  return `${first}${count}`;
}

function sortByStandings(teams = []) {
  return [...teams].sort((a, b) => {
    const aGames = safeNum(a?.wins) + safeNum(a?.losses) + safeNum(a?.ties);
    const bGames = safeNum(b?.wins) + safeNum(b?.losses) + safeNum(b?.ties);
    const aPct = aGames ? (safeNum(a?.wins) + safeNum(a?.ties) * 0.5) / aGames : 0;
    const bPct = bGames ? (safeNum(b?.wins) + safeNum(b?.ties) * 0.5) / bGames : 0;
    if (bPct !== aPct) return bPct - aPct;
    return safeNum(b?.ptsFor) - safeNum(a?.ptsFor);
  });
}

function winPct(team) {
  const games = safeNum(team?.wins) + safeNum(team?.losses) + safeNum(team?.ties);
  return games > 0 ? (safeNum(team?.wins) + safeNum(team?.ties) * 0.5) / games : 0;
}

export function buildPowerRankings(league, { limit = 32 } = {}) {
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  return [...teams]
    .sort((a, b) => {
      const aScore = winPct(a) * 100 + (safeNum(a?.ptsFor) - safeNum(a?.ptsAgainst)) * 0.08 + safeNum((a?.recentResults ?? []).slice(-3).filter((r) => String(r).toUpperCase() === 'W').length) * 0.9;
      const bScore = winPct(b) * 100 + (safeNum(b?.ptsFor) - safeNum(b?.ptsAgainst)) * 0.08 + safeNum((b?.recentResults ?? []).slice(-3).filter((r) => String(r).toUpperCase() === 'W').length) * 0.9;
      return bScore - aScore;
    })
    .slice(0, limit)
    .map((team, index) => ({
      rank: index + 1,
      teamId: team?.id,
      teamAbbr: team?.abbr ?? team?.name ?? `Team ${team?.id ?? ''}`.trim(),
      summary: `${team?.gmPersona ?? 'Balanced'} outlook · ${formatRecord(team)} record`,
    }));
}

export function buildLeagueHeadlines(league, { limit = 10 } = {}) {
  const week = safeNum(league?.week, 1);
  const raw = Array.isArray(league?.newsItems) ? league.newsItems : [];
  return raw
    .filter((item) => safeNum(item?.week ?? item?.meta?.week, week) <= week)
    .slice(-limit)
    .reverse()
    .map((item, index) => ({
      id: item?.id ?? `league-headline-${index}`,
      headline: item?.headline ?? item?.title ?? 'League update',
      detail: item?.summary ?? item?.body ?? item?.detail ?? '',
      timestamp: `Week ${safeNum(item?.week ?? item?.meta?.week, week)}`,
      teamId: item?.teamId ?? null,
    }));
}

function formatRecord(team) {
  if (!team) return '0-0';
  const ties = safeNum(team.ties);
  return `${safeNum(team.wins)}-${safeNum(team.losses)}${ties ? `-${ties}` : ''}`;
}

function getPrevGame(league) {
  const weeks = [...(league?.schedule?.weeks ?? [])].sort((a, b) => Number(b?.week ?? 0) - Number(a?.week ?? 0));
  for (const week of weeks) {
    const games = [...(week?.games ?? [])].reverse();
    for (const game of games) {
      if (!game?.played) continue;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      if (homeId !== Number(league?.userTeamId) && awayId !== Number(league?.userTeamId)) continue;
      return { ...game, week: Number(week?.week ?? league?.week ?? 1), homeId, awayId };
    }
  }
  return null;
}

function deriveActionStatuses(weekly, nextGame) {
  return {
    lineup: { subtitle: getActionContext('lineup', weekly, nextGame), badge: safeNum(weekly?.pressurePoints?.injuriesCount, 0) > 1 ? `${safeNum(weekly?.pressurePoints?.injuriesCount, 0)} injuries` : null },
    gameplan: { subtitle: getActionContext('gameplan', weekly, nextGame), badge: nextGame?.opp?.ovr && safeNum(nextGame.opp.ovr) >= 85 ? 'Tough matchup' : null },
    scouting: { subtitle: getActionContext('opponent', weekly, nextGame), badge: weekly?.scouting?.completionPct != null && weekly.scouting.completionPct < 70 ? 'Needs attention' : null },
    news: { subtitle: getActionContext('news', weekly, nextGame), badge: safeNum(weekly?.pressurePoints?.incomingTradeCount, 0) > 0 ? `${safeNum(weekly?.pressurePoints?.incomingTradeCount, 0)} unresolved` : null },
  };
}

function toSeverity(level) {
  if (level === 'urgent' || level === 'blocker') return 'danger';
  if (level === 'recommended' || level === 'warning') return 'warning';
  return 'info';
}


const DEFAULT_GM_PERSONAS = ['Trader', 'Draft-and-Develop', 'Win-Now', 'Tanker', 'Cap Hoarder', 'Loyalist'];

function ensureLeaguePersonasAndRelationships(league) {
  if (!league || typeof league !== 'object') return;
  if (!league.gmRelationships || typeof league.gmRelationships !== 'object') league.gmRelationships = {};
  for (const team of league.teams ?? []) {
    const key = String(team?.id ?? '');
    if (!team?.gmPersona) {
      const idx = Math.abs(safeNum(team?.id, 0)) % DEFAULT_GM_PERSONAS.length;
      team.gmPersona = DEFAULT_GM_PERSONAS[idx];
    }
    if (!(key in league.gmRelationships)) league.gmRelationships[key] = 0;
  }
}

function maybeQueueWeeklyEvent(league) {
  if (!league || typeof league !== 'object') return null;
  if (!Array.isArray(league.pendingWeeklyEvents)) league.pendingWeeklyEvents = [];
  const currentWeek = safeNum(league?.week, 1);
  const unresolved = league.pendingWeeklyEvents.find((evt) => evt?.state !== 'resolved');
  if (unresolved) {
    const currentWeek = safeNum(league?.week, 1);
    const trackedWeek = safeNum(unresolved?.lastCheckedWeek, safeNum(unresolved?.week, currentWeek));
    const elapsed = Math.max(0, currentWeek - trackedWeek);
    if (elapsed > 0) {
      unresolved.ignoredWeeks = safeNum(unresolved?.ignoredWeeks, 0) + elapsed;
      unresolved.lastCheckedWeek = currentWeek;
    }
    if (safeNum(unresolved?.ignoredWeeks, 0) >= 2) {
      const fallbackChoice = pickWorstEventChoice(unresolved);
      if (fallbackChoice?.id) {
        const resolved = applyEventDecision(unresolved, fallbackChoice.id);
        Object.assign(unresolved, resolved, { autoResolved: true, ignoredTag: 'Ignored — escalated' });
        logChronicleEvent(league, {
          week: currentWeek,
          season: safeNum(league?.year, 0),
          type: 'weekly_event_auto_resolve',
          headline: unresolved?.headline ?? 'Franchise event auto-resolved',
          outcome: `${resolved?.choiceLabel ?? fallbackChoice.label} · Ignored — escalated`,
          summary: 'A weekly event was ignored for multiple weeks and escalated.',
          meta: { ignoredWeeks: safeNum(unresolved?.ignoredWeeks, 0) },
        });
      }
    }
    return unresolved;
  }
  const resolvedThisWeek = (league.pendingWeeklyEvents ?? []).some((evt) => safeNum(evt?.week) === currentWeek);
  if (resolvedThisWeek) return null;
  const event = resolveWeeklyEvent({ league });
  if (event) league.pendingWeeklyEvents.push(event);
  return event;
}

export function buildWeeklyAgenda({ team, league, weekly, prep, nextGame }) {
  if (!team || !league) return [];
  const ranked = rankHqPriorityItems(team, league, weekly, nextGame);
  const mappedRanked = [ranked.featured, ...(ranked.secondary ?? []), ...((weekly?.urgentItems ?? []).slice(0, 3))]
    .filter(Boolean)
    .map((item, idx) => ({
      id: item?.id ?? `priority-${idx}`,
      icon: item.level === 'urgent' ? '⛳' : item.level === 'recommended' ? '⚠️' : '📌',
      title: item.label,
      description: item.detail,
      severity: toSeverity(item.level),
      ctaLabel: item.verb ?? 'Open',
      targetRoute: item.tab ?? 'HQ',
    }));

  const items = [...mappedRanked];

  const injuries = (team?.roster ?? []).filter((player) => safeNum(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining, 0) > 0).length;
  if (injuries > 0 && !items.some((item) => item.targetRoute?.includes('Injur'))) {
    items.push({
      id: 'injury-followup',
      icon: injuries >= 3 ? '🚑' : '🩹',
      title: 'Adjust injury replacements',
      description: `${injuries} player${injuries > 1 ? 's are' : ' is'} unavailable this week.`,
      severity: injuries >= 3 ? 'danger' : 'warning',
      ctaLabel: 'Review injuries',
      targetRoute: 'Team:Injuries',
    });
  }

  if (prep?.completionPct != null && prep.completionPct < 75) {
    items.push({
      id: 'prep-incomplete',
      icon: '🧠',
      title: 'Complete weekly prep checklist',
      description: `Only ${Math.round(prep.completionPct)}% complete before kickoff.`,
      severity: 'warning',
      ctaLabel: 'Open prep',
      targetRoute: 'Weekly Prep',
    });
  }

  if ((weekly?.scouting?.completionPct ?? 100) < 70) {
    items.push({
      id: 'scouting-incomplete',
      icon: '🔬',
      title: 'Scouting package unfinished',
      description: `${Math.round(safeNum(weekly?.scouting?.completionPct, 0))}% of this week’s opponent report is complete.`,
      severity: 'info',
      ctaLabel: 'Scout opponent',
      targetRoute: 'Weekly Prep',
    });
  }

  const moraleState = String(weekly?.chemistry?.state ?? '').toLowerCase();
  if ((moraleState.includes('fragmented') || moraleState.includes('uneasy')) && !items.some((item) => item.id === 'morale-alert')) {
    items.push({
      id: 'morale-alert',
      icon: '🧠',
      title: 'Locker room morale check',
      description: weekly?.chemistry?.reasons?.[0] ?? 'Team chemistry needs attention before kickoff.',
      severity: moraleState.includes('fragmented') ? 'danger' : 'warning',
      ctaLabel: 'Review team pulse',
      targetRoute: 'Team:Overview',
    });
  }

  const startersMissing = safeNum(team?.depthChartWarnings?.missingStarters ?? team?.missingStarters ?? weekly?.pressurePoints?.missingStarters, 0);
  if (startersMissing > 0 && !items.some((item) => item.id === 'missing-starters')) {
    items.push({
      id: 'missing-starters',
      icon: '🧩',
      title: 'Starter roles unresolved',
      description: `${startersMissing} starting slot${startersMissing > 1 ? 's are' : ' is'} unresolved this week.`,
      severity: startersMissing >= 2 ? 'danger' : 'warning',
      ctaLabel: 'Set lineup',
      targetRoute: 'Team:Roster / Depth',
    });
  }

  const staffVacancies = safeNum(team?.staffVacancies ?? league?.staffVacancies, 0);
  if (staffVacancies > 0 && !items.some((item) => item.id === 'staff-vacancies')) {
    items.push({
      id: 'staff-vacancies',
      icon: '🧑‍💼',
      title: 'Staff vacancy requires action',
      description: `${staffVacancies} open staff role${staffVacancies > 1 ? 's are' : ' is'} affecting weekly operations.`,
      severity: 'warning',
      ctaLabel: 'Open staff',
      targetRoute: 'Staff',
    });
  }

  const unresolvedEvent = (league?.pendingWeeklyEvents ?? []).find((event) => event?.state !== 'resolved');
  if (unresolvedEvent) {
    items.unshift({
      id: `weekly-event-${unresolvedEvent.id}`,
      icon: '🗞️',
      title: unresolvedEvent.headline ?? 'Franchise event awaiting decision',
      description: 'Decide now or risk an automatic negative outcome.',
      severity: 'warning',
      ctaLabel: 'Open event',
      targetRoute: 'HQ:Events',
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${String(item?.title ?? '').toLowerCase()}|${String(item?.targetRoute ?? '').toLowerCase()}`;
    if (!item?.title || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, 5);
}

export function selectWeeklyAgenda(league) {
  const vm = getHQViewModel(league);
  if (!vm.userTeam) return [];
  const weekly = evaluateWeeklyContext(vm.league);
  const prep = deriveWeeklyPrepState(vm.league);
  const nextGame = getPrepNextGame(vm.league);
  return buildWeeklyAgenda({ team: vm.userTeam, league: vm.league, weekly, prep, nextGame });
}

export function selectFranchiseHQViewModel(league) {
  const vm = getHQViewModel(league);
  if (!vm.userTeam) {
    return { readyState: 'loading', weeklyAgenda: [] };
  }
  const team = vm.userTeam;
  ensureLeaguePersonasAndRelationships(vm.league);
  const weekly = evaluateWeeklyContext(vm.league);
  const prep = deriveWeeklyPrepState(vm.league);
  const nextGame = getPrepNextGame(vm.league);
  const previousScheduledGame = getPrevGame(vm.league);
  const latestArchived = getArchivedRecentGames(1)?.[0] ?? null;
  const latestGamePresentation = latestArchived
    ? buildCompletedGamePresentation(
      {
        ...latestArchived,
        homeScore: latestArchived?.score?.home,
        awayScore: latestArchived?.score?.away,
      },
      { seasonId: vm.league?.seasonId, week: Number(latestArchived?.week ?? vm.league?.week ?? 1), source: 'hq_last_game' },
    )
    : null;

  const fallbackLastGame = previousScheduledGame
    ? {
      id: previousScheduledGame?.id,
      homeAbbr: previousScheduledGame?.home?.abbr ?? 'HOME',
      awayAbbr: previousScheduledGame?.away?.abbr ?? 'AWAY',
      score: {
        home: safeNum(previousScheduledGame?.homeScore),
        away: safeNum(previousScheduledGame?.awayScore),
      },
      week: previousScheduledGame?.week,
      userWon:
          (previousScheduledGame?.homeId === Number(vm.league?.userTeamId)
            && safeNum(previousScheduledGame?.homeScore) > safeNum(previousScheduledGame?.awayScore))
          || (previousScheduledGame?.awayId === Number(vm.league?.userTeamId)
            && safeNum(previousScheduledGame?.awayScore) > safeNum(previousScheduledGame?.homeScore)),
    }
    : null;

  const cap = deriveTeamCapSnapshot(team, { fallbackCapTotal: 255 });
  const rosterCount = Array.isArray(team?.roster) ? team.roster.length : safeNum(team?.rosterCount, 0);
  const leagueNews = (Array.isArray(vm.league?.newsItems) ? vm.league.newsItems : [])
    .slice(0, 4)
    .map((item, index) => ({ id: item.id ?? `news-${index}`, headline: item.headline ?? item.title ?? 'League update', detail: item.summary ?? item.body ?? null }));

  const ownerApproval = safeNum(weekly?.pressurePoints?.ownerApproval ?? vm.league?.ownerApproval ?? vm.league?.ownerMood, 50);
  const momentum = deriveMomentum(team?.id, vm.league?.schedule?.weeks ?? []);
  const lastGameMoments = deriveLastGameMoments(latestArchived ?? fallbackLastGame);
  const prepChecklist = [
    { key: 'lineupChecked', label: 'Set Lineup', tab: 'Team:Roster / Depth', done: Boolean(prep?.completion?.lineupChecked) },
    { key: 'opponentScouted', label: 'Scout Opponent', tab: 'Weekly Prep', done: Boolean(prep?.completion?.opponentScouted) },
    { key: 'planReviewed', label: 'Game Plan', tab: 'Game Plan', done: Boolean(prep?.completion?.planReviewed) },
  ];
  const expiringStarters = (team?.roster ?? [])
    .filter((player) => safeNum(player?.contract?.yearsRemaining ?? player?.contract?.years ?? 0) <= 1 && safeNum(player?.ovr, 0) >= 75)
    .sort((a, b) => safeNum(b?.ovr) - safeNum(a?.ovr))
    .slice(0, 8)
    .map((player) => ({
      id: player?.id,
      name: getDisplayName(player),
      pos: player?.pos ?? '—',
      ovr: safeNum(player?.ovr, 0),
      estCost: estimateResignCost(player),
    }));
  const mandateDeltas = toMandateDelta({
    ownerApproval,
    capRoom: cap.capRoom,
    expiringStarters: expiringStarters.length,
    incomingTradeCount: safeNum(weekly?.pressurePoints?.incomingTradeCount, 0),
  });
  const capTotal = Math.max(1, safeNum(cap.capTotal, 255));
  const capUsed = safeNum(cap.capUsed, 0);
  const deadCap = safeNum(team?.deadCap ?? team?.deadMoney ?? 0);
  const capUsedPct = Math.max(0, Math.min(100, (capUsed / capTotal) * 100));
  const deadCapPct = Math.max(0, Math.min(capUsedPct, (deadCap / capTotal) * 100));
  const projectedRollover = Math.round((cap.capRoom - deadCap * 0.25) * 10) / 10;
  const divisionTeams = (vm.league?.teams ?? []).filter((candidate) => Number(candidate?.conf) === Number(team?.conf) && Number(candidate?.div) === Number(team?.div));
  const divisionMiniStandings = sortByStandings(divisionTeams).slice(0, 4).map((candidate) => ({
    id: candidate?.id,
    abbr: candidate?.abbr ?? candidate?.name ?? 'TEAM',
    record: formatRecord(candidate),
    pf: safeNum(candidate?.ptsFor, 0),
    pa: safeNum(candidate?.ptsAgainst, 0),
    streak: formatStreak(candidate?.recentResults),
    isUser: Number(candidate?.id) === Number(team?.id),
  }));
  const latestWeek = [...(vm.league?.schedule?.weeks ?? [])]
    .filter((week) => (week?.games ?? []).some((game) => game?.played))
    .sort((a, b) => safeNum(b?.week) - safeNum(a?.week))[0];
  const spotlightResults = (latestWeek?.games ?? [])
    .filter((game) => game?.played)
    .map((game, idx) => {
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      const homeTeam = vm.league?.teams?.find((candidate) => Number(candidate?.id) === homeId);
      const awayTeam = vm.league?.teams?.find((candidate) => Number(candidate?.id) === awayId);
      const total = safeNum(game?.homeScore) + safeNum(game?.awayScore);
      const margin = Math.abs(safeNum(game?.homeScore) - safeNum(game?.awayScore));
      return {
        id: game?.id ?? `spotlight-${idx}`,
        label: `${awayTeam?.abbr ?? 'AWY'} ${safeNum(game?.awayScore)} @ ${homeTeam?.abbr ?? 'HME'} ${safeNum(game?.homeScore)}${safeNum(game?.overtimePeriods ?? game?.ot, 0) > 0 ? ' OT' : ''}`,
        scoreWeight: total + (margin <= 3 ? 8 : 0),
      };
    })
    .sort((a, b) => b.scoreWeight - a.scoreWeight)
    .slice(0, 2);
  const queuedEvent = maybeQueueWeeklyEvent(vm.league);
  const story = syncFranchiseChronicle(vm.league);
  const injuredSpotlight = (team?.roster ?? [])
    .filter((player) => safeNum(player?.injuryWeeksRemaining ?? player?.injuredWeeks ?? player?.injury?.gamesRemaining ?? 0) > 0)
    .sort((a, b) => safeNum(b?.ovr) - safeNum(a?.ovr))[0] ?? null;

  return {
    readyState: 'ready',
    seasonLabel: `${vm.league?.year ?? 'Season'} · ${String(vm.league?.phase ?? 'regular').replaceAll('_', ' ')}`,
    weekLabel: `Week ${vm.league?.week ?? 1}`,
    teamRecord: formatRecord(team),
    nextOpponent: nextGame?.opp?.name ?? 'TBD',
    nextOpponentRecord: nextGame?.opp ? formatRecord(nextGame.opp) : '—',
    nextGame,
    prep,
    prepStatus: prep?.readinessLabel ?? 'Prep status unavailable',
    prepChecklist,
    momentum,
    lastGameMoments,
    pressureSummary: ownerApproval < 45 ? `Owner pressure high (${ownerApproval}%)` : ownerApproval < 60 ? `Owner pressure elevated (${ownerApproval}%)` : `Owner confidence stable (${ownerApproval}%)`,
    ownerMandate: {
      approval: ownerApproval,
      tone: ownerApproval < 45 ? 'danger' : ownerApproval < 65 ? 'warning' : 'ok',
      deltas: mandateDeltas,
      expiringStarters,
    },
    blockers: prep?.blockers ?? [],
    actionStatuses: deriveActionStatuses(weekly, nextGame),
    weeklyIntelligence: buildWeeklyIntelligence({ league: vm.league, team, nextGame, prep }),
    weeklyAgenda: buildActionableWeeklyPriorities({
      team,
      nextGame,
      prep,
      weeklyAgenda: buildWeeklyAgenda({ team, league: vm.league, weekly, prep, nextGame }),
    }),
    lastGameSummary: latestArchived ?? fallbackLastGame,
    standingSummary: `${formatRecord(team)} · ${team?.conf ?? ''} ${team?.div ?? ''}`.trim(),
    latestArchived,
    latestGamePresentation,
    teamOverview: [
      { label: 'Cap Space', value: formatMoneyM(cap.capRoom), tone: cap.capRoom < 5 ? 'warning' : 'ok' },
      { label: 'Roster Count', value: `${rosterCount}/53`, tone: rosterCount > 53 ? 'danger' : 'info' },
      { label: 'Injuries', value: `${safeNum(weekly?.pressurePoints?.injuriesCount, 0)}`, tone: safeNum(weekly?.pressurePoints?.injuriesCount, 0) >= 3 ? 'warning' : 'info' },
      { label: 'Morale', value: weekly?.chemistry?.state ?? 'Stable', tone: String(weekly?.chemistry?.state ?? '').toLowerCase().includes('fragmented') ? 'danger' : String(weekly?.chemistry?.state ?? '').toLowerCase().includes('uneasy') ? 'warning' : 'ok' },
      { label: 'Owner Approval', value: `${safeNum(weekly?.pressurePoints?.ownerApproval ?? vm.league?.ownerApproval ?? vm.league?.ownerMood, 50)}%`, tone: safeNum(weekly?.pressurePoints?.ownerApproval ?? vm.league?.ownerApproval ?? vm.league?.ownerMood, 50) < 50 ? 'danger' : 'ok' },
    ],
    capSnapshot: {
      capTotal,
      capUsed,
      capRoom: safeNum(cap.capRoom, 0),
      capUsedPct,
      deadCap,
      deadCapPct,
      projectedRollover,
      tone: safeNum(cap.capRoom, 0) < 5 ? 'danger' : safeNum(cap.capRoom, 0) < 12 ? 'warning' : 'ok',
    },
    divisionMiniStandings,
    spotlightResults,
    injurySpotlight: injuredSpotlight
      ? {
        id: injuredSpotlight?.id,
        name: getDisplayName(injuredSpotlight),
        pos: injuredSpotlight?.pos ?? '—',
        ovr: safeNum(injuredSpotlight?.ovr, 0),
        severity: safeNum(injuredSpotlight?.injuryWeeksRemaining ?? injuredSpotlight?.injuredWeeks ?? injuredSpotlight?.injury?.gamesRemaining, 0) >= 8
          ? 'IR'
          : safeNum(injuredSpotlight?.injuryWeeksRemaining ?? injuredSpotlight?.injuredWeeks ?? injuredSpotlight?.injury?.gamesRemaining, 0) >= 2
            ? 'OUT'
            : 'DTD',
        returnWeek: safeNum(vm.league?.week, 1) + safeNum(injuredSpotlight?.injuryWeeksRemaining ?? injuredSpotlight?.injuredWeeks ?? injuredSpotlight?.injury?.gamesRemaining, 0),
      }
      : null,
    leagueNews,
    story,
    weeklyEvent: queuedEvent,
    powerRankings: buildPowerRankings(vm.league, { limit: 32 }),
    leagueHeadlines: buildLeagueHeadlines(vm.league, { limit: 10 }),
    navState: {
      activeSection: 'hq',
      suggestedDestinations: ['HQ', 'Team', 'League', 'News', 'Story', 'More'],
      hasSecondaryAdvance: true,
    },
  };
}

export const selectFranchiseCommandCenter = selectFranchiseHQViewModel;
