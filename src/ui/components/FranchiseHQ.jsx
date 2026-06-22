import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { autoBuildDepthChart, depthWarnings } from '../../core/depthChart.js';
import { markWeeklyPrepStep, deriveWeeklyPrepState } from '../utils/weeklyPrep.js';
import { evaluateWeeklyContext } from '../utils/weeklyContext.js';
import { buildAdvanceReadinessGate } from '../utils/advanceReadinessGate.js';
import AdvanceReadinessGate from './AdvanceReadinessGate.jsx';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import { buildCommandCenterSummary } from '../utils/weeklyHubLayout.js';
import { classifyTeamCulture, buildTeamCultureNarrative, TEAM_CULTURE_DEFAULT } from '../../core/teamCulture.js';
import { buildRecentCultureEvents } from '../../core/broadcastNarrative.js';
import { EmptyState, StatusChip, ActionTile, SectionCard } from './ScreenSystem.jsx';
import { getLastGameDisplay, getLatestUserCompletedGame, getNextOpponentDisplay } from '../utils/hqGameDisplay.js';
import { HQIcon, TeamIdentityBadge } from './HQVisuals.jsx';
import { buildGameBookDestination } from '../utils/managementScreenRouting.js';
import ChronicleHeadlineBanner from './ChronicleHeadlineBanner.tsx';
import MediaDesk from './MediaDesk.jsx';
import CombineDashboard from './CombineDashboard.jsx';
import FranchiseLegacyView from './FranchiseLegacyView.jsx';
import FranchiseBrandHQ from './FranchiseBrandHQ.jsx';
import JobSecurityCard from './JobSecurityCard.jsx';
import ActivityToastStack from './ActivityToastStack.jsx';

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

// Weeks matching DEADLINE_CONFIG.tension_start_week and deadline_week
const HQ_DEADLINE_TENSION_WEEK = 8;
const HQ_DEADLINE_FINAL_WEEK   = 10;

function HQDeadlineBanner({ week }) {
  if (week < HQ_DEADLINE_TENSION_WEEK || week > HQ_DEADLINE_FINAL_WEEK) return null;

  const isDeadlineWeek = week === HQ_DEADLINE_FINAL_WEEK;

  return (
    <div
      data-testid="hq-deadline-banner"
      data-deadline-state={isDeadlineWeek ? 'crimson' : 'amber'}
      style={{
        margin: '4px 12px',
        padding: 'var(--space-3) var(--space-4)',
        border: `1px solid ${isDeadlineWeek ? 'rgba(255,69,58,0.5)' : 'rgba(255,159,10,0.5)'}`,
        background: isDeadlineWeek ? 'rgba(255,69,58,0.08)' : 'rgba(255,159,10,0.07)',
        borderRadius: 'var(--radius-md)',
        fontSize: 'var(--text-xs)',
        borderLeft: isDeadlineWeek ? '3px solid var(--danger, #FF453A)' : '3px solid var(--warning, #FF9F0A)',
        animation: isDeadlineWeek ? 'hq-deadline-pulse 2s ease-in-out infinite' : 'none',
      }}
    >
      <strong style={{ display: 'block', color: isDeadlineWeek ? 'var(--danger, #FF453A)' : 'var(--warning, #FF9F0A)', marginBottom: 2 }}>
        {isDeadlineWeek ? '🚨 DEADLINE WEEK' : '⚠️ Trade Deadline Approaching — Week 10'}
      </strong>
      <span style={{ color: 'var(--text-muted)' }}>
        {isDeadlineWeek
          ? 'The trade window closes at the end of this week. Front offices are making aggressive moves.'
          : 'Market volatility is HIGH. Contenders are overpaying for stars.'}
      </span>
      <style>{`
        @keyframes hq-deadline-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-deadline-state="crimson"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function formatRecordInline(record) {
  if (!record || record === '—') return '0-0';
  return record;
}

function getLatestUserResultFromRecentResults(lastResults, { league, lastSimWeek } = {}) {
  const userTeamId = Number(league?.userTeamId);
  if (!Array.isArray(lastResults) || !lastResults.length || !Number.isFinite(userTeamId)) return null;
  const teams = Array.isArray(league?.teams) ? league.teams : [];
  const fallbackWeek = safeNum(lastSimWeek ?? (safeNum(league?.week, 1) - 1), 1);

  for (let index = lastResults.length - 1; index >= 0; index -= 1) {
    const result = lastResults[index];
    const homeId = Number(result?.homeId ?? result?.homeTeamId ?? result?.home?.id ?? result?.home);
    const awayId = Number(result?.awayId ?? result?.awayTeamId ?? result?.away?.id ?? result?.away);
    if (homeId !== userTeamId && awayId !== userTeamId) continue;
    const homeScore = Number(result?.homeScore ?? result?.scoreHome ?? result?.score?.home);
    const awayScore = Number(result?.awayScore ?? result?.scoreAway ?? result?.score?.away);
    if (!Number.isFinite(homeId) || !Number.isFinite(awayId) || !Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;
    const home = teams.find((team) => Number(team?.id) === homeId) ?? null;
    const away = teams.find((team) => Number(team?.id) === awayId) ?? null;
    return {
      ...result,
      id: result?.id ?? result?.gameId,
      gameId: result?.gameId ?? result?.id,
      homeId,
      awayId,
      home,
      away,
      homeAbbr: result?.homeAbbr ?? home?.abbr ?? result?.homeName?.slice?.(0, 3) ?? 'HOME',
      awayAbbr: result?.awayAbbr ?? away?.abbr ?? result?.awayName?.slice?.(0, 3) ?? 'AWAY',
      homeScore,
      awayScore,
      score: { home: homeScore, away: awayScore },
      played: true,
      week: safeNum(result?.week, fallbackWeek),
    };
  }
  return null;
}

const HQ_GP_STORAGE_KEY = 'footballgm_gameplan_v1';
function loadHQStoredPlan() {
  try { return JSON.parse(localStorage.getItem(HQ_GP_STORAGE_KEY) || 'null'); } catch { return null; }
}

export default function FranchiseHQ({ league, lastResults = [], lastSimWeek = null, onNavigate, onAdvanceWeek, busy, simulating, actions }) {
  const [lineupToast, setLineupToast] = useState(null);
  const [showGate, setShowGate] = useState(false);
  const command = useMemo(() => selectFranchiseHQViewModel(league), [league]);
  const hqPrep = useMemo(() => deriveWeeklyPrepState(league), [league]);
  const hqWeeklyContext = useMemo(() => evaluateWeeklyContext(league), [league]);
  const gate = useMemo(
    () => buildAdvanceReadinessGate({ league, prep: hqPrep, weeklyContext: hqWeeklyContext }),
    [league, hqPrep, hqWeeklyContext],
  );
  const commandSummary = useMemo(
    () => buildCommandCenterSummary({ gate, weeklyContext: hqWeeklyContext }),
    [gate, hqWeeklyContext],
  );

  if (command.readyState !== 'ready') {
    return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  }

  const userTeam = (league?.teams ?? []).find((t) => Number(t?.id) === Number(league?.userTeamId));
  const opponent = command.nextGame?.opp ?? null;
  const nextOpponentDisplay = useMemo(() => getNextOpponentDisplay(command.nextGame), [command.nextGame]);

  const handleAdvanceOrGate = () => {
    if (gate.shouldWarn) {
      setShowGate(true);
    } else {
      onAdvanceWeek?.();
    }
  };

  const handleGateAdvanceAnyway = () => {
    setShowGate(false);
    onAdvanceWeek?.();
  };

  const handleGateReview = (dest) => {
    setShowGate(false);
    onNavigate?.(dest);
  };

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

  const handleGamePlanTile = () => {
    markWeeklyPrepStep(league, 'planReviewed', true);
    if (actions?.send) {
      const storedPlan = loadHQStoredPlan();
      const strats = userTeam?.strategies ?? {};
      actions.send('UPDATE_STRATEGY', {
        offSchemeId: strats.offSchemeId || 'WEST_COAST',
        defSchemeId: strats.defSchemeId || 'COVER_2',
        offPlanId: strats.offPlanId || 'BALANCED',
        defPlanId: strats.defPlanId || 'BALANCED',
        riskId: strats.riskId || 'BALANCED',
        ...(storedPlan ? { gamePlan: storedPlan } : {}),
      });
    }
    onNavigate?.('Game Plan');
  };

  const handleTrainingTile = () => {
    if (actions?.send) {
      const strats = userTeam?.strategies ?? {};
      if (strats.offPlanId || strats.offSchemeId) {
        actions.send('UPDATE_STRATEGY', {
          offSchemeId: strats.offSchemeId || 'WEST_COAST',
          defSchemeId: strats.defSchemeId || 'COVER_2',
          offPlanId: strats.offPlanId || 'BALANCED',
          defPlanId: strats.defPlanId || 'BALANCED',
          riskId: strats.riskId || 'BALANCED',
        });
      }
    }
    onNavigate?.('Training');
  };

  const handleScoutTile = () => {
    markWeeklyPrepStep(league, 'opponentScouted', true);
    if (actions?.send) {
      const strats = userTeam?.strategies ?? {};
      if (strats.offPlanId || strats.offSchemeId) {
        actions.send('UPDATE_STRATEGY', {
          offSchemeId: strats.offSchemeId || 'WEST_COAST',
          defSchemeId: strats.defSchemeId || 'COVER_2',
          offPlanId: strats.offPlanId || 'BALANCED',
          defPlanId: strats.defPlanId || 'BALANCED',
          riskId: strats.riskId || 'BALANCED',
        });
      }
    }
    onNavigate?.('Weekly Prep');
  };

  const actionTiles = [
    { title: 'Game Plan', icon: <HQIcon name="gamePlan" size={22} />, subtitle: command.actionStatuses.gameplan.subtitle, badge: command.actionStatuses.gameplan.badge || 'Recommended', onClick: handleGamePlanTile },
    { title: 'Set Lineup', icon: <HQIcon name="lineup" size={22} />, subtitle: command.actionStatuses.lineup.subtitle, badge: command.actionStatuses.lineup.badge, onClick: handleSetLineup },
    { title: 'Training', icon: <HQIcon name="target" size={22} />, subtitle: 'Adjust weekly player focus', badge: null, onClick: handleTrainingTile },
    { title: 'Scout Opponent', icon: <HQIcon name="scout" size={22} />, subtitle: command.actionStatuses.scouting.subtitle, badge: command.actionStatuses.scouting.badge || 'New report', onClick: handleScoutTile },
  ];

  const recentLastGame = useMemo(
    () => getLatestUserResultFromRecentResults(lastResults, { league, lastSimWeek }),
    [lastResults, lastSimWeek, league],
  );
  const lastGame = useMemo(() => getLatestUserCompletedGame(league) ?? recentLastGame ?? command.lastGameSummary ?? null, [league, recentLastGame, command.lastGameSummary]);
  const lastGameDisplay = useMemo(() => getLastGameDisplay(lastGame, league?.userTeamId), [lastGame, league?.userTeamId]);

  // Compact last result row data
  const lastResultRow = useMemo(() => {
    if (!lastGame) return null;
    const homeId = Number(lastGame.homeId);
    const awayId = Number(lastGame.awayId);
    const userId = Number(league?.userTeamId);
    const homeScore = safeNum(lastGame.homeScore ?? lastGame.score?.home);
    const awayScore = safeNum(lastGame.awayScore ?? lastGame.score?.away);
    const userIsHome = homeId === userId;
    const homeWon = homeScore > awayScore;
    const tied = homeScore === awayScore;
    const userWon = !tied && ((userIsHome && homeWon) || (!userIsHome && !homeWon));
    const userScore = userIsHome ? homeScore : awayScore;
    const oppScore = userIsHome ? awayScore : homeScore;
    const oppAbbr = userIsHome
      ? (lastGame.awayAbbr ?? lastGame.away?.abbr ?? 'OPP')
      : (lastGame.homeAbbr ?? lastGame.home?.abbr ?? 'OPP');
    const gameId = lastGame.gameId ?? lastGame.id ?? null;
    const weekNum = safeNum(lastGame.week);
    return {
      label: tied ? 'T' : userWon ? 'W' : 'L',
      tone: tied ? 'info' : userWon ? 'ok' : 'danger',
      text: `${userScore}–${oppScore} vs ${oppAbbr}${weekNum ? ` · Wk${weekNum}` : ''}`,
      gameId,
    };
  }, [lastGame, league?.userTeamId]);

  // Division standings for mini-table (max 4 rows)
  const divisionRows = useMemo(() => {
    const rows = command.divisionMiniStandings ?? [];
    if (!rows.length) return [];
    const leaderWins = safeNum((rows[0]?.record ?? '0-0').split('-')[0]);
    return rows.slice(0, 4).map((row) => {
      const rowWins = safeNum((row.record ?? '0-0').split('-')[0]);
      const gb = leaderWins - rowWins;
      return { ...row, gbDisplay: gb === 0 ? '—' : String(gb) };
    });
  }, [command.divisionMiniStandings]);

  const capSpace = command.teamOverview?.find((item) => item.label === 'Cap Space')?.value ?? '—';
  const weeklyIntel = useMemo(() => command.weeklyIntelligence?.insights ?? [], [command.weeklyIntelligence?.insights]);
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
      note: review?.newsNote ?? (command.leaguePulse ?? [])[0]?.headline ?? (command.leagueNews ?? [])[0]?.headline ?? 'No new league bulletin yet.',
      actions: Array.isArray(review?.actions) ? review.actions : [],
    };
  }, [command.leagueNews, command.leaguePulse, command.postGameReview, command.teamRecord, lastGame, lastGameDisplay.overviewLine, nextOpponentDisplay.isHome, nextOpponentDisplay.opponentAbbr]);

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
      filmRoute: gameId ? buildGameBookDestination(gameId) : 'Weekly Prep',
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

  const rosterHealthBadge = useMemo(() => {
    const roster = Array.isArray(userTeam?.roster) ? userTeam.roster : [];
    const injuredCount = roster.filter((p) => safeNum(p?.injuryWeeksRemaining, 0) > 0).length;
    if (injuredCount > 2 || hqTeamBuilder.capPressure === 'critical') return { label: 'Attention', tone: 'danger' };
    if (injuredCount > 0 || hqTeamBuilder.capPressure === 'high') return { label: 'Monitor', tone: 'warning' };
    return { label: 'Healthy', tone: 'ok' };
  }, [userTeam?.roster, hqTeamBuilder.capPressure]);

  const culturePulse = useMemo(() => {
    const raw = league?.teamCulture?.[String(league?.userTeamId)] ?? null;
    const score = Number(raw?.score ?? TEAM_CULTURE_DEFAULT);
    const shift = Number(raw?.lastShift ?? 0);
    const trend = raw?.trend ?? 'flat';
    const reasons = Array.isArray(raw?.reasons) ? raw.reasons : [];
    const recentEvents = buildRecentCultureEvents(
      league?.teamCulture ?? {},
      league?.userTeamId,
      league?.newsItems,
    );
    const recentEventHeadline = recentEvents[0]?.headline ?? null;
    return {
      score,
      label: classifyTeamCulture(score),
      trend,
      trendIcon: trend === 'up' ? '↑' : trend === 'down' ? '↓' : '–',
      tone: trend === 'up' ? 'ok' : trend === 'down' ? 'warning' : 'info',
      narrative: buildTeamCultureNarrative(score, shift, reasons),
      recentEventHeadline,
    };
  }, [league?.teamCulture, league?.userTeamId, league?.newsItems]);

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

  const teamDisplayName = userTeam?.name ?? userTeam?.abbr ?? 'My Team';

  // Collapse transient roster / simulation notices into one compact strip
  // instead of stacking oversized full-width alert cards.
  const activityMessages = useMemo(() => {
    const out = [];
    if (busy || simulating) out.push({ id: 'sim', text: 'Simulating week — resolving games…', tone: 'info' });
    const roster = Array.isArray(userTeam?.roster) ? userTeam.roster : [];
    const injuredCount = roster.filter((p) => safeNum(p?.injuryWeeksRemaining, 0) > 0).length;
    if (injuredCount > 0) {
      out.push({ id: 'inj', text: `${injuredCount} player${injuredCount === 1 ? '' : 's'} on the injury report`, tone: injuredCount > 2 ? 'warning' : 'info' });
    }
    if (lineupToast) out.push({ id: 'lineup', text: lineupToast, tone: lineupToast.includes('valid') ? 'ok' : 'warning' });
    return out;
  }, [busy, simulating, userTeam?.roster, lineupToast]);

  return (
    <div
      className="app-screen-stack franchise-hq franchise-command-center hq-compact-layout"
      data-testid="franchise-hq"
      role="main"
      aria-label="Franchise HQ weekly command center"
    >
      {/* ── COMPACT TOP BAR — single line, ~40px, 4 tappable segments ─────── */}
      <header className="hq-compact-topbar" aria-label="Franchise HQ top bar">
        <button
          type="button"
          className="hq-topbar-seg hq-topbar-seg--team"
          onClick={() => onNavigate?.('Team:Overview')}
          aria-label={`Team: ${teamDisplayName}, record ${formatRecordInline(command.teamRecord)}`}
        >
          <strong className="hq-topbar-seg__primary">{teamDisplayName}</strong>
          <span className="hq-topbar-seg__secondary">{formatRecordInline(command.teamRecord)}</span>
        </button>
        <button
          type="button"
          className="hq-topbar-seg hq-topbar-seg--week"
          onClick={() => onNavigate?.('Game Plan')}
          aria-label={`Week ${safeNum(league?.week, 1)}`}
        >
          <strong className="hq-topbar-seg__primary">Wk {safeNum(league?.week, 1)}</strong>
        </button>
        <button
          type="button"
          className="hq-topbar-seg hq-topbar-seg--cap"
          onClick={() => onNavigate?.('Team:Front Office')}
          aria-label={`Cap space: ${capSpace}`}
        >
          <span className="hq-topbar-seg__secondary">{capSpace} cap</span>
        </button>
        <button
          type="button"
          className="hq-topbar-seg hq-topbar-seg--season"
          onClick={() => onNavigate?.('Standings')}
          aria-label={command.seasonLabel}
        >
          <span className="hq-topbar-seg__secondary">{command.seasonLabel}</span>
        </button>
      </header>

      {/* ── LAST RESULT ROW — single line, tappable → box score ─────────── */}
      {lastResultRow && (
        <button
          type="button"
          className={`hq-status-row hq-status-row--result`}
          data-tone={lastResultRow.tone}
          aria-label={`Last result: ${lastResultRow.text}. Tap to view box score.`}
          onClick={() => lastResultRow.gameId && onNavigate?.(buildGameBookDestination(lastResultRow.gameId))}
        >
          <span className={`hq-wl-badge hq-wl-badge--${lastResultRow.tone}`}>{lastResultRow.label}</span>
          <span className="hq-status-row__text">{lastResultRow.text}</span>
          <span className="hq-status-row__chevron" aria-hidden="true">›</span>
        </button>
      )}

      {/* ── NEXT GAME ROW — single line, tappable → Game Plan ───────────── */}
      <button
        type="button"
        className="hq-status-row hq-status-row--next"
        aria-label={`Next game: Week ${safeNum(league?.week, 1)} ${nextOpponentDisplay.isHome ? 'vs' : 'at'} ${nextOpponentDisplay.opponentAbbr ?? opponent?.abbr ?? 'TBD'}. Tap to open Game Plan.`}
        onClick={() => onNavigate?.('Game Plan')}
        data-testid="hq-matchup-hero"
      >
        <span className="hq-next-badge" aria-hidden="true">🏈</span>
        <span className="hq-status-row__text">
          Wk{safeNum(league?.week, 1)} {nextOpponentDisplay.isHome ? 'vs' : '@'} {nextOpponentDisplay.opponentAbbr ?? opponent?.abbr ?? command.nextOpponent ?? 'TBD'}
        </span>
        <span className="hq-status-row__muted">{formatRecordInline(command.nextOpponentRecord)}</span>
        <span className="hq-status-row__chevron" aria-hidden="true">›</span>
      </button>

      {/* ── STANDINGS MINI-TABLE — division only, 4 rows max ────────────── */}
      {divisionRows.length > 0 && (
        <section className="hq-standings-mini" aria-label="Division standings">
          <div className="hq-standings-mini__header" aria-hidden="true">
            <span>Division</span>
            <span>W-L</span>
            <span>GB</span>
          </div>
          {divisionRows.map((row, i) => (
            <button
              key={row.id ?? row.abbr ?? i}
              type="button"
              className={`hq-standings-mini__row${row.isUser ? ' is-user' : ''}`}
              onClick={() => onNavigate?.('Standings')}
              aria-label={`${row.abbr ?? row.name ?? '—'} ${row.record ?? ''}${row.isUser ? ' (your team)' : ''}`}
            >
              <span className="hq-standings-mini__abbr">{row.abbr ?? row.name ?? '—'}</span>
              <span className="hq-standings-mini__record">{row.record ?? '—'}</span>
              <span className="hq-standings-mini__gb">{row.gbDisplay}</span>
            </button>
          ))}
        </section>
      )}

      {/* ── ALERTS ROW — single line, only if actions exist ─────────────── */}
      {commandSummary.criticalCount > 0 ? (
        <button
          type="button"
          className={`hq-alerts-row hq-alerts-row--${commandSummary.readinessTone}`}
          data-testid="hq-actions-required"
          aria-label={`${commandSummary.criticalCount} action${commandSummary.criticalCount !== 1 ? 's' : ''} required. Tap to review.`}
          onClick={() => setShowGate(true)}
        >
          <span>⚠ {commandSummary.criticalCount} action{commandSummary.criticalCount !== 1 ? 's' : ''} required</span>
          <span className="hq-alerts-row__chevron" aria-hidden="true">›</span>
        </button>
      ) : (
        <div
          className="hq-ready-row"
          data-testid="hq-actions-required"
          data-ready="true"
          aria-label="No actions required"
        >
          <StatusChip label="Ready" tone="ok" />
          <span>No blockers — ready to advance</span>
        </div>
      )}

      {/* ── QUICK ACTION GRID 2×2 ────────────────────────────────────────── */}
      <div
        className="app-hq-action-tiles"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 6,
          padding: '0 12px',
        }}
      >
        {actionTiles.map((tile) => (
          <ActionTile
            key={tile.title}
            icon={tile.icon}
            title={tile.title}
            subtitle={tile.subtitle}
            badge={typeof tile.badge === 'string' ? <StatusChip label={tile.badge} tone="warning" /> : tile.badge}
            onClick={tile.onClick}
          />
        ))}
      </div>

      {/* ── TRADE REQUEST ALERTS ─────────────────────────────────────────── */}
      {(() => {
        const alerts = Array.isArray(userTeam?.tradeRequestAlerts) ? userTeam.tradeRequestAlerts : [];
        if (alerts.length === 0) return null;
        return (
          <section data-testid="hq-trade-request-alerts" aria-label="Trade request alerts">
            {alerts.map((alert) => {
              const isBoiling = safeNum(alert.stonewalledWeeks, 0) >= 4;
              return (
                <div
                  key={alert.playerId}
                  className="card"
                  data-testid={`trade-request-alert-${alert.playerId}`}
                  style={{
                    margin: '4px 12px',
                    padding: 'var(--space-3) var(--space-4)',
                    border: `1px solid ${isBoiling ? '#FF453A44' : '#FF9F0A44'}`,
                    background: isBoiling ? '#FF453A0E' : '#FF9F0A0E',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontWeight: 900, color: isBoiling ? '#FF453A' : '#FF9F0A', textTransform: 'uppercase', letterSpacing: '.07em' }}>
                      Trade Request
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      — {alert.playerName} ({alert.pos} · OVR {alert.ovr})
                    </span>
                    {isBoiling && (
                      <span style={{ color: '#FF453A', fontWeight: 700 }}>
                        · Week {alert.stonewalledWeeks} unresolved
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 6 }}>
                    Reason: {alert.reason?.replace(/_/g, ' ') ?? 'undisclosed'}
                    {alert.stonewalledWeeks > 0 ? ` · ${alert.stonewalledWeeks}w unresolved` : ''}
                  </div>
                  {isBoiling && (
                    <div style={{ color: '#FF453A', fontWeight: 600, marginBottom: 6 }}>
                      Warning: locker room morale at risk
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: '#34C759', borderColor: '#34C759', fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                      onClick={() => actions?.honorTradeRequest?.(alert.playerId)}
                      data-testid={`honor-trade-request-${alert.playerId}`}
                    >
                      Honor — List on Block
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: '#0A84FF', borderColor: '#0A84FF', fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                      onClick={() => actions?.offerExtensionToWithdraw?.(alert.playerId)}
                      data-testid={`offer-extension-${alert.playerId}`}
                    >
                      Offer Extension
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ color: isBoiling ? '#FF453A' : 'var(--text-muted)', borderColor: isBoiling ? '#FF453A' : 'var(--hairline)', fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                      onClick={() => actions?.stonewallTradeRequest?.(alert.playerId)}
                      data-testid={`stonewall-trade-request-${alert.playerId}`}
                    >
                      Stonewall
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        );
      })()}

      {/* ── INBOUND TRADE BLOCK OFFERS badge ────────────────────────────── */}
      {(() => {
        const inboundOffers = Array.isArray(league?.inboundTradeOffers) ? league.inboundTradeOffers : [];
        if (inboundOffers.length === 0) return null;
        return (
          <div
            style={{
              margin: '4px 12px',
              padding: '6px var(--space-4)',
              border: '1px solid rgba(10,132,255,0.35)',
              background: 'rgba(10,132,255,0.07)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            data-testid="hq-inbound-trade-offers-badge"
          >
            <span style={{ fontWeight: 700, color: '#0A84FF' }}>Trade Block</span>
            <span style={{ color: 'var(--text-muted)' }}>
              {inboundOffers.length} inbound {inboundOffers.length === 1 ? 'offer' : 'offers'} — review in Trade Center
            </span>
            {typeof onNavigate === 'function' && (
              <button
                type="button"
                className="btn btn-sm"
                style={{ marginLeft: 'auto', color: '#0A84FF', borderColor: 'rgba(10,132,255,0.35)', fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                onClick={() => onNavigate('Trade')}
              >
                View
              </button>
            )}
          </div>
        );
      })()}

      {/* ── TRADE DEADLINE BANNER ─────────────────────────────────────────── */}
      <HQDeadlineBanner week={safeNum(league?.week, 1)} />

      {/* ── DRAFT COMBINE DASHBOARD ─────────────────────────────────────── */}
      {league?.phase === 'draft_combine' && Array.isArray(league?.combineProspects) && (
        <CombineDashboard
          prospects={league.combineProspects}
          combineInvitesLeft={league.combineInvitesLeft ?? 0}
          actions={actions}
        />
      )}

      {/* ── COLLAPSED DRAWER: secondary content ─────────────────────────── */}
      <details className="hq-more-drawer" data-testid="hq-more-drawer">
        <summary className="hq-more-drawer__trigger">Season Pulse &amp; More ▾</summary>

        <ChronicleHeadlineBanner
          headlines={Array.isArray(league?.weeklyHeadlines) ? league.weeklyHeadlines : []}
          currentWeek={safeNum(league?.week, 1)}
          currentYear={safeNum(league?.year, 0)}
          onViewAll={() => onNavigate?.('News')}
        />

        <MediaDesk stories={Array.isArray(league?.mediaStories) ? league.mediaStories : []} />

        {/* Twin status cards */}
        <div className="hq-twin-grid" aria-label="Team status overview" data-testid="hq-twin-status-grid">
          <article
            className={`hq-twin-card card tone-${rosterHealthBadge.tone}`}
            data-testid="roster-health-card"
            aria-label="Roster Health"
          >
            <div className="hq-twin-card__head">
              <strong>Roster Health</strong>
              <StatusChip label={rosterHealthBadge.label} tone={rosterHealthBadge.tone} />
            </div>
            <p className="hq-twin-card__stat">
              {hqTeamBuilder.biggestNeed !== 'Needs more data' ? `Need: ${hqTeamBuilder.biggestNeed}` : 'Balanced'}
            </p>
            <p className="hq-twin-card__detail">{hqTeamBuilder.nextAction}</p>
            {lastGame ? (
              <p className="hq-twin-card__detail hq-twin-card__divider" data-testid="hq-last-result">
                {lastGameDisplay.heroLine} · {formatRecordInline(command.teamRecord)}
              </p>
            ) : null}
            {weeklyIntel.length > 0 ? (
              <p className="hq-twin-card__detail hq-intel-text--clamp">{weeklyIntel[0].text}</p>
            ) : null}
            {(command.weeklyAgenda ?? []).length > 0 ? (
              <details className="hq-game-plan-accordion">
                <summary className="hq-game-plan-accordion__trigger">
                  Plan ({(command.weeklyAgenda ?? []).length}) ▾
                </summary>
                <div className="hq-game-plan-accordion__grid">
                  {(command.weeklyAgenda ?? []).slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="btn btn-sm"
                      onClick={() => item.targetRoute && onNavigate?.(item.targetRoute)}
                      disabled={!item.targetRoute}
                      aria-label={`${item.title}: ${item.ctaLabel}`}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </details>
            ) : null}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
              <button type="button" className="btn btn-sm" onClick={() => onNavigate?.('Team:Roster / Team Builder')}>
                Team Builder
              </button>
              {hqNextAction.route ? (
                <button type="button" className="btn btn-sm" onClick={() => onNavigate?.(hqNextAction.route)}>
                  {hqNextAction.label}
                </button>
              ) : null}
            </div>
          </article>

          <article
            className={`hq-twin-card card tone-${seasonPulse.mandateTone}`}
            data-testid="office-status-card"
            aria-label="Office Status"
          >
            <div className="hq-twin-card__head">
              <strong>Office Status</strong>
              <StatusChip label={`${seasonPulse.approval}%`} tone={seasonPulse.mandateTone} />
            </div>
            <p className="hq-twin-card__stat">{seasonPulse.capLabel} cap</p>
            <p className="hq-twin-card__detail">{seasonPulse.pressureSummary}</p>
            <p className="hq-twin-card__detail hq-twin-card__divider">
              Next: {postAdvanceNote.nextOpponent} · {formatRecordInline(command.teamRecord)}
            </p>
            {weeklyIntel.length > 1 ? (
              <p className="hq-twin-card__detail hq-intel-text--clamp">{weeklyIntel[1].text}</p>
            ) : null}
            <p className="hq-twin-card__detail hq-twin-card__divider" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.78em', opacity: 0.65 }}>Culture</span>
              <StatusChip label={`${culturePulse.label} ${culturePulse.trendIcon}`} tone={culturePulse.tone} />
            </p>
            <button type="button" className="btn btn-sm" onClick={() => onNavigate?.('Team:Front Office')}>
              Front Office
            </button>
          </article>

          <JobSecurityCard ownerProfile={league?.userOwnerPressure} />
        </div>

        {/* Franchise termination notice (blocking, shown when user is fired) */}
        {league?.userFranchiseTerminated && (
          <div
            data-testid="franchise-terminated-notice"
            role="alert"
            style={{
              margin: '8px 12px',
              padding: 'var(--space-4)',
              border: '2px solid var(--danger, #FF453A)',
              background: 'rgba(255,69,58,0.10)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <strong style={{ display: 'block', color: 'var(--danger, #FF453A)', marginBottom: 4 }}>
              🚨 Franchise Dismissed
            </strong>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', margin: 0 }}>
              The ownership group has terminated your tenure as General Manager due to repeated failure
              to meet the team mandate. Load a previous save or start a new franchise to continue.
            </p>
          </div>
        )}

        {/* League quick navigation */}
        <nav
          className="hq-nav-pills"
          aria-label="League quick navigation"
          data-testid="hq-league-destination-links"
        >
          <button type="button" className="hq-nav-pill" onClick={() => onNavigate?.('League Leaders')}>Stats</button>
          <button type="button" className="hq-nav-pill" onClick={() => onNavigate?.('Standings')}>Standings</button>
          <button type="button" className="hq-nav-pill" onClick={() => onNavigate?.('News')}>News</button>
          <button type="button" className="hq-nav-pill" onClick={() => onNavigate?.('Team:Front Office')}>Ops</button>
        </nav>

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

            <article
              className={`app-hq-pulse-card tone-${culturePulse.tone}`}
              style={{ gridColumn: '1 / -1' }}
              data-testid="culture-pulse-card"
              aria-label="Team Culture"
            >
              <div className="app-hq-pulse-card__head">
                <span>Team Culture</span>
                <StatusChip label={`${culturePulse.score.toFixed(0)} ${culturePulse.trendIcon}`} tone={culturePulse.tone} />
              </div>
              <strong>{culturePulse.label}</strong>
              <p style={{ margin: '2px 0 0', fontSize: '0.85em', opacity: 0.9 }}>{culturePulse.narrative}</p>
              {culturePulse.recentEventHeadline ? (
                <p style={{ margin: '3px 0 0', fontSize: '0.8em', opacity: 0.7 }} data-testid="culture-recent-event">{culturePulse.recentEventHeadline}</p>
              ) : null}
            </article>
          </div>
        </SectionCard>

        {/* Decision Review */}
        <SectionCard
          title={decisionReview?.heading ?? 'What Mattered Last Week'}
          subtitle={decisionReview?.resultSummary ?? 'Run a completed game to unlock a weekly decision review.'}
          variant="compact"
        >
          <details className="app-hq-background-section__inner">
            <summary className="app-hq-section-expand">Show decision recap ▾</summary>
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
          </details>
        </SectionCard>

        {/* Operations Snapshot */}
        <SectionCard title="Operations Snapshot" subtitle="Last result, standing, and upcoming slate." variant="compact">
          <details className="app-hq-background-section__inner">
            <summary className="app-hq-section-expand">Show snapshot ▾</summary>
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
          </details>
        </SectionCard>
      </details>

      {/* ── Trophy Case ── */}
      {(() => {
        const userTeamId = Number(league?.userTeamId);
        const franchiseAwards = Array.isArray(league?.franchiseAwards) ? league.franchiseAwards : [];
        const leagueHistory = Array.isArray(league?.leagueHistory) ? league.leagueHistory : [];
        const teams = Array.isArray(league?.teams) ? league.teams : [];
        const teamAbbrById = new Map(teams.map(t => [Number(t.id), t.abbr ?? t.name]));

        // Championships from franchiseAwards
        const championships = franchiseAwards
          .filter(a => a.type === 'LEAGUE_CHAMPION' && Number(a.teamId) === userTeamId)
          .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));

        // Coach of Year from franchiseAwards
        const coachAwards = franchiseAwards
          .filter(a => a.type === 'COACH_OF_YEAR' && Number(a.teamId) === userTeamId)
          .sort((a, b) => (b.season ?? 0) - (a.season ?? 0));

        // Individual awards from leagueHistory for players on user team
        const indAwards = [];
        for (const s of leagueHistory) {
          const yr = s.year ?? s.seasonId;
          const aw = s.awards ?? {};
          for (const [key, val] of Object.entries(aw)) {
            if (!val?.playerId || !val?.teamId) continue;
            if (Number(val.teamId) !== userTeamId) continue;
            if (['mvp', 'opoy', 'dpoy', 'roty'].includes(key)) {
              indAwards.push({ year: yr, key, name: val.name, pos: val.pos });
            }
          }
        }
        indAwards.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

        if (championships.length === 0 && coachAwards.length === 0 && indAwards.length === 0) return null;

        const LABELS = { mvp: 'MVP', opoy: 'OPOY', dpoy: 'DPOY', roty: 'ROTY' };

        return (
          <SectionCard
            title="Trophy Case"
            subtitle="Championship seasons and major franchise honors."
            variant="compact"
            data-testid="hq-trophy-case"
          >
            <details className="app-hq-background-section__inner">
              <summary className="app-hq-section-expand">Show trophy case ▾</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, maxHeight: 280, overflowY: 'auto' }}>
                {championships.map(c => (
                  <div key={`champ-${c.season}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--hairline)' }}>
                    <span style={{ fontSize: '1.1rem' }}>🏆</span>
                    <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{c.season}</span>
                    <span style={{ color: 'var(--text)', fontSize: 'var(--text-xs)' }}>League Champions</span>
                  </div>
                ))}
                {coachAwards.map(c => (
                  <div key={`coy-${c.season}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--hairline)' }}>
                    <span style={{ fontSize: '1.1rem' }}>🎖️</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{c.season}</span>
                    <span style={{ color: 'var(--text)', fontSize: 'var(--text-xs)' }}>Coach of the Year{c.coachName ? ` — ${c.coachName}` : ''}</span>
                  </div>
                ))}
                {indAwards.slice(0, 10).map((a, i) => (
                  <div key={`ind-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--hairline)' }}>
                    <span style={{ fontSize: '1.1rem' }}>🥇</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{a.year}</span>
                    <span style={{ color: 'var(--text)', fontSize: 'var(--text-xs)' }}>{a.pos} {a.name} — {LABELS[a.key] ?? a.key}</span>
                  </div>
                ))}
              </div>
            </details>
          </SectionCard>
        );
      })()}

      {/* ── Hall of Famers ── */}
      {(() => {
        const userTeamId = Number(league?.userTeamId);
        const userTeam = (league?.teams ?? []).find((t) => Number(t?.id) === userTeamId);
        const userTeamAbbr = userTeam?.abbr ?? null;
        const hofRoster = Array.isArray(league?.hofRoster) ? league.hofRoster : [];
        const franchiseLegends = hofRoster.filter((h) =>
          Array.isArray(h.teamIds) && userTeamAbbr && h.teamIds.includes(userTeamAbbr),
        ).sort((a, b) => Number(b.inductionSeason ?? 0) - Number(a.inductionSeason ?? 0));
        if (franchiseLegends.length === 0) return null;
        return (
          <SectionCard
            title="Hall of Famers"
            subtitle="Legends who wore your franchise's colors."
            variant="compact"
            data-testid="hq-hall-of-famers"
          >
            <details className="app-hq-background-section__inner">
              <summary className="app-hq-section-expand">Show Hall of Famers ▾</summary>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, maxHeight: 260, overflowY: 'auto' }}>
                {franchiseLegends.map((h) => (
                  <div
                    key={`hof-${h.playerId}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--hairline)' }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>★</span>
                    <span style={{ fontWeight: 700, color: 'var(--warning)' }}>{h.inductionSeason}</span>
                    <span style={{ color: 'var(--text)', fontSize: 'var(--text-xs)' }}>
                      {h.position} {h.playerName}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)', marginLeft: 'auto' }}>
                      Score {Math.round(h.hofScore ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </SectionCard>
        );
      })()}

      {/* ── Dead Cap Panel — shown only when team has dead cap items ── */}
      {(() => {
        const deadCapItems = Array.isArray(userTeam?.deadCapItems) ? userTeam.deadCapItems : [];
        if (deadCapItems.length === 0) return null;
        const totalDeadCap = deadCapItems.reduce((sum, item) => sum + safeNum(item?.amount, 0), 0);
        const capRoom = safeNum(userTeam?.capRoom, 0);
        return (
          <SectionCard
            data-testid="franchise-hq-dead-cap-panel"
            title="Dead Cap"
            style={{ margin: '0 12px 12px', padding: '10px 14px' }}
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 8 }}>
              Total dead cap this season:{' '}
              <strong style={{ color: totalDeadCap > capRoom * 0.10 ? 'var(--danger)' : 'var(--text)' }}>
                ${totalDeadCap.toFixed(1)}M
              </strong>
            </div>
            {deadCapItems.map((item, idx) => (
              <div
                key={`${item.playerId ?? idx}-${item.season ?? 0}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 'var(--text-xs)',
                  padding: '4px 0',
                  borderTop: idx === 0 ? 'none' : '1px solid var(--hairline)',
                }}
              >
                <span>{item.playerName ?? 'Unknown'}</span>
                <span style={{ color: 'var(--text-muted)' }}>
                  ${safeNum(item.amount, 0).toFixed(1)}M · exp. {item.expiresAfterSeason ?? '—'}
                </span>
              </div>
            ))}
          </SectionCard>
        );
      })()}

      {/* ── Championship Wall ── */}
      {(() => {
        const champYears = Array.isArray(league?.championshipYears) ? league.championshipYears : [];
        if (champYears.length === 0) return null;
        return (
          <div style={{ padding: '0 12px', marginBottom: 4 }}>
            <FranchiseBrandHQ championshipYears={champYears} />
          </div>
        );
      })()}

      {/* ── Franchise Legacy: Ring of Honor, Retired Numbers & All-Time Leaders ── */}
      {(() => {
        const rohMembers         = Array.isArray(league?.ringOfHonor) ? league.ringOfHonor : [];
        const atLeaders          = league?.allTimeLeaders ?? null;
        const rohCandidates      = Array.isArray(league?.pendingRohCandidates) ? league.pendingRohCandidates : [];
        const retiredNums        = Array.isArray(league?.retiredNumbers) ? league.retiredNumbers : [];
        const retiredNumDisplay  = Array.isArray(league?.retiredNumberDisplay) ? league.retiredNumberDisplay : [];
        const hasLegacyData = rohMembers.length > 0 || rohCandidates.length > 0 || retiredNums.length > 0;

        const handleInduct = (playerId, teamId) => {
          if (actions?.send) {
            actions.send('INDUCT_PLAYER_TO_ROH', { playerId, teamId });
          }
        };

        const handleRetireNumber = (playerId, jerseyNumber) => {
          if (actions?.send) {
            const userTeamId = league?.userTeamId ?? league?.teams?.[0]?.id;
            actions.send('RETIRE_JERSEY_NUMBER', { teamId: userTeamId, playerId });
          }
        };

        if (!hasLegacyData && !atLeaders) return null;

        return (
          <div style={{ padding: '0 12px', marginBottom: 4 }}>
            <FranchiseLegacyView
              ringOfHonor={rohMembers}
              allTimeLeaders={atLeaders}
              pendingRohCandidates={rohCandidates}
              retiredNumbers={retiredNums}
              retiredNumberDisplay={retiredNumDisplay}
              awardHistory={league?.awardHistory ?? []}
              onInduct={handleInduct}
              onRetireNumber={handleRetireNumber}
            />
          </div>
        );
      })()}

      <ActivityToastStack messages={activityMessages} />

      {showGate ? (
        <div style={{ padding: '0 12px', marginBottom: 8 }}>
          <AdvanceReadinessGate
            gate={gate}
            onAdvanceAnyway={handleGateAdvanceAnyway}
            onReview={handleGateReview}
            onCancel={() => setShowGate(false)}
          />
        </div>
      ) : null}

      {/* ── ADVANCE WEEK BUTTON — full-width, always visible without scroll ── */}
      <div className="app-hq-sticky-advance">
        <Button
          className="app-command-advance app-command-advance-gold"
          data-testid="advance-week-cta"
          onClick={handleAdvanceOrGate}
          disabled={busy || simulating || commandSummary.criticalCount > 0}
          aria-label={
            busy || simulating
              ? 'Advancing week…'
              : commandSummary.criticalCount > 0
                ? `Advance Week — ${commandSummary.criticalCount} item${commandSummary.criticalCount !== 1 ? 's' : ''} must be resolved first`
                : `Advance Week — move from ${command.weekLabel} to next week`
          }
          title={commandSummary.criticalCount > 0 ? `Resolve ${commandSummary.criticalCount} open item${commandSummary.criticalCount !== 1 ? 's' : ''} to unlock` : 'Advance Week'}
        >
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
