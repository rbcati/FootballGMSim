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

export function buildWeeklyAgenda({ team, league, weekly, prep, nextGame }) {
  if (!team || !league) return [];
  const ranked = rankHqPriorityItems(team, league, weekly, nextGame);
  const items = [ranked.featured, ...(ranked.secondary ?? [])]
    .filter(Boolean)
    .map((item, idx) => ({
      id: `priority-${idx}`,
      title: item.label,
      detail: item.detail,
      severity: item.level === 'urgent' ? 'danger' : item.level === 'recommended' ? 'warning' : 'info',
      badge: item.level === 'urgent' ? 'Urgent' : item.level === 'recommended' ? 'Needs attention' : 'Optional',
      tab: item.tab ?? 'HQ',
    }));

  const injuries = (team?.roster ?? []).filter((player) => safeNum(player?.injury?.gamesRemaining ?? player?.injuryWeeksRemaining, 0) > 0).length;
  if (injuries > 0 && !items.some((item) => item.tab?.includes('Injur'))) {
    items.push({
      id: 'injury-followup',
      title: 'Adjust injury replacements',
      detail: `${injuries} player${injuries > 1 ? 's are' : ' is'} unavailable this week.`,
      severity: injuries >= 3 ? 'danger' : 'warning',
      badge: injuries >= 3 ? 'Critical' : 'Monitor',
      tab: 'Team:Injuries',
    });
  }

  if (prep?.completionPct != null && prep.completionPct < 75) {
    items.push({
      id: 'prep-incomplete',
      title: 'Complete weekly prep checklist',
      detail: `Only ${Math.round(prep.completionPct)}% complete before kickoff.`,
      severity: 'warning',
      badge: 'Prep incomplete',
      tab: 'Weekly Prep',
    });
  }

  return items.slice(0, 5);
}

export function selectFranchiseCommandCenter(league) {
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

  return {
    readyState: 'ready',
    seasonLabel: `${vm.league?.year ?? 'Season'} · ${String(vm.league?.phase ?? 'regular').replaceAll('_', ' ')}`,
    weekLabel: `Week ${vm.league?.week ?? 1}`,
    nextOpponent: nextGame?.opp?.name ?? 'TBD',
    nextOpponentRecord: nextGame?.opp ? formatRecord(nextGame.opp) : '—',
    nextGame,
    prep,
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
  };
}
