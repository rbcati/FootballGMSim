import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { openResolvedBoxScore } from '../utils/boxScoreAccess.js';
import { autoBuildDepthChart, depthWarnings } from '../../core/depthChart.js';
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import {
  EmptyState,
  StatusChip,
  WeeklyHero,
  ActionTile,
  SectionCard,
  CompactListRow,
  SummaryGrid,
  WeeklyAgenda,
  CompactNewsCard,
} from './ScreenSystem.jsx';

function safeNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export default function FranchiseHQ({ league, onNavigate, onOpenBoxScore, onAdvanceWeek, busy, simulating }) {
  const [lineupToast, setLineupToast] = useState(null);
  const command = useMemo(() => selectFranchiseHQViewModel(league), [league]);

  if (command.readyState !== 'ready') {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

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
    { title: 'Scout Opponent', icon: '🔎', subtitle: command.actionStatuses.scouting.subtitle, badge: command.actionStatuses.scouting.badge, onClick: () => { markWeeklyPrepStep(league, 'opponentScouted', true); onNavigate?.('Weekly Prep'); } },
    { title: 'News & Injuries', icon: '📰', subtitle: command.actionStatuses.news.subtitle, badge: command.actionStatuses.news.badge, onClick: () => { markWeeklyPrepStep(league, 'injuriesReviewed', true); onNavigate?.('News'); } },
  ];

  const lastGame = command.lastGameSummary;

  return (
    <div className="app-screen-stack franchise-hq franchise-command-center">
      <WeeklyHero
        eyebrow={`${command.seasonLabel} · ${command.weekLabel}`}
        title={`Next: ${command.nextGame?.isHome ? 'vs' : '@'} ${command.nextOpponent}`}
        subtitle={`Your record ${command.teamRecord} · Opponent ${command.nextOpponentRecord}`}
        rightMeta={<StatusChip label={command.prepStatus} tone="info" />}
        actions={(
          <>
            <Button size="sm" variant="outline" onClick={() => onNavigate?.('Weekly Prep')}>Prep Details</Button>
            <Button size="sm" className="app-advance-btn app-command-advance" onClick={onAdvanceWeek} disabled={busy || simulating}>{busy || simulating ? 'Advancing…' : 'Advance Week'}</Button>
          </>
        )}
      >
        <div className="app-hero-summary-grid app-hero-summary-grid-command">
          <div>
            <span>Last Game</span>
            <strong>{lastGame ? `${lastGame.userWon ? 'W' : 'L'} · ${lastGame.awayAbbr} ${safeNum(lastGame?.score?.away)} @ ${lastGame.homeAbbr} ${safeNum(lastGame?.score?.home)}` : 'No completed game yet'}</strong>
          </div>
          <div>
            <span>Standing</span>
            <strong>{command.standingSummary}</strong>
          </div>
          <div>
            <span>Owner Pressure</span>
            <strong>{command.pressureSummary}</strong>
          </div>
        </div>
        {command.blockers?.length ? <div className="app-blocker-row"><StatusChip label={`${command.blockers.length} prep blocker${command.blockers.length > 1 ? 's' : ''}`} tone="warning" /></div> : null}
      </WeeklyHero>

      <div className="app-action-grid-2x2">
        {actionTiles.map((action) => (
          <ActionTile key={action.title} icon={action.icon} title={action.title} subtitle={action.subtitle} badge={action.badge ? <StatusChip label={action.badge} tone="warning" /> : null} onClick={action.onClick} tone="info" />
        ))}
      </div>
      {lineupToast ? <p className="app-inline-toast">{lineupToast}</p> : null}

      <SectionCard title="Weekly Agenda" subtitle="Front office priorities ranked for this week." variant="compact">
        <WeeklyAgenda items={command.weeklyAgenda} onOpenTask={(task) => onNavigate?.(task?.targetRoute ?? task?.tab ?? 'HQ')} />
      </SectionCard>

      <div className="app-command-bottom-grid">
        <SectionCard title="Snapshot" subtitle="Quick pressure and readiness indicators." variant="compact">
          <SummaryGrid items={command.teamOverview} />
        </SectionCard>
        <SectionCard title="League Pulse" subtitle="Compact headlines around the league." variant="compact">
          <div className="app-news-compact-list">
            {(command.leagueNews ?? []).slice(0, 3).map((item) => (
              <CompactNewsCard key={item.id} title={item.headline} subtitle={item.detail} />
            ))}
            {!command.leagueNews?.length ? <EmptyState title="No league headlines yet." body="Advance to generate weekly stories." /> : null}
          </div>
        </SectionCard>
      </div>

      {lastGame ? (
        <SectionCard title="Last Game Recap" subtitle="Open full recap and box score." variant="compact">
          <CompactListRow
            title={`${lastGame.userWon ? 'Win' : 'Loss'} · Week ${lastGame.week ?? league?.week ?? 1}`}
            subtitle={`${lastGame.awayAbbr} ${safeNum(lastGame?.score?.away)} @ ${lastGame.homeAbbr} ${safeNum(lastGame?.score?.home)}`}
            meta={<StatusChip label="Recap" tone="league" />}
          >
            <Button size="sm" variant="outline" onClick={() => openResolvedBoxScore({ ...command.latestArchived, id: command.latestArchived?.id ?? lastGame?.id }, { seasonId: league?.seasonId, week: Number(command.latestArchived?.week ?? lastGame?.week ?? league?.week ?? 1), source: 'hq_last_game' }, onOpenBoxScore)} disabled={command.latestArchived ? !command.latestGamePresentation?.canOpen : false}>Box Score</Button>
          </CompactListRow>
        </SectionCard>
      ) : null}
    </div>
  );
}
