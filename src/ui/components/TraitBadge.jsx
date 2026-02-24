import React from 'react';
import { TRAITS } from '../../data/traits.js';

export default function TraitBadge({ traitId, small = false, showName = true }) {
  const trait = TRAITS[traitId];
  if (!trait) return null;

  return (
    <span
      title={`${trait.name}: ${trait.description}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface-strong)',
        color: 'var(--text)',
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-pill)',
        padding: small ? '0 3px' : '1px 6px',
        fontSize: small ? '10px' : 'var(--text-xs)',
        fontWeight: 600,
        marginRight: 2,
        cursor: 'help',
        verticalAlign: 'middle',
        userSelect: 'none'
      }}
    >
      <span style={{ marginRight: showName ? 3 : 0 }}>{trait.icon}</span>
      {showName && trait.name}
    </span>
  );
}
