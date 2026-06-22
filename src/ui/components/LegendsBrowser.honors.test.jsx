/** @vitest-environment jsdom */
/**
 * LegendsBrowser.honors.test.jsx — career honor counts (Awards & Honors V2).
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import LegendsBrowser from './LegendsBrowser.jsx';

afterEach(() => cleanup());

function makeRoh(overrides = {}) {
  return {
    id: 'p1',
    name: 'Dan Legend',
    position: 'QB',
    jerseyNumber: 10,
    yearsPlayedWithTeam: '2010–2020',
    totalPassingYards: 45000,
    accolades: ['MVP (2015)'],
    inductionYear: 2022,
    ...overrides,
  };
}

const AWARD_HISTORY = [
  {
    year: 2015,
    awards: { MVP: { playerId: 'p1' } },
    allPro: { firstTeam: [{ playerId: 'p1' }], secondTeam: [] },
    proBowl: [{ playerId: 'p1' }],
  },
  {
    year: 2016,
    awards: { MVP: { playerId: 'p1' } },
    allPro: { firstTeam: [{ playerId: 'p1' }], secondTeam: [] },
    proBowl: [{ playerId: 'p1' }],
  },
];

describe('LegendsBrowser — career honor counts', () => {
  it('renders honor count badges for the selected legend when award history matches', () => {
    render(<LegendsBrowser ringOfHonor={[makeRoh()]} awardHistory={AWARD_HISTORY} />);
    expect(screen.getByTestId('legend-career-honors')).toBeTruthy();
    // 2× MVP aggregated from the ledger
    expect(screen.getByTestId('honor-count-mvp').textContent).toContain('2×');
    expect(screen.getByTestId('honor-count-all-pro')).toBeTruthy();
    expect(screen.getByTestId('honor-count-pro-bowl')).toBeTruthy();
  });

  it('omits the honors panel when award history is absent (graceful degrade)', () => {
    render(<LegendsBrowser ringOfHonor={[makeRoh()]} />);
    expect(screen.queryByTestId('legend-career-honors')).toBeNull();
  });

  it('omits the honors panel when the legend earned no tracked honors', () => {
    render(<LegendsBrowser ringOfHonor={[makeRoh({ id: 'ghost' })]} awardHistory={AWARD_HISTORY} />);
    expect(screen.queryByTestId('legend-career-honors')).toBeNull();
  });

  it('does not crash on malformed award history', () => {
    const messy = [null, {}, { awards: null, allPro: null, proBowl: null }];
    expect(() => render(<LegendsBrowser ringOfHonor={[makeRoh()]} awardHistory={messy} />)).not.toThrow();
  });
});
