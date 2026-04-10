import React from 'react';

export default function SectionSubnav({ items, activeItem, onChange }) {
  return (
    <div
      className="standings-tabs"
      style={{
        marginBottom: 'var(--space-3)',
        gap: 6,
        flexWrap: 'nowrap',
        overflowX: 'auto',
        paddingBottom: 2,
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
