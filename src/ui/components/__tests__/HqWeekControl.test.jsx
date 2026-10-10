/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';
import { buildHqWeekControl } from '../../utils/hqCommandCenterV2.js';
import { validateLeagueTeamLegality } from '../../../core/teamValidation.js';

afterEach(cleanup);
const state = (count = 53) => ({ id: 's', year: 2026, seasonId: 'season', phase: 'regular', week: 2, userTeamId: 1,
  teams: [{ id: 1, name: 'Steelers', abbr: 'PIT', conf: 0, div: 1, roster: Array.from({ length: count }, (_, i) => ({ id: i + 1, teamId: 1, name: `Player ${i}`, pos: 'WR', contract: { baseAnnual: 1, years: 3 } })) }, { id: 2, abbr: 'CLE', roster: [] }],
  schedule: { weeks: [{ week: 2, games: [{ home: 1, away: 2, played: false }] }] } });

it.each(['roster', 'cap', 'contract'])('keeps a worker-rejected %s state visible, disabled, and actionable', (kind) => {
  const league = state(kind === 'roster' ? 54 : 53);
  if (kind === 'cap') league.teams[0].deadCap = 1000;
  if (kind === 'contract') delete league.teams[0].roster[0].contract;
  const errors = validateLeagueTeamLegality({ teams: league.teams, players: league.teams.flatMap((t) => t.roster), phase: league.phase }).issues.filter((issue) => issue.severity === 'error');
  expect(errors.length).toBeGreaterThan(0);
  const advance = vi.fn(); const navigate = vi.fn();
  render(<FranchiseHQ league={league} onAdvanceWeek={advance} onNavigate={navigate} />);
  const control = screen.getByTestId('hq-week-control');
  expect(screen.getByTestId('advance-week-cta').disabled).toBe(true);
  expect(control.textContent).toContain(errors[0].message);
  fireEvent.click(screen.getByTestId('advance-week-cta'));
  expect(advance).not.toHaveBeenCalled();
  fireEvent.click(within(control).getByRole('button', { name: /review/i }));
  expect(navigate).toHaveBeenCalled();
});

it.each([52, 54])('keeps Start Season blocked at %s players', (count) => {
  const league = { ...state(count), phase: 'preseason' };
  render(<FranchiseHQ league={league} />);
  expect(screen.getByRole('button', { name: /Start Season/ }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: count < 53 ? /Sign Players/ : /Run Final Cuts/ })).toBeTruthy();
});

it('does not make an underfilled regular-season roster a blocker when the worker does not reject it', () => {
  expect(buildHqWeekControl({ league: state(52) }).blocked).toBe(false);
});

it('keeps a mandatory event blocked with its existing decision path', () => {
  const advance = vi.fn();
  render(<FranchiseHQ league={{ ...state(), pendingWeeklyEvents: [{ state: 'pending' }] }} onAdvanceWeek={advance} />);
  expect(screen.getByTestId('advance-week-cta').disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Review Decision/ }));
  expect(advance).toHaveBeenCalledOnce();
});

it.each([[31, 14, true, 'W 31–14 vs CLE'], [24, 20, false, 'L 20–24 @ CLE'], [17, 17, true, 'T 17–17 vs CLE']])('opens the canonical last result %s-%s', (homeScore, awayScore, isHome, text) => {
  const league = state();
  league.schedule.weeks.unshift({ week: 1, games: [{ gameId: 'final-1', home: isHome ? 1 : 2, away: isHome ? 2 : 1, played: true, homeScore, awayScore }] });
  const open = vi.fn();
  render(<FranchiseHQ league={league} onOpenBoxScore={open} />);
  expect(screen.getByTestId('hq-last-result').textContent).toContain(text);
  fireEvent.click(screen.getByRole('button', { name: /View Game Book/ }));
  expect(open).toHaveBeenCalledWith('final-1');
});

it('does not invent a last score from an incomplete final or a fresh schedule', () => {
  const league = state();
  const view = render(<FranchiseHQ league={league} />);
  expect(screen.queryByTestId('hq-last-result')).toBeNull();
  league.schedule.weeks.unshift({ week: 1, games: [{ home: 1, away: 2, played: true }] });
  view.rerender(<FranchiseHQ league={{ ...league }} />);
  expect(screen.queryByTestId('hq-last-result')).toBeNull();
});

it('loads Game Book for an elapsed matchup whose schedule completion is stale', async () => {
  const league = state();
  league.schedule.weeks.unshift({ week: 1, games: [{ home: 1, away: 2, played: false }] });
  const actions = { getBoxScore: vi.fn().mockResolvedValue({ payload: { game: { homeId: 1, awayId: 2, homeScore: 31, awayScore: 14 } } }) };
  render(<FranchiseHQ league={league} actions={actions} />);
  expect(await screen.findByTestId('hq-last-result')).toHaveProperty('textContent', expect.stringContaining('W 31–14 vs CLE'));
  expect(actions.getBoxScore).toHaveBeenCalledExactlyOnceWith('season_w1_1_2');
});

it('does not let a previous save archive response populate a new franchise', async () => {
  const league = state();
  league.schedule.weeks.unshift({ week: 1, games: [{ home: 1, away: 2, played: false }] });
  let resolveOld;
  const actions = { getBoxScore: vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue({ payload: { game: null } }) };
  const view = render(<FranchiseHQ league={league} actions={actions} />);
  view.rerender(<FranchiseHQ league={{ ...state(), id: 'new-save', week: 1 }} actions={actions} />);
  await act(async () => resolveOld({ payload: { game: { homeId: 1, awayId: 2, homeScore: 31, awayScore: 14 } } }));
  expect(screen.queryByTestId('hq-last-result')).toBeNull();
});

it('retains every HQ content section and canonical quick destination', () => {
  const navigate = vi.fn();
  render(<FranchiseHQ league={state()} onNavigate={navigate} />);
  for (const id of ['hq-next-action', 'hq-week-control', 'hq-division-card', 'hq-team-strength', 'hq-yardage-leaders', 'hq-next-game']) expect(screen.getByTestId(id)).toBeTruthy();
  for (const label of ['TEAM LEADERS', 'LEAGUE LEADERS', 'TEAM', 'OFF', 'DEF', 'SPEC', 'More Prep']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  for (const [label, destination] of [['Lineup', 'Team:Lineup'], ['Game Plan', 'Game Plan'], ['Injuries', 'Team:Injuries'], ['Stats', 'Stats']]) {
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Quick actions' })).getByRole('button', { name: label }));
    expect(navigate).toHaveBeenLastCalledWith(destination);
  }
});
