/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LeagueDashboard from '../LeagueDashboard.jsx';

const league = {
  year: 2026, week: 6, seasonId: 's6', phase: 'regular', userTeamId: 1,
  teams: [
    { id: 1, city: 'Chicago', name: 'Bears', abbr: 'CHI', wins: 3, losses: 2, roster: [], capRoom: 10 },
    { id: 2, city: 'Detroit', name: 'Lions', abbr: 'DET', wins: 4, losses: 1, roster: [] },
  ],
  schedule: { weeks: [{ week: 6, games: [{ id: 'g6', home: 1, away: 2, played: false }] }] },
  incomingTradeOffers: [], newsItems: [],
};

describe('LeagueDashboard + FranchiseHQ mobile shell', () => {
  afterEach(() => cleanup());

  it('owns one global app nav and one thumb-sized HQ primary action', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    render(
      <LeagueDashboard
        league={league}
        actions={{ send: vi.fn() }}
        onAdvanceWeek={vi.fn()}
        busy={false}
        simulating={false}
      />,
    );

    const globalNavs = document.querySelectorAll('[data-layout-owner="global-app-navigation"]');
    expect(globalNavs).toHaveLength(1);
    expect(screen.getAllByTestId('advance-week-cta')).toHaveLength(1);
    expect(document.querySelector('.app-hq-bottom-nav')).toBeNull();
    expect(globalNavs[0].classList.contains('premium-bottom-nav')).toBe(true);
    for (const label of ['HQ', 'Team', 'League', 'News', 'More']) {
      expect(globalNavs[0].querySelectorAll(`button[aria-label="${label}"]`)).toHaveLength(1);
    }
  });
});
