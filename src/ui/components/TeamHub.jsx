import React, { useMemo, useState } from 'react';
import Roster from './Roster.jsx';
import ContractCenter from './ContractCenter.jsx';
import CapManager from './CapManager.jsx';
import FinancialsView from './FinancialsView.jsx';
import PlayerStats from './PlayerStats.jsx';
import TeamHistoryScreen from './TeamHistoryScreen.jsx';
import FranchiseSummaryPanel from './FranchiseSummaryPanel.jsx';
import SectionHeader from './SectionHeader.jsx';
import SectionSubnav from './SectionSubnav.jsx';

const TEAM_SUBNAV = ['Overview', 'Roster', 'Contracts', 'Cap', 'Stats', 'Schedule', 'History'];

function money(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(1)}M`;
}

function getPlayerMetric(player, keys = []) {
  const sources = [player?.seasonStats, player?.stats, player];
  for (const source of sources) {
    if (!source) continue;
    for (const key of keys) {
      const value = Number(source?.[key]);
      if (Number.isFinite(value)) return value;
    }
  }
  return 0;
}

function TeamStatsPanel({ team, league, onPlayerSelect, actions }) {
  const roster = Array.isArray(team?.roster) ? team.roster : [];

  const leaders = useMemo(() => {
    const pick = (label, keys) => {
      const sorted = [...roster].sort((a, b) => getPlayerMetric(b, keys) - getPlayerMetric(a, keys));
      const top = sorted[0];
      if (!top) return null;
      return { label, name: top.name, value: getPlayerMetric(top, keys) };
    };

    return [
      pick('Pass Yds', ['passYards', 'passingYards']),
      pick('Rush Yds', ['rushYards', 'rushingYards']),
      pick('Rec Yds', ['recYards', 'receivingYards']),
      pick('Sacks', ['sacks']),
      pick('Tackles', ['tackles']),
    ].filter(Boolean);
  }, [roster]);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <SectionHeader
        title="Team Stats"
        subtitle={`${team?.name ?? 'My Team'} performance snapshot and leaders`}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 'var(--space-3)' }}>
        {[
          { label: 'Record', value: `${team?.wins ?? 0}-${team?.losses ?? 0}${team?.ties ? `-${team.ties}` : ''}` },
          { label: 'Off / Def / OVR', value: `${team?.off ?? '—'} / ${team?.def ?? '—'} / ${team?.ovr ?? '—'}` },
          { label: 'Points For', value: team?.ptsFor ?? '—' },
          { label: 'Points Against', value: team?.ptsAgainst ?? '—' },
        ].map((item) => (
          <div key={item.label} className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.label}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>{item.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 'var(--space-3)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Roster leaders</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {leaders.map((leader) => (
            <button
              type="button"
              key={leader.label}
              className="btn"
              onClick={() => onPlayerSelect?.(roster.find((p) => p.name === leader.name)?.id)}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
            >
              <span>{leader.label}: {leader.name}</span>
              <span>{leader.value}</span>
            </button>
          ))}
          {leaders.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No team stat leaders available yet.</div> : null}
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-3)' }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Player production</div>
        <PlayerStats actions={actions} league={league} onPlayerSelect={onPlayerSelect} initialFamily="passing" />
      </div>
    </div>
  );
}

export default function TeamHub({ league, actions, onOpenGameDetail, onPlayerSelect, rosterInitialState, rosterInitialView, renderSchedule }) {
  const [subtab, setSubtab] = useState('Overview');
  const team = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(league?.userTeamId)) ?? null, [league]);
  const roster = Array.isArray(team?.roster) ? team.roster : [];
  const capTotal = Number(team?.salaryCap ?? 255);
  const capUsed = roster.reduce((sum, p) => sum + Number(p?.contract?.salary ?? p?.capHit ?? 0), 0);
  const deadCap = Number(team?.deadCap ?? 0);
  const capRoom = capTotal - capUsed - deadCap;

  const expiringCount = roster.filter((p) => Number(p?.contract?.years ?? 0) <= 1).length;
  const injuredCount = roster.filter((p) => Number(p?.injury?.gamesRemaining ?? 0) > 0).length;

  const depthConcerns = useMemo(() => {
    const groups = roster.reduce((acc, player) => {
      const pos = player?.pos ?? 'UNK';
      acc[pos] = (acc[pos] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(groups)
      .filter(([, count]) => count < 2)
      .slice(0, 3)
      .map(([pos]) => pos);
  }, [roster]);

  const latestGame = useMemo(() => {
    const games = Array.isArray(league?.schedule) ? league.schedule : [];
    return [...games].reverse().find((g) => (Number(g.homeId ?? g.home) === Number(team?.id) || Number(g.awayId ?? g.away) === Number(team?.id)) && Number(g.homeScore ?? -1) >= 0 && Number(g.awayScore ?? -1) >= 0);
  }, [league?.schedule, team?.id]);

  const upcomingGame = useMemo(() => {
    const games = Array.isArray(league?.schedule) ? league.schedule : [];
    return games.find((g) => (Number(g.homeId ?? g.home) === Number(team?.id) || Number(g.awayId ?? g.away) === Number(team?.id)) && (g.homeScore == null || g.awayScore == null));
  }, [league?.schedule, team?.id]);

  return (
    <div>
      <SectionHeader title="Team" subtitle="My Team command center" />
      <SectionSubnav items={TEAM_SUBNAV} activeItem={subtab} onChange={setSubtab} />

      {subtab === 'Overview' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Team identity</div>
            <div style={{ fontWeight: 800, fontSize: 'var(--text-lg)' }}>{team?.name ?? 'My Team'}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {team?.wins ?? 0}-{team?.losses ?? 0}{team?.ties ? `-${team.ties}` : ''} · {team?.conf ?? '—'} {team?.div ?? ''}
            </div>
            <div style={{ marginTop: 6 }}>OFF {team?.off ?? '—'} · DEF {team?.def ?? '—'} · OVR {team?.ovr ?? '—'}</div>
            {team?.scheme || team?.coach ? <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>Scheme/Coach: {team?.scheme ?? '—'} · {team?.coach ?? '—'}</div> : null}
          </div>

          <FranchiseSummaryPanel league={league} compact />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 'var(--space-3)' }}>
            <div className="card" style={{ padding: 'var(--space-3)' }}><strong>Cap Room</strong><div>{money(capRoom)}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Used {money(capUsed)} · Dead {money(deadCap)}</div></div>
            <div className="card" style={{ padding: 'var(--space-3)' }}><strong>Contracts</strong><div>{expiringCount} expiring</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Urgent decisions this season</div></div>
            <div className="card" style={{ padding: 'var(--space-3)' }}><strong>Injuries</strong><div>{injuredCount} active</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Monitor depth + replacements</div></div>
            <div className="card" style={{ padding: 'var(--space-3)' }}><strong>Depth concerns</strong><div>{depthConcerns.join(', ') || 'None'}</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Position groups under 2 players</div></div>
          </div>

          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700 }}>Recent / Upcoming</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
              {latestGame ? `Latest result: ${latestGame.awayScore}-${latestGame.homeScore} (Week ${latestGame.week ?? '—'}).` : 'No completed game yet.'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {upcomingGame ? `Upcoming: Week ${upcomingGame.week ?? '—'} vs ${upcomingGame.homeId === team?.id ? upcomingGame.awayAbbr ?? upcomingGame.away : upcomingGame.homeAbbr ?? upcomingGame.home}.` : 'No upcoming matchup found.'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {['Roster', 'Contracts', 'Cap', 'Schedule'].map((item) => (
                <button key={item} className="btn" onClick={() => setSubtab(item)}>{item}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {subtab === 'Roster' && <Roster league={league} actions={actions} onPlayerSelect={onPlayerSelect} initialState={rosterInitialState} initialViewMode={rosterInitialView} />}
      {subtab === 'Contracts' && <ContractCenter league={league} actions={actions} />}
      {subtab === 'Cap' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <CapManager league={league} actions={actions} />
          <FinancialsView league={league} actions={actions} />
        </div>
      )}
      {subtab === 'Stats' && <TeamStatsPanel team={team} league={league} onPlayerSelect={onPlayerSelect} actions={actions} />}
      {subtab === 'Schedule' && renderSchedule?.('Team')}
      {subtab === 'History' && <TeamHistoryScreen league={league} actions={actions} onPlayerSelect={onPlayerSelect} onBack={() => setSubtab('Overview')} teamId={league?.userTeamId} onOpenBoxScore={(gameId) => onOpenGameDetail?.(gameId, 'Team')} />}
    </div>
  );
}
