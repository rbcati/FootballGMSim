/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor, within } from '@testing-library/react';
import FinancialsView from '../FinancialsView.jsx';

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Player',
    pos: 'QB',
    ovr: 70,
    potential: 70,
    age: 27,
    morale: 70,
    schemeFit: 65,
    contract: { years: 1, baseAnnual: 6, signingBonus: 0, yearsTotal: 1 },
    ...overrides,
  };
}

// High-value, young, well-liked starter → should score highest → priority_resign.
const starPlayer = makePlayer({
  id: 101,
  name: 'Star Quarterback',
  pos: 'QB',
  ovr: 90,
  potential: 92,
  age: 25,
  morale: 80,
  schemeFit: 70,
  contract: { years: 1, baseAnnual: 10, signingBonus: 0, yearsTotal: 1 },
});

// Old, declining, low-morale depth piece → should score lowest → let_walk.
const walkPlayer = makePlayer({
  id: 102,
  name: 'Aging Linebacker',
  pos: 'LB',
  ovr: 40,
  potential: 40,
  age: 38,
  morale: 30,
  schemeFit: 50,
  contract: { years: 1, baseAnnual: 3, signingBonus: 0, yearsTotal: 1 },
});

const rosterPayload = {
  team: { id: 1, capTotal: 200, capUsed: 150, deadCap: 0, capRoom: 30 },
  players: [starPlayer, walkPlayer],
};

const baseLeague = {
  userTeamId: 1,
  week: 5,
  year: 2026,
  phase: 'offseason_resign',
  teams: [{ id: 1, name: 'Sharks', wins: 8, losses: 8, capRoom: 30 }],
};

function makeActions(players = rosterPayload.players) {
  return {
    getRoster: vi.fn(async () => ({ payload: { ...rosterPayload, players } })),
  };
}

describe('FinancialsView — expiring contracts dashboard', () => {
  afterEach(cleanup);

  it('renders priority badges for expiring players', async () => {
    const actions = makeActions();
    const { findAllByTestId } = render(<FinancialsView league={baseLeague} actions={actions} />);
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());

    const badgeGroups = await findAllByTestId('resign-priority-badges');
    expect(badgeGroups.length).toBe(2);
  });

  it('renders the recommendation reason inside the priority badge group', async () => {
    const actions = makeActions();
    const { findAllByTestId } = render(<FinancialsView league={baseLeague} actions={actions} />);
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());

    const badgeGroups = await findAllByTestId('resign-priority-badges');
    expect(within(badgeGroups[0]).getByText('Priority Re-sign: productive starter at a thin position')).toBeTruthy();
  });

  it('sorts expiring rows by recommendation score descending (highest priority first)', async () => {
    const actions = makeActions();
    const { findAllByTestId } = render(<FinancialsView league={baseLeague} actions={actions} />);
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());

    const tierBadges = await findAllByTestId('resign-priority-badge-tier');
    // Star quarterback (high score) must render before the aging linebacker (low score).
    expect(tierBadges[0].textContent).toBe('Priority Re-sign');
    expect(tierBadges[1].textContent).toBe('Let walk');
  });

  it('does not mutate the source players array when sorting the dashboard rows', async () => {
    const players = [starPlayer, walkPlayer];
    const actions = makeActions(players);
    const { findAllByTestId } = render(<FinancialsView league={baseLeague} actions={actions} />);
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());
    await findAllByTestId('resign-priority-badges');

    // The original fixture array order must be untouched by the dashboard's internal sort.
    expect(players[0].id).toBe(starPlayer.id);
    expect(players[1].id).toBe(walkPlayer.id);
  });

  it('does not render raw enum values such as priority_resign or trade_or_tag in the list', async () => {
    const actions = makeActions();
    const { findAllByTestId, container } = render(<FinancialsView league={baseLeague} actions={actions} />);
    await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());
    await findAllByTestId('resign-priority-badges');

    expect(container.textContent).not.toMatch(/priority_resign|resign_if_price|trade_or_tag|replaceable_depth/);
  });
});
