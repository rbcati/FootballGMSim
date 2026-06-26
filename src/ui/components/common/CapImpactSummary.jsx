import React from 'react';

/**
 * CapImpactSummary — a single, reusable cap-impact breakdown.
 *
 * Both Trade Center and Free Agency need to answer the same question before a
 * user commits to a move: "what does this do to my cap room?". This component
 * renders that breakdown consistently:
 *
 *   current room → outgoing (freed) → incoming (added) → projected room
 *
 * It is purely presentational. Callers pass already-computed numbers; this
 * component does NOT change any valuation, contract, or cap math — it only
 * formats and, when the projected room is negative, surfaces a clear warning.
 *
 * @param {object} props
 * @param {number} props.currentRoom    Cap room before the move (in $M).
 * @param {number} [props.incoming]     Salary coming IN / added (in $M).
 * @param {number} [props.outgoing]     Salary going OUT / freed (in $M).
 * @param {number} [props.projectedRoom] Cap room after the move. Computed from
 *                                        currentRoom + outgoing - incoming when omitted.
 * @param {string} [props.title]        Heading copy.
 * @param {string} [props.incomingLabel] Override label for the incoming row.
 * @param {string} [props.outgoingLabel] Override label for the outgoing row.
 * @param {number} [props.warnThreshold] Projected room at/below this is flagged (default 0).
 * @param {string} [props.warningText]   Override the default warning copy.
 */
export default function CapImpactSummary({
  currentRoom = 0,
  incoming = 0,
  outgoing = 0,
  projectedRoom,
  title = 'Cap impact',
  incomingLabel = 'Salary added',
  outgoingLabel = 'Salary freed',
  warnThreshold = 0,
  warningText,
}) {
  const current = Number(currentRoom) || 0;
  const inc = Number(incoming) || 0;
  const out = Number(outgoing) || 0;
  const projected = Number.isFinite(projectedRoom)
    ? Number(projectedRoom)
    : Math.round((current + out - inc) * 10) / 10;

  const fmt = (val) => {
    const n = Number(val) || 0;
    return n < 0 ? `-$${Math.abs(n).toFixed(1)}M` : `$${n.toFixed(1)}M`;
  };

  const overCap = projected < warnThreshold;
  const tight = !overCap && projected < 5;
  const projectedColor = overCap ? 'var(--danger)' : tight ? 'var(--warning)' : 'var(--success)';
  const defaultWarning = overCap
    ? 'This move puts you over the cap. Free up salary or send less money before proposing.'
    : 'Cap room is tight after this move. Watch your remaining flexibility.';

  const rows = [
    { key: 'current', label: 'Current cap room', value: fmt(current), color: 'var(--text)' },
    { key: 'outgoing', label: outgoingLabel, value: out > 0 ? `+${fmt(out)}` : fmt(0), color: out > 0 ? 'var(--success)' : 'var(--text-muted)' },
    { key: 'incoming', label: incomingLabel, value: inc > 0 ? `-${fmt(inc)}` : fmt(0), color: inc > 0 ? 'var(--warning)' : 'var(--text-muted)' },
    { key: 'projected', label: 'Projected cap room', value: fmt(projected), color: projectedColor, strong: true },
  ];

  return (
    <div
      className="cap-impact-summary"
      data-testid="cap-impact-summary"
      data-over-cap={overCap ? 'true' : 'false'}
      style={{
        display: 'grid',
        gap: 6,
        border: '1px solid var(--hairline)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-3)',
        background: 'var(--surface)',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-subtle)', fontWeight: 700 }}>
        {title}
      </div>
      <div style={{ display: 'grid', gap: 4 }}>
        {rows.map((row) => (
          <div
            key={row.key}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontSize: 'var(--text-xs)',
              paddingTop: row.strong ? 4 : 0,
              borderTop: row.strong ? '1px solid var(--hairline)' : 'none',
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{row.label}</span>
            <strong style={{ color: row.color, fontWeight: row.strong ? 800 : 700 }}>{row.value}</strong>
          </div>
        ))}
      </div>
      {(overCap || tight) && (
        <div
          role={overCap ? 'alert' : 'status'}
          style={{
            fontSize: 'var(--text-xs)',
            color: overCap ? 'var(--danger)' : 'var(--warning)',
            background: overCap ? 'rgba(255,69,58,0.08)' : 'rgba(255,159,10,0.08)',
            border: `1px solid ${overCap ? 'rgba(255,69,58,0.35)' : 'rgba(255,159,10,0.35)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '6px 8px',
          }}
        >
          {warningText ?? defaultWarning}
        </div>
      )}
    </div>
  );
}
