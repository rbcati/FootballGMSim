import React from 'react';

export default function SectionSubnav({ items, activeItem, onChange, sticky = false }) {
  return (
    <div
      className="standings-tabs"
      style={{
        marginBottom: 'var(--space-3)',
        gap: 6,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        paddingBottom: 2,
        position: sticky ? 'sticky' : 'static',
        top: sticky ? 0 : undefined,
        zIndex: sticky ? 8 : undefined,
        background: sticky ? 'var(--bg)' : undefined,
      }}
    >
      {items.map((item) => (
        <button
          key={item}
          className={`standings-tab${activeItem === item ? ' active' : ''}`}
          onClick={() => onChange(item)}
          style={{ flexShrink: 0 }}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
