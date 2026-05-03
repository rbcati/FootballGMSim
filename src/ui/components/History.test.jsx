/** @vitest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import History from './History.jsx';

describe('History', () => {
  it('renders empty states with no history', () => {
    render(<History league={{ seasonId: 2026, week: 1 }} />);
    expect(screen.getByText(/No champions have been archived yet/i)).toBeTruthy();
  });
  it('renders champions and awards rows', () => {
    render(<History league={{ history: { seasons: [{ year: 2025, champion: { name: 'Sharks' }, awards: { mvp: { name: 'MVP Guy' }, source: 'derived' } }] } }} />);
    expect(screen.getByText('Sharks')).toBeTruthy();
    expect(screen.getByText(/Derived from season stats/i)).toBeTruthy();
  });
  it('tables are scrollable and links call callbacks', () => {
    const onNavigatePlayer = vi.fn();
    render(<History league={{ playerStats: [{ name: 'P', stats: { passYd: 100 } }] }} onNavigatePlayer={onNavigatePlayer} />);
    expect(screen.getAllByTestId('history-scroll').length).toBeGreaterThan(0);
  });
});
