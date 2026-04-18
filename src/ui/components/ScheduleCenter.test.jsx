import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import ScheduleCenter, {
  getFilteredScheduleGames,
  getScheduleBuckets,
  getUpcomingGameOpenTarget,
} from './ScheduleCenter.jsx';

describe('ScheduleCenter', () => {
  const games = [
    { id: 'g1', home: 1, away: 2, played: false },
    { id: 'g2', home: 2, away: 3, played: true, homeScore: 21, awayScore: 17 },
    { gameId: 'g3', home: 3, away: 4, played: false },
  ];

  it('preserves schedule filter modes and status grouping', () => {
    expect(getFilteredScheduleGames({ games, viewMode: 'my_team', userTeamId: 1 })).toHaveLength(1);
    expect(getFilteredScheduleGames({ games, viewMode: 'selected_team', selectedTeamId: 3 })).toHaveLength(2);
    expect(getFilteredScheduleGames({ games, viewMode: 'all_week', scheduleModelGames: [games[1]] })).toHaveLength(1);

    expect(getScheduleBuckets(games, 'all').map((bucket) => bucket.key)).toEqual(['upcoming', 'completed']);
    expect(getScheduleBuckets(games, 'completed')[0].games).toHaveLength(1);
    expect(getScheduleBuckets(games, 'upcoming')[0].games).toHaveLength(2);
  });

  it('keeps game-open target behavior compatible for id and gameId payloads', () => {
    expect(getUpcomingGameOpenTarget(games[0])).toBe('g1');
    expect(getUpcomingGameOpenTarget(games[2])).toBe('g3');
    expect(getUpcomingGameOpenTarget({})).toBe(null);
  });

  it('renders safe empty state for partial saves without schedule', () => {
    const html = renderToString(
      <ScheduleCenter
        schedule={{}}
        teams={[{ id: 1, name: 'Dallas', abbr: 'DAL' }]}
        currentWeek={1}
        userTeamId={1}
        nextGameStakes={0}
        seasonId={'2026'}
        onGameSelect={() => {}}
        playoffSeeds={null}
        onTeamRoster={() => {}}
        league={{ week: 1 }}
        onPlayerSelect={() => {}}
      />,
    );

    expect(html).toContain('Schedule unavailable');
  });
});
