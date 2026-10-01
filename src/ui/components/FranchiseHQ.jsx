import React, { useEffect, useMemo, useState } from 'react';
import { deriveWeeklyPrepState } from '../utils/weeklyPrep.js';
import { evaluateWeeklyContext } from '../utils/weeklyContext.js';
import { buildAdvanceReadinessGate } from '../utils/advanceReadinessGate.js';
import { selectFranchiseHQViewModel } from '../utils/franchiseCommandCenter.js';
import { buildGameDayReadinessModel } from '../utils/gameDayReadinessModel.js';
import { buildHqDivisionSnapshot, buildHqNextAction, buildHqStrengthSnapshot, formatHqRecord } from '../utils/hqCommandCenterV2.js';
import { EmptyState } from './ScreenSystem.jsx';
import JobSecurityCard from './JobSecurityCard.jsx';
import HqInfoPopover from './HqInfoPopover.jsx';

const value = (number) => number == null ? '—' : number;
const rank = (number) => number == null ? '—' : `#${number}`;

function HqNextActionCard({ action, onNavigate, onAdvanceWeek, disabled }) {
  const activate = () => action.advance ? onAdvanceWeek?.() : action.destination && onNavigate?.(action.destination);
  return (
    <section className="hq-v2-card hq-v2-next" data-testid="hq-next-action">
      <p className="hq-v2-kicker">{action.eyebrow}</p>
      <strong className="hq-v2-next__title">{action.title}</strong>
      <button type="button" className="hq-v2-primary" data-testid="advance-week-cta" disabled={disabled || (!action.advance && !action.destination)} onClick={activate}>{disabled ? 'Please wait…' : `${action.cta} →`}</button>
    </section>
  );
}

function HqDivisionCard({ division, onNavigate }) {
  if (!division) return null;
  return (
    <section className="hq-v2-card" data-testid="hq-division-card">
      <button className="hq-v2-heading-link" type="button" onClick={() => onNavigate?.('League:Standings')}><span>{division.title}</span><span>Standings →</span></button>
      <div className="hq-v2-table-head"><span>TEAM</span><span>RECORD</span><span>DIV <HqInfoPopover label="Division record">Record against teams in your division.</HqInfoPopover></span></div>
      {division.teams.map((team) => <div key={team.id} className={`hq-v2-division-row${team.isUser ? ' is-user' : ''}`} data-user-team={team.isUser ? 'true' : undefined}>
        <strong>{team.abbr}</strong><span>{team.record}</span><span>{team.divisionRecord}{team.isUser ? <small>YOU</small> : null}</span>
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

function LeaderGroup({ title, data }) {
  const categories = [['PASS', 'passing'], ['RUSH', 'rushing'], ['REC', 'receiving']];
  return <div className="hq-v2-leader-group"><h3>{title}</h3>{categories.map(([label, key]) => {
    const player = data?.[key]?.[0];
    if (!player) return null;
    const name = compactName(player);
    return <div className="hq-v2-leader" key={key}><span>{label}</span><strong title={name.full}>{name.compact}</strong><b>{Number(player.value ?? 0).toLocaleString()} yds</b></div>;
  })}</div>;
}

function HqYardageLeaders({ actions, saveKey, hasCompletedGames, onNavigate }) {
  const [state, setState] = useState({ key: saveKey, data: null });
  useEffect(() => {
    let current = true;
    setState({ key: saveKey, data: null });
    if (!hasCompletedGames || typeof actions?.getDashboardLeaders !== 'function') return () => { current = false; };
    actions.getDashboardLeaders().then((response) => {
      if (current) setState({ key: saveKey, data: response?.payload ?? response });
    }).catch(() => { if (current) setState({ key: saveKey, data: null }); });
    return () => { current = false; };
  }, [actions, hasCompletedGames, saveKey]);
  const data = state.key === saveKey ? state.data : null;
  const hasLeaders = ['team', 'league'].some((scope) => ['passing', 'rushing', 'receiving'].some((category) => data?.[scope]?.[category]?.[0]));
  return <section className="hq-v2-card hq-v2-leaders" data-testid="hq-yardage-leaders">
    {hasLeaders ? <div className="hq-v2-leaders-grid"><LeaderGroup title="TEAM LEADERS" data={data?.team} /><LeaderGroup title="LEAGUE LEADERS" data={data?.league} /></div>
      : <><h2>SEASON LEADERS</h2><p className="hq-v2-empty">Season leaders appear after games are played.</p></>}
    <button type="button" className="hq-v2-text-link" onClick={() => onNavigate?.('Stats')}>View Stats →</button>
  </section>;
}

function HqNextGame({ nextGame }) {
  if (!nextGame) return null;
  const opponent = nextGame.opp;
  return <section className="hq-v2-card hq-v2-game" data-testid="hq-next-game"><div><h2>NEXT GAME</h2><strong>{nextGame.isHome ? 'vs' : '@'} {opponent?.abbr ?? 'TBD'}</strong><p>{formatHqRecord(opponent)} · {value(opponent?.ovr ?? opponent?.overallRating)} OVR</p></div></section>;
}

export default function FranchiseHQ({ league, onNavigate, onAdvanceWeek, busy, simulating, actions }) {
  const command = useMemo(() => selectFranchiseHQViewModel(league), [league]);
  const prep = useMemo(() => deriveWeeklyPrepState(league), [league]);
  const weekly = useMemo(() => evaluateWeeklyContext(league), [league]);
  const gate = useMemo(() => buildAdvanceReadinessGate({ league, prep, weeklyContext: weekly }), [league, prep, weekly]);
  const team = (league?.teams ?? []).find((row) => String(row?.id) === String(league?.userTeamId));
  const readiness = useMemo(() => buildGameDayReadinessModel({ roster: team?.roster, teamId: team?.id }), [team]);
  const division = useMemo(() => buildHqDivisionSnapshot(league), [league]);
  const strength = useMemo(() => buildHqStrengthSnapshot({ league, team }), [league, team]);
  const action = useMemo(() => buildHqNextAction({ league, gate, gameDayReadiness: readiness, nextGame: command.nextGame }), [league, gate, readiness, command.nextGame]);
  if (command.readyState !== 'ready' || !team) return <EmptyState title="HQ loading" body="Team context is still loading or this save is missing team ownership metadata." />;
  const completedGames = (league?.schedule?.weeks ?? []).flatMap((week) => week?.games ?? []).some((game) => game?.played || (Number.isFinite(Number(game?.homeScore ?? game?.scoreHome)) && Number.isFinite(Number(game?.awayScore ?? game?.scoreAway))));
  const saveKey = `${league?.activeLeagueId ?? league?.id ?? 'league'}:${league?.franchiseGenerationId ?? league?.seasonId ?? league?.year ?? 'season'}`;
  return <main className="hq-v2" data-testid="franchise-hq">
    <header className="hq-v2-identity"><h1>{String(team.city ?? team.name ?? team.abbr ?? 'FRANCHISE').toUpperCase()}</h1><p aria-label={`Week ${league?.week ?? 1}`}>{formatHqRecord(team)} · {division?.title ?? 'LEAGUE'} · WEEK {league?.week ?? 1}</p></header>
    <HqNextActionCard action={action} onNavigate={onNavigate} onAdvanceWeek={onAdvanceWeek} disabled={busy || simulating} />
    {league?.userFranchiseTerminated ? <section className="hq-v2-card" data-testid="franchise-terminated-notice"><h2>Franchise Dismissed</h2><p>Your ownership tenure has ended.</p></section> : null}
    {league?.userOwnerPressure ? <JobSecurityCard ownerProfile={league.userOwnerPressure} /> : null}
    <div className="hq-v2-pair"><HqDivisionCard division={division} onNavigate={onNavigate} /><HqTeamStrength snapshot={strength} /></div>
    <HqYardageLeaders actions={actions} saveKey={saveKey} hasCompletedGames={completedGames} onNavigate={onNavigate} />
    <HqNextGame nextGame={command.nextGame} />
    <details className="hq-v2-more"><summary>More Prep</summary><div>{gate.riskItems?.length ? gate.riskItems.map((item) => {
      const destination = item.id === 'depth-blocker' ? 'Team:Lineup' : item.fixDestination;
      return <button type="button" key={item.id} disabled={!destination} onClick={() => destination && onNavigate?.(destination)}><span>{item.label}</span><b>{destination ? item.severity === 'info' ? 'Optional' : 'Review' : 'Status'}</b></button>;
    }) : <p>Lineup, game plan, scouting and training are ready.</p>}</div></details>
  </main>;
}
