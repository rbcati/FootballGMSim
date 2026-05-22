import React from 'react';
import { Button } from '@/components/ui/button';

const TONE_CLASS = { danger: 'tone-danger', warning: 'tone-warning', info: 'tone-info' };

/**
 * Compact inline confirmation panel shown before advancing the week
 * when unresolved prep risks are detected.
 *
 * Props:
 *   gate           — output of buildAdvanceReadinessGate
 *   onAdvanceAnyway — called when user overrides and advances anyway
 *   onReview        — called with primaryFixDestination when user chooses to fix
 *   onCancel        — called when user dismisses the panel
 */
export default function AdvanceReadinessGate({ gate, onAdvanceAnyway, onReview, onCancel }) {
  if (!gate?.shouldWarn) return null;

  const warningItems = (gate.riskItems ?? []).filter((item) => item.severity !== 'info');

  return (
    <div
      className={`advance-readiness-gate ${TONE_CLASS[gate.severity ?? 'warning']}`}
      role="dialog"
      aria-modal="false"
      aria-label="Advance Week Readiness Check"
      data-testid="advance-readiness-gate"
      style={{
        padding: '14px 16px',
        borderRadius: 10,
        border: '1.5px solid currentColor',
        marginBottom: 10,
        background: 'var(--surface-2, #1a1a2e)',
      }}
    >
      <strong
        className="advance-readiness-gate__title"
        style={{ display: 'block', marginBottom: 8, fontSize: '0.97em' }}
      >
        {gate.title}
      </strong>

      {warningItems.length > 0 ? (
        <ul
          className="advance-readiness-gate__risks"
          aria-label="Unresolved prep items"
          role="list"
          style={{ listStyle: 'none', padding: 0, margin: '0 0 8px 0' }}
        >
          {warningItems.map((item) => (
            <li
              key={item.id}
              className={`advance-readiness-gate__risk-item ${TONE_CLASS[item.severity ?? 'warning']}`}
              role="listitem"
              style={{ marginBottom: 4, fontSize: '0.88em' }}
            >
              <strong>{item.label}</strong>
              {item.detail ? <span style={{ opacity: 0.8 }}> {item.detail}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      <p
        className="advance-readiness-gate__summary"
        style={{ margin: '0 0 12px 0', fontSize: '0.88em', opacity: 0.9 }}
      >
        {gate.summary}
      </p>

      <div
        className="advance-readiness-gate__actions"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <Button
          size="sm"
          variant="outline"
          onClick={() => onReview?.(gate.primaryFixDestination)}
          data-testid="gate-review-btn"
        >
          Review weekly prep
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onAdvanceAnyway}
          data-testid="gate-advance-anyway-btn"
        >
          {gate.advanceAnywayLabel ?? 'Advance anyway'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="gate-cancel-btn"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
