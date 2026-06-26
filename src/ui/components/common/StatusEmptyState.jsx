import React from 'react';

/**
 * StatusEmptyState — one consistent presentation for the "nothing to show yet"
 * states shared across management surfaces (loading, empty, unavailable, error,
 * filtered-empty).
 *
 * It centralises the accessibility + styling decisions that were previously
 * duplicated inline: error variants announce themselves with role="alert",
 * everything else uses role="status", and the variant drives colour. An
 * optional action (e.g. "Reset filters") can be rendered beneath the message.
 *
 * Purely presentational — it carries no business logic.
 *
 * @param {object} props
 * @param {"loading"|"empty"|"unavailable"|"error"|"filtered"|string} [props.state]
 * @param {string} props.title
 * @param {string} [props.body]
 * @param {string} [props.testId]      data-testid for targeting in tests.
 * @param {string} [props.actionLabel] When set with onAction, renders a button.
 * @param {Function} [props.onAction]
 */
export default function StatusEmptyState({
  state = 'empty',
  title,
  body,
  testId = 'status-empty-state',
  actionLabel,
  onAction,
}) {
  const isError = state === 'error';
  return (
    <div
      role={isError ? 'alert' : 'status'}
      data-testid={testId}
      data-state={state}
      style={{
        padding: 'var(--space-8)',
        textAlign: 'center',
        color: isError ? 'var(--danger)' : 'var(--text-muted)',
        display: 'grid',
        gap: 6,
        justifyItems: 'center',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 'var(--text-base)', color: isError ? 'var(--danger)' : 'var(--text)' }}>
        {title}
      </div>
      {body ? <div style={{ fontSize: 'var(--text-sm)', maxWidth: 420 }}>{body}</div> : null}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="btn"
          onClick={onAction}
          style={{ marginTop: 4 }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
