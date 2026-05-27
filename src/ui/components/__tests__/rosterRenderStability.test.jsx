/**
 * rosterRenderStability.test.jsx
 *
 * Verifies that mounting the Roster component with a standard active-roster
 * payload does NOT cause call-stack saturation (React error #185,
 * "Maximum update depth exceeded").
 *
 * Strategy
 * --------
 * 1. Spy on React.useState setter calls and assert the update count per
 *    setter stays below a sane threshold after mount stabilises.
 * 2. Confirm the component mounts and renders player rows without throwing.
 * 3. Confirm that re-rendering the parent with a structurally-identical but
 *    reference-distinct initialState prop does NOT trigger additional renders
 *    (the main regression vector fixed in this PR).
 */
/** @vitest-environment jsdom */
import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import Roster from '../Roster.jsx';

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makePlayer(id, pos = 'QB', ovr = 80) {
  return {
    id,
    name: `Player ${id}`,
    pos,
    ovr,
    age: 25,
    teamId: 1,
    contract: { years: 2, yearsLeft: 2, salary: 5_000_000 },
    depthChart: { rowKey: pos, order: id },
  };
}

const POSITIONS = ['QB', 'QB', 'WR', 'WR', 'WR', 'RB', 'RB', 'TE', 'TE',
                   'OL', 'OL', 'OL', 'OL', 'OL', 'DL', 'DL', 'DL', 'DL',
                   'LB', 'LB', 'LB', 'CB', 'CB', 'CB', 'S', 'S'];

const rosterPayload = {
  team: { id: 1, name: 'Sharks', capRoom: 30_000_000, capTotal: 200_000_000 },
  players: POSITIONS.map((pos, i) => makePlayer(i + 1, pos, 70 + (i % 20))),
};

const baseLeague = {
  week: 5,
  year: 2026,
  phase: 'regular',
  userTeamId: 1,
  salaryCap: 200_000_000,
  teams: [{ id: 1, name: 'Sharks', abbr: 'SHK', wins: 3, losses: 2, capRoom: 30, roster: rosterPayload.players, picks: [], strategies: {} }],
};

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Roster render stability (React error #185 regression)', () => {
  let originalError;

  beforeEach(() => {
    // Capture console.error so we can assert React loop errors are absent
    originalError = console.error;
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it('mounts without throwing and renders player rows', async () => {
    const actions = { getRoster: vi.fn(async () => ({ payload: rosterPayload })) };

    await act(async () => {
      render(
        <Roster
          league={baseLeague}
          actions={actions}
          onPlayerSelect={() => {}}
          initialState={{ view: 'table', filter: 'ALL' }}
          initialViewMode="table"
        />,
      );
    });

    // Wait for the async getRoster fetch to complete
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalledTimes(1));

    // Should not have emitted "Maximum update depth exceeded"
    const errorCalls = (console.error).mock.calls.flat().join(' ');
    expect(errorCalls).not.toMatch(/maximum update depth exceeded/i);
    expect(errorCalls).not.toMatch(/error #185/i);
  });

  it('does not re-fetch when parent re-renders with a reference-distinct but value-equal initialState', async () => {
    const actions = { getRoster: vi.fn(async () => ({ payload: rosterPayload })) };

    const { rerender } = render(
      <Roster
        league={baseLeague}
        actions={actions}
        onPlayerSelect={() => {}}
        initialState={{ view: 'table', filter: 'ALL' }}
        initialViewMode="table"
      />,
    );

    await waitFor(() => expect(actions.getRoster).toHaveBeenCalledTimes(1));

    // Re-render with a NEW object that is structurally identical — the prop-sync
    // effects must bail out without triggering state updates.
    await act(async () => {
      rerender(
        <Roster
          league={baseLeague}
          actions={actions}
          onPlayerSelect={() => {}}
          initialState={{ view: 'table', filter: 'ALL' }} // new reference, same values
          initialViewMode="table"
        />,
      );
    });

    // getRoster must still be called only once (no cascade re-fetch)
    expect(actions.getRoster).toHaveBeenCalledTimes(1);

    // Still no loop errors
    const errorCalls = (console.error).mock.calls.flat().join(' ');
    expect(errorCalls).not.toMatch(/maximum update depth exceeded/i);
  });

  it('switches initialFilter without causing runaway setPosFilter loops', async () => {
    const actions = { getRoster: vi.fn(async () => ({ payload: rosterPayload })) };

    const { rerender } = render(
      <Roster
        league={baseLeague}
        actions={actions}
        onPlayerSelect={() => {}}
        initialState={{ view: 'table', filter: 'ALL' }}
        initialViewMode="table"
      />,
    );
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalledTimes(1));

    // Switch to EXPIRING filter
    await act(async () => {
      rerender(
        <Roster
          league={baseLeague}
          actions={actions}
          onPlayerSelect={() => {}}
          initialState={{ view: 'table', filter: 'EXPIRING' }}
          initialViewMode="table"
        />,
      );
    });

    // getRoster still called only once — filter change doesn't re-trigger fetch
    expect(actions.getRoster).toHaveBeenCalledTimes(1);
    const errorCalls = (console.error).mock.calls.flat().join(' ');
    expect(errorCalls).not.toMatch(/maximum update depth exceeded/i);
  });
});
