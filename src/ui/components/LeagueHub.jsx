import React, { useMemo, useState } from 'react';
import RecordBook from './RecordBook.jsx';
import PostseasonHub from './PostseasonHub.jsx';
import PlayerStats from './PlayerStats.jsx';
import NewsFeed from './NewsFeed.jsx';
import SectionHeader from './SectionHeader.jsx';
import SectionSubnav from './SectionSubnav.jsx';

const LEAGUE_SUBNAV = ['Schedule', 'Standings', 'Stats', 'Transactions', 'History'];

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
  const [subtab, setSubtab] = useState('Schedule');
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
    const weeks = Array.isArray(league?.schedule?.weeks) ? league.schedule.weeks : [];
    const allGames = weeks.flatMap((weekRow) => (
      (weekRow?.games ?? []).map((g) => ({ ...g, week: Number(weekRow?.week ?? g?.week ?? 0) }))
    ));
    return allGames
      .filter((g) => g?.played || (Number(g.homeScore ?? -1) >= 0 && Number(g.awayScore ?? -1) >= 0))
      .sort((a, b) => Number(b.week ?? 0) - Number(a.week ?? 0))
      .slice(0, 3);
  }, [league?.schedule?.weeks]);

  return (
    <div>
      <SectionHeader title="League" subtitle="League command center" />
      <SectionSubnav items={LEAGUE_SUBNAV} activeItem={subtab} onChange={setSubtab} />

      {subtab === 'Standings' && renderStandings?.()}
      {subtab === 'Schedule' && renderSchedule?.('League')}
      {subtab === 'Stats' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700 }}>League leaders snapshot</div>
            {leaders.map((item) => <div key={item.label} style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{item.label}: <strong style={{ color: 'var(--text)' }}>{item.team?.abbr ?? item.team?.name ?? '—'}</strong></div>)}
          </div>
          <TeamComparison teams={teams} />
          <PlayerStats actions={actions} league={league} onPlayerSelect={onPlayerSelect} initialFamily="passing" />
        </div>
      )}
      {subtab === 'Transactions' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Latest featured games</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {featuredGames.map((game, idx) => (
                <button key={`${game.week}-${idx}`} className="btn" onClick={() => onOpenGameDetail?.(game.id ?? game.gameId, 'League')}>
                  W{game.week ?? '—'} · {game.awayAbbr ?? game.away} {game.awayScore} - {game.homeScore} {game.homeAbbr ?? game.home}
                </button>
              ))}
              {featuredGames.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No recent results yet.</div> : null}
            </div>
          </div>
          <NewsFeed
            league={league}
            mode="full"
            segment="transactions"
            onPlayerSelect={onPlayerSelect}
            onOpenBoxScore={(gameId) => onOpenGameDetail?.(gameId, 'League')}
          />
        </div>
      )}
      {subtab === 'History' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <PostseasonHub league={league} onOpenBoxScore={(gameId) => onOpenGameDetail?.(gameId, 'League')} />
          <RecordBook league={league} />
        </div>
      )}
    </div>
  );
}
