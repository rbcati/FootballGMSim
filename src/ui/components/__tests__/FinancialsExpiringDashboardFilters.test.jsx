/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor, fireEvent, within } from '@testing-library/react';
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

// priority_resign: high score (young, high ovr/pot, good morale, thin position).
const priorityPlayer = makePlayer({
  id: 201,
  name: 'Priority Star',
  pos: 'QB',
  ovr: 92,
  potential: 94,
  age: 24,
  morale: 85,
  schemeFit: 75,
  contract: { years: 1, baseAnnual: 10, signingBonus: 0, yearsTotal: 1 },
});

// let_walk: old, low morale, low everything.
const letWalkPlayer = makePlayer({
  id: 202,
  name: 'Walk Candidate',
  pos: 'LB',
  ovr: 38,
  potential: 38,
  age: 39,
  morale: 28,
  schemeFit: 45,
  contract: { years: 1, baseAnnual: 2, signingBonus: 0, yearsTotal: 1 },
});

// trade_or_tag: elite ovr, big ask, non-contender direction (override fires
// regardless of replacement difficulty, so deep WR bench below doesn't flip it).
const tradeOrTagPlayer = makePlayer({
  id: 203,
  name: 'Trade Candidate',
  pos: 'WR',
  ovr: 88,
  potential: 88,
  age: 28,
  morale: 70,
  schemeFit: 65,
  contract: { years: 1, baseAnnual: 30, signingBonus: 0, yearsTotal: 1 },
  extensionAsk: { baseAnnual: 30 },
});

// Non-expiring bench depth at WR only, so tradeOrTagPlayer's position is easy
// to replace while QB/LB (single-occupant positions) stay "high" difficulty —
// gives the Hard to Replace filter a real positive/negative case to split on.
const wrBench = [204, 205, 206, 207].map((id) =>
  makePlayer({ id, name: `WR Depth ${id}`, pos: 'WR', ovr: 65, contract: { years: 3, baseAnnual: 3, signingBonus: 0, yearsTotal: 3 } }),
);

const rosterPayload = {
  team: { id: 1, capTotal: 200, capUsed: 150, deadCap: 0, capRoom: 20 },
  players: [priorityPlayer, letWalkPlayer, tradeOrTagPlayer, ...wrBench],
};

// Rebuilding direction (low win pct) keeps trade_or_tag classification reachable.
const baseLeague = {
  userTeamId: 1,
  week: 5,
  year: 2026,
  phase: 'offseason_resign',
  teams: [{ id: 1, name: 'Sharks', wins: 2, losses: 14, capRoom: 20 }],
};

function makeActions(players = rosterPayload.players) {
  return {
    getRoster: vi.fn(async () => ({ payload: { ...rosterPayload, players } })),
  };
}

async function renderDashboard(players) {
  const actions = makeActions(players);
  const utils = render(<FinancialsView league={baseLeague} actions={actions} />);
  await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());
  await utils.findAllByTestId('resign-priority-badges');
  return utils;
}

describe('FinancialsView — expiring dashboard triage tabs', () => {
  afterEach(cleanup);

  it('the All tab renders every expiring row', async () => {
    const { getAllByTestId, getByTestId } = await renderDashboard();
    expect(getAllByTestId('resign-priority-badges').length).toBe(3);
    expect(getByTestId('resign-decision-tab-all').textContent).toContain('3');
  });

  it('the Priority tab only shows priority_resign players', async () => {
    const { getByTestId, getAllByTestId } = await renderDashboard();
    fireEvent.click(getByTestId('resign-decision-tab-priority'));
    const badgeGroups = getAllByTestId('resign-priority-badges');
    expect(badgeGroups.length).toBe(1);
    expect(within(badgeGroups[0]).getByTestId('resign-priority-badge-tier').textContent).toBe('Priority Re-sign');
  });

  it('the Let Walk tab only shows let_walk players', async () => {
    const { getByTestId, getAllByTestId } = await renderDashboard();
    fireEvent.click(getByTestId('resign-decision-tab-let_walk'));
    const badgeGroups = getAllByTestId('resign-priority-badges');
    expect(badgeGroups.length).toBe(1);
    expect(within(badgeGroups[0]).getByTestId('resign-priority-badge-tier').textContent).toBe('Let walk');
  });

  it('the Trade / Tag tab only shows trade_or_tag players', async () => {
    const { getByTestId, getAllByTestId } = await renderDashboard();
    fireEvent.click(getByTestId('resign-decision-tab-trade_or_tag'));
    const badgeGroups = getAllByTestId('resign-priority-badges');
    expect(badgeGroups.length).toBe(1);
    expect(within(badgeGroups[0]).getByTestId('resign-priority-badge-tier').textContent).toBe('Trade / Tag');
  });

  it('the High Risk tab only shows players with high negotiation risk', async () => {
    const { getByTestId, getAllByTestId } = await renderDashboard();
    fireEvent.click(getByTestId('resign-decision-tab-high_risk'));
    const badgeGroups = getAllByTestId('resign-priority-badges');
    for (const group of badgeGroups) {
      expect(within(group).getByTestId('resign-priority-badge-risk').textContent).toBe('High risk');
    }
    // priorityPlayer has low negotiation risk (high morale, reasonable ask) and is excluded.
    expect(badgeGroups.length).toBe(2);
  });

  it('the Hard to Replace tab only shows players with high replacement difficulty', async () => {
    const { getByTestId, getAllByTestId } = await renderDashboard();
    fireEvent.click(getByTestId('resign-decision-tab-hard_to_replace'));
    const badgeGroups = getAllByTestId('resign-priority-badges');
    for (const group of badgeGroups) {
      expect(within(group).getByTestId('resign-priority-badge-replacement').textContent).toBe('Hard to replace');
    }
    // priorityPlayer (QB) and letWalkPlayer (LB) are the only occupants of their
    // positions; tradeOrTagPlayer (WR) has a deep bench, so it's excluded here.
    expect(badgeGroups.length).toBe(2);
  });

  it('count badges reflect the unfiltered row set regardless of active tab', async () => {
    const { getByTestId } = await renderDashboard();
    fireEvent.click(getByTestId('resign-decision-tab-priority'));
    // Switching tabs must not change any tab's displayed count.
    expect(getByTestId('resign-decision-tab-all').textContent).toContain('3');
    expect(getByTestId('resign-decision-tab-let_walk').textContent).toContain('1');
  });

  it('a zero-count tab remains visible, dimmed, and shows the empty-state message when selected', async () => {
    // Only a priority_resign player is expiring — every other bucket is empty.
    const { getByTestId, queryByText } = await renderDashboard([priorityPlayer]);

    const letWalkTab = getByTestId('resign-decision-tab-let_walk');
    expect(letWalkTab).toBeTruthy();
    expect(letWalkTab.className).toContain('resign-decision-tab--empty');
    expect(letWalkTab.textContent).toContain('0');

    fireEvent.click(letWalkTab);
    expect(queryByText('No expiring players in this bucket.')).toBeTruthy();
  });

  it('preserves the existing score-descending sort within the filtered result', async () => {
    // priorityPlayer scores far above tradeOrTagPlayer; both should appear under "All" in that order.
    const { getByTestId, getAllByTestId } = await renderDashboard();
    fireEvent.click(getByTestId('resign-decision-tab-all'));
    const tierBadges = getAllByTestId('resign-priority-badge-tier');
    expect(tierBadges[0].textContent).toBe('Priority Re-sign');
  });

  it('does not mutate the source players array when filtering', async () => {
    const players = [priorityPlayer, letWalkPlayer, tradeOrTagPlayer];
    const { getByTestId } = await renderDashboard(players);
    fireEvent.click(getByTestId('resign-decision-tab-let_walk'));
    expect(players.map((p) => p.id)).toEqual([201, 202, 203]);
  });
});
