/** @vitest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import HonorsCenter from './HonorsCenter.jsx';
import HistoryCenter from './HistoryCenter.jsx';

afterEach(cleanup);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_HONORS = {
  FIRST_TEAM_ALL_PRO: {
    QB: [{ playerId: 'p1', playerName: 'Star QB', teamAbbr: 'PHI', teamName: 'Eagles', pos: 'QB', prestigePos: 'QB', score: 600 }],
    RB: [{ playerId: 'p2', playerName: 'Speed RB', teamAbbr: 'BAL', teamName: 'Ravens', pos: 'RB', prestigePos: 'RB', score: 300 }],
    WR: [{ playerId: 'p3', playerName: 'Deep WR', teamAbbr: 'DAL', teamName: 'Cowboys', pos: 'WR', prestigePos: 'WR', score: 280 }],
    DL: [{ playerId: 'p4', playerName: 'Pass Rush DL', teamAbbr: 'GB', teamName: 'Packers', pos: 'DL', prestigePos: 'DL', score: 160 }],
  },
  SECOND_TEAM_ALL_PRO: {
    QB: [{ playerId: 'p5', playerName: 'Backup QB', teamAbbr: 'LAR', teamName: 'Rams', pos: 'QB', prestigePos: 'QB', score: 500 }],
    RB: [],
    WR: [],
    DL: [],
  },
  PRO_BOWL: {
    QB: [
      { playerId: 'p1', playerName: 'Star QB', teamAbbr: 'PHI', pos: 'QB', prestigePos: 'QB', score: 600 },
      { playerId: 'p6', playerName: 'Steady QB', teamAbbr: 'SF', pos: 'QB', prestigePos: 'QB', score: 400 },
    ],
    RB: [],
    WR: [],
    DL: [],
  },
};

// ── HonorsCenter unit tests ───────────────────────────────────────────────────

describe('HonorsCenter', () => {
  it('renders empty state when honors is null', () => {
    render(<HonorsCenter honors={null} />);
    expect(screen.getByTestId('honors-empty')).toBeTruthy();
  });

  it('renders empty state when honors is undefined', () => {
    render(<HonorsCenter />);
    expect(screen.getByTestId('honors-empty')).toBeTruthy();
  });

  it('renders honors center container when honors provided', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    expect(screen.getByTestId('honors-center')).toBeTruthy();
  });

  it('renders FIRST_TEAM_ALL_PRO badge', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    expect(screen.getByTestId('honor-badge-FIRST_TEAM_ALL_PRO')).toBeTruthy();
  });

  it('renders SECOND_TEAM_ALL_PRO badge', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    expect(screen.getByTestId('honor-badge-SECOND_TEAM_ALL_PRO')).toBeTruthy();
  });

  it('renders PRO_BOWL badge', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    expect(screen.getByTestId('honor-badge-PRO_BOWL')).toBeTruthy();
  });

  it('renders player names for First-Team All-Pro', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    expect(screen.getAllByText('Star QB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Speed RB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Deep WR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pass Rush DL').length).toBeGreaterThan(0);
  });

  it('renders team abbreviation for each honored player', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    expect(screen.getAllByText('PHI').length).toBeGreaterThan(0);
    expect(screen.getByText('BAL')).toBeTruthy();
  });

  it('renders rows for first-team QB position group', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    const qbRows = screen.getAllByTestId('honor-row-FIRST_TEAM_ALL_PRO-QB');
    expect(qbRows).toHaveLength(1);
  });

  it('renders score values', () => {
    render(<HonorsCenter honors={MOCK_HONORS} />);
    expect(screen.getAllByText('600.0').length).toBeGreaterThan(0);
  });

  it('does not crash with empty position groups', () => {
    const sparseHonors = { FIRST_TEAM_ALL_PRO: {}, SECOND_TEAM_ALL_PRO: {}, PRO_BOWL: {} };
    expect(() => render(<HonorsCenter honors={sparseHonors} />)).not.toThrow();
  });
});

// ── HistoryCenter + Honors tab integration ────────────────────────────────────

describe('HistoryCenter — Honors tab', () => {
  it('renders the Honors tab button', () => {
    render(<HistoryCenter league={{ historyLedger: [], currentSeasonHonors: MOCK_HONORS }} />);
    expect(screen.getByRole('tab', { name: 'Honors' })).toBeTruthy();
  });

  it('Honors tab is not active by default', () => {
    render(<HistoryCenter league={{ historyLedger: [], currentSeasonHonors: MOCK_HONORS }} />);
    const honorsTab = screen.getByRole('tab', { name: 'Honors' });
    expect(honorsTab.getAttribute('aria-selected')).toBe('false');
  });

  it('clicking Honors tab shows HonorsCenter content', () => {
    render(<HistoryCenter league={{ historyLedger: [], currentSeasonHonors: MOCK_HONORS }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Honors' }));
    expect(screen.getByTestId('honors-center')).toBeTruthy();
  });

  it('clicking Honors tab with null honors shows empty state', () => {
    render(<HistoryCenter league={{ historyLedger: [], currentSeasonHonors: null }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Honors' }));
    expect(screen.getByTestId('honors-empty')).toBeTruthy();
  });

  it('Honor Roll and Record Book tabs still work after Honors tab added', () => {
    const ledger = [{ year: 2025, championTeamId: 1, championName: 'Eagles', runnerUpName: 'Chiefs', superBowlScore: '31-24', mvpName: 'QB1' }];
    render(<HistoryCenter league={{ historyLedger: ledger, currentSeasonHonors: MOCK_HONORS }} />);
    // Honor Roll active by default
    expect(screen.getByText('Eagles')).toBeTruthy();
    // Switch to Honors
    fireEvent.click(screen.getByRole('tab', { name: 'Honors' }));
    expect(screen.getByTestId('honors-center')).toBeTruthy();
    // Switch back to Honor Roll
    fireEvent.click(screen.getByRole('tab', { name: 'Honor Roll' }));
    expect(screen.getByText('Eagles')).toBeTruthy();
  });

  it('renders safely when currentSeasonHonors is missing from league prop', () => {
    expect(() => render(<HistoryCenter league={{ historyLedger: [] }} />)).not.toThrow();
  });
});
