import React, { useEffect, useState } from 'react';
import { ScreenHeader, SectionCard } from './ScreenSystem.jsx';

const DESTINATIONS = [
  { key: 'History', title: 'League Archive', body: 'Champions, season snapshots, and year-to-year memory.' },
  { key: 'Team History', title: 'Franchise Timeline', body: 'Highs/lows, droughts, and long-run identity by club.' },
  { key: 'Hall of Fame', title: 'Hall of Fame', body: 'All-time greats, induction classes, and legacy scoreboards.' },
  { key: 'Awards & Records', title: 'Awards & Records', body: 'Who defined each season and who owns the book.' },
];

export default function HistoryHub({ onNavigate, actions, onSelectSeason, league = null }) {
  const [seasons, setSeasons] = useState([]);
  useEffect(() => {
    let mounted = true;
    (actions?.getAllSeasons?.() ?? Promise.resolve({ payload: { seasons: [] } }))
      .then((res) => {
        if (!mounted) return;
        setSeasons(res?.payload?.seasons ?? []);
      })
      .catch(() => {
        if (!mounted) return;
        setSeasons([]);
      });
    return () => {
      mounted = false;
    };
  }, [actions]);

  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title="History Hub"
        subtitle="Your save-file memory center: archives, honors, records, and franchise timelines."
      />
      <SectionCard title="Choose a history destination" subtitle="Consistent archive routes with clear destination naming.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 'var(--space-3)' }}>
        {DESTINATIONS.map((item) => (
          <button
            key={item.key}
            className="card clickable-card"
            style={{ padding: 'var(--space-4)', textAlign: 'left' }}
            onClick={() => onNavigate?.(item.key)}
          >
            <div style={{ fontWeight: 800 }}>{item.title}</div>
            <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{item.body}</div>
          </button>
        ))}
        </div>
      </SectionCard>
      <SectionCard title="Archived seasons" subtitle="Recent dynasty memory snapshots.">
        {seasons.length === 0 ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            No completed seasons are archived yet. History appears automatically after your first full season is completed.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }} data-testid="history-hub-archived-seasons">
            {seasons.slice(0, 5).map((season) => {
              const uid = league?.userTeamId;
              const userRow = uid != null ? (season?.standings ?? []).find((r) => Number(r?.id) === Number(uid)) : null;
              const userLine = userRow
                ? `Your team: ${userRow.wins ?? 0}-${userRow.losses ?? 0}${userRow.ties ? `-${userRow.ties}` : ''}`
                : season?.userTeamSummary?.record
                  ? `Your team: ${season.userTeamSummary.record}`
                  : uid != null
                    ? 'Your team: —'
                    : null;
              return (
              <button
                key={season.id ?? season.year}
                className="card clickable-card"
                style={{ padding: 'var(--space-3)', textAlign: 'left' }}
                data-testid={`history-hub-season-${season.year}`}
                onClick={() => {
                  onSelectSeason?.(season.id ?? season.seasonId ?? season.year ?? null);
                  onNavigate?.('History');
                }}
              >
                <div style={{ fontWeight: 800 }}>
                  {season.year} · {season?.champion?.abbr ?? season?.champion?.name ?? 'Champion TBD'}
                </div>
                <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                  Runner-up: {season?.runnerUp?.abbr ?? season?.runnerUp?.name ?? '—'} · MVP: {season?.awards?.mvp?.name ?? '—'}
                </div>
                {userLine ? (
                  <div style={{ marginTop: 4, fontSize: 'var(--text-xs)', color: 'var(--text-subtle)' }}>{userLine}</div>
                ) : null}
                <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent)' }}>View season →</div>
              </button>
            );})}
          </div>
        )}
      </SectionCard>
      </div>
  );
}
