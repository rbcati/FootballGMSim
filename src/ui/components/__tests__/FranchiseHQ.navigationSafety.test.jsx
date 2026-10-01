/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FranchiseHQ from '../FranchiseHQ.jsx';

vi.mock('../../utils/advanceReadinessGate.js', () => ({
  buildAdvanceReadinessGate: () => ({ riskItems: [{ id: 'status-only', severity: 'warning', label: 'Status without a destination' }] }),
}));
afterEach(cleanup);

it('keeps a risk without a fix destination static in NEXT UP and collapsed More Prep', () => {
  const onNavigate = vi.fn();
  const onAdvanceWeek = vi.fn();
  render(<FranchiseHQ league={{ id: 'save', phase: 'regular', userTeamId: 1, teams: [{ id: 1, roster: [] }] }} onNavigate={onNavigate} onAdvanceWeek={onAdvanceWeek} />);
  const more = screen.getByText('More Prep').closest('details');
  expect(more.hasAttribute('open')).toBe(false);
  fireEvent.click(screen.getByTestId('advance-week-cta'));
  fireEvent.click(screen.getByText('More Prep'));
  const status = within(more).getByRole('button');
  expect(status.disabled).toBe(true);
  fireEvent.click(status);
  expect(onNavigate).not.toHaveBeenCalled();
  expect(onAdvanceWeek).not.toHaveBeenCalled();
});
