import React, { useMemo, useState } from 'react';
import SectionHeader from './SectionHeader.jsx';
import { rankLeaguePulseItems, PULSE_IMPORTANCE } from '../../core/leaguePulse.js';

export function LeaguePulseTimeline({ league, currentTeamId, onNavigate }) {
  const [filter, setFilter] = useState('ALL'); // ALL, CRITICAL, HIGH, USER

  const pulseItems = useMemo(() => {
    const raw = league?.leaguePulse || [];
    let filtered = raw;

    if (filter === 'CRITICAL') filtered = raw.filter(i => i.importance >= PULSE_IMPORTANCE.CRITICAL);
    if (filter === 'HIGH') filtered = raw.filter(i => i.importance >= PULSE_IMPORTANCE.HIGH);
    if (filter === 'USER') filtered = raw.filter(i => String(i.relatedTeamId) === String(currentTeamId));

    // Sort chronologically (newest first), then by importance for ties
    return filtered.sort((a, b) => {
      if (a.season !== b.season) return b.season - a.season;
      if (a.week !== b.week) return b.week - a.week;
      return b.importance - a.importance;
    });
  }, [league?.leaguePulse, filter, currentTeamId]);

  return (
    <div className="view-enter" style={{ maxWidth: '800px', margin: '0 auto', paddingBottom: '2rem' }}>
      <SectionHeader
        title="League Pulse"
        subtitle="Timeline of significant events across the league."
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
        {['ALL', 'CRITICAL', 'HIGH', 'USER'].map(f => (
          <button
            key={f}
            className={`btn ${filter === f ? 'primary' : 'ghost'}`}
            onClick={() => setFilter(f)}
            style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
          >
            {f === 'USER' ? 'My Team' : f}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {pulseItems.length === 0 ? (
          <div className="empty-state">
            <p>No major stories right now. Advance the week to see how the season unfolds.</p>
          </div>
        ) : (
          pulseItems.map((item) => (
            <PulseCard
              key={item.dedupeKey || item.id}
              item={item}
              isUserTeam={String(item.relatedTeamId) === String(currentTeamId)}
            />
          ))
        )}
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center' }}>
        <button className="btn" onClick={() => onNavigate('hub')}>
          Back to Hub
        </button>
      </div>
    </div>
  );
}

export function PulseCard({ item, isUserTeam, compact = false }) {
  const getBorderColor = () => {
    if (item.importance >= PULSE_IMPORTANCE.CRITICAL) return 'var(--danger)';
    if (item.importance >= PULSE_IMPORTANCE.HIGH) return 'var(--accent)';
    if (isUserTeam) return 'var(--brand)';
    return 'var(--border)';
  };

  return (
    <div className="app-section-card" style={{
      borderLeft: `4px solid ${getBorderColor()}`,
      padding: compact ? '0.75rem 1rem' : '1.25rem 1.5rem',
      backgroundColor: isUserTeam ? 'rgba(var(--brand-rgb), 0.03)' : undefined
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            S{item.season} W{item.week}
          </span>
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border)'
          }}>
            {item.type}
          </span>
          {isUserTeam && (
            <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--brand)', color: 'white' }}>
              My Team
            </span>
          )}
        </div>
      </div>

      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: compact ? '1rem' : '1.1rem', color: 'var(--text)' }}>
        {item.headline}
      </h4>

      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {item.body}
      </p>
    </div>
  );
}
