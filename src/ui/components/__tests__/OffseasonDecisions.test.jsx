/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import ContractCenter from '../ContractCenter.jsx';
vi.mock('../FaceAvatar.jsx', () => ({ default: () => null }));
afterEach(cleanup);
function setup(teamId, playerId, overrides = {}) {
  const player = { id: playerId, name: 'Test Quarterback', pos: 'QB', age: 25, ovr: 85, teamId, contract: { years: 1, yearsTotal: 1, baseAnnual: 8 } };
  const team = { id: teamId, name: 'Bills', roster: [player], capRoom: 80, capTotal: 255 };
  const actions = { updatePlayerManagement: vi.fn(async () => ({ type: 'STATE_UPDATE' })), extendContract: vi.fn(async () => ({ payload: { status: 'accepted' } })), applyFranchiseTag: vi.fn(async () => ({ type: 'STATE_UPDATE' })), ...overrides };
  const view = render(<ContractCenter league={{ phase: 'offseason_resign', userTeamId: teamId, teams: [team], year: 2026 }} actions={actions} />);
  return { ...view, actions };
}
describe.each([0, 7])('offseason actions for team %s', teamId => {
  for (const playerId of [0, 'player:opaque']) {
    it(`commits Let Walk and Defer for player ${playerId}`, async () => {
      const v = setup(teamId, playerId);
      fireEvent.click(v.getByRole('button', { name: 'Let Walk', exact: true }));
      await waitFor(() => expect(v.getByRole('status').textContent).toContain('Let Walk.'));
      expect(v.actions.updatePlayerManagement).toHaveBeenCalledWith(playerId, teamId, { extensionDecision: 'let_walk' });
      fireEvent.click(v.getByRole('button', { name: 'Defer', exact: true }));
      await waitFor(() => expect(v.getByRole('status').textContent).toContain('Decide Later.'));
      expect(v.actions.updatePlayerManagement).toHaveBeenLastCalledWith(playerId, teamId, { extensionDecision: 'deferred' });
    });
    it(`submits and acknowledges the extension and tag for player ${playerId}`, async () => {
      const v = setup(teamId, playerId);
      fireEvent.click(v.getByRole('button', { name: 'Extend', exact: true }));
      fireEvent.click(v.getByRole('button', { name: 'Confirm extension' }));
      await waitFor(() => expect(v.getByRole('status').textContent).toContain('extension accepted'));
      expect(v.actions.extendContract).toHaveBeenCalledWith(playerId, teamId, expect.objectContaining({ baseAnnual: expect.any(Number) }));
      expect(v.actions.updatePlayerManagement).not.toHaveBeenCalled();
      fireEvent.click(v.getByRole('button', { name: 'Use franchise tag' }));
      await waitFor(() => expect(v.getByRole('status').textContent).toContain('Tagged'));
      expect(v.actions.applyFranchiseTag).toHaveBeenCalledWith(playerId, teamId);
    });
  }
  it('waits for acknowledgement and displays explicit failures', async () => {
    let complete;
    const v = setup(teamId, 0, { updatePlayerManagement: vi.fn(() => new Promise(resolve => { complete = resolve; })) });
    fireEvent.click(v.getByRole('button', { name: 'Let Walk', exact: true }));
    expect(v.queryByRole('status')).toBeNull();
    complete({ type: 'ERROR', payload: { message: 'Save failed. Retry.' } });
    await waitFor(() => expect(v.getByRole('status').textContent).toBe('Save failed. Retry.'));
    expect(v.container.textContent).not.toContain('Test Quarterback: Let Walk.');
  });
  it('reports a committed extension truthfully when saving its history fails', async () => {
    const v = setup(teamId, 0, { updateFranchiseChronicle: vi.fn(async () => { throw new Error('History write failed'); }) });
    fireEvent.click(v.getByRole('button', { name: 'Extend', exact: true }));
    fireEvent.click(v.getByRole('button', { name: 'Confirm extension' }));
    await waitFor(() => expect(v.getByRole('status').textContent).toContain('extension accepted, but history could not be saved'));
  });
  it('displays rejected extensions and tag errors', async () => {
    const v = setup(teamId, 'opaque', { extendContract: vi.fn(async () => ({ payload: { status: 'declined', reason: 'Cap room short' } })), applyFranchiseTag: vi.fn(async () => { throw new Error('Tag failed. Retry.'); }) });
    fireEvent.click(v.getByRole('button', { name: 'Extend', exact: true }));
    fireEvent.click(v.getByRole('button', { name: 'Confirm extension' }));
    await waitFor(() => expect(v.getByRole('status').textContent).toBe('Cap room short'));
    expect(v.actions.updatePlayerManagement).not.toHaveBeenCalled();
    fireEvent.click(v.getByRole('button', { name: 'Use franchise tag' }));
    await waitFor(() => expect(v.getByRole('status').textContent).toBe('Tag failed. Retry.'));
  });
});
