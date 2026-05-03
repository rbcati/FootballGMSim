/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { requestPlayableLeagueState } from '../../src/state/leagueInit.ts';
import { buildDefaultLeague } from '../../src/data/defaultLeague.ts';
import SchedulePage from '../../src/ui/components/SchedulePage.jsx';

describe('league initialization', () => {
  it('uses API league when response is valid', async () => {
    const apiLeague = {
      phase: 'regular',
      week: 1,
      userTeamId: 0,
      teams: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }],
      schedule: { weeks: [{ week: 1, games: [{ away: 0, home: 1, played: false }] }] },
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ league: apiLeague }),
    });

    const result = await requestPlayableLeagueState({ userTeamId: 0 }, fetchMock);

    expect(result.source).toBe('api');
    expect(result.league).toEqual(apiLeague);
  });

  it('falls back to default league when API fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await requestPlayableLeagueState({ userTeamId: 0 }, fetchMock);

    expect(result.source).toBe('fallback');
    expect(result.league.teams).toHaveLength(32);
    expect(result.league.schedule.weeks[0].games.length).toBeGreaterThan(0);
  });

  it('renders at least one game on schedule page', () => {
    const league = buildDefaultLeague();

    render(<SchedulePage league={league} />);

    expect(screen.getByTestId('schedule-page')).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
  });
});
