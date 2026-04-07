import React, { useEffect, useMemo, useState } from 'react';

export default function TeamHistoryScreen({ league, actions, teamId, onPlayerSelect, onBack }) {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeTeam = useMemo(() => (league?.teams ?? []).find((t) => Number(t.id) === Number(teamId ?? league?.userTeamId)), [league?.teams, league?.userTeamId, teamId]);

  useEffect(() => {
    let mounted = true;
    actions?.getAllSeasons?.().then((res) => {
      if (!mounted) return;
      setSeasons(res?.payload?.seasons ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { mounted = false; };
  }, [actions]);

  const timeline = useMemo(() => (seasons ?? []).map((s) => {
    const standing = (s.standings ?? []).find((t) => t.id === activeTeam?.id || t.abbr === activeTeam?.abbr);
    const isChampion = s?.champion?.abbr === activeTeam?.abbr;
    return { year: s.year, wins: standing?.wins ?? 0, losses: standing?.losses ?? 0, ties: standing?.ties ?? 0, pf: standing?.pf ?? 0, pa: standing?.pa ?? 0, champion: isChampion, mvp: s?.awards?.mvp };
  }).filter((x) => x.wins + x.losses + x.ties > 0 || x.champion), [seasons, activeTeam]);

  const titles = timeline.filter((t) => t.champion).length;
  const playoffYears = timeline.filter((t) => t.wins >= 10).length;
  const best = [...timeline].sort((a, b) => b.wins - a.wins)[0];
  const worst = [...timeline].sort((a, b) => a.wins - b.wins)[0];
  const drought = [...timeline].reverse().findIndex((t) => t.champion);

  if (loading) return <div className="card" style={{ padding: 'var(--space-4)' }}>Loading team history…</div>;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>{activeTeam?.name ?? 'Team'} History</h3>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Franchise timeline, drought context, best/worst runs, and milestones.</div>
        </div>
        <button className="btn" onClick={onBack}>Back to History Hub</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        <div className="stat-box"><div className="stat-label">Titles</div><div className="stat-value-large">{titles}</div></div>
        <div className="stat-box"><div className="stat-label">Playoff-caliber years</div><div className="stat-value-large">{playoffYears}</div></div>
        <div className="stat-box"><div className="stat-label">Current drought</div><div className="stat-value-large">{drought < 0 ? 'No title yet' : `${drought} seasons`}</div></div>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h4 style={{ marginTop: 0 }}>Best and worst seasons</h4>
        <div style={{ fontSize: 'var(--text-sm)' }}>Best: {best ? `${best.year} (${best.wins}-${best.losses}${best.ties ? `-${best.ties}` : ''})` : '—'}</div>
        <div style={{ fontSize: 'var(--text-sm)' }}>Worst: {worst ? `${worst.year} (${worst.wins}-${worst.losses}${worst.ties ? `-${worst.ties}` : ''})` : '—'}</div>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h4 style={{ marginTop: 0 }}>Season-by-season timeline</h4>
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
          {timeline.slice().reverse().map((s) => (
            <div key={s.year} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong>{s.year}</strong>
                <span>{s.wins}-{s.losses}{s.ties ? `-${s.ties}` : ''}{s.champion ? ' · 🏆 Champion' : ''}</span>
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>PF {s.pf} · PA {s.pa}</div>
              {s.mvp?.playerId != null ? <button className="btn-link" onClick={() => onPlayerSelect?.(s.mvp.playerId)}>League MVP: {s.mvp.name}</button> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
