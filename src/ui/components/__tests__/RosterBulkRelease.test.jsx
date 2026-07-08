/** @vitest-environment jsdom */
/**
 * RosterBulkRelease.test.jsx — bulk release confirm flow.
 *
 * Regression: actions.bulkReleasePlayers resolves with { type, payload } from
 * the worker request bridge, but confirmBulkRelease read `result.ok` (always
 * undefined), so every SUCCESSFUL bulk release showed the "stopped after 0
 * release(s)" failure alert. A rejected promise (worker ERROR on a partial
 * stop) escaped the handler entirely and left the preview modal stuck open.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Roster from '../Roster.jsx';

function makePlayer(id, overrides = {}) {
  return {
    id,
    name: `Player ${id}`,
    pos: 'WR',
    ovr: 74,
    potential: 78,
    age: 26,
    morale: 70,
    schemeFit: 65,
    teamId: 1,
    contract: { years: 2, yearsLeft: 2, baseAnnual: 4, salary: 4_000_000 },
    depthChart: { rowKey: 'WR', order: id },
    ...overrides,
  };
}

const players = [makePlayer(1), makePlayer(2)];

const rosterPayload = {
  team: { id: 1, name: 'Sharks', capRoom: 30_000_000, capTotal: 200_000_000 },
  players,
};

const baseLeague = {
  week: 3,
  year: 2026,
  phase: 'regular',
  userTeamId: 1,
  salaryCap: 200_000_000,
  teams: [{ id: 1, name: 'Sharks', abbr: 'SHK', wins: 8, losses: 8, capRoom: 30, roster: players, picks: [], strategies: {} }],
};

async function driveToConfirm(actions) {
  render(
    <Roster
      league={baseLeague}
      actions={actions}
      onPlayerSelect={() => {}}
      initialState={{ view: 'table', filter: 'ALL' }}
      initialViewMode="table"
    />,
  );
  await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());

  fireEvent.click(await screen.findByRole('button', { name: /bulk cut mode off/i }));
  fireEvent.click(await screen.findByRole('button', { name: /select visible/i }));
  fireEvent.click(await screen.findByRole('button', { name: /preview bulk release/i }));

  const dialog = await screen.findByRole('dialog', { name: /bulk release preview/i });
  fireEvent.click(screen.getByRole('button', { name: /confirm bulk release/i }));
  return dialog;
}

describe('Roster — bulk release confirm flow', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('treats a resolved SUCCESS payload as success: no failure alert, modal closes', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const actions = {
      getRoster: vi.fn(async () => ({ payload: rosterPayload })),
      bulkReleasePlayers: vi.fn(async () => ({ type: 'SUCCESS', payload: { ok: true, released: [1, 2] } })),
    };

    await driveToConfirm(actions);

    await waitFor(() => expect(actions.bulkReleasePlayers).toHaveBeenCalledTimes(1));
    expect(actions.bulkReleasePlayers).toHaveBeenCalledWith(1, [1, 2]);
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /bulk release preview/i })).toBeNull(),
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('surfaces a rejected bulk release (worker ERROR) and still closes the modal', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const workerMessage = 'Bulk release stopped after 1 release(s): Player is not on selected roster';
    const actions = {
      getRoster: vi.fn(async () => ({ payload: rosterPayload })),
      bulkReleasePlayers: vi.fn(async () => {
        throw new Error(workerMessage);
      }),
    };

    await driveToConfirm(actions);

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(workerMessage));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /bulk release preview/i })).toBeNull(),
    );
  });
});
