import { evaluateWeeklyContext } from './weeklyContext.js';
import { deriveWeeklyPrepState, getNextGame as getPrepNextGame } from './weeklyPrep.js';
import { deriveTeamCapSnapshot, formatMoneyM } from './numberFormatting.js';
import { getHQViewModel } from '../../state/selectors.js';
import { rankHqPriorityItems, getActionContext } from './hqHelpers.js';
import { buildCompletedGamePresentation } from './boxScoreAccess.js';
import { getRecentGames as getArchivedRecentGames } from '../../core/archive/gameArchive.ts';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
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
    pressureSummary: ownerApproval < 45 ? `Owner pressure high (${ownerApproval}%)` : ownerApproval < 60 ? `Owner pressure elevated (${ownerApproval}%)` : `Owner confidence stable (${ownerApproval}%)`,
    blockers: prep?.blockers ?? [],
    actionStatuses: deriveActionStatuses(weekly, nextGame),
    weeklyAgenda: buildWeeklyAgenda({ team, league: vm.league, weekly, prep, nextGame }),
    lastGameSummary: latestArchived ?? fallbackLastGame,
    standingSummary: `${formatRecord(team)} · ${team?.conf ?? ''} ${team?.div ?? ''}`.trim(),
    latestArchived,
    latestGamePresentation,
    teamOverview: [
      { label: 'Cap Space', value: formatMoneyM(cap.capRoom), tone: cap.capRoom < 5 ? 'warning' : 'ok' },
      { label: 'Roster', value: `${rosterCount}/53`, tone: rosterCount > 53 ? 'danger' : 'info' },
      { label: 'Injuries', value: `${safeNum(weekly?.pressurePoints?.injuriesCount, 0)}`, tone: safeNum(weekly?.pressurePoints?.injuriesCount, 0) >= 3 ? 'warning' : 'info' },
      { label: 'Owner Confidence', value: `${safeNum(weekly?.pressurePoints?.ownerApproval ?? vm.league?.ownerApproval ?? vm.league?.ownerMood, 50)}%`, tone: safeNum(weekly?.pressurePoints?.ownerApproval ?? vm.league?.ownerApproval ?? vm.league?.ownerMood, 50) < 50 ? 'danger' : 'ok' },
    ],
    leagueNews,
    navState: {
      activeSection: 'hq',
      suggestedDestinations: ['HQ', 'Team', 'League', 'News', 'More'],
      hasSecondaryAdvance: true,
    },
  };
}

export const selectFranchiseCommandCenter = selectFranchiseHQViewModel;
