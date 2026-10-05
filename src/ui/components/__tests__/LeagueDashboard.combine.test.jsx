/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import LeagueDashboard from '../LeagueDashboard.jsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('opens the existing combine on the Draft tab and advances with combine authority', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  const onAdvanceWeek = vi.fn();
  const actions = { advanceCombineWeek: vi.fn(), runCombineWorkout: vi.fn().mockResolvedValue({}) };
  const league = { id: 'save', phase: 'draft_combine', userTeamId: 1, teams: [{ id: 1, name: 'Team', roster: [] }], combineInvitesLeft: 6, combineProspects: [{ id: 100, name: 'Prospect', pos: 'QB' }] };
  render(<LeagueDashboard league={league} actions={actions} onAdvanceWeek={onAdvanceWeek} />);
  fireEvent.click(screen.getByRole('button', { name: /open draft combine/i }));
  expect(await screen.findByTestId('combine-header-amber')).toBeTruthy();
  expect(screen.getByText('Prospect')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /invite/i }));
  expect(actions.runCombineWorkout).toHaveBeenCalledWith(100);
  fireEvent.click(screen.getByRole('button', { name: /continue to draft/i }));
  expect(actions.advanceCombineWeek).toHaveBeenCalledTimes(1);
  expect(onAdvanceWeek).not.toHaveBeenCalled();
});
