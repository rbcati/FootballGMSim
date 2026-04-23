import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { autoBuildDepthChart, depthWarnings } from '../../core/depthChart.js';
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import {
  EmptyState,
  StatusChip,
  ActionTile,
  SectionCard,
  SummaryGrid,
  WeeklyAgenda,
  CompactNewsCard,
} from './ScreenSystem.jsx';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatRecordInline(record) {
  if (!record || record === '—') return '0-0';
  return record;
}

function getMatchupMeta(command, nextGame) {
  // TODO(hq-data): replace fallback weekday/time/location with canonical scheduled kickoff metadata once exposed in the weekly selector.
  const day = nextGame?.dayLabel ?? nextGame?.kickoffDay ?? 'Sunday';
  const time = nextGame?.kickoffTime ?? '1:00 PM';
  const location = nextGame?.venueName ?? (nextGame?.isHome ? 'Home Field' : 'Away');
  return `${day} • ${time} • ${location}`;
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
    { title: 'Set Lineup', icon: '🧩', subtitle: command.actionStatuses.lineup.subtitle, badge: command.actionStatuses.lineup.badge, onClick: handleSetLineup },
    { title: 'Game Plan', icon: '📋', subtitle: command.actionStatuses.gameplan.subtitle, badge: command.actionStatuses.gameplan.badge || 'Recommended', onClick: () => { markWeeklyPrepStep(league, 'planReviewed', true); onNavigate?.('Game Plan'); } },
    { title: 'Scout Opponent', icon: '🔎', subtitle: command.actionStatuses.scouting.subtitle, badge: command.actionStatuses.scouting.badge || 'New report', onClick: () => { markWeeklyPrepStep(league, 'opponentScouted', true); onNavigate?.('Weekly Prep'); } },
    { title: 'News & Injuries', icon: '📰', subtitle: command.actionStatuses.news.subtitle, badge: command.actionStatuses.news.badge, onClick: () => { markWeeklyPrepStep(league, 'injuriesReviewed', true); onNavigate?.('News'); } },
  ];

  const lastGame = command.lastGameSummary;
  const homeAwayVerb = command.nextGame?.isHome ? 'vs' : '@';
  const footerDays = Math.max(0, 7 - ((safeNum(league?.week, 1) - 1) % 7));

  return (
    <div className="app-screen-stack franchise-hq franchise-command-center">
      <section className="app-hq-topbar card" aria-label="Franchise HQ top bar">
        <div className="app-hq-topbar__left">
          <span>{command.seasonLabel}</span>
          <strong>{command.weekLabel}</strong>
        </div>
        <div className="app-hq-topbar__meta">
          <StatusChip label={String(league?.phase ?? 'Regular').replaceAll('_', ' ')} tone="league" />
          <StatusChip label={command.teamRecord} tone="team" />
        </div>
        <div className="app-hq-topbar__team">
          <div className="app-hq-team-badge" aria-hidden>{userTeam?.abbr?.slice(0, 2) ?? 'TM'}</div>
          <div className="app-hq-team-copy">
            <strong>{userTeam?.name ?? 'Your Team'}</strong>
            <span>{userTeam?.abbr ?? 'TEAM'}</span>
          </div>
          <button className="app-hq-settings" type="button" aria-label="Open settings" onClick={() => onNavigate?.('Settings')}>⚙</button>
        </div>
      </section>

      <section className="app-hq-matchup-hero card" aria-label="Weekly Hero">
        <div className="app-hq-matchup-hero__header">
          <span className="app-hq-matchup-hero__eyebrow">Next Opponent</span>
          <span className="app-hq-matchup-hero__meta">{getMatchupMeta(command, command.nextGame)}</span>
        </div>

        <div className="app-hq-matchup-main">
          <div className="app-hq-team app-hq-team--user">
            <div className="app-hq-team-logo">{userTeam?.abbr ?? 'YOU'}</div>
            <strong>{userTeam?.name ?? 'Your Team'}</strong>
            <span>{formatRecordInline(command.teamRecord)}</span>
          </div>
          <div className="app-hq-vs-block">
            <span>Week {safeNum(league?.week, 1)}</span>
            <strong>VS</strong>
            <small>{homeAwayVerb}</small>
          </div>
          <div className="app-hq-team app-hq-team--opp">
            <div className="app-hq-team-logo">{opponent?.abbr ?? 'OPP'}</div>
            <strong>{opponent?.name ?? command.nextOpponent}</strong>
            <span>{formatRecordInline(command.nextOpponentRecord)}</span>
          </div>
        </div>

        <div className="app-hq-hero-subcards">
          <div className="app-hq-hero-subcard">
            <span>Last Game</span>
            <strong>{lastGame ? `${lastGame.userWon ? 'W' : 'L'} · ${lastGame.awayAbbr} ${safeNum(lastGame?.score?.away)} @ ${lastGame.homeAbbr} ${safeNum(lastGame?.score?.home)}` : 'No completed game yet'}</strong>
          </div>
          <div className="app-hq-hero-subcard">
            <span>Standing</span>
            <strong>{command.standingSummary}</strong>
          </div>
        </div>

        <Button className="app-command-advance app-command-advance-gold" onClick={onAdvanceWeek} disabled={busy || simulating}>
          {busy || simulating ? 'Advancing…' : 'Advance Week'}
        </Button>
        <p className="app-hq-hero-footnote">Sim to Sunday • {footerDays} days until kickoff</p>
      </section>

      <section className="app-section-stack" aria-label="This Week Action Center">
        <div className="app-section-heading">This Week</div>
        <div className="app-action-grid-2x2">
          {actionTiles.map((action) => (
            <ActionTile key={action.title} icon={action.icon} title={action.title} subtitle={action.subtitle} badge={action.badge ? <StatusChip label={action.badge} tone="warning" /> : null} onClick={action.onClick} tone="info" />
          ))}
        </div>
      </section>
      {lineupToast ? <p className="app-inline-toast">{lineupToast}</p> : null}

      <SectionCard title="Weekly Agenda" subtitle="Priority tasks before kickoff." variant="compact">
        <WeeklyAgenda items={command.weeklyAgenda} onOpenTask={(task) => onNavigate?.(task?.targetRoute ?? task?.tab ?? 'HQ')} />
      </SectionCard>

      <SectionCard title="Team Overview" subtitle="Franchise health at a glance." variant="compact">
        <SummaryGrid items={command.teamOverview} />
      </SectionCard>

      <SectionCard title="League News" subtitle="Around the league this week." variant="compact">
        <div className="app-news-compact-list">
          {(command.leagueNews ?? []).slice(0, 4).map((item) => (
            <CompactNewsCard key={item.id} title={item.headline} subtitle={item.detail} />
          ))}
          {!command.leagueNews?.length ? <EmptyState title="No league headlines yet." body="Advance to generate weekly stories." /> : null}
        </div>
      </SectionCard>

      <nav className="app-hq-bottom-nav" aria-label="HQ quick bottom navigation">
        <button type="button" className="is-active" onClick={() => onNavigate?.('HQ')}>Home</button>
        <button type="button" onClick={() => onNavigate?.('Team:Overview')}>Team</button>
        <button type="button" onClick={() => onNavigate?.('League:Overview')}>League</button>
        <button type="button" onClick={() => onNavigate?.('News')}>News</button>
        <button type="button" onClick={() => onNavigate?.('More')}>More</button>
      </nav>
    </div>
  );
}
