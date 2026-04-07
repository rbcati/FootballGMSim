import React, { useEffect, useMemo, useState } from 'react';
import { filterAwardRows } from '../utils/historyDestinations.js';

const AWARD_KEYS = ['mvp', 'opoy', 'dpoy', 'roty'];

export default function AwardsRecordsScreen({ actions, league, onPlayerSelect, onBack }) {
  const [seasons, setSeasons] = useState([]);
  const [records, setRecords] = useState(null);
  const [scope, setScope] = useState('all');

  useEffect(() => {
    Promise.all([
      actions?.getAllSeasons?.() ?? Promise.resolve({ payload: { seasons: [] } }),
      actions?.getRecords?.() ?? Promise.resolve({ payload: { records: null } }),
    ]).then(([seasonRes, recordsRes]) => {
      setSeasons(seasonRes?.payload?.seasons ?? []);
      setRecords(recordsRes?.payload?.records ?? null);
    });
  }, [actions]);

  const awardRows = useMemo(() => (seasons ?? []).flatMap((s) => AWARD_KEYS.map((k) => ({
    season: s.year,
    award: k.toUpperCase(),
    ...s?.awards?.[k],
  }))).filter((r) => r?.name), [seasons]);

  const filteredAwardRows = filterAwardRows(awardRows.slice().reverse(), scope);
  const recordRows = useMemo(() => Object.entries(records?.singleSeason ?? {}).map(([k, rec]) => ({ key: k, ...rec })), [records]);

  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="card" style={{ padding: 'var(--space-4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>Awards & Records</h3>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Award history, league records, and fast browsing controls.</div>
        </div>
        <button className="btn" onClick={onBack}>Back to History Hub</button>
      </div>

      <div className="card" style={{ padding: 'var(--space-3)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className={`standings-tab ${scope === 'all' ? 'active' : ''}`} onClick={() => setScope('all')}>All awards</button>
        <button className={`standings-tab ${scope === 'recent' ? 'active' : ''}`} onClick={() => setScope('recent')}>Recent awards</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 10 }}>
        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ marginTop: 0 }}>Award history</h4>
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {filteredAwardRows.map((row, idx) => (
              <div key={`${row.season}-${row.award}-${idx}`} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.season} · {row.award}</div>
                {row.playerId != null ? <button className="btn-link" onClick={() => onPlayerSelect?.(row.playerId)}>{row.name}</button> : <strong>{row.name}</strong>}
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.pos ?? ''}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 'var(--space-4)' }}>
          <h4 style={{ marginTop: 0 }}>League records</h4>
          <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto' }}>
            {recordRows.map((rec) => (
              <div key={rec.key} style={{ border: '1px solid var(--hairline)', borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rec.key}</div>
                <div style={{ fontWeight: 700 }}>{Number(rec.value ?? 0).toLocaleString()}</div>
                <div style={{ fontSize: 12 }}>{rec.name ?? '—'} {rec.year ? `(${rec.year})` : ''}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h4 style={{ marginTop: 0 }}>Franchise records (current user team)</h4>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{league?.teams?.find((t) => t.id === league?.userTeamId)?.name ?? 'Your team'} records are included in league record output when available in this save.</div>
      </div>
    </div>
  );
}
