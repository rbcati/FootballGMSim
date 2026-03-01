import React from 'react';

const TeamNeedsWidget = ({ needs }) => {
  if (!needs || needs.length === 0) return null;

  // Filter for top needs (score > 1.2 or just top 5)
  const topNeeds = needs
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const getUrgencyColor = (score) => {
    if (score >= 2.0) return 'var(--danger)'; // Critical
    if (score >= 1.5) return 'var(--warning)'; // High
    return 'var(--text-muted)'; // Moderate/Low
  };

  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        flexWrap: 'wrap'
      }}>
        <span style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          color: 'var(--text-muted)'
        }}>
          Team Needs:
        </span>

        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {topNeeds.map((need, idx) => (
            <div key={need.pos} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--text)'
            }}>
              <span style={{ color: 'var(--text-subtle)', fontSize: 'var(--text-xs)' }}>
                {idx + 1}.
              </span>
              <span style={{
                color: getUrgencyColor(need.score),
                fontWeight: 700
              }}>
                {need.pos}
              </span>
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                fontWeight: 400
              }}>
                ({need.starterOvr > 0 ? need.starterOvr : '-'})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TeamNeedsWidget;
