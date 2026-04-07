import React from 'react';

const DESTINATIONS = [
  { key: 'History', title: 'League History', body: 'Season timelines, champions, and franchise arcs.' },
  { key: 'Team History', title: 'Team History', body: 'Team-specific milestones and legacy context.' },
  { key: 'Hall of Fame', title: 'Hall of Fame', body: 'Career achievement archive and notable classes.' },
  { key: 'Awards & Records', title: 'Awards & Records', body: 'Record book, award races, and all-time leaders.' },
];

export default function HistoryHub({ onNavigate }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
      <div className="card" style={{ padding: 'var(--space-4)' }}>
        <h3 style={{ marginTop: 0 }}>History & Legacy</h3>
        <p style={{ marginBottom: 0, color: 'var(--text-muted)' }}>
          Dedicated archive routes make history systems first-class destinations instead of hidden secondary tabs.
        </p>
      </div>
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
    </div>
  );
}
