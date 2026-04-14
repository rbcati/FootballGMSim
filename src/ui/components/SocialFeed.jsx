import React, { useMemo, useState } from 'react';
import { EVENT_TOOLTIPS } from '../../core/events/eventSystem.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'team', label: 'Team' },
  { key: 'league', label: 'League' },
];

function formatDate(entry) {
  if (entry?.year && entry?.week) return `Y${entry.year} · W${entry.week}`;
  if (entry?.week) return `W${entry.week}`;
  return 'Now';
}

export default function SocialFeed({ league, onPlayerSelect, onTeamSelect, defaultFilter = 'all', maxItems = 40 }) {
  const [filter, setFilter] = useState(defaultFilter);
  const userTeamId = Number(league?.userTeamId);

  const entries = useMemo(() => {
    const rows = Array.isArray(league?.newsItems) ? league.newsItems : [];
    return [...rows]
      .map((entry) => ({ ...entry, timestamp: Number(entry?.timestamp ?? 0) }))
      .sort((a, b) => b.timestamp - a.timestamp)
      .filter((entry) => {
        if (filter === 'team') return Number(entry?.teamId) === userTeamId;
        if (filter === 'league') return Number(entry?.teamId) !== userTeamId;
        return true;
      })
      .slice(0, maxItems);
  }, [league?.newsItems, filter, userTeamId, maxItems]);

  return (
    <div className="card" style={{ padding: '10px', display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>Social Feed</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map((item) => (
            <button key={item.key} className="btn btn-sm" onClick={() => setFilter(item.key)} style={{ opacity: filter === item.key ? 1 : 0.7 }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No social stories yet for this save.</div> : null}

      {entries.map((entry, idx) => {
        const tooltip = entry?.tooltip ?? EVENT_TOOLTIPS[entry?.type] ?? 'League update.';
        return (
          <div key={entry?.id ?? `${entry?.headline ?? 'entry'}-${idx}`} style={{ border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 10px', display: 'grid', gap: 4 }} title={tooltip}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <strong style={{ fontSize: 13 }}>{entry?.headline ?? entry?.text ?? 'Update'}</strong>
              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{formatDate(entry)}</span>
            </div>
            {entry?.body || entry?.description ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{entry?.body ?? entry?.description}</div> : null}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {entry?.actionLabel && entry?.actionTarget ? <span className="badge" title={`Suggested action: ${entry.actionTarget}`}>{entry.actionLabel}</span> : null}
              {entry?.playerId != null ? <button className="btn btn-sm" onClick={() => onPlayerSelect?.(entry.playerId)}>View Profile</button> : null}
              {entry?.teamId != null ? <button className="btn btn-sm" onClick={() => onTeamSelect?.(entry.teamId)}>Team</button> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
