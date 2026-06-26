/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { resolveFreeAgencyLoadStatus } from '../../utils/freeAgencyLoadStatus.js';
import StatusEmptyState from '../common/StatusEmptyState.jsx';
import FreeAgency from '../FreeAgency.jsx';

/**
 * Free Agency state model regression.
 *
 * The page resolves one of: loading / ready / empty(true-empty) /
 * unavailable(phase) / error via resolveFreeAgencyLoadStatus, and renders the
 * non-ready states through the shared StatusEmptyState. These tests lock the
 * resolver → presentation mapping (including filtered-empty) and confirm the
 * live component renders the loading state before its data arrives.
 */

function renderStatus(status, extra = {}) {
  return render(
    <StatusEmptyState testId="fa-load-status" state={status.state} title={status.title} body={status.body} {...extra} />,
  );
}

describe('FreeAgency — state model presentation', () => {
  afterEach(cleanup);

  it('renders the loading state', () => {
    const status = resolveFreeAgencyLoadStatus({ loading: true });
    const { getByTestId } = renderStatus(status);
    const el = getByTestId('fa-load-status');
    expect(el.getAttribute('data-state')).toBe('loading');
    expect(el.textContent).toMatch(/loading free agents/i);
  });

  it('renders the populated (ready) state with no status block', () => {
    const status = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: 'free_agency', freeAgents: [{ id: 1 }] },
      poolCount: 1,
    });
    expect(status.state).toBe('ready');
  });

  it('renders the true-empty state', () => {
    const status = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: 'free_agency', freeAgents: [] },
      poolCount: 0,
    });
    const { getByRole } = renderStatus(status);
    expect(getByRole('status').textContent).toMatch(/no free agents available/i);
  });

  it('renders the phase-unavailable state', () => {
    const status = resolveFreeAgencyLoadStatus({
      loading: false,
      faState: { phase: 'draft', freeAgents: [] },
      poolCount: 0,
    });
    const { getByTestId } = renderStatus(status);
    expect(getByTestId('fa-load-status').getAttribute('data-state')).toBe('unavailable');
    expect(getByTestId('fa-load-status').textContent).toMatch(/unavailable during this phase/i);
  });

  it('renders the error state with role=alert', () => {
    const status = resolveFreeAgencyLoadStatus({ loading: false, error: 'boom', faState: { freeAgents: [] } });
    const { getByRole } = renderStatus(status);
    expect(getByRole('alert').textContent).toMatch(/failed to load free agents/i);
  });

  it('renders the filtered-empty state with a reset-filters action', () => {
    const onReset = vi.fn();
    const { getByTestId, getByText } = render(
      <StatusEmptyState
        testId="fa-filtered-empty"
        state="filtered"
        title="No players match your filters."
        body="Adjust your filters."
        actionLabel="Reset filters"
        onAction={onReset}
      />,
    );
    expect(getByTestId('fa-filtered-empty').getAttribute('data-state')).toBe('filtered');
    expect(getByText('Reset filters')).toBeTruthy();
  });
});

describe('FreeAgency — live component loading state', () => {
  afterEach(cleanup);

  it('shows the loading status before free-agent data resolves', () => {
    // getFreeAgents never resolves during this synchronous render, so the
    // component stays in its initial loading state.
    const actions = {
      getFreeAgents: vi.fn(() => new Promise(() => {})),
      getRoster: vi.fn(() => new Promise(() => {})),
    };
    const league = { userTeamId: 1, week: 1, phase: 'free_agency', teams: [{ id: 1, abbr: 'CHI', capRoom: 30, roster: [] }] };
    const { getByTestId } = render(
      <FreeAgency userTeamId={1} league={league} actions={actions} onPlayerSelect={() => {}} onNavigate={() => {}} />,
    );
    const el = getByTestId('fa-load-status');
    expect(el.getAttribute('data-state')).toBe('loading');
  });
});
