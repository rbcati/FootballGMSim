/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ScheduleCenter from '../ScheduleCenter.jsx';
import { saveGame } from '../../../core/archive/gameArchive.ts';

afterEach(() => { cleanup(); localStorage.clear(); });

it('shows worker archive finals despite a stale schedule and opens the existing Game Book', async () => {
  const gameId = 's1_w1_1_2';
  const schedule = { weeks: [{ week: 1, games: [{ home: 1, away: 2, gameId, played: false }] }, { week: 2, games: [] }] };
  const teams = [{ id: 1, name: 'Pittsburgh', abbr: 'PIT' }, { id: 2, name: 'Cleveland', abbr: 'CLE' }];
  // The async worker archive must also win over a disagreeing local cache.
  saveGame(gameId, { season: 's1', week: 1, homeId: 1, awayId: 2, homeScore: 3, awayScore: 7 });
  const actions = { getBoxScore: vi.fn().mockResolvedValue({ payload: { game: { gameId, homeId: 1, awayId: 2, homeScore: 31, awayScore: 14 } } }) };
  const onGameSelect = vi.fn();
  render(<ScheduleCenter schedule={schedule} teams={teams} currentWeek={2} userTeamId={1} seasonId="s1" league={{ id: 'save', phase: 'regular', week: 2, seasonId: 's1', teams, schedule }} actions={actions} onGameSelect={onGameSelect} />);
  fireEvent.click(screen.getByRole('button', { name: '← Previous' }));
  expect(await screen.findAllByText('31')).not.toHaveLength(0);
  expect(actions.getBoxScore).toHaveBeenCalledExactlyOnceWith(gameId);
  fireEvent.click(screen.getAllByRole('button', { name: /open box score|view result|game book/i })[0]);
  expect(onGameSelect).toHaveBeenCalledWith(gameId);
});
