/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import ContractCenter from '../ContractCenter.jsx';
import { ScrollArea } from '../ui/scroll-area.jsx';

vi.mock('../FaceAvatar.jsx', () => ({ default: () => null }));
afterEach(cleanup);

const terms = { years: 4, yearsTotal: 4, baseAnnual: 14.2, signingBonus: 5, guaranteedPct: 0.6 };

function setup({ quote = { canCommit: true, terms, capHitDelta: 3.1, capRoom: 20 }, extend = { type: 'EXTENSION_RESPONSE', payload: { status: 'accepted' } } } = {}) {
  const players = [
    { id: 'p-qb', name: 'Raymond Bridges', pos: 'QB', age: 27, ovr: 84, teamId: 0, contract: { years: 1, yearsTotal: 3, baseAnnual: 10 } },
    { id: 'p-wr', name: 'Gardner', pos: 'WR', age: 29, ovr: 66, teamId: 0, contract: { years: 1, yearsTotal: 2, baseAnnual: 3 }, extensionDecision: 'deferred' },
    { id: 'p-lb', name: 'Lester', pos: 'LB', age: 26, ovr: 70, teamId: 0, contract: { years: 1, yearsTotal: 2, baseAnnual: 2 } },
  ];
  const team = { id: 0, name: 'Bills', roster: players, capRoom: 20, capTotal: 255 };
  const actions = {
    getExtensionQuote: vi.fn(async () => ({ type: 'EXTENSION_QUOTE', payload: quote })),
    extendContract: vi.fn(async () => extend),
    updatePlayerManagement: vi.fn(async () => ({ type: 'STATE_UPDATE' })),
    applyFranchiseTag: vi.fn(async () => ({ type: 'STATE_UPDATE' })),
  };
  const view = render(<ContractCenter league={{ phase: 'offseason_resign', userTeamId: 0, teams: [team], year: 2026 }} actions={actions} />);
  return { view, actions };
}

describe('Re-signing Center execution', () => {
  it('previews the worker-quoted terms and submits exactly those terms', async () => {
    const { view, actions } = setup();
    fireEvent.click(view.getAllByRole('button', { name: 'Extend', exact: true })[0]);
    await waitFor(() => expect(view.getByTestId('extension-preview-terms').textContent).toContain('$14.2M'));
    expect(actions.getExtensionQuote).toHaveBeenCalledWith('p-qb', 0);
    fireEvent.click(view.getByRole('button', { name: 'Confirm extension' }));
    await waitFor(() => expect(view.getByRole('status').textContent).toContain('extension accepted'));
    expect(actions.extendContract).toHaveBeenCalledWith('p-qb', 0, terms);
    // Preview closes once the worker confirms the commit.
    expect(view.queryByTestId('extension-preview')).toBeNull();
  });

  it('explains why Confirm cannot act when the worker cannot commit', async () => {
    const { view, actions } = setup({ quote: { canCommit: false, terms, blockReason: 'Cap room short by $2.0M (extension adds $5.0M, room is $3.0M)' } });
    fireEvent.click(view.getAllByRole('button', { name: 'Extend', exact: true })[0]);
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('Cap room short by $2.0M'));
    fireEvent.click(view.getByRole('button', { name: 'Confirm extension' }));
    await waitFor(() => expect(view.getByRole('status').textContent).toContain('Cap room short by $2.0M'));
    expect(actions.extendContract).not.toHaveBeenCalled();
  });

  it('keeps Confirm disabled until the worker quote for this player arrives', async () => {
    let release;
    const { view, actions } = setup();
    actions.getExtensionQuote.mockImplementation(() => new Promise((resolve) => { release = resolve; }));
    fireEvent.click(view.getAllByRole('button', { name: 'Extend', exact: true })[0]);
    expect(view.getByRole('button', { name: 'Confirm extension' }).disabled).toBe(true);
    release({ type: 'EXTENSION_QUOTE', payload: { canCommit: true, terms, capHitDelta: 1, capRoom: 20 } });
    await waitFor(() => expect(view.getByRole('button', { name: 'Confirm extension' }).disabled).toBe(false));
  });

  it('shows an agent refusal inside the open preview', async () => {
    const { view } = setup({ extend: { type: 'EXTENSION_RESPONSE', payload: { status: 'declined', reason: 'We appreciate the offer, but my client deserves a fair deal.' } } });
    fireEvent.click(view.getAllByRole('button', { name: 'Extend', exact: true })[0]);
    await waitFor(() => expect(view.getByRole('button', { name: 'Confirm extension' }).disabled).toBe(false));
    fireEvent.click(view.getByRole('button', { name: 'Confirm extension' }));
    await waitFor(() => expect(view.getByTestId('extension-preview').textContent).toContain('my client deserves a fair deal'));
  });

  it('names the players who will enter free agency and resolves them in one click', async () => {
    const { view, actions } = setup();
    const gate = view.getByTestId('resign-advance-gate');
    expect(gate.textContent).toContain('Raymond Bridges (Pending)');
    expect(gate.textContent).toContain('Gardner (Decide Later)');
    fireEvent.click(view.getByTestId('resign-let-all-walk'));
    await waitFor(() => expect(view.getByRole('status').textContent).toContain('Let Walk recorded for 3 players'));
    expect(actions.updatePlayerManagement.mock.calls.map((c) => c[0]).sort()).toEqual(['p-lb', 'p-qb', 'p-wr']);
    for (const call of actions.updatePlayerManagement.mock.calls) expect(call[2]).toEqual({ extensionDecision: 'let_walk' });
  });

  it('no longer reserves projected cap room for deferred players', () => {
    const { view } = setup();
    expect(view.container.textContent).toContain('Cap room (committed)');
    expect(view.container.textContent).not.toContain('Projected cap room (pending)');
  });
});

describe('ScrollArea (native)', () => {
  it('renders children in a scrollable container with no render-time state', () => {
    const view = render(<ScrollArea style={{ maxHeight: 40 }} className="x">{Array.from({ length: 50 }, (_, i) => <div key={i}>row {i}</div>)}</ScrollArea>);
    const el = view.container.querySelector('[data-scroll-area]');
    expect(el.style.overflowY).toBe('auto');
    expect(el.style.maxHeight).toBe('40px');
    expect(el.textContent).toContain('row 49');
  });
});
