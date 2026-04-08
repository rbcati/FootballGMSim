import React, { useEffect, useMemo, useState } from 'react';
import { ScreenHeader, SectionCard, EmptyState } from './ScreenSystem.jsx';

function buildSeasonTeamMap(season) {
  const map = {};
  for (const row of season?.standings ?? []) {
    map[Number(row?.id)] = row;
  }
  return map;
}

export default function TeamHistoryScreen({ league, actions, teamId, onPlayerSelect, onBack, onOpenBoxScore }) {
  const [seasons, setSeasons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryYear, setQueryYear] = useState('');
  const [scope, setScope] = useState('all');
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

  const filteredTimeline = useMemo(() => {
    return timeline.filter((row) => {
      if (scope === 'champions' && !row.champion) return false;
      if (scope === 'playoff' && row.wins < 10) return false;
      if (!queryYear.trim()) return true;
      return String(row.year).includes(queryYear.trim());
    });
  }, [timeline, queryYear, scope]);

  const titles = timeline.filter((t) => t.champion).length;
  const playoffYears = timeline.filter((t) => t.wins >= 10).length;
  const best = [...timeline].sort((a, b) => b.wins - a.wins)[0];
  const worst = [...timeline].sort((a, b) => a.wins - b.wins)[0];
  const drought = [...timeline].reverse().findIndex((t) => t.champion);
  const completedGameRows = useMemo(() => {
    const rows = [];
    const targetTeamId = Number(activeTeam?.id);
    if (!Number.isFinite(targetTeamId)) return rows;

    for (const season of seasons ?? []) {
      const teamMap = buildSeasonTeamMap(season);
      for (const game of season?.gameIndex ?? []) {
        const homeId = Number(game?.homeId);
        const awayId = Number(game?.awayId);
        if (homeId !== targetTeamId && awayId !== targetTeamId) continue;
        rows.push({
          gameId: game?.id,
          year: season?.year,
          week: game?.week,
          home: teamMap[homeId],
          away: teamMap[awayId],
          homeScore: game?.homeScore,
          awayScore: game?.awayScore,
        });
      }
    }

    return rows
      .sort((a, b) => (Number(b.year) - Number(a.year)) || (Number(b.week) - Number(a.week)))
      .slice(0, 24);
  }, [activeTeam?.id, seasons]);

  if (loading) return <div className="card" style={{ padding: 'var(--space-4)' }}>Loading team history…</div>;

  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title={`${activeTeam?.name ?? 'Team'} History`}
        subtitle="Franchise timeline, drought context, best/worst runs, and milestones."
        onBack={onBack}
        backLabel="History Hub"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 10 }}>
        <div className="stat-box"><div className="stat-label">Titles</div><div className="stat-value-large">{titles}</div></div>
        <div className="stat-box"><div className="stat-label">Playoff-caliber years</div><div className="stat-value-large">{playoffYears}</div></div>
        <div className="stat-box"><div className="stat-label">Current drought</div><div className="stat-value-large">{drought < 0 ? 'No title yet' : `${drought} seasons`}</div></div>
      </div>

      <SectionCard title="Best and worst seasons">
        <div style={{ fontSize: 'var(--text-sm)' }}>Best: {best ? `${best.year} (${best.wins}-${best.losses}${best.ties ? `-${best.ties}` : ''})` : '—'}</div>
        <div style={{ fontSize: 'var(--text-sm)' }}>Worst: {worst ? `${worst.year} (${worst.wins}-${worst.losses}${worst.ties ? `-${worst.ties}` : ''})` : '—'}</div>
      </SectionCard>

      <SectionCard title="Season-by-season timeline">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          <input
            value={queryYear}
            onChange={(e) => setQueryYear(e.target.value)}
            placeholder="Filter by year"
            style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 8, padding: '6px 10px', color: 'var(--text)', minWidth: 160 }}
          />
          {[
            { key: 'all', label: 'All-time' },
            { key: 'playoff', label: 'Playoff-caliber' },
            { key: 'champions', label: 'Championship years' },
          ].map((opt) => (
            <button key={opt.key} className="btn" onClick={() => setScope(opt.key)} style={{ opacity: scope === opt.key ? 1 : 0.7 }}>
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
          {filteredTimeline.length === 0 ? <EmptyState title="No team history yet" body="Adjust filters or play more seasons to populate this timeline." /> : filteredTimeline.slice().reverse().map((s) => (
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
      </SectionCard>

      <SectionCard title="Completed game history">
        <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
          {completedGameRows.length === 0 ? (
            <EmptyState title="No archived results yet" body="Completed game links appear here as season history builds." />
          ) : completedGameRows.map((row) => {
            const clickable = Boolean(row.gameId && onOpenBoxScore);
            return (
              <button
                key={`${row.gameId}-${row.year}-${row.week}`}
                className="btn"
                onClick={() => clickable ? onOpenBoxScore?.(row.gameId) : null}
                style={{ textAlign: 'left', opacity: clickable ? 1 : 0.7, cursor: clickable ? 'pointer' : 'default' }}
                title={clickable ? 'View box score' : undefined}
              >
                <strong>{row.year} · Week {row.week} · {row.away?.abbr ?? 'AWY'} {row.awayScore ?? '—'}-{row.homeScore ?? '—'} {row.home?.abbr ?? 'HME'}</strong>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{clickable ? 'Open shared game detail' : 'Game detail unavailable for this row'}</div>
              </button>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
