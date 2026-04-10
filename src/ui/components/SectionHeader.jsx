import React from 'react';

export default function SectionHeader({ title, subtitle, right }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        marginBottom: 'var(--space-3)',
      }}
    >
      <div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, lineHeight: 1.1 }}>{title}</div>
        {subtitle ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>{subtitle}</div>
        ) : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}
