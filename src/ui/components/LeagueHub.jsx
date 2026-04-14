import React, { useMemo, useState } from 'react';
import RecordBook from './RecordBook.jsx';
import PostseasonHub from './PostseasonHub.jsx';
import PlayerStats from './PlayerStats.jsx';
import SectionHeader from './SectionHeader.jsx';
import SectionSubnav from './SectionSubnav.jsx';
import { buildNewsDeskModel } from '../utils/newsDesk.js';

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

  const newsDesk = useMemo(() => buildNewsDeskModel(league, { segment: 'all', limit: 120 }), [league]);
  const transactionRows = useMemo(() => {
    return (newsDesk.transactions ?? []).slice(0, 14).map((item) => {
      const raw = `${item?.headline ?? ''} ${item?.body ?? ''}`.toLowerCase();
      const type = raw.includes('trade')
        ? 'Trade'
        : raw.includes('release') || raw.includes('waive')
          ? 'Release'
          : raw.includes('draft')
            ? 'Draft'
            : 'Signing';
      return { ...item, _txType: type };
    });
  }, [newsDesk.transactions]);
  const transactionTotals = useMemo(() => (
    transactionRows.reduce((acc, row) => {
      acc[row._txType] = (acc[row._txType] ?? 0) + 1;
      return acc;
    }, {})
  ), [transactionRows]);
  const champions = Array.isArray(league?.history?.champions) ? league.history.champions : [];
  const recentWinners = champions.slice(-3).reverse();

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
            <div style={{ fontWeight: 700, marginBottom: 8 }}>League activity center</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {['Trade', 'Signing', 'Release', 'Draft'].map((label) => (
                <div key={label} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px', background: 'var(--surface-2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>{transactionTotals[label] ?? 0}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent transactions</div>
            <div style={{ display: 'grid', gap: 7 }}>
              {transactionRows.map((item, idx) => (
                <div key={item?.id ?? `tx-${idx}`} style={{ border: '1px solid var(--hairline)', borderRadius: 9, padding: '8px 10px', display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                    <strong style={{ fontSize: 13 }}>{item?.headline ?? 'League transaction'}</strong>
                    <span className="badge">{item?._txType}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item?.body ?? 'No detail available.'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>W{item?.week ?? '-'} · {item?.phase ?? 'season'}</span>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {item?.playerId != null ? <button className="btn btn-sm" onClick={() => onPlayerSelect?.(item.playerId)}>Player</button> : null}
                      {item?.gameId ? <button className="btn btn-sm" onClick={() => onOpenGameDetail?.(item.gameId, 'League')}>Box</button> : null}
                    </div>
                  </div>
                </div>
              ))}
              {transactionRows.length === 0 ? <div style={{ color: 'var(--text-muted)' }}>No transaction activity yet.</div> : null}
            </div>
          </div>
        </div>
      )}
      {subtab === 'History' && (
        <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
          <div className="card" style={{ padding: 'var(--space-3)' }}>
            <div style={{ fontWeight: 700 }}>History spotlight</div>
            <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              Defending champion: <strong style={{ color: 'var(--text)' }}>{league?.championAbbr ?? recentWinners?.[0]?.champion ?? 'TBD'}</strong>
            </div>
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {recentWinners.map((entry, idx) => (
                <div key={`winner-${idx}`} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {entry?.year ?? '—'}: <strong style={{ color: 'var(--text)' }}>{entry?.champion ?? 'Champion TBD'}</strong>
                </div>
              ))}
              {recentWinners.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Play more seasons to unlock dynasty arcs.</div> : null}
            </div>
          </div>
          <PostseasonHub league={league} onOpenBoxScore={(gameId) => onOpenGameDetail?.(gameId, 'League')} />
          <RecordBook league={league} />
        </div>
      )}
    </div>
  );
}
