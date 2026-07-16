/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import AdvancedStats from '../AdvancedStats.jsx';

const playerStats = {
  home: {
    10: { name: 'Home Starter QB', pos: 'QB', stats: { passAtt: 33, passComp: 24, passYd: 288, passTD: 3, interceptions: 1 } },
    30: { name: 'Home RB', pos: 'RB', stats: { rushAtt: 18, rushYd: 96, rushTD: 1 } },
    40: { name: 'Home CB', pos: 'CB', stats: { tackles: 6, passesDefended: 2, interceptions: 1 } },
  },
  away: {
    20: { name: 'Away Starter QB', pos: 'QB', stats: { passAtt: 30, passComp: 18, passYd: 205, passTD: 1, interceptions: 2 } },
    50: { name: 'Away WR One Catch', pos: 'WR', stats: { targets: 1, receptions: 1, recYd: 14 } },
  },
};

const homeTeam = { id: 1, abbr: 'NYJ', name: 'Jets' };
const awayTeam = { id: 2, abbr: 'BAL', name: 'Ravens' };

describe('AdvancedStats — canonical Game Performance Grades', () => {
  afterEach(() => cleanup());

  it('uses no external-brand language (no "PFF" / "PFF-Style")', () => {
    const { container } = render(
      <AdvancedStats playerStats={playerStats} homeTeam={homeTeam} awayTeam={awayTeam} userTeamId={1} />,
    );
    expect(container.textContent).not.toMatch(/PFF/i);
    expect(container.textContent).toMatch(/Game Performance Grades/i);
  });

  it('never labels a value as "snaps"', () => {
    const { container } = render(
      <AdvancedStats playerStats={playerStats} homeTeam={homeTeam} awayTeam={awayTeam} userTeamId={1} />,
    );
    expect(container.textContent).not.toMatch(/snap/i);
  });

  it('defaults to the user team and tags every row with a team', () => {
    render(
      <AdvancedStats playerStats={playerStats} homeTeam={homeTeam} awayTeam={awayTeam} userTeamId={2} />,
    );
    // User is BAL (away) → default view shows BAL players only.
    const rows = screen.getAllByTestId('grade-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('data-team')).toBe('BAL');
      expect(within(row).getByTestId('grade-team-tag').textContent).toBe('BAL');
    }
  });

  it('lets the user switch to the opponent and to All players', () => {
    render(
      <AdvancedStats playerStats={playerStats} homeTeam={homeTeam} awayTeam={awayTeam} userTeamId={1} />,
    );
    // Default: user is NYJ (home).
    let rows = screen.getAllByTestId('grade-row');
    expect(rows.every((r) => r.getAttribute('data-team') === 'NYJ')).toBe(true);

    // Switch to opponent BAL.
    fireEvent.click(screen.getByText('BAL'));
    rows = screen.getAllByTestId('grade-row');
    expect(rows.every((r) => r.getAttribute('data-team') === 'BAL')).toBe(true);

    // Switch to All — both teams appear (offense side).
    fireEvent.click(screen.getByText('All'));
    rows = screen.getAllByTestId('grade-row');
    const teams = new Set(rows.map((r) => r.getAttribute('data-team')));
    expect(teams.has('NYJ')).toBe(true);
    expect(teams.has('BAL')).toBe(true);
  });

  it('marks a one-catch receiver as Limited sample rather than Star/Elite', () => {
    render(
      <AdvancedStats playerStats={playerStats} homeTeam={homeTeam} awayTeam={awayTeam} userTeamId={2} />,
    );
    const row = screen.getAllByTestId('grade-row').find((r) => r.textContent.includes('Away WR One Catch'));
    expect(row).toBeTruthy();
    expect(row.getAttribute('data-limited')).toBe('1');
    expect(row.textContent).toMatch(/Limited sample/i);
    expect(row.textContent).not.toMatch(/Elite|Star/);
  });

  it('shows an honest unavailable state when canonical stats are missing', () => {
    render(<AdvancedStats playerStats={null} homeTeam={homeTeam} awayTeam={awayTeam} userTeamId={1} />);
    expect(screen.getByTestId('grades-unavailable')).toBeTruthy();
  });

  it('shows only one QB per team (no three-QB rotation)', () => {
    render(
      <AdvancedStats playerStats={playerStats} homeTeam={homeTeam} awayTeam={awayTeam} userTeamId={1} />,
    );
    const qbRows = screen.getAllByTestId('grade-row').filter((r) => r.getAttribute('data-pos') === 'QB');
    expect(qbRows).toHaveLength(1);
  });
});
