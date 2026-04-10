import React, { useMemo, useState } from 'react';
import RecordBook from './RecordBook.jsx';
import PostseasonHub from './PostseasonHub.jsx';
import PlayerStats from './PlayerStats.jsx';
import SectionHeader from './SectionHeader.jsx';
import SectionSubnav from './SectionSubnav.jsx';

const LEAGUE_SUBNAV = ['Overview', 'Standings', 'Schedule', 'Team Stats', 'Player Stats', 'Records', 'Playoffs'];

function TeamComparison({ teams = [] }) {
  const rows = [...teams]
    .map((t) => ({ ...t, pd: Number(t?.ptsFor ?? 0) - Number(t?.ptsAgainst ?? 0) }))
    .sort((a, b) => b.pd - a.pd)
    .slice(0, 16);

  return (
    <div className="card" style={{ padding: 'var(--space-3)' }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>League team comparisons</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12 }}>
          <thead><tr><th align="left">Team</th><th>Record</th><th>PF</th><th>PA</th><th>PD</th><th>OVR</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}><td>{row.abbr ?? row.name}</td><td>{row.wins}-{row.losses}</td><td>{row.ptsFor ?? 0}</td><td>{row.ptsAgainst ?? 0}</td><td>{row.pd}</td><td>{row.ovr ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LeagueHub({ league, actions, onOpenGameDetail, onPlayerSelect, renderStandings, renderSchedule }) {
  const [subtab, setSubtab] = useState('Overview');
  const teams = Array.isArray(league?.teams) ? league.teams : [];

  const leaders = useMemo(() => {
    const by = (label, sorter) => ({ label, team: [...teams].sort(sorter)[0] });
    return [
      by('Best Record', (a, b) => (b.wins - b.losses) - (a.wins - a.losses)),
      by('Top Offense', (a, b) => Number(b.ptsFor ?? 0) - Number(a.ptsFor ?? 0)),
      by('Top Defense', (a, b) => Number(a.ptsAgainst ?? 0) - Number(b.ptsAgainst ?? 0)),
    ];
  }, [teams]);

  const featuredGames = useMemo(() => {
    const games = Array.isArray(league?.schedule) ? league.schedule : [];
    return [...games].reverse().filter((g) => Number(g.homeScore ?? -1) >= 0 && Number(g.awayScore ?? -1) >= 0).slice(0, 3);
  }, [league?.schedule]);

  return (
    <div>
      <SectionHeader title="League" subtitle="League command center" />
      <SectionSubnav items={LEAGUE_SUBNAV} activeItem={subtab} onChange={setSubtab} />

      {subtab === 'Overview' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 'var(--space-3)' }}>
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontWeight: 700 }}>Conference snapshot</div>
              <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>AFC teams: {teams.filter((t) => String(t.conf).toUpperCase().includes('A') || Number(t.conf) === 0).length}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>NFC teams: {teams.filter((t) => String(t.conf).toUpperCase().includes('N') || Number(t.conf) === 1).length}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontWeight: 700 }}>{league?.phase === 'playoffs' ? 'Postseason snapshot' : 'Playoff race snapshot'}</div>
              <div style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>Week {league?.week ?? '—'} · {league?.phase ?? 'regular'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Quick link into standings and playoffs below.</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontWeight: 700 }}>League leaders snapshot</div>
              {leaders.map((item) => <div key={item.label} style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{item.label}: <strong style={{ color: 'var(--text)' }}>{item.team?.abbr ?? item.team?.name ?? '—'}</strong></div>)}
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700 }}>Latest featured games</div>
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              {featuredGames.map((game, idx) => (
                <button key={`${game.week}-${idx}`} className="btn" onClick={() => onOpenGameDetail?.(game.id ?? game.gameId, 'League')}>
                  W{game.week ?? '—'} · {game.awayAbbr ?? game.away} {game.awayScore} - {game.homeScore} {game.homeAbbr ?? game.home}
                </button>
              ))}
              {featuredGames.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No recent results yet.</div> : null}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {['Standings', 'Schedule', 'Playoffs', 'Records'].map((item) => <button key={item} className="btn" onClick={() => setSubtab(item)}>{item}</button>)}
            </div>
          </div>
        </div>
      )}

      {subtab === 'Standings' && renderStandings?.()}
      {subtab === 'Schedule' && renderSchedule?.('League')}
      {subtab === 'Team Stats' && <TeamComparison teams={teams} />}
      {subtab === 'Player Stats' && <PlayerStats actions={actions} league={league} onPlayerSelect={onPlayerSelect} initialFamily="passing" />}
      {subtab === 'Records' && <RecordBook league={league} />}
      {subtab === 'Playoffs' && <PostseasonHub league={league} onOpenBoxScore={(gameId) => onOpenGameDetail?.(gameId, 'League')} />}
    </div>
  );
}
