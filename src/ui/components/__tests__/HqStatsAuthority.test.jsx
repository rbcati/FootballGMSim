/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import FranchiseHQ from '../FranchiseHQ.jsx';

afterEach(cleanup);
it('requests all six canonical leaders after rollover despite an unplayed schedule snapshot', async () => {
  const category = (name) => [{ name, value: 123, playerId: name }];
  const leaders = { passing: category('Passing Leader'), rushing: category('Rushing Leader'), receiving: category('Receiving Leader') };
  const actions = { getDashboardLeaders: vi.fn().mockResolvedValue({ payload: { team: leaders, league: leaders } }) };
  render(<FranchiseHQ league={{ id: 'save', franchiseGenerationId: 'generation', year: 2026, seasonId: 's1', phase: 'regular', week: 2, userTeamId: 0, teams: [{ id: 0, name: 'Steelers', abbr: 'PIT', conf: 0, div: 1, roster: [] }], schedule: { weeks: [{ week: 1, games: [{ home: 0, away: 1, played: false }] }] } }} actions={actions} />);
  expect(actions.getDashboardLeaders).toHaveBeenCalledTimes(1);
  expect(await screen.findAllByText('123 yds')).toHaveLength(6);
  expect(screen.queryByText('Season leaders appear after games are played.')).toBeNull();
});
