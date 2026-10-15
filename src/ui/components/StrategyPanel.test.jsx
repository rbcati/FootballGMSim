// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import StrategyPanel from './StrategyPanel.jsx';

afterEach(cleanup);
it('selects legacy scheme labels while leaving stored identifiers intact', async () => {
  const strategies = Object.freeze({ offSchemeId: 'Vertical', defSchemeId: '3-4 Blitz' });
  const actions = { getRoster: vi.fn(async () => ({ payload: { players: [] } })), send: vi.fn() };
  const view = render(<StrategyPanel league={{ userTeamId: 1, teams: [{ id: 1, strategies }] }} actions={actions} />);
  expect(view.getByRole('button', { name: /Vertical \/ Air Raid/ }).className).toContain('btn-primary');
  expect(view.getByRole('button', { name: /3-4 Blitz/ }).className).toContain('btn-primary');
  await waitFor(() => expect(actions.getRoster).toHaveBeenCalled());
  expect(actions.send).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: /Smashmouth/ }));
  await waitFor(() => expect(actions.send).toHaveBeenCalledWith('UPDATE_STRATEGY', expect.objectContaining({
    offSchemeId: 'SMASHMOUTH', defSchemeId: '3-4 Blitz',
  })));
  expect(strategies).toEqual({ offSchemeId: 'Vertical', defSchemeId: '3-4 Blitz' });
});
