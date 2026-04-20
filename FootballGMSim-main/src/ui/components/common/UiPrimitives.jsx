import React from 'react';

export function StatCard({ label, value, note }) {
  return (
    <div className="card" style={{ padding: 'var(--space-3)' }}>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>{value}</div>
      {note ? <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{note}</div> : null}
    </div>
  );
}

export function SectionCard({ title, actions = null, children }) {
  return (
    <section className="card" style={{ padding: 'var(--space-4)' }}>
      {(title || actions) ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)' }}>{title}</h3>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function TeamChip({ team }) {
  if (!team) return <span className="badge">TBD</span>;
  return <span className="badge">{team.abbr ?? team.name ?? 'TBD'}</span>;
}

export function TrendBadge({ trend }) {
  const tone = trend === 'up' ? 'var(--success)' : trend === 'down' ? 'var(--danger)' : 'var(--text-muted)';
  return <span style={{ color: tone, fontSize: 'var(--text-xs)', fontWeight: 700 }}>{trend ?? 'steady'}</span>;
}

export function DeadlineBanner({ message, locked }) {
  return (
    <div className="card" style={{ padding: 'var(--space-3)', borderColor: locked ? 'var(--danger)' : 'var(--warning)', background: locked ? 'rgba(255,69,58,0.08)' : 'rgba(255,159,10,0.08)' }}>
      <strong style={{ display: 'block' }}>{locked ? 'Trade window closed' : 'Trade deadline approaching'}</strong>
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>{message}</span>
    </div>
  );
}

export function EmptyState({ title, body }) {
  return <div className="card" style={{ padding: 'var(--space-5)', color: 'var(--text-muted)' }}><strong>{title}</strong><div>{body}</div></div>;
}

export function ErrorState({ title = 'Something went wrong', body, onRetry }) {
  return (
    <div className="card" style={{ padding: 'var(--space-5)', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
      <strong>{title}</strong>
      <div style={{ color: 'var(--text-muted)' }}>{body}</div>
      {onRetry ? <button className="btn" style={{ marginTop: 8 }} onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

export function DataTable({ columns = [], rows = [] }) {
  return (
    <table className="table" style={{ width: '100%' }}>
      <thead><tr>{columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, idx) => <tr key={idx}>{columns.map((col) => <td key={col.key}>{row[col.key]}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

export function PlayerRow({ player, trailing }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, padding: '6px 0' }}>
      <div>{player?.name} · {player?.pos} · Age {player?.age ?? '--'} · OVR {player?.ovr ?? '--'}</div>
      <div>{trailing}</div>
    </div>
  );
}
