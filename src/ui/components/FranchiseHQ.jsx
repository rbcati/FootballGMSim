import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { autoBuildDepthChart, depthWarnings } from '../../core/depthChart.js';
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import { EmptyState, StatusChip, ActionTile, SectionCard, WeeklyAgenda, CompactNewsCard } from './ScreenSystem.jsx';
import { getLastGameDisplay, getLatestUserCompletedGame, getNextOpponentDisplay } from '../utils/hqGameDisplay.js';
import { HQIcon, TeamIdentityBadge } from './HQVisuals.jsx';

const BOTTOM_NAV_ITEMS = [
  { label: 'Home', route: 'HQ', icon: 'home', active: true },
  { label: 'Team', route: 'Team:Overview', icon: 'team' },
  { label: 'League', route: 'League:Overview', icon: 'league' },
  { label: 'News', route: 'News', icon: 'news' },
  { label: 'More', route: 'More', icon: 'more' },
];

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatRecordInline(record) {
  if (!record || record === '—') return '0-0';
  return record;
}

export default function FranchiseHQ({ league, onNavigate, onAdvanceWeek, busy, simulating }) {
  const [lineupToast, setLineupToast] = useState(null);
  const command = useMemo(() => selectFranchiseHQViewModel(league), [league]);

  if (command.readyState !== 'ready') {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const userTeam = (league?.teams ?? []).find((t) => Number(t?.id) === Number(league?.userTeamId));
  const opponent = command.nextGame?.opp ?? null;
  const nextOpponentDisplay = useMemo(() => getNextOpponentDisplay(command.nextGame), [command.nextGame]);

  const handleSetLineup = () => {
    const team = (league?.teams ?? []).find((t) => Number(t?.id) === Number(league?.userTeamId));
    const roster = Array.isArray(team?.roster) ? team.roster : [];
    const existingAssignments = {};
    for (const player of roster) {
      const rowKey = player?.depthChart?.rowKey;
      if (!rowKey) continue;
      if (!existingAssignments[rowKey]) existingAssignments[rowKey] = [];
      existingAssignments[rowKey].push(player.id);
    }
    const assignments = autoBuildDepthChart(roster, existingAssignments);
    const warnings = depthWarnings(assignments, roster);
    const hasBlockingLineupIssue = warnings.some((warning) => warning.level === 'error');
    if (!hasBlockingLineupIssue) markWeeklyPrepStep(league, 'lineupChecked', true);
    setLineupToast(hasBlockingLineupIssue ? 'Depth chart still has missing starters.' : 'Lineup is valid. Opening depth chart.');
    window.setTimeout(() => setLineupToast(null), 2200);
    onNavigate?.('Team:Roster / Depth');
  };

  const actionTiles = [
    { title: 'Game Plan', icon: <HQIcon name="gamePlan" size={22} />, subtitle: command.actionStatuses.gameplan.subtitle, badge: command.actionStatuses.gameplan.badge || 'Recommended', onClick: () => { markWeeklyPrepStep(league, 'planReviewed', true); onNavigate?.('Game Plan'); } },
    { title: 'Set Lineup', icon: <HQIcon name="lineup" size={22} />, subtitle: command.actionStatuses.lineup.subtitle, badge: command.actionStatuses.lineup.badge, onClick: handleSetLineup },
    { title: 'Training', icon: <HQIcon name="target" size={22} />, subtitle: 'Adjust weekly player focus', badge: null, onClick: () => onNavigate?.('Training') },
    { title: 'Scout Opponent', icon: <HQIcon name="scout" size={22} />, subtitle: command.actionStatuses.scouting.subtitle, badge: command.actionStatuses.scouting.badge || 'New report', onClick: () => { markWeeklyPrepStep(league, 'opponentScouted', true); onNavigate?.('Weekly Prep'); } },
  ];

  const lastGame = useMemo(() => getLatestUserCompletedGame(league) ?? command.lastGameSummary ?? null, [league, command.lastGameSummary]);
  const lastGameDisplay = useMemo(() => getLastGameDisplay(lastGame, league?.userTeamId), [lastGame, league?.userTeamId]);
  const footerDays = Math.max(0, 7 - ((safeNum(league?.week, 1) - 1) % 7));
  const heroMeta = useMemo(() => {
    const homeAwayVerb = command.nextGame?.isHome ? 'vs' : '@';
    const divisionRows = command.divisionMiniStandings ?? [];
    const divisionLeader = divisionRows[0] ?? null;
    const userRow = divisionRows.find((row) => row?.isUser) ?? null;
    const leaderWins = safeNum(divisionLeader?.record?.split('-')?.[0]);
    const userWins = safeNum(userRow?.record?.split('-')?.[0]);
    const gamesBehind = Math.max(0, leaderWins - userWins);
    const standingDetail = divisionLeader && !divisionLeader?.isUser ? `${gamesBehind || 1} GB behind ${divisionLeader?.abbr ?? 'division lead'}` : 'Leads division race';

    const lastTwo = Array.isArray(userTeam?.recentResults) ? userTeam.recentResults.slice(-2).map((r) => String(r).toUpperCase()) : [];
    const hasTwoWins = lastTwo.length === 2 && lastTwo.every((result) => result === 'W');
    const hasTwoLosses = lastTwo.length === 2 && lastTwo.every((result) => result === 'L');
    const lastGameStory = hasTwoWins ? 'Won 2 straight heading into kickoff' : hasTwoLosses ? 'Need division response this week' : (lastGameDisplay.heroLine.startsWith('W') ? 'Carrying momentum from last win' : 'Rebound spot after last result');

    const operationHeading = `WEEK ${safeNum(league?.week, 1)} ${homeAwayVerb} ${opponent?.abbr ?? command.nextOpponent ?? 'TBD'}`.toUpperCase();
    const matchupLine = [`${homeAwayVerb} ${opponent?.abbr ?? command.nextOpponent ?? 'TBD'}`, formatRecordInline(command.nextOpponentRecord), `Week ${safeNum(league?.week, 1)}`].join(' • ');
    const trendLine = hasTwoWins ? 'Win streak 2' : hasTwoLosses ? 'Loss streak 2' : 'Momentum balanced';
    const nextOppSummary = [command.standingSummary, matchupLine, trendLine].filter(Boolean).join(' • ');
    return { standingDetail, lastGameStory, operationHeading, nextOppSummary };
  }, [command.divisionMiniStandings, command.nextGame?.isHome, command.nextOpponent, command.nextOpponentRecord, command.standingSummary, lastGameDisplay.heroLine, league?.week, opponent?.abbr, userTeam?.recentResults]);

  const capSpace = command.teamOverview?.find((item) => item.label === 'Cap Space')?.value ?? '—';
  const weeklyIntel = useMemo(() => command.weeklyIntelligence?.insights ?? [], [command.weeklyIntelligence?.insights]);
  const postAdvanceNote = useMemo(() => {
    const latestNews = (command.leagueNews ?? [])[0] ?? null;
    const recordDelta = lastGame ? `Record now ${formatRecordInline(command.teamRecord)}` : 'Advance to generate game feedback';
    return {
      result: lastGameDisplay.overviewLine,
      recordDelta,
      nextOpponent: `${nextOpponentDisplay.isHome ? 'vs' : '@'} ${nextOpponentDisplay.opponentAbbr}`,
      note: latestNews?.headline ?? 'No new league bulletin yet.',
    };
  }, [command.leagueNews, command.teamRecord, lastGame, lastGameDisplay.overviewLine, nextOpponentDisplay.isHome, nextOpponentDisplay.opponentAbbr]);
  const nextOpponents = useMemo(() => (league?.schedule?.weeks ?? [])
    .filter((week) => safeNum(week?.week, 0) >= safeNum(league?.week, 1))
    .flatMap((week) => (week?.games ?? []).map((game) => ({ ...game, week: week.week })))
    .filter((game) => {
      if (game?.played) return false;
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      return homeId === Number(league?.userTeamId) || awayId === Number(league?.userTeamId);
    })
    .slice(0, 3)
    .map((game) => {
      const homeId = Number(game?.home?.id ?? game?.home);
      const awayId = Number(game?.away?.id ?? game?.away);
      const isHome = homeId === Number(league?.userTeamId);
      const oppId = isHome ? awayId : homeId;
      const oppTeam = (league?.teams ?? []).find((t) => Number(t?.id) === Number(oppId));
      return `W${safeNum(game?.week, 0)} ${isHome ? 'vs' : '@'} ${oppTeam?.abbr ?? 'TBD'}`;
    }), [league]);

  useEffect(() => {
    document.title = `Franchise HQ • ${command.weekLabel} • Football GM Sim`;
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement('meta');
      description.setAttribute('name', 'description');
      document.head.appendChild(description);
    }
    description.setAttribute('content', 'Manage weekly prep, review your last result, and advance your franchise one week at a time.');
  }, [command.weekLabel]);

  return (
    <div className="app-screen-stack franchise-hq franchise-command-center" role="main" aria-label="Franchise HQ weekly command center">
      <section className="app-hq-topbar card" aria-label="Franchise HQ top bar">
        <div className="app-hq-topbar__left">
          <span>{command.seasonLabel}</span>
          <strong>{command.weekLabel.toUpperCase()}</strong>
        </div>
        <div className="app-hq-topbar__team">
          <span>{formatRecordInline(command.teamRecord)}</span>
          <strong>{capSpace} cap</strong>
        </div>
      </section>

      <section className="app-hq-matchup-hero card" aria-label="Weekly Hero" aria-live="polite">
        <div className="app-hq-matchup-main">
          <div className="app-hq-hero-copy">
            <span className="app-hq-matchup-hero__eyebrow">Week Command • {command.weekLabel}</span>
            <h1 className="app-hq-hero-title">{heroMeta.operationHeading}</h1>
            <p>{nextOpponentDisplay.detail} • {heroMeta.nextOppSummary}</p>
          </div>
          <div className="app-hq-team app-hq-team--opp">
            <TeamIdentityBadge team={opponent} size={112} variant="circle" />
            <strong>{nextOpponentDisplay.opponentAbbr}</strong>
            <span>{formatRecordInline(command.nextOpponentRecord)}</span>
          </div>
        </div>

        <div className="app-hq-hero-subcards">
          <div className="app-hq-hero-subcard">
            <div className="app-hq-hero-subcard__head">
              <HQIcon name="lastGame" size={14} />
              <strong>Last Result</strong>
            </div>
            <p className="app-hq-hero-subcard__value">{lastGameDisplay.heroLine}</p>
            <small>{lastGame ? heroMeta.lastGameStory : 'No final yet. Build your plan and get ready for kickoff.'}</small>
          </div>
          <div className="app-hq-hero-subcard">
            <div className="app-hq-hero-subcard__head">
              <HQIcon name="standing" size={14} />
              <strong>Standing</strong>
            </div>
            <p className="app-hq-hero-subcard__value">{command.standingSummary}</p>
            <small>{heroMeta.standingDetail}</small>
          </div>
        </div>

        <p className="app-hq-hero-footnote">Sim to Sunday • {footerDays} days until kickoff</p>
      </section>

      <SectionCard title={command.weeklyIntelligence?.heading ?? 'Coordinator Brief'} subtitle="Matchup intel for this week’s decision loop." variant="compact">
        <div className="app-hq-intel-list" role="list" aria-label="Weekly intelligence">
          {weeklyIntel.map((insight) => (
            <p key={insight.id} role="listitem" className={`app-hq-intel-item tone-${insight.tone ?? 'info'}`}>{insight.text}</p>
          ))}
        </div>
      </SectionCard>

      <section className="app-section-stack" aria-label="This Week Action Center">
        <h2 className="app-section-heading">Prepare for Kickoff</h2>
        <div className="app-action-grid-2x2">
          {actionTiles.map((action) => (
            <ActionTile key={action.title} icon={action.icon} title={action.title} subtitle={action.subtitle} badge={action.badge ? <StatusChip label={action.badge} tone="warning" /> : null} onClick={action.onClick} tone="info" ariaLabel={`${action.title}: ${action.subtitle}`} />
          ))}
        </div>
      </section>
      {lineupToast ? <p className="app-inline-toast" role="status" aria-live="polite">{lineupToast}</p> : null}

      <SectionCard title="Week Command" subtitle="What needs attention, why it matters, and where to handle it." variant="compact">
        <WeeklyAgenda items={(command.weeklyAgenda ?? []).slice(0, 3)} onOpenTask={(task) => onNavigate?.(task?.targetRoute ?? task?.tab ?? 'HQ')} />
      </SectionCard>

      <SectionCard title="Operations Snapshot" subtitle="Last result, standing, and upcoming slate." variant="compact">
        <div className="app-hq-team-overview">
          <div><span>Last Game</span><strong>{postAdvanceNote.result}</strong></div>
          <div><span>Record Update</span><strong>{postAdvanceNote.recordDelta}</strong></div>
          <div><span>Next Opponent</span><strong>{postAdvanceNote.nextOpponent}</strong></div>
          <div><span>News Note</span><strong>{postAdvanceNote.note}</strong></div>
          <div><span>Next 3</span><div className="app-hq-opponent-chips">{nextOpponents.length ? nextOpponents.map((chip) => <em key={chip}>{chip}</em>) : <em>No future games on file</em>}</div></div>
        </div>
      </SectionCard>

      <SectionCard title="League News" subtitle="Around the league this week." variant="compact">
        <div className="app-news-compact-list">
          {(command.leagueNews ?? []).slice(0, 2).map((item) => (
            <CompactNewsCard key={item.id} title={item.headline} subtitle={item.detail} />
          ))}
          {!command.leagueNews?.length ? <EmptyState title="No league headlines yet." body="Advance to generate weekly stories." /> : null}
        </div>
      </SectionCard>

      <div className="app-hq-sticky-advance">
        <Button className="app-command-advance app-command-advance-gold" onClick={onAdvanceWeek} disabled={busy || simulating} aria-label={`Advance Week — move from ${command.weekLabel} to next week`} title="Advance Week">
          {busy || simulating ? 'Advancing…' : 'Advance Week'}
          <HQIcon name="arrowRight" size={16} />
        </Button>
      </div>

      <nav className="app-hq-bottom-nav" aria-label="HQ quick bottom navigation">
        {BOTTOM_NAV_ITEMS.map((item) => (
          <button
            key={item.label}
            type="button"
            className={item.active ? 'is-active' : ''}
            onClick={() => onNavigate?.(item.route)}
            aria-label={`Open ${item.label}`}
          >
            <span aria-hidden="true"><HQIcon name={item.icon} size={18} /></span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
