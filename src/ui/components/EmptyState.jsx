import React from "react";

export default function EmptyState({ icon = '📋', title, subtitle, action, onAction }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 'var(--space-7) var(--space-4)',
      textAlign: 'center', gap: 'var(--space-3)',
    }}>
      <div style={{ fontSize: 40 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text)' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', maxWidth: 280 }}>
          {subtitle}
        </div>
      )}
      {action && onAction && (
        <button onClick={onAction} style={{
          marginTop: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)',
          background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 'var(--radius-md)', fontWeight: 700, cursor: 'pointer',
          fontSize: 'var(--text-sm)',
        }}>
          {action}
        </button>
      )}
    </div>
  );
}
