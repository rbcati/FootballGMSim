/** @vitest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import History from './History.jsx';

describe('History', () => {
  it('renders empty states with no history', () => {
    render(<History league={{ seasonId: 2026, week: 1 }} />);
    expect(screen.getByText(/Season summaries will appear/i)).toBeTruthy();
    expect(screen.getByText(/Playoff history has not been recorded yet/i)).toBeTruthy();
  });
  it('renders added archive sections', () => {
    render(<History league={{ history: { seasons: [{ year: 2025, champion: { name: 'Sharks' }, standings: [{ id: 1, abbr: 'SHK', wins: 12, losses: 5 }], awards: { mvp: { name: 'MVP Guy' }, source: 'derived' }, playoffResults: [{ round: 'Final', winnerName: 'Sharks', loserName: 'Owls', result: '27-20' }], leaders: [{ playerId: 7, teamId: 1, name: 'Leader', teamAbbr: 'SHK', stats: { passYd: 4000 } }], warnings: ['partial archive'] }] } }} />);
    expect(screen.getAllByText('Sharks').length).toBeGreaterThan(0);
    expect(screen.getByText(/Derived from season stats/i)).toBeTruthy();
    expect(screen.getAllByText(/partial archive/i).length).toBeGreaterThan(0);
  });
  it('links call callbacks when ids exist', () => {
    const onNavigatePlayer = vi.fn();
    const onNavigateTeam = vi.fn();
    render(<History league={{ history: { seasons: [{ year: 2025, standings: [{ id: 1, abbr: 'SHK', wins: 12, losses: 5 }], leaders: [{ playerId: 7, teamId: 1, name: 'Leader', teamAbbr: 'SHK', stats: { passYd: 4000 } }] }] } }} onNavigatePlayer={onNavigatePlayer} onNavigateTeam={onNavigateTeam} />);
    const leaderButtons = screen.getAllByRole('button', { name: 'Leader' });
    const teamButtons = screen.getAllByRole('button', { name: 'SHK' });
    fireEvent.click(leaderButtons[leaderButtons.length - 1]);
    fireEvent.click(teamButtons[teamButtons.length - 1]);
    expect(onNavigatePlayer).toHaveBeenCalledWith(7);
    expect(onNavigateTeam).toHaveBeenCalledWith(1);
    expect(screen.getAllByTestId('history-scroll').length).toBeGreaterThan(3);
  });
});
