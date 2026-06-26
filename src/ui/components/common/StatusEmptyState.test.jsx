/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, fireEvent } from '@testing-library/react';
import StatusEmptyState from './StatusEmptyState.jsx';

describe('StatusEmptyState', () => {
  afterEach(cleanup);

  it('uses role="status" for non-error states and exposes the state via data-state', () => {
    const { getByTestId, getByRole } = render(
      <StatusEmptyState state="empty" title="No free agents available" body="Check back later." />,
    );
    const el = getByTestId('status-empty-state');
    expect(el.getAttribute('data-state')).toBe('empty');
    expect(getByRole('status')).toBeTruthy();
    expect(el.textContent).toContain('No free agents available');
    expect(el.textContent).toContain('Check back later.');
  });

  it('uses role="alert" for the error state', () => {
    const { getByRole } = render(
      <StatusEmptyState state="error" title="Failed to load free agents" body="Try again." />,
    );
    expect(getByRole('alert').textContent).toContain('Failed to load free agents');
  });

  it('honours a custom testId for targeting', () => {
    const { getByTestId } = render(
      <StatusEmptyState testId="fa-load-status" state="loading" title="Loading…" />,
    );
    expect(getByTestId('fa-load-status').getAttribute('data-state')).toBe('loading');
  });

  it('renders an action button only when both actionLabel and onAction are provided', () => {
    const onAction = vi.fn();
    const { getByText } = render(
      <StatusEmptyState
        state="filtered"
        title="No players match your filters."
        actionLabel="Reset filters"
        onAction={onAction}
      />,
    );
    const btn = getByText('Reset filters');
    fireEvent.click(btn);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when no handler is provided', () => {
    const { queryByText } = render(
      <StatusEmptyState state="filtered" title="No players match your filters." actionLabel="Reset filters" />,
    );
    expect(queryByText('Reset filters')).toBeNull();
  });
});
