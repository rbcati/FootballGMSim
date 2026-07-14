/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { buildWatchPostGameResult } from './App.jsx';

const homeTeam = { id: 1, abbr: 'HME', name: 'Home' };
const awayTeam = { id: 2, abbr: 'AWY', name: 'Away' };

describe('App watch-mode postgame result contract', () => {
  it('does not build a normal postgame result when scores are missing or partial', () => {
    for (const input of [
      { canonicalFinal: null, viewerScores: {} },
      { canonicalFinal: { home: null, away: null }, viewerScores: {} },
      { canonicalFinal: { home: '', away: '   ' }, viewerScores: {} },
      { canonicalFinal: null, viewerScores: { homeScore: 21, awayScore: null } },
    ]) {
      const result = buildWatchPostGameResult({
        ...input,
        homeTeam,
        awayTeam,
        userTeamId: homeTeam.id,
        week: 4,
        phase: 'regular',
        seasonId: '2031',
      });

      expect(result).toBeNull();
    }
  });

  it('does not create victory, defeat, tie, archive, or Game Book data without a strict final pair', () => {
    const result = buildWatchPostGameResult({
      canonicalFinal: null,
      viewerScores: {},
      homeTeam,
      awayTeam,
      userTeamId: homeTeam.id,
      week: 4,
      phase: 'regular',
      seasonId: '2031',
    });

    expect(result).toBeNull();
    expect(result?.homeScore).toBeUndefined();
    expect(result?.awayScore).toBeUndefined();
    expect(result?.gameId).toBeUndefined();
  });

  it('keeps a genuine canonical 0-0 as a trusted tie-capable result', () => {
    const result = buildWatchPostGameResult({
      canonicalFinal: { home: 0, away: 0 },
      viewerScores: {},
      homeTeam,
      awayTeam,
      userTeamId: homeTeam.id,
      week: 4,
      phase: 'regular',
      seasonId: '2031',
    });

    expect(result).toMatchObject({
      homeScore: 0,
      awayScore: 0,
      gameId: '2031_w4_1_2',
    });
    expect(result.homeScore).toBe(result.awayScore);
  });
});
