import React from 'react';
import { SectionCard, StatusChip } from './ScreenSystem.jsx';
import { buildEventChoiceImpactChips } from '../utils/franchiseEvents.js';

export default function EventDecisionModal({ event, onChoose, onClose, onDecideLater }) {
  if (!event) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(3,8,20,0.86)', overflowY: 'auto' }}>
      <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', padding: 12 }}>
        <SectionCard title={event.headline ?? 'Weekly Event'} subtitle={`Week ${event.week ?? '—'} decision`} variant="compact">
          <div className="app-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <StatusChip label="Decision Required" tone="warning" />
            <button type="button" className="btn btn-sm" onClick={onClose}>Close</button>
          </div>
          <div className="app-row-stack" style={{ marginTop: 12 }}>
            {(event.choices ?? []).map((choice) => (
              <button
                key={choice.id}
                type="button"
                className="btn"
                style={{ width: '100%', textAlign: 'left', display: 'grid', gap: 2 }}
                onClick={() => onChoose?.(choice.id)}
              >
                <strong>{choice.label}</strong>
                <span style={{ fontSize: 12, opacity: 0.8 }}>{choice.preview}</span>
                <div className="app-row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {buildEventChoiceImpactChips(choice).map((chip) => (
                    <span key={chip.key} style={{ fontSize: 11, borderRadius: 999, padding: '2px 8px', border: '1px solid var(--hairline)', background: chip.tone === 'negative' ? 'rgba(255,69,58,0.14)' : chip.tone === 'positive' ? 'rgba(52,199,89,0.14)' : 'rgba(120,120,120,0.14)' }}>
                      {chip.label}
                    </span>
                  ))}
                </div>
              </button>
            ))}
            <button type="button" className="btn" onClick={onDecideLater}>Decide later</button>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
