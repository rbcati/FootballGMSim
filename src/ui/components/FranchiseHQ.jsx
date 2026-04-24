import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { autoBuildDepthChart, depthWarnings } from '../../core/depthChart.js';
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import { EmptyState, StatusChip, ActionTile, SectionCard, WeeklyAgenda, CompactNewsCard } from './ScreenSystem.jsx';
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

  const lastGame = command.lastGameSummary;
  const homeAwayVerb = command.nextGame?.isHome ? 'vs' : '@';
  const footerDays = Math.max(0, 7 - ((safeNum(league?.week, 1) - 1) % 7));
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
  const lastGameStory = hasTwoWins ? 'Won 2 straight heading into kickoff' : hasTwoLosses ? 'Need division response this week' : (lastGame?.userWon ? 'Carrying momentum from last win' : 'Rebound spot after last result');
  const lastGameOpponentAbbr = lastGame
    ? (lastGame?.awayAbbr === userTeam?.abbr ? lastGame?.homeAbbr : lastGame?.awayAbbr)
    : null;
  const capSpace = command.teamOverview?.find((item) => item.label === 'Cap Space')?.value ?? '—';
  const operationHeading = `WEEK ${safeNum(league?.week, 1)} ${homeAwayVerb} ${opponent?.abbr ?? command.nextOpponent ?? 'TBD'}`.toUpperCase();
  const nextOppSummary = [
    command.standingSummary,
    formatRecordInline(command.nextOpponentRecord),
    hasTwoWins ? 'Win streak 2' : hasTwoLosses ? 'Loss streak 2' : 'Momentum balanced',
  ].filter(Boolean).join(' • ');
  const nextOpponents = (league?.schedule?.weeks ?? [])
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
    });

  return (
    <div className="app-screen-stack franchise-hq franchise-command-center">
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

      <section className="app-hq-matchup-hero card" aria-label="Weekly Hero">
        <div className="app-hq-matchup-main">
          <div className="app-hq-hero-copy">
            <span className="app-hq-matchup-hero__eyebrow">Next Opponent · Week {safeNum(league?.week, 1)} Operations</span>
            <strong>{operationHeading}</strong>
            <p>{nextOppSummary}</p>
          </div>
          <div className="app-hq-team app-hq-team--opp">
            <TeamIdentityBadge team={opponent} size={112} variant="circle" />
            <strong>{opponent?.abbr ?? command.nextOpponent}</strong>
            <span>{formatRecordInline(command.nextOpponentRecord)}</span>
          </div>
        </div>

        <div className="app-hq-hero-subcards">
          <div className="app-hq-hero-subcard">
            <div className="app-hq-hero-subcard__head">
              <HQIcon name="lastGame" size={14} />
              <strong>Last Game</strong>
            </div>
            <p className="app-hq-hero-subcard__value">{lastGame ? `${lastGame.userWon ? 'W' : 'L'} · ${lastGame.awayAbbr} ${safeNum(lastGame?.score?.away)} @ ${lastGame.homeAbbr} ${safeNum(lastGame?.score?.home)}` : 'No completed game yet'}</p>
            <small>{lastGame ? lastGameStory : 'Play this week to establish momentum.'}</small>
          </div>
          <div className="app-hq-hero-subcard">
            <div className="app-hq-hero-subcard__head">
              <HQIcon name="standing" size={14} />
              <strong>Standing</strong>
            </div>
            <p className="app-hq-hero-subcard__value">{command.standingSummary}</p>
            <small>{standingDetail}</small>
          </div>
        </div>

        <p className="app-hq-hero-footnote">Sim to Sunday • {footerDays} days until kickoff</p>
      </section>

      <section className="app-section-stack" aria-label="This Week Action Center">
        <div className="app-section-heading">This Week</div>
        <span style={{ display: 'none' }}>News &amp; Injuries</span>
        <div className="app-action-grid-2x2">
          {actionTiles.map((action) => (
            <ActionTile key={action.title} icon={action.icon} title={action.title} subtitle={action.subtitle} badge={action.badge ? <StatusChip label={action.badge} tone="warning" /> : null} onClick={action.onClick} tone="info" />
          ))}
        </div>
      </section>
      {lineupToast ? <p className="app-inline-toast">{lineupToast}</p> : null}

      <SectionCard title="Weekly Agenda" subtitle="Weekly Priorities for this week." variant="compact">
        <WeeklyAgenda items={(command.weeklyAgenda ?? []).slice(0, 3)} onOpenTask={(task) => onNavigate?.(task?.targetRoute ?? task?.tab ?? 'HQ')} />
      </SectionCard>

      <SectionCard title="Team Overview" subtitle="Last result, standing, and upcoming slate." variant="compact">
        <div className="app-hq-team-overview">
          <div><span>Last Game</span><strong>{lastGame ? `${lastGame.userWon ? 'W' : 'L'} ${safeNum(lastGame?.score?.away)}-${safeNum(lastGame?.score?.home)} vs ${lastGameOpponentAbbr ?? 'TBD'}` : 'No completed game yet'}</strong></div>
          <div><span>Standing</span><strong>{command.standingSummary}</strong></div>
          <div><span>Next 3</span><div className="app-hq-opponent-chips">{nextOpponents.map((chip) => <em key={chip}>{chip}</em>)}</div></div>
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
        <Button className="app-command-advance app-command-advance-gold" onClick={onAdvanceWeek} disabled={busy || simulating}>
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
          >
            <span aria-hidden="true"><HQIcon name={item.icon} size={18} /></span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>
    </div>
  );
}
