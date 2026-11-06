/** @vitest-environment jsdom */
import React, { Profiler } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import TradeWorkspace from '../TradeWorkspace.jsx';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
for (const ids of [['user-alpha', 'partner-beta'], [101, 201]]) it(`preserves ${typeof ids[0]} IDs across the real workspace without a render loop`, async () => {
  const teams = [1, 2].map((id, index) => ({ id, name: `Team ${id}`, abbr: `T${id}`, wins: 5, losses: 5, capRoom: 100, roster: [{ id: ids[index], name: index ? 'Partner Player' : 'User Player', pos: 'WR', ovr: 75, age: 25, contract: { baseAnnual: 1 } }] }));
  const actions = { getRoster: vi.fn(async id => ({ payload: { team: teams[id-1], players: teams[id-1].roster } })) };
  let commits = 0;
  // Bound an actual feedback loop so a regression fails instead of hanging CI.
  const onRender = () => { if (++commits > 40) throw new Error('Trade workspace did not settle'); };
  const view = render(<Profiler id="workspace" onRender={onRender}><TradeWorkspace league={{ teams, userTeamId: 1, year: 2026, phase: 'regular', week: 1, incomingTradeOffers: [], settings: {} }} actions={actions} initialView="Builder" initialPartnerTeamId={2} /></Profiler>);
  fireEvent.click(await view.findByRole('checkbox', { name: 'Add to Trade User Player' }));
  fireEvent.click(await view.findByRole('checkbox', { name: 'Add to Trade Partner Player' }));
  fireEvent.click(view.getByRole('button', { name: 'Summary', exact: true }));
  fireEvent.click(view.getByRole('button', { name: 'Builder', exact: true }));
  await waitFor(() => {
    expect(view.getByRole('checkbox', { name: 'Remove User Player' }).checked).toBe(true);
    expect(view.getByRole('checkbox', { name: 'Remove Partner Player' }).checked).toBe(true);
  });
  expect(commits).toBeLessThanOrEqual(40);
});
