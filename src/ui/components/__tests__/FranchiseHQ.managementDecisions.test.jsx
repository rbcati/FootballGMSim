/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LeagueDashboard from '../LeagueDashboard.jsx';

beforeEach(() => {
  window.matchMedia = () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  window.localStorage.clear();
});
afterEach(cleanup);
const base = { id: 'decisions', phase: 'regular', year: 2026, week: 1, userTeamId: 1, teams: [{ id: 1, name: 'Bears', abbr: 'CHI', conf: 0, div: 0, roster: [] }] };

it('routes pending trade requests from collapsed More Prep to existing Team Overview controls', async () => {
  const actions = { honorTradeRequest: vi.fn(), offerExtensionToWithdraw: vi.fn(), stonewallTradeRequest: vi.fn() };
  const onAdvanceWeek = vi.fn();
  const league = { ...base, teams: [{ ...base.teams[0], tradeRequestAlerts: [{ playerId: 10, playerName: 'Pending Player', pos: 'WR', ovr: 80, reason: 'role_concern', stonewalledWeeks: 4 }] }] };
  render(<LeagueDashboard league={league} actions={actions} onAdvanceWeek={onAdvanceWeek} />);
  expect(screen.getByText('More Prep').closest('details').open).toBe(false);
  fireEvent.click(screen.getByText('More Prep'));
  fireEvent.click(screen.getByRole('button', { name: /1 player trade request.*review/i }));
  expect(await screen.findByTestId('trade-request-alert-10')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /honor.*list on block/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Offer Extension' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stonewall' }));
  for (const action of Object.values(actions)) expect(action).toHaveBeenCalledExactlyOnceWith(10);
  expect(onAdvanceWeek).not.toHaveBeenCalled();
});

it('restores induction and number retirement through Team Overview without mounting legacy stats on HQ', async () => {
  const actions = { inductRingOfHonor: vi.fn(), retireJerseyNumber: vi.fn() };
  const onAdvanceWeek = vi.fn();
  const league = { ...base, pendingRohCandidates: [{ playerId: 50, teamId: 1, title: 'Candidate Legend', body: 'Eligible for induction.' }], ringOfHonor: [{ id: 51, name: 'Existing Legend', position: 'QB', jerseyNumber: 12, totalPassingYards: 20000, inductionYear: 2025 }] };
  render(<LeagueDashboard league={league} actions={actions} onAdvanceWeek={onAdvanceWeek} />);
  expect(screen.queryByTestId('franchise-legacy-view')).toBeNull();
  fireEvent.click(screen.getByText('More Prep'));
  fireEvent.click(screen.getByRole('button', { name: /1 Ring of Honor candidate.*review/i }));
  const summary = await screen.findByText('Franchise Legacy', { selector: 'summary' });
  expect(summary.closest('details').open).toBe(false);
  fireEvent.click(summary);
  fireEvent.click(screen.getByTestId('induct-roh-button'));
  expect(actions.inductRingOfHonor).toHaveBeenCalledExactlyOnceWith({ playerId: 50, teamId: 1 });
  fireEvent.click(screen.getByTestId('leaderboard-row-passing-yards-0'));
  fireEvent.click(screen.getByTestId('retire-number-button'));
  expect(actions.retireJerseyNumber).toHaveBeenCalledExactlyOnceWith({ playerId: 51, teamId: 1 });
  expect(onAdvanceWeek).not.toHaveBeenCalled();
});
