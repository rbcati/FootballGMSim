import React from 'react';
import { Button } from '@/components/ui/button';

export default function PlayerCompareTray({ compareIds, resolvePlayer, onRemove, onOpenCompare, onClear, max = 2 }) {
  if (!compareIds?.length) return null;

  return (
    <div style={{ position: 'sticky', bottom: 8, zIndex: 40, padding: 'var(--space-3) var(--space-4)', background: 'rgba(10,132,255,0.08)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--accent)' }}>Compare ({compareIds.length}/{max})</span>
      {compareIds.map((id) => {
        const player = resolvePlayer(id);
        if (!player) return null;
        return (
          <span key={id} style={{ padding: '2px 10px', borderRadius: 'var(--radius-pill)', background: 'var(--accent-muted)', color: 'var(--accent)', fontSize: 'var(--text-xs)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            {player.name}
            <Button onClick={() => onRemove(player)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</Button>
          </span>
        );
      })}
      {compareIds.length === max && (
        <Button className="btn" onClick={onOpenCompare} style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', padding: '4px 14px', background: 'var(--accent)', color: '#fff', border: 'none' }}>
          Compare →
        </Button>
      )}
      <Button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>Clear</Button>
    </div>
  );
}
