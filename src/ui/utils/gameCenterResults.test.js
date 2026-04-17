import { describe, expect, it } from 'vitest';
import { deriveCompactResultRecap, getGameLifecycleBucket, selectWeekGames } from './gameCenterResults.js';

describe('gameCenterResults helpers', () => {
  it('creates deterministic recap text for the same payload', () => {
    const payload = {
      awayScore: 24,
      homeScore: 20,
      summary: { storyline: 'Defense closed the final drive.' },
    };

    const first = deriveCompactResultRecap(payload, { awayTeam: { abbr: 'DAL' }, homeTeam: { abbr: 'PHI' } });
    const second = deriveCompactResultRecap(payload, { awayTeam: { abbr: 'DAL' }, homeTeam: { abbr: 'PHI' } });

    expect(first).toBe('Defense closed the final drive.');
    expect(second).toBe(first);
  });

  it('falls back to score-only text when archive detail is missing', () => {
    expect(deriveCompactResultRecap({ awayScore: 17, homeScore: 21 }, { awayTeam: { abbr: 'NYG' }, homeTeam: { abbr: 'WAS' } }))
      .toBe('WAS won by 4 (17-21).');
  });

  it('classifies completed, live, and upcoming games', () => {
    expect(getGameLifecycleBucket({ played: true })).toBe('completed');
    expect(getGameLifecycleBucket({ status: 'live' })).toBe('live');
    expect(getGameLifecycleBucket({})).toBe('upcoming');
  });

  it('loads games for the requested week when browsing results history', () => {
    const schedule = {
      weeks: [
        { week: 1, games: [{ gameId: '2026_w1_1_2' }] },
        { week: 2, games: [{ gameId: '2026_w2_2_3' }, { gameId: '2026_w2_1_3' }] },
      ],
    };
    expect(selectWeekGames(schedule, 1)).toHaveLength(1);
    expect(selectWeekGames(schedule, 2)).toHaveLength(2);
    expect(selectWeekGames(schedule, 3)).toHaveLength(0);
  });
});
