import React from 'react';
import { ScreenHeader, SectionCard } from './ScreenSystem.jsx';

const DESTINATIONS = [
  { key: 'History', title: 'League Archive', body: 'Champions, season snapshots, and year-to-year memory.' },
  { key: 'Team History', title: 'Franchise Timeline', body: 'Highs/lows, droughts, and long-run identity by club.' },
  { key: 'Hall of Fame', title: 'Hall of Fame', body: 'All-time greats, induction classes, and legacy scoreboards.' },
  { key: 'Awards & Records', title: 'Awards & Records', body: 'Who defined each season and who owns the book.' },
];

export default function HistoryHub({ onNavigate }) {
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
      </div>
  );
}
