/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import {
  getBootViewStateValidation,
  getPlayableLeagueValidation,
  requestPlayableLeagueState,
  isPlayableLeagueState,
} from '../../src/state/leagueInit.ts';
import { buildDefaultLeague } from '../../src/data/defaultLeague.ts';
import SchedulePage from '../../src/ui/components/SchedulePage.jsx';

describe('league initialization', () => {
  it('boot-view validation accepts worker view state without full sim data', () => {
    const viewState = {
      activeLeagueId: 'save_slot_1',
      phase: 'regular',
      week: 1,
      year: 2026,
      userTeamId: 0,
      teams: [{ id: 0, abbr: 'BUF' }, { id: 1, abbr: 'MIA' }],
    };
    expect(getBootViewStateValidation(viewState).valid).toBe(true);
    expect(getPlayableLeagueValidation(viewState).valid).toBe(false);
  });

  it('isPlayableLeagueState validates expected shape', () => {
    const league = buildDefaultLeague();
    expect(isPlayableLeagueState(league)).toBe(true);
    expect(isPlayableLeagueState(null)).toBe(false);
    expect(isPlayableLeagueState({ ...league, teams: [] })).toBe(false);
    expect(isPlayableLeagueState({ ...league, schedule: { weeks: [] } })).toBe(false);
    expect(getPlayableLeagueValidation({
      ...league,
      teams: league.teams.map(({ roster, ...team }) => team),
    }).valid).toBe(false);
  });

  it('default safe starter league has required football roster positions and scheduled games', () => {
    const league = buildDefaultLeague({ userTeamId: 3 });
    const requiredPositions = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'];
    const userTeam = league.teams.find((team) => team.id === 3);
    expect(userTeam).toBeTruthy();
    for (const pos of requiredPositions) {
      expect(userTeam.roster.some((player) => player.pos === pos)).toBe(true);
    }
    expect(league.schedule.weeks.length).toBeGreaterThanOrEqual(1);
    expect(league.schedule.weeks[0].games.every((game) => game.id && game.home != null && game.away != null)).toBe(true);
    expect(league.schedule.weeks[0].games[0].gameId).toMatch(/^s1_w1_\d+_\d+$/);
  });

  it('uses API league when response is valid', async () => {
    const apiLeague = buildDefaultLeague();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ league: apiLeague }),
    });

    const result = await requestPlayableLeagueState({ userTeamId: 0 }, fetchMock);

    expect(result.source).toBe('api');
    expect(isPlayableLeagueState(result.league)).toBe(true);
  });

  it('falls back to default league when API fails/invalid', async () => {
    const downMock = vi.fn().mockRejectedValue(new Error('network down'));
    const down = await requestPlayableLeagueState({ userTeamId: 0 }, downMock);
    expect(down.source).toBe('fallback');
    expect(isPlayableLeagueState(down.league)).toBe(true);

    const invalidMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ league: { phase: 'regular' } }) });
    const invalid = await requestPlayableLeagueState({ userTeamId: 0 }, invalidMock);
    expect(invalid.source).toBe('fallback');
    expect(isPlayableLeagueState(invalid.league)).toBe(true);
  });

  it('schedule page exposes real actions without placeholder copy', () => {
    const league = buildDefaultLeague();
    const onAdvanceWeek = vi.fn();
    render(<SchedulePage league={league} onAdvanceWeek={onAdvanceWeek} />);
    expect(screen.getAllByRole('button', { name: /advance week/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/feature coming soon/i)).toBeNull();
  });
});
