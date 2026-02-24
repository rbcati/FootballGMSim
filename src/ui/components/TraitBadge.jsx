import React from 'react';
import { getTrait } from '../../core/traits.js';

export default function TraitBadge({ traitId }) {
  const trait = getTrait(traitId);
  if (!trait) return null;

  return (
    <span
      title={`${trait.name}\n${trait.description}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: 'var(--surface)',
        border: '1px solid var(--hairline)',
        fontSize: '14px',
        cursor: 'help',
        marginRight: 2
      }}
    >
      {trait.icon}
    </span>
  );
}
