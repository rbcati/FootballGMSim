/** @vitest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import HistoryCenter from './HistoryCenter.jsx';

afterEach(cleanup);

const LEDGER_ENTRIES = [
  {
    year: 2025,
    championTeamId: 3,
    championName: 'Eagles',
    runnerUpName: 'Chiefs',
    superBowlScore: '31-24',
    mvpName: 'Star QB',
    opoyName: 'Speed RB',
    dpoyName: 'Edge Pro',
  },
  {
    year: 2026,
    championTeamId: 7,
    championName: 'Ravens',
    runnerUpName: 'Packers',
    superBowlScore: '28-17',
    mvpName: 'Rifle Arm',
    opoyName: 'Zoom WR',
    dpoyName: 'Wall LB',
  },
];

const RECORD_BOOK = {
  singleGame: {
    passingYards: {
      id: 'p1', playerName: 'Star QB', position: 'QB',
      metricValue: 520, yearAchieved: 2025, teamNameAtTime: 'Eagles',
    },
    passingTds: null,
    rushingYards: null,
    sacks: {
      id: 'p2', playerName: 'Edge Pro', position: 'DE',
      metricValue: 4, yearAchieved: 2025, teamNameAtTime: 'Eagles',
    },
  },
  singleSeasonBests: {
    passingYards: {
      id: 'p1', playerName: 'Star QB', position: 'QB',
      metricValue: 5000, yearAchieved: 2025, teamNameAtTime: 'Eagles',
    },
    passingTds: null,
    rushingYards: null,
    sacks: null,
  },
};

describe('HistoryCenter', () => {
  it('renders the Honor Roll tab by default', () => {
    render(<HistoryCenter league={{ historyLedger: LEDGER_ENTRIES }} />);
    expect(screen.getByRole('tab', { name: 'Honor Roll' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Record Book' })).toBeTruthy();
    // Honor Roll content visible
    expect(screen.getByText('Eagles')).toBeTruthy();
    expect(screen.getByText('Chiefs')).toBeTruthy();
    expect(screen.getByText('31-24')).toBeTruthy();
  });

  it('renders ledger rows in the Honor Roll tab (newest first)', () => {
    render(<HistoryCenter league={{ historyLedger: LEDGER_ENTRIES }} />);
    const rows = screen.getAllByRole('row');
    // header + 2 data rows = 3 rows
    expect(rows.length).toBeGreaterThanOrEqual(3);
    // Newest first: 2026 should appear before 2025 in DOM
    const rowTexts = rows.map(r => r.textContent);
    const idx26 = rowTexts.findIndex(t => t.includes('2026'));
    const idx25 = rowTexts.findIndex(t => t.includes('2025'));
    expect(idx26).toBeLessThan(idx25);
  });

  it('highlights user champion cell when user team won', () => {
    render(
      <HistoryCenter
        league={{
          historyLedger: LEDGER_ENTRIES,
          userTeamId: 3, // Eagles 2025
        }}
      />,
    );
    const champCell = screen.getByTestId('user-champion-cell');
    expect(champCell).toBeTruthy();
    expect(champCell.textContent).toBe('Eagles');
  });

  it('does not highlight user champion cell when user team did not win', () => {
    render(
      <HistoryCenter
        league={{
          historyLedger: LEDGER_ENTRIES,
          userTeamId: 99,
        }}
      />,
    );
    expect(screen.queryByTestId('user-champion-cell')).toBeNull();
  });

  it('shows empty state when no history exists', () => {
    render(<HistoryCenter league={{ historyLedger: [] }} />);
    expect(screen.getByTestId('honor-roll-empty')).toBeTruthy();
  });

  it('renders Record Book tab when clicked', () => {
    render(<HistoryCenter league={{ historyLedger: LEDGER_ENTRIES, recordBook: RECORD_BOOK }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Record Book' }));
    expect(screen.getByTestId('single-game-records')).toBeTruthy();
    expect(screen.getByTestId('single-season-records')).toBeTruthy();
  });

  it('renders single-game record rows in Record Book tab', () => {
    render(<HistoryCenter league={{ historyLedger: [], recordBook: RECORD_BOOK }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Record Book' }));
    expect(screen.getAllByText('Passing Yards').length).toBeGreaterThan(0);
    expect(screen.getByText('520')).toBeTruthy();
    expect(screen.getAllByText(/Star QB/).length).toBeGreaterThan(0);
  });

  it('renders single-season record rows in Record Book tab', () => {
    render(<HistoryCenter league={{ historyLedger: [], recordBook: RECORD_BOOK }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Record Book' }));
    expect(screen.getByText('5000')).toBeTruthy();
  });

  it('renders safe dash for null record holders in Record Book', () => {
    render(<HistoryCenter league={{ historyLedger: [], recordBook: RECORD_BOOK }} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Record Book' }));
    // passingTds has null holder → should show '—' cells
    const dashCells = screen.getAllByText('—');
    expect(dashCells.length).toBeGreaterThan(0);
  });

  it('renders safely when league prop is undefined', () => {
    expect(() => render(<HistoryCenter />)).not.toThrow();
  });
});
