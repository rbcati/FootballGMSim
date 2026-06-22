/**
 * ActivityToastStack.jsx — compact mobile activity strip
 *
 * Collapses transient roster / simulation notices (lineup validity, depth-chart
 * warnings, "week advanced", auto-save confirmations, etc.) into a single tight
 * stack instead of stacking full-width alert cards that eat vertical space.
 *
 * Pure presentational primitive — no gameplay logic. Each message:
 *   { id, text, tone? } where tone ∈ 'info' | 'ok' | 'warning' | 'danger'
 */

import React from 'react';

const TONE_COLOR = {
  ok: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--accent)',
};

export default function ActivityToastStack({ messages, max = 4 }) {
  const list = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && (m.text ?? '').toString().trim().length > 0)
    .slice(-max);

  if (list.length === 0) return null;

  return (
    <div
      className="activity-toast-stack"
      data-testid="activity-toast-stack"
      role="status"
      aria-live="polite"
      aria-label="Recent franchise activity"
    >
      {list.map((m) => {
        const tone = TONE_COLOR[m.tone] ? m.tone : 'info';
        const color = TONE_COLOR[tone];
        return (
          <div
            key={m.id ?? m.text}
            className={`activity-toast activity-toast--${tone}`}
            data-testid="activity-toast"
            data-tone={tone}
            style={{ borderLeftColor: color }}
          >
            <span className="activity-toast__dot" style={{ background: color }} aria-hidden="true" />
            <span className="activity-toast__text">{m.text}</span>
          </div>
        );
      })}
    </div>
  );
}
