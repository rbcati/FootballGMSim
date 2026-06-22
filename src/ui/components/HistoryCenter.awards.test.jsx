/** @vitest-environment jsdom */
/**
 * HistoryCenter.awards.test.jsx — Awards & Honors Expansion V2 awards panel.
 */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import HistoryCenter from './HistoryCenter.jsx';

afterEach(cleanup);

const AWARD_HISTORY = [
  {
    year: 2025,
    seasonId: 's1',
    awards: {
      MVP: { playerId: 'qb1', playerName: 'Star QB', teamAbbr: 'AAA', pos: 'QB', score: 320 },
      OPOY: { playerId: 'rb1', playerName: 'Speed RB', teamAbbr: 'BBB', pos: 'RB' },
      DPOY: { playerId: 'dl1', playerName: 'Edge Pro', teamAbbr: 'AAA', pos: 'DL' },
      ORoy: null,
      DRoy: null,
      COY: null,
    },
    allPro: { firstTeam: [{ playerId: 'qb1' }, { playerId: 'dl1' }], secondTeam: [{ playerId: 'qb2' }] },
    proBowl: [{ playerId: 'qb1' }, { playerId: 'rb1' }],
    leaders: { passYd: { playerName: 'Star QB', teamAbbr: 'AAA', value: 5100 }, sacks: null },
  },
];

function openAwards() {
  fireEvent.click(screen.getByRole('tab', { name: 'Awards' }));
}

describe('HistoryCenter — Awards panel', () => {
  it('renders the awards summary for each recorded season', () => {
    render(<HistoryCenter league={{ awardHistory: AWARD_HISTORY }} />);
    openAwards();
    expect(screen.getByTestId('season-awards-panel')).toBeTruthy();
    expect(screen.getByTestId('season-awards-2025')).toBeTruthy();
    expect(screen.getAllByText(/Star QB/).length).toBeGreaterThan(0);
    expect(screen.getByText(/MVP:/)).toBeTruthy();
  });

  it('shows a safe empty state when awardHistory is missing', () => {
    render(<HistoryCenter league={{}} />);
    openAwards();
    expect(screen.getByTestId('season-awards-empty')).toBeTruthy();
  });

  it('does not crash when league is undefined', () => {
    expect(() => render(<HistoryCenter />)).not.toThrow();
    openAwards();
    expect(screen.getByTestId('season-awards-empty')).toBeTruthy();
  });

  it('tolerates malformed entries without crashing', () => {
    const messy = [null, {}, { year: 2030, awards: {}, allPro: {}, proBowl: [] }];
    expect(() => render(<HistoryCenter league={{ awardHistory: messy }} />)).not.toThrow();
    openAwards();
    expect(screen.getByTestId('season-awards-2030')).toBeTruthy();
  });
});
