import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { autoBuildDepthChart, depthWarnings } from '../../core/depthChart.js';
import { markWeeklyPrepStep } from '../utils/weeklyPrep.js';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import { buildWeeklyCommandHub } from '../utils/weeklyCommandHub.js';
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
  const gamePlanImpactCards = useMemo(() => command.gamePlanImpact?.recommendedAdjustments ?? [], [command.gamePlanImpact?.recommendedAdjustments]);
  const postAdvanceNote = useMemo(() => {
    const review = command.postGameReview ?? null;
    const recordDelta = lastGame ? `Record now ${formatRecordInline(command.teamRecord)}` : 'Advance to generate game feedback';
    return {
      heading: review?.heading ?? 'Review Last Week',
      result: review?.result ?? lastGameDisplay.overviewLine,
      takeaway: review?.takeaway ?? 'Result recorded. Open box score for full drive details.',
      nextAction: review?.nextAction ?? "Tune this week's prep before advancing again.",
      recordDelta,
      nextOpponent: `${nextOpponentDisplay.isHome ? 'vs' : '@'} ${nextOpponentDisplay.opponentAbbr}`,
      note: review?.newsNote ?? (command.leagueNews ?? [])[0]?.headline ?? 'No new league bulletin yet.',
      actions: Array.isArray(review?.actions) ? review.actions : [],
    };
  }, [command.leagueNews, command.postGameReview, command.teamRecord, lastGame, lastGameDisplay.overviewLine, nextOpponentDisplay.isHome, nextOpponentDisplay.opponentAbbr]);

  const decisionReview = useMemo(() => command.weeklyDecisionImpact ?? null, [command.weeklyDecisionImpact]);

  const hqTeamBuilder = useMemo(() => {
    const roster = Array.isArray(userTeam?.roster) ? userTeam.roster : [];
    const byPos = ['QB','RB','WR','TE','OL','DL','LB','CB','S'].map((pos) => ({ pos, players: roster.filter((p) => p?.pos === pos).sort((a,b)=>safeNum(b?.ovr)-safeNum(a?.ovr)) }));
    const weakest = byPos.map((g) => ({ pos: g.pos, top: safeNum(g.players[0]?.ovr, 0), depth: g.players.length })).sort((a,b)=>(a.top + a.depth*2)-(b.top + b.depth*2))[0] ?? null;
    const capPressure = safeNum(userTeam?.capRoom, 0) < 0 ? 'critical' : safeNum(userTeam?.capRoom, 0) < 10 ? 'high' : 'managed';
    return {
      biggestNeed: weakest?.pos ?? 'Needs more data',
      capPressure,
      nextAction: weakest ? `Review ${weakest.pos} starter/depth plan` : 'Review roster needs',
    };
  }, [userTeam]);



  const weeklyCommandHub = useMemo(() => buildWeeklyCommandHub({
    league,
    userTeam,
    command,
    teamBuilder: hqTeamBuilder,
    weeklyDecisionImpact: decisionReview,
    gamePlanImpact: command.gamePlanImpact,
    weeklyIntelligence: command.weeklyIntelligence,
    nextGame: command.nextGame,
    lastGame,
  }), [league, userTeam, command, hqTeamBuilder, decisionReview, lastGame]);


  const hqNextAction = useMemo(() => {
    const roster = Array.isArray(userTeam?.roster) ? userTeam.roster : [];
    const injuredCount = roster.filter((player) => safeNum(player?.injuryWeeksRemaining, 0) > 0).length;
    if (decisionReview?.recommendedAction?.label && decisionReview?.recommendedAction?.route) {
      return {
        label: decisionReview.recommendedAction.label,
        route: decisionReview.recommendedAction.route,
        reason: decisionReview.recommendedAction.reason ?? 'Review last week before locking the next plan.',
      };
    }
    if (injuredCount > 0) {
      return { label: 'Check injuries', route: 'Team:Injuries', reason: `${injuredCount} roster player${injuredCount === 1 ? '' : 's'} listed with injury time.` };
    }
    if (hqTeamBuilder.biggestNeed && hqTeamBuilder.biggestNeed !== 'Needs more data') {
      return { label: 'Open Team Builder', route: 'Team:Roster / Team Builder', reason: hqTeamBuilder.nextAction };
    }
    return { label: 'Advance next week', route: null, reason: 'No roster blocker is visible from current HQ data.' };
  }, [decisionReview?.recommendedAction, hqTeamBuilder.biggestNeed, hqTeamBuilder.nextAction, userTeam?.roster]);

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

  const seasonPulse = useMemo(() => {
    const approval = Math.max(0, Math.min(100, safeNum(command.ownerMandate?.approval, 50)));
    const mandateTone = command.ownerMandate?.tone ?? (approval < 45 ? 'danger' : approval < 65 ? 'warning' : 'ok');
    const capRoom = safeNum(command.capSnapshot?.capRoom, safeNum(userTeam?.capRoom, 0));
    const capTone = command.capSnapshot?.tone ?? (capRoom < 5 ? 'danger' : capRoom < 12 ? 'warning' : 'ok');
    const capLabel = `${capRoom >= 0 ? '$' : '-$'}${Math.abs(capRoom).toFixed(1)}M`;
    const gameId = decisionReview?.metadata?.gameId ?? lastGame?.gameId ?? lastGame?.id ?? null;
    return {
      approval,
      mandateTone,
      pressureSummary: command.pressureSummary ?? `Owner approval ${approval}%`,
      momentumLabel: command.momentum?.label ?? 'No trend yet',
      filmLabel: lastGame ? lastGameDisplay.heroLine : 'Kickoff ahead',
      filmDetail: lastGame ? 'Open the latest final before changing next week.' : 'Scout the opponent and lock a plan before kickoff.',
      filmRoute: gameId ? `Game Book:${gameId}` : 'Weekly Prep',
      filmCta: gameId ? 'Open Game Book' : 'Open Weekly Prep',
      rosterNeed: hqTeamBuilder.biggestNeed ?? 'No urgent need',
      rosterDetail: hqTeamBuilder.nextAction ?? 'Review team builder for leverage.',
      capLabel,
      capTone,
    };
  }, [
    command.ownerMandate?.approval,
    command.ownerMandate?.tone,
    command.pressureSummary,
    command.momentum?.label,
    command.capSnapshot?.capRoom,
    command.capSnapshot?.tone,
    decisionReview?.metadata?.gameId,
    hqTeamBuilder.biggestNeed,
    hqTeamBuilder.nextAction,
    lastGame,
    lastGameDisplay.heroLine,
    userTeam?.capRoom,
  ]);

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
    <div className="app-screen-stack franchise-hq franchise-command-center" data-testid="franchise-hq" role="main" aria-label="Franchise HQ weekly command center">
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


      {lastGame ? (
        <SectionCard title="Next Action" subtitle="Postgame handoff from the latest completed week." variant="info">
          <div className="app-hq-next-action-panel" data-testid="hq-next-action">
            <article data-testid="hq-last-result">
              <span>Last result</span>
              <strong>{lastGameDisplay.heroLine}</strong>
              <small>{postAdvanceNote.takeaway}</small>
            </article>
            <article>
              <span>Current record</span>
              <strong>{formatRecordInline(command.teamRecord)}</strong>
              <small>{postAdvanceNote.recordDelta}</small>
            </article>
            <article>
              <span>Next scheduled game</span>
              <strong>{postAdvanceNote.nextOpponent}</strong>
              <small>{nextOpponentDisplay.detail}</small>
            </article>
            <article>
              <span>Recommended action</span>
              <strong>{hqNextAction.label}</strong>
              <small>{hqNextAction.reason}</small>
              {hqNextAction.route ? (
                <button type="button" className="btn btn-sm" onClick={() => onNavigate?.(hqNextAction.route)}>{hqNextAction.label}</button>
              ) : (
                <button type="button" className="btn btn-sm" onClick={onAdvanceWeek} disabled={busy || simulating}>{busy || simulating ? 'Advancing…' : 'Advance Week'}</button>
              )}
            </article>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={command.weeklyIntelligence?.heading ?? 'Coordinator Brief'} subtitle="Matchup intel for this week’s decision loop." variant="compact">
        <div className="app-hq-intel-list" role="list" aria-label="Weekly intelligence">
          {weeklyIntel.map((insight) => (
            <p key={insight.id} role="listitem" className={`app-hq-intel-item tone-${insight.tone ?? 'info'}`}>{insight.text}</p>
          ))}
        </div>
      </SectionCard>



      <SectionCard title="Season Pulse" subtitle="Pressure, form, and roster leverage at a glance." variant="compact">
        <div className="app-hq-pulse-grid" data-testid="season-pulse">
          <article className={`app-hq-pulse-card tone-${seasonPulse.mandateTone}`}>
            <div className="app-hq-pulse-card__head">
              <span>Owner Mandate</span>
              <StatusChip label={`${seasonPulse.approval}%`} tone={seasonPulse.mandateTone} />
            </div>
            <strong>{seasonPulse.pressureSummary}</strong>
            <div className="app-mandate-meter" aria-hidden="true">
              <span className="app-mandate-meter__segment tone-danger" />
              <span className="app-mandate-meter__segment tone-warning" />
              <span className="app-mandate-meter__segment tone-ok" />
              <span className="app-mandate-meter__needle" style={{ left: `${seasonPulse.approval}%` }} />
            </div>
          </article>

          <article className="app-hq-pulse-card tone-info">
            <div className="app-hq-pulse-card__head">
              <span>Momentum</span>
              <StatusChip label={formatRecordInline(command.teamRecord)} tone="info" />
            </div>
            <strong>{seasonPulse.momentumLabel}</strong>
            <p>{seasonPulse.filmLabel}</p>
          </article>

          <article className={`app-hq-pulse-card tone-${seasonPulse.capTone}`}>
            <div className="app-hq-pulse-card__head">
              <span>Roster Lever</span>
              <StatusChip label={seasonPulse.rosterNeed} tone={seasonPulse.capTone} />
            </div>
            <strong>{seasonPulse.capLabel} cap room</strong>
            <p>{seasonPulse.rosterDetail}</p>
            <button type="button" className="btn btn-sm" onClick={() => onNavigate?.('Team:Roster / Team Builder')}>
              Open Team Builder
            </button>
          </article>

          <article className="app-hq-pulse-card tone-ok">
            <div className="app-hq-pulse-card__head">
              <span>Film Room</span>
              <StatusChip label={lastGame ? 'Postgame' : 'Pregame'} tone={lastGame ? 'ok' : 'warning'} />
            </div>
            <strong>{seasonPulse.filmCta}</strong>
            <p>{seasonPulse.filmDetail}</p>
            <button type="button" className="btn btn-sm" onClick={() => onNavigate?.(seasonPulse.filmRoute)}>
              {seasonPulse.filmCta}
            </button>
          </article>
        </div>
      </SectionCard>

      <SectionCard title="Weekly Command Hub" subtitle="Ranked actions for this week before you advance." variant="compact">
        <div className="app-hq-intel-list">
          {(weeklyCommandHub.sections ?? []).map((section) => (
            <div key={section.key} className="app-hq-impact-card" style={{ marginBottom: 8 }}>
              <div className="app-hq-impact-card__head">
                <strong>{section.title}</strong>
                <StatusChip label={`${section.actions.length} action${section.actions.length === 1 ? '' : 's'}`} tone={section.tone === 'danger' ? 'warning' : 'info'} />
              </div>
              {section.actions.length ? section.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="btn btn-sm app-hq-impact-card__cta"
                  style={{ width: '100%', minHeight: 44, textAlign: 'left', marginTop: 6 }}
                  disabled={!action.route}
                  onClick={() => action.route && onNavigate?.(action.route)}
                  aria-label={`${section.title}: ${action.label}`}
                >
                  <strong>{action.label}</strong>
                  <span style={{ display: 'block', opacity: 0.85 }}>{action.detail}</span>
                </button>
              )) : <p className="app-hq-intel-item tone-info">No actions right now.</p>}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={command.gamePlanImpact?.heading ?? 'Game Plan Impact'} subtitle={command.gamePlanImpact?.summary ?? 'Translate coordinator intel into fast football actions.'} variant="compact">
        <div className="app-hq-impact-list" role="list" aria-label="Game plan impact recommendations">
          {gamePlanImpactCards.map((item) => (
            <article key={item.id} role="listitem" className={`app-hq-impact-card tone-${item.tag?.tone ?? 'info'}`}>
              <div className="app-hq-impact-card__head">
                <strong>{item.title}</strong>
                <StatusChip label={item.tag?.label ?? `${item.confidenceLevel ?? 'medium'} confidence`} tone={item.tag?.tone ?? 'warning'} />
              </div>
              <p>{item.explanation}</p>
              <button type="button" className="btn btn-sm app-hq-impact-card__cta" onClick={() => onNavigate?.(item.targetRoute)} aria-label={`${item.title}: ${item.ctaLabel}`}>
                {item.ctaLabel}
              </button>
            </article>
          ))}
        </div>
      </SectionCard>


      {lineupToast ? <p className="app-inline-toast" role="status" aria-live="polite">{lineupToast}</p> : null}




      <SectionCard title={decisionReview?.heading ?? 'What Mattered Last Week'} subtitle={decisionReview?.resultSummary ?? 'Run a completed game to unlock a weekly decision review.'} variant="compact">
        <div className="app-hq-intel-list" role="list" aria-label="Weekly decision impact recap">
          {(decisionReview?.bullets ?? []).slice(0, 4).map((bullet, idx) => (
            <p key={`decision-${idx}`} role="listitem" className="app-hq-intel-item tone-info">{bullet}</p>
          ))}
        </div>
        {decisionReview?.recommendedAction ? (
          <div className="app-hq-impact-card tone-info" style={{ marginTop: 10 }}>
            <div className="app-hq-impact-card__head">
              <strong>Recommended next action</strong>
              <StatusChip label={decisionReview.recommendedAction.label} tone="info" />
            </div>
            <p>{decisionReview.recommendedAction.reason}</p>
            <button
              type="button"
              className="btn btn-sm app-hq-impact-card__cta"
              onClick={() => onNavigate?.(decisionReview.recommendedAction.route)}
              aria-label={`Decision review: ${decisionReview.recommendedAction.label}`}
            >
              {decisionReview.recommendedAction.label}
            </button>
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Operations Snapshot" subtitle="Last result, standing, and upcoming slate." variant="compact">
        <div className="app-hq-team-overview">
          <div><span>{postAdvanceNote.heading}</span><strong>{postAdvanceNote.result}</strong></div>
          <div><span>Key Takeaway</span><strong>{postAdvanceNote.takeaway}</strong></div>
          <div><span>Next Action</span><strong>{postAdvanceNote.nextAction}</strong></div>
          <div><span>Record Update</span><strong>{postAdvanceNote.recordDelta}</strong></div>
          <div><span>Next Opponent</span><strong>{postAdvanceNote.nextOpponent}</strong></div>
          <div><span>News Note</span><strong>{postAdvanceNote.note}</strong></div>
          <div><span>Review Routes</span><div className="app-hq-opponent-chips">{postAdvanceNote.actions.length ? postAdvanceNote.actions.map((action) => <button key={action.targetRoute} type="button" onClick={() => onNavigate?.(action.targetRoute)}>{action.label}</button>) : <em>No review actions</em>}</div></div>
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

      <section className="card" aria-label="Advance readiness">
        <p className="app-hq-intel-item tone-info">
          {weeklyCommandHub.readiness.readyToAdvance ? 'Ready to advance.' : `${weeklyCommandHub.readiness.criticalOpen} critical item open.`} {' '}
          {weeklyCommandHub.readiness.recommendedOpen ? `${weeklyCommandHub.readiness.recommendedOpen} recommended actions remaining.` : 'No recommended actions remaining.'}
          {weeklyCommandHub.readiness.lastCompletedAction ? ` Last review: ${weeklyCommandHub.readiness.lastCompletedAction}.` : ''}
        </p>
        {weeklyCommandHub.primaryAction?.blocking ? (
          <button type="button" className="btn btn-sm app-hq-impact-card__cta" onClick={() => onNavigate?.(weeklyCommandHub.primaryAction.route)}>
            Resolve blocker: {weeklyCommandHub.primaryAction.label}
          </button>
        ) : null}
      </section>

      <div className="app-hq-sticky-advance">
        <Button className="app-command-advance app-command-advance-gold" data-testid="advance-week-cta" onClick={onAdvanceWeek} disabled={busy || simulating} aria-label={`Advance Week — move from ${command.weekLabel} to next week`} title="Advance Week">
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
