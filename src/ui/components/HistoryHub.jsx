import React from 'react';
import { ScreenHeader, SectionCard } from './ScreenSystem.jsx';

const DESTINATIONS = [
  { key: 'History', title: 'League History', body: 'Season timelines, champions, and franchise arcs.' },
  { key: 'Team History', title: 'Team History', body: 'Team-specific milestones and legacy context.' },
  { key: 'Hall of Fame', title: 'Hall of Fame', body: 'Career achievement archive and notable classes.' },
  { key: 'Awards & Records', title: 'Awards & Records', body: 'Record book, award races, and all-time leaders.' },
];

export default function HistoryHub({ onNavigate }) {
  return (
    <div className="app-screen-stack">
      <ScreenHeader
        title="History Hub"
        subtitle="League archives, team legacy paths, and record books in one destination."
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
      </div>
  );
}
