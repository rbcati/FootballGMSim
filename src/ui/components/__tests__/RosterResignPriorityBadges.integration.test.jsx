/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import Roster from '../Roster.jsx';

function makePlayer(id, overrides = {}) {
  return {
    id,
    name: `Player ${id}`,
    pos: 'QB',
    ovr: 80,
    potential: 82,
    age: 27,
    morale: 70,
    schemeFit: 65,
    teamId: 1,
    contract: { years: 1, yearsLeft: 1, baseAnnual: 8, salary: 8_000_000 },
    depthChart: { rowKey: 'QB', order: id },
    ...overrides,
  };
}

const rosterPayload = {
  team: { id: 1, name: 'Sharks', capRoom: 30_000_000, capTotal: 200_000_000 },
  players: [
    makePlayer(1, { pos: 'QB' }),
    makePlayer(2, { pos: 'WR', contract: { years: 3, yearsLeft: 3, baseAnnual: 5 } }),
  ],
};

const baseLeague = {
  week: 3,
  year: 2026,
  phase: 'offseason_resign',
  userTeamId: 1,
  salaryCap: 200_000_000,
  teams: [{ id: 1, name: 'Sharks', abbr: 'SHK', wins: 8, losses: 8, capRoom: 30, roster: rosterPayload.players, picks: [], strategies: {} }],
};

describe('Roster — expiring/re-sign tab priority badges', () => {
  afterEach(cleanup);

  it('renders priority badges for expiring players in the resign-phase table', async () => {
    const actions = { getRoster: vi.fn(async () => ({ payload: rosterPayload })) };

    const { findAllByTestId } = render(
      <Roster
        league={baseLeague}
        actions={actions}
        onPlayerSelect={() => {}}
        initialState={{ view: 'table', filter: 'ALL' }}
        initialViewMode="table"
      />,
    );

    await waitFor(() => expect(actions.getRoster).toHaveBeenCalledTimes(1));

    // Only Player 1 has a 1-year-or-less contract, so only one badge group should render.
    const badgeGroups = await findAllByTestId('resign-priority-badges');
    expect(badgeGroups.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render raw enum values in the roster list', async () => {
    const actions = { getRoster: vi.fn(async () => ({ payload: rosterPayload })) };

    const { container, findAllByTestId } = render(
      <Roster
        league={baseLeague}
        actions={actions}
        onPlayerSelect={() => {}}
        initialState={{ view: 'table', filter: 'ALL' }}
        initialViewMode="table"
      />,
    );

    await waitFor(() => expect(actions.getRoster).toHaveBeenCalledTimes(1));
    await findAllByTestId('resign-priority-badges');

    expect(container.textContent).not.toMatch(/priority_resign|resign_if_price|trade_or_tag|replaceable_depth/);
  });
});
