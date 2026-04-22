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
  const [expandedPressure, setExpandedPressure] = useState(false);
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
  const mandate = command.ownerMandate;
  const cap = command.capSnapshot;

  const handlePrepChecklistToggle = (item) => {
    const nextValue = !item?.done;
    markWeeklyPrepStep(league, item?.key, nextValue);
    if (!nextValue) return;
    onNavigate?.(item?.tab ?? 'Weekly Prep');
  };

  return (
    <div className="app-screen-stack franchise-hq franchise-command-center">
      <WeeklyHero
        eyebrow={`${command.seasonLabel} · ${command.weekLabel}`}
        title={`Next: ${command.nextGame?.isHome ? 'vs' : '@'} ${command.nextOpponent}`}
        subtitle={`Your record ${command.teamRecord} ${command.momentum?.icon ?? '→'} · Opponent ${command.nextOpponentRecord}`}
        rightMeta={<StatusChip label={`${command.prepStatus} · ${command.momentum?.label ?? 'No trend yet'}`} tone="info" />}
        actions={(
          <>
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
            <strong>{command.pressureSummary} {command.momentum?.icon ?? '→'}</strong>
          </div>
        </div>
        {command.lastGameMoments?.length ? (
          <div className="app-moment-list">
            {command.lastGameMoments.map((moment) => <p key={moment.id}>• {moment.text}</p>)}
          </div>
        ) : null}
        <div className="app-prep-checklist">
          {command.prepChecklist?.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`app-prep-checklist__item ${item.done ? 'is-done' : ''}`}
              onClick={() => handlePrepChecklistToggle(item)}
            >
              <span className="app-prep-checklist__check">{item.done ? '✓' : '○'}</span>
              <span>{item.label}</span>
            </button>
          ))}
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

      <SectionCard title="Owner Mandate" subtitle="Approval impact by likely outcomes." variant="compact">
        <div className="app-mandate-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={mandate?.approval ?? 0}>
          <div className="app-mandate-meter__segment tone-danger" />
          <div className="app-mandate-meter__segment tone-warning" />
          <div className="app-mandate-meter__segment tone-ok" />
          <div className="app-mandate-meter__needle" style={{ left: `${Math.max(0, Math.min(100, mandate?.approval ?? 0))}%` }} />
        </div>
        <p className="app-mandate-caption">{mandate?.approval ?? 0}% approval · {command.pressureSummary}</p>
        <button type="button" className="btn btn-sm" onClick={() => setExpandedPressure((prev) => !prev)}>
          {expandedPressure ? 'Hide trigger details' : 'Show trigger details'}
        </button>
        {expandedPressure ? (
          <div className="app-mandate-deltas">
            {mandate?.deltas?.map((row) => <p key={row.label}><strong>{row.label}</strong> <span>{row.delta > 0 ? `+${row.delta}` : row.delta}</span></p>)}
          </div>
        ) : null}
        <div className="app-expiring-list">
          <strong>{mandate?.expiringStarters?.length ?? 0} expiring starters</strong>
          {(mandate?.expiringStarters ?? []).slice(0, 5).map((player) => (
            <button key={player.id} type="button" className="app-expiring-list__row" onClick={() => onNavigate?.('Contract Center')}>
              <span>{player.pos} · {player.name} ({player.ovr} OVR)</span>
              <span>${player.estCost.toFixed(1)}M</span>
            </button>
          ))}
        </div>
      </SectionCard>

      <div className="app-command-bottom-grid">
        <SectionCard title="Snapshot" subtitle="Quick pressure and readiness indicators." variant="compact">
          <SummaryGrid items={command.teamOverview} />
          <div className="app-cap-thermometer">
            <div className={`app-cap-thermometer__fill tone-${cap?.tone ?? 'ok'}`} style={{ width: `${cap?.capUsedPct ?? 0}%` }} />
            {cap?.deadCapPct > 0 ? <div className="app-cap-thermometer__dead" style={{ width: `${cap.deadCapPct}%` }} /> : null}
          </div>
          <p className="app-cap-caption">
            Used ${cap?.capUsed?.toFixed(1) ?? '0.0'}M / ${cap?.capTotal?.toFixed(1) ?? '0.0'}M · Room ${cap?.capRoom?.toFixed(1) ?? '0.0'}M · Rollover ${cap?.projectedRollover?.toFixed(1) ?? '0.0'}M
          </p>
        </SectionCard>
        <SectionCard title="League Pulse" subtitle="Compact headlines around the league." variant="compact">
          <div className="app-division-mini-table">
            {(command.divisionMiniStandings ?? []).map((teamRow) => (
              <div key={teamRow.id} className={`app-division-mini-table__row ${teamRow.isUser ? 'is-user' : ''}`}>
                <strong>{teamRow.abbr}</strong>
                <span>{teamRow.record}</span>
                <span>PF {teamRow.pf}</span>
                <span>PA {teamRow.pa}</span>
                <span>{teamRow.streak}</span>
              </div>
            ))}
          </div>
          <div className="app-spotlight-results">
            {(command.spotlightResults ?? []).map((game) => <p key={game.id}>{game.label}</p>)}
          </div>
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

      <SectionCard title="Injury Spotlight" subtitle="Highest-impact injury this week." variant="compact">
        {command.injurySpotlight ? (
          <CompactListRow
            title={`${command.injurySpotlight.name} · ${command.injurySpotlight.pos} · ${command.injurySpotlight.ovr} OVR`}
            subtitle={`${command.injurySpotlight.severity} · Expected return Week ${command.injurySpotlight.returnWeek}`}
            meta={<StatusChip label={command.injurySpotlight.severity} tone={command.injurySpotlight.severity === 'IR' ? 'danger' : 'warning'} />}
          >
            <Button size="sm" variant="outline" onClick={() => onNavigate?.('Injuries')}>Open injuries</Button>
          </CompactListRow>
        ) : (
          <EmptyState title="No major injuries" body="Your top rotation is currently available." />
        )}
      </SectionCard>
    </div>
  );
}
