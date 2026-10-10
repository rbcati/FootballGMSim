import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deriveWeeklyPrepState } from '../utils/weeklyPrep.js';
import { evaluateWeeklyContext } from '../utils/weeklyContext.js';
import { buildAdvanceReadinessGate } from '../utils/advanceReadinessGate.js';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import { buildGameDayReadinessModel } from '../utils/gameDayReadinessModel.js';
import { buildHqDivisionSnapshot, buildHqNextAction, buildHqStrengthSnapshot, buildHqWeekControl, buildHqLastResult, formatHqRecord } from '../utils/hqCommandCenterV2.js';
import { EmptyState } from './ScreenSystem.jsx';
import JobSecurityCard from './JobSecurityCard.jsx';
import HqInfoPopover from './HqInfoPopover.jsx';
import { getUserScheduleGames } from '../utils/userWeeklyGames.js';
import { PlayerEntityLink } from './EntityLink.jsx';
import { loadWeeklyStoryArchivedGame } from '../utils/weeklyStoryPresentation.js';
import { resolveCanonicalCompletedGame } from '../utils/canonicalCompletedGame.js';
import { resolveCompletedGameId } from '../utils/gameResultIdentity.js';

const value = (number) => number == null ? '—' : number;
const rank = (number) => number == null ? '—' : `#${number}`;

function HqNextActionCard({ action, onNavigate, disabled }) {
  const activate = () => action.destination && onNavigate?.(action.destination);
  return (
    <section className="hq-v2-card hq-v2-next" data-testid="hq-next-action">
      <p className="hq-v2-kicker">NEXT UP</p>
      <strong className="hq-v2-next__title">{action.title}</strong>
      {action.advance ? <span className="hq-v2-empty">{action.eyebrow === 'READY FOR GAME DAY' ? 'Ready for game day.' : 'Ready to advance.'}</span> : <button type="button" className="hq-v2-text-link" disabled={disabled || !action.destination} onClick={activate}>{`${action.cta} →`}</button>}
    </section>
  );
}

function HqDivisionCard({ division, onNavigate }) {
  if (!division) return null;
  return (
    <section className="hq-v2-card" data-testid="hq-division-card">
      <button className="hq-v2-heading-link" type="button" onClick={() => onNavigate?.('League:Standings')}><span>{division.title}</span><span>Standings →</span></button>
      <div className="hq-v2-table-head"><span>TEAM</span><span>RECORD</span><span>DIV <HqInfoPopover label="Division record">{division.isArchived ? 'Previous-season division records are unavailable.' : 'Record against teams in your division.'}</HqInfoPopover></span></div>
      {division.teams.map((team) => <div key={team.id} className={`hq-v2-division-row${team.isUser ? ' is-user' : ''}`} data-user-team={team.isUser ? 'true' : undefined}>
        <strong>{team.abbr}</strong><span>{team.record}</span><span>{value(team.divisionRecord)}{team.isUser ? <small>YOU</small> : null}</span>
      </div>)}
    </section>
  );
}

function HqTeamStrength({ snapshot }) {
  const metrics = [['TEAM', snapshot.teamOvr], ['OFF', snapshot.offenseOvr], ['DEF', snapshot.defenseOvr], ['SPEC', snapshot.specialTeamsOvr]];
  return (
    <section className="hq-v2-card" data-testid="hq-team-strength">
      <h2>TEAM STRENGTH</h2>
      <div className="hq-v2-ratings">{metrics.map(([label, score]) => <div key={label}><span>{label}</span><strong>{value(score)}</strong></div>)}</div>
      <div className="hq-v2-ranks">
        <div><span>POWER <HqInfoPopover label="Power rank">Weekly team ranking based on current results, point differential, and recent form.</HqInfoPopover></span><strong>{rank(snapshot.powerRank)}</strong></div>
        <div><span>OFFENSE <HqInfoPopover label="Offense rank">League rank by current offensive unit strength.</HqInfoPopover></span><strong>{rank(snapshot.offenseRank)}</strong></div>
        <div><span>DEFENSE <HqInfoPopover label="Defense rank">League rank by current defensive unit strength.</HqInfoPopover></span><strong>{rank(snapshot.defenseRank)}</strong></div>
      </div>
    </section>
  );
}

function compactName(player) {
  const full = String(player?.name ?? `${player?.firstName ?? ''} ${player?.lastName ?? ''}`).trim();
  const parts = full.split(/\s+/).filter(Boolean);
  return { full: full || 'Unknown', compact: parts.length > 1 ? `${parts[0][0]}. ${parts.at(-1)}` : full || 'Unknown' };
}

function LeaderGroup({ title, data, onPlayerSelect }) {
  const categories = [['PASS', 'passing'], ['RUSH', 'rushing'], ['REC', 'receiving']];
  return <div className="hq-v2-leader-group"><h3>{title}</h3>{categories.map(([label, key]) => {
    const player = data?.[key]?.[0];
    if (!player) return <div className="hq-v2-leader" key={key}><span>{label}</span><strong>No stats yet</strong><b>—</b></div>;
    const name = compactName(player);
    return <div className="hq-v2-leader" key={key}><span>{label}</span><strong title={name.full}><PlayerEntityLink playerId={player.playerId} onPlayerSelect={onPlayerSelect}>{name.compact}</PlayerEntityLink></strong><b>{Number(player.value ?? 0).toLocaleString()} yds</b></div>;
  })}</div>;
}

function HqYardageLeaders({ actions, leaderRequestKey, onNavigate, onPlayerSelect }) {
  const [state, setState] = useState({ key: leaderRequestKey, data: null });
  const request = useRef(actions?.getDashboardLeaders);
  request.current = actions?.getDashboardLeaders;
  const canRequest = typeof actions?.getDashboardLeaders === 'function';
  useEffect(() => {
    let current = true;
    setState({ key: leaderRequestKey, data: null, status: canRequest ? 'loading' : 'unavailable' });
    if (!canRequest) return () => { current = false; };
    request.current().then((response) => {
      if (current) setState({ key: leaderRequestKey, data: response?.payload ?? response });
    }).catch(() => { if (current) setState({ key: leaderRequestKey, data: null, status: 'error' }); });
    return () => { current = false; };
  }, [canRequest, leaderRequestKey]);
  const data = state.key === leaderRequestKey ? state.data : null;
  const hasLeaders = ['team', 'league'].some((scope) => ['passing', 'rushing', 'receiving'].some((category) => data?.[scope]?.[category]?.[0]));
  return <section className="hq-v2-card hq-v2-leaders" data-testid="hq-yardage-leaders">
    <div className="hq-v2-leaders-grid"><LeaderGroup title="TEAM LEADERS" data={data?.team} onPlayerSelect={onPlayerSelect} /><LeaderGroup title="LEAGUE LEADERS" data={data?.league} onPlayerSelect={onPlayerSelect} /></div>
    {!hasLeaders && <p className="hq-v2-empty" role="status">{state.status === 'loading' ? 'Loading season stats…' : state.status === 'error' || state.status === 'unavailable' ? 'Season stats unavailable.' : 'No season stats yet.'}</p>}
    <button type="button" className="hq-v2-text-link" onClick={() => onNavigate?.('Stats')}>View Stats →</button>
  </section>;
}

function HqNextGame({ nextGame }) {
  if (!nextGame) return null;
  const opponent = nextGame.opp;
  return <section className="hq-v2-card hq-v2-game" data-testid="hq-next-game"><div><h2>NEXT GAME</h2><strong>{nextGame.isHome ? 'vs' : '@'} {opponent?.abbr ?? 'TBD'}</strong><p>{formatHqRecord(opponent)} · {value(opponent?.ovr ?? opponent?.overallRating)} OVR</p></div></section>;
}

function HqLastResult({ league, actions, requestKey, onOpenBoxScore, onNavigate }) {
  // A rollover can reach the UI before the slim schedule's played/scores fields.
  // Ask Game Book's archive authority about the latest elapsed user matchup.
  // Do not consult the unscoped localStorage "latest game" across saves.
  const candidate = getUserScheduleGames(league).filter((game) => game.isCompleted || game.week < Number(league.week)).at(-1);
  const gameId = candidate && resolveCompletedGameId(candidate, { seasonId: league.seasonId, week: candidate.week });
  const key = `${requestKey}:${gameId ?? 'none'}`;
  const request = useRef(actions?.getBoxScore);
  request.current = actions?.getBoxScore;
  const available = typeof actions?.getBoxScore === 'function';
  const [archive, setArchive] = useState(null);
  useEffect(() => {
    let current = true;
    if (gameId && available) loadWeeklyStoryArchivedGame({ getBoxScore: request.current, gameId })
      .then((game) => { if (current) setArchive({ key, game }); })
      .catch(() => { if (current) setArchive({ key, game: null }); });
    return () => { current = false; };
  }, [key, gameId, available]);
  const resolved = candidate && resolveCanonicalCompletedGame({ league, gameId, scheduleGame: candidate, archivedGame: archive?.key === key ? archive.game : null });
  const result = buildHqLastResult(league, resolved);
  if (!result) return null;
  return <section className="hq-v2-card hq-v2-game" data-testid="hq-last-result"><div><h2>LAST RESULT</h2><strong>{result.summary}</strong></div>{result.gameId && <button type="button" className="hq-v2-text-link" onClick={() => onOpenBoxScore ? onOpenBoxScore(result.gameId) : onNavigate?.(`Game Book:${result.gameId}`)}>View Game Book →</button>}</section>;
}

export default function FranchiseHQ({ league, onNavigate, onAdvanceWeek, onOpenBoxScore, onPlayerSelect, busy, simulating, actions, advanceDisabled = false }) {
  const command = useMemo(() => selectFranchiseHQViewModel(league), [league]);
  const prep = useMemo(() => deriveWeeklyPrepState(league), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(league), [league]);
  const currentGame = useMemo(() => getUserScheduleGames(league).find((game) => !game.isCompleted && game.week === Number(league?.week ?? 1)) ?? null, [league]);
  // Future matchup prep belongs to its own week. Keep roster/injury/cap risks
  // on a bye, while excluding game-plan and matchup risks for a later game.
  const gate = useMemo(() => buildAdvanceReadinessGate({ league, prep: currentGame ? prep : { ...prep, nextGame: null, prepSummary: null, readinessTier: null }, weeklyContext: weekly }), [league, prep, weekly, currentGame]);
  const team = (league?.teams ?? []).find((row) => String(row?.id) === String(league?.userTeamId));
  const readiness = useMemo(() => buildGameDayReadinessModel({ roster: team?.roster, teamId: team?.id }), [team]);
  const division = useMemo(() => buildHqDivisionSnapshot(league), [league]);
  const strength = useMemo(() => buildHqStrengthSnapshot({ league, team }), [league, team]);
  const action = useMemo(() => buildHqNextAction({ league, gate, gameDayReadiness: readiness, nextGame: currentGame }), [league, gate, readiness, currentGame]);
  const control = useMemo(() => buildHqWeekControl({ league, nextGame: currentGame }), [league, currentGame]);
  if (command.readyState !== 'ready' || !team) return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  const saveKey = `${league?.activeLeagueId ?? league?.id ?? 'league'}:${league?.franchiseGenerationId ?? league?.seasonId ?? league?.year ?? 'season'}`;
  const leaderRequestKey = `${saveKey}:${league?.seasonId ?? league?.year}:${league?.phase ?? 'phase'}:${league?.week ?? 0}`;
  return <main className="hq-v2" data-testid="franchise-hq">
    <header className="hq-v2-identity"><h1>{String(team.city ?? team.name ?? team.abbr ?? 'FRANCHISE').toUpperCase()}</h1><p aria-label={`Week ${league?.week ?? 1}`}>{formatHqRecord(team)} · {division?.title ?? 'LEAGUE'} · WEEK {league?.week ?? 1}</p></header>
    <HqNextActionCard action={action} onNavigate={onNavigate} disabled={busy || simulating} />
    {control && <section className="hq-v2-week-control" data-testid="hq-week-control">
      <button type="button" className="hq-v2-primary" data-testid="advance-week-cta" aria-describedby={control.blocked ? 'hq-advance-reason' : undefined} disabled={busy || simulating || advanceDisabled || control.blocked} onClick={onAdvanceWeek}>{control.label} →</button>
      {control.blocked && <><p id="hq-advance-reason">{control.reason}</p>{(control.reviewEvent || control.destination !== action.destination) && <button type="button" className="hq-v2-text-link" onClick={() => control.reviewEvent ? onAdvanceWeek?.() : onNavigate?.(control.destination)}>{control.repairLabel} →</button>}</>}
    </section>}
    <HqLastResult league={league} actions={actions} requestKey={leaderRequestKey} onOpenBoxScore={onOpenBoxScore} onNavigate={onNavigate} />
    {league?.userFranchiseTerminated ? <section className="hq-v2-card" data-testid="franchise-terminated-notice"><h2>Franchise Dismissed</h2><p>Your ownership tenure has ended.</p></section> : null}
    {league?.userOwnerPressure ? <JobSecurityCard ownerProfile={league.userOwnerPressure} /> : null}
    <div className="hq-v2-pair"><HqDivisionCard division={division} onNavigate={onNavigate} /><HqTeamStrength snapshot={strength} /></div>
    <HqYardageLeaders actions={actions} leaderRequestKey={leaderRequestKey} onNavigate={onNavigate} onPlayerSelect={onPlayerSelect} />
    <HqNextGame nextGame={command.nextGame} />
    <section className="hq-v2-card"><h2>QUICK ACTIONS</h2><nav className="hq-v2-quick" aria-label="Quick actions">{[['Lineup', 'Team:Lineup'], ['Game Plan', 'Game Plan'], ['Injuries', 'Team:Injuries'], ['Stats', 'Stats']].map(([label, destination]) => <button type="button" key={label} onClick={() => onNavigate?.(destination)}>{label}</button>)}</nav></section>
    <details className="hq-v2-more"><summary>More Prep</summary><div>{gate.riskItems?.length ? gate.riskItems.filter((item) => !item.fixDestination || (item.fixDestination !== action.destination && !['Game Plan', 'Team:Injuries', 'Injuries', 'Team:Roster / Depth'].includes(item.fixDestination))).map((item) => {
      const destination = item.id === 'depth-blocker' ? 'Team:Lineup' : item.fixDestination;
      return <button type="button" key={item.id} disabled={!destination} onClick={() => destination && onNavigate?.(destination)}><span>{item.label}</span><b>{destination ? item.severity === 'info' ? 'Optional' : 'Review' : 'Status'}</b></button>;
    }) : <p>Lineup, game plan, scouting and training are ready.</p>}
      {team.tradeRequestAlerts?.length > 0 && <button type="button" onClick={() => onNavigate?.('Team:Overview')}><span>{team.tradeRequestAlerts.length} player trade request{team.tradeRequestAlerts.length === 1 ? '' : 's'}</span><b>Review</b></button>}
      {league.pendingRohCandidates?.length > 0 && <button type="button" onClick={() => onNavigate?.('Team:Overview')}><span>{league.pendingRohCandidates.length} Ring of Honor candidate{league.pendingRohCandidates.length === 1 ? '' : 's'}</span><b>Review</b></button>}
    </div></details>
  </main>;
}
