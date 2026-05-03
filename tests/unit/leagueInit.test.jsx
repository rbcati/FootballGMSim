/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { requestPlayableLeagueState, isPlayableLeagueState } from '../../src/state/leagueInit.ts';
import { buildDefaultLeague } from '../../src/data/defaultLeague.ts';
import SchedulePage from '../../src/ui/components/SchedulePage.jsx';

describe('league initialization', () => {
  it('isPlayableLeagueState validates expected shape', () => {
    const league = buildDefaultLeague();
    expect(isPlayableLeagueState(league)).toBe(true);
    expect(isPlayableLeagueState(null)).toBe(false);
    expect(isPlayableLeagueState({ ...league, teams: [] })).toBe(false);
    expect(isPlayableLeagueState({ ...league, schedule: { weeks: [] } })).toBe(false);
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
