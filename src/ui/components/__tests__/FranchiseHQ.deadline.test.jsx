/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';

afterEach(cleanup);

const BASE_ACTIONS = {};

function makeLeague(week, extraProps = {}) {
  return {
    year: 2026,
    week,
    phase: 'regular',
    userTeamId: 1,
    ownerApproval: 60,
    teams: [
      { id: 1, name: 'Bears', abbr: 'CHI', conf: 1, div: 0, wins: 5, losses: 4, ties: 0, ovr: 80, offenseRating: 78, defenseRating: 79, capRoom: 10, roster: [] },
      { id: 2, name: 'Lions', abbr: 'DET', conf: 1, div: 0, wins: 4, losses: 5, ties: 0, ovr: 77, offenseRating: 75, defenseRating: 76, capRoom: 12, roster: [] },
    ],
    schedule: { weeks: [] },
    incomingTradeOffers: [],
    newsItems: [],
    leaguePulse: [],
    weeklyHeadlines: [],
    tradeWindowOpen: week <= 10,
    ...extraProps,
  };
}

describe('HQDeadlineBanner visibility', () => {
  it('is NOT rendered for week 5 (pre-tension)', () => {
    render(<FranchiseHQ league={makeLeague(5)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    expect(screen.queryByTestId('hq-deadline-banner')).toBeNull();
  });

  it('is NOT rendered for week 7 (one week before tension)', () => {
    render(<FranchiseHQ league={makeLeague(7)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    expect(screen.queryByTestId('hq-deadline-banner')).toBeNull();
  });

  it('renders amber state for week 8', () => {
    render(<FranchiseHQ league={makeLeague(8)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    const banner = screen.getByTestId('hq-deadline-banner');
    expect(banner).toBeTruthy();
    expect(banner.getAttribute('data-deadline-state')).toBe('amber');
  });

  it('renders amber state for week 9', () => {
    render(<FranchiseHQ league={makeLeague(9)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    const banner = screen.getByTestId('hq-deadline-banner');
    expect(banner.getAttribute('data-deadline-state')).toBe('amber');
  });

  it('renders crimson pulse state for week 10 (deadline week)', () => {
    render(<FranchiseHQ league={makeLeague(10)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    const banner = screen.getByTestId('hq-deadline-banner');
    expect(banner.getAttribute('data-deadline-state')).toBe('crimson');
  });

  it('is NOT rendered for week 11 (post-deadline)', () => {
    render(<FranchiseHQ league={makeLeague(11, { tradeWindowOpen: false })} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    expect(screen.queryByTestId('hq-deadline-banner')).toBeNull();
  });

  it('amber banner contains approaching warning text', () => {
    render(<FranchiseHQ league={makeLeague(8)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    const banner = screen.getByTestId('hq-deadline-banner');
    expect(banner.textContent).toMatch(/Trade Deadline Approaching|Week 10/i);
  });

  it('crimson banner contains DEADLINE WEEK text', () => {
    render(<FranchiseHQ league={makeLeague(10)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    const banner = screen.getByTestId('hq-deadline-banner');
    expect(banner.textContent).toMatch(/DEADLINE WEEK/i);
  });

  it('crimson banner mentions trade window closing', () => {
    render(<FranchiseHQ league={makeLeague(10)} onNavigate={() => {}} onAdvanceWeek={() => {}} busy={false} simulating={false} />);
    const banner = screen.getByTestId('hq-deadline-banner');
    expect(banner.textContent).toMatch(/trade window closes/i);
  });
});
