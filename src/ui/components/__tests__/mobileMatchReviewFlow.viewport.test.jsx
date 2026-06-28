/** @vitest-environment jsdom */
/**
 * Viewport assertions for the mobile Match Review flow.
 *
 * Runs the key structural guarantees at the three target mobile viewports:
 *   - 390×844 (iPhone 14/15)
 *   - 375×812 (iPhone X/11 Pro/12 mini)
 *   - 430×932 (iPhone 14/15 Pro Max)
 *
 * jsdom does not compute real layout, so these assert the structural
 * invariants that keep the result, score, and return action reachable without
 * scrolling and prevent the bottom nav from overlapping Game Book content:
 *   - HQ shows the compact post-sim strip, not a full Weekly Results center.
 *   - The Game Book exposes a sticky header (final score + return action).
 *   - The mobile bottom nav collapses during Game Book review and restores.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import LeagueDashboard from '../LeagueDashboard.jsx';

const baseLeague = {
  year: 2026,
  week: 10,
  seasonId: 's10',
  phase: 'regular',
  userTeamId: 10,
  ownerApproval: 58,
  teams: [
    { id: 10, city: 'Chicago', name: 'Bears', abbr: 'CHI', conf: 1, div: 0, wins: 6, losses: 3, ties: 0, ovr: 84, capRoom: 7, roster: [{ id: 1 }, { id: 2 }], recentResults: ['W', 'W', 'L', 'W'] },
    { id: 11, city: 'Detroit', name: 'Lions', abbr: 'DET', conf: 1, div: 0, wins: 5, losses: 4, ties: 0, ovr: 83, capRoom: 11, roster: [] },
  ],
  schedule: {
    weeks: [
      { week: 9, games: [{ id: 'g-9', home: { id: 11, abbr: 'DET' }, away: { id: 10, abbr: 'CHI' }, homeId: 11, awayId: 10, homeAbbr: 'DET', awayAbbr: 'CHI', homeScore: 20, awayScore: 23, played: true }] },
      { week: 10, games: [{ id: 'g-10', home: { id: 10, abbr: 'CHI' }, away: { id: 11, abbr: 'DET' }, played: false }] },
    ],
  },
  gameById: { 'g-9': { id: 'g-9', home: 11, away: 10, homeId: 11, awayId: 10, week: 9, played: true, homeScore: 20, awayScore: 23 } },
  newsItems: [{ id: 'n1', teamId: 10, headline: 'Starter upgraded to probable status.' }],
};

function setViewport(width, height) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
  window.matchMedia = (query) => {
    const match = /max-width:\s*(\d+)/.exec(query);
    const matches = match ? width <= Number(match[1]) : false;
    return { matches, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() };
  };
}

const VIEWPORTS = [
  { label: '390x844', width: 390, height: 844 },
  { label: '375x812', width: 375, height: 812 },
  { label: '430x932', width: 430, height: 932 },
];

describe('mobile Match Review flow — viewport assertions', () => {
  afterEach(() => {
    cleanup();
  });

  it.each(VIEWPORTS)('keeps result, sticky Game Book header, and uncluttered HQ at $label', async ({ width, height }) => {
    setViewport(width, height);
    render(
      <LeagueDashboard
        league={baseLeague}
        actions={{ getDashboardLeaders: vi.fn(() => Promise.resolve({ league: {}, team: {} })), getBoxScore: vi.fn() }}
        busy={false}
        simulating={false}
        onAdvanceWeek={() => {}}
      />,
    );

    const bottomBar = () => document.querySelector('.mobile-bottom-bar');

    // HQ is not dominated by stacked notices: a single compact post-sim strip,
    // and no full Weekly Results center embedded on HQ.
    expect(screen.getByTestId('hq-postsim-status-strip')).toBeTruthy();
    expect(screen.queryByTestId('weekly-results')).toBeNull();
    // Bottom nav present and not overlapping (not collapsed) on HQ.
    expect(bottomBar()).not.toBeNull();
    expect(bottomBar().classList.contains('is-collapsed')).toBe(false);

    // Open the Game Book from the last result affordance / film room.
    const seasonPulse = screen.getByTestId('season-pulse');
    fireEvent.click(within(seasonPulse).getByRole('button', { name: /open game book/i }));

    // Sticky Game Book header carries the final score + a return action above the fold.
    const stickyHeader = await screen.findByTestId('game-book-sticky-header');
    expect(stickyHeader).toBeTruthy();
    expect(screen.getByTestId('game-book-sticky-back')).toBeTruthy();
    expect(screen.getByTestId('game-book-sticky-score').textContent).toMatch(/\d/);

    // Bottom nav collapses so it cannot overlap Game Book review content.
    expect(bottomBar().classList.contains('is-collapsed')).toBe(true);

    // Return to HQ is reachable from the sticky header and restores the nav.
    fireEvent.click(screen.getByTestId('game-book-sticky-back'));
    expect(await screen.findByTestId('franchise-hq')).toBeTruthy();
    expect(bottomBar().classList.contains('is-collapsed')).toBe(false);
  });
});
