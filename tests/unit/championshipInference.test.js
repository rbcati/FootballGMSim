import { describe, it, expect } from 'vitest';
import { inferChampionshipOutcome, isChampionshipFinalGame } from '../../src/core/championshipInference.js';

describe('championshipInference', () => {
  it('resolves Super Bowl week 22 with playoffRound superbowl', () => {
    const seasonGames = [
      { id: 's1_w18_0_1', week: 18, homeId: 0, awayId: 1, homeScore: 21, awayScore: 17, isPlayoff: false },
      { id: 's1_w21_2_3', week: 21, homeId: 2, awayId: 3, homeScore: 24, awayScore: 20, isPlayoff: true, playoffRound: 'conference' },
      {
        id: 's1_w22_2_3',
        week: 22,
        homeId: 2,
        awayId: 3,
        homeScore: 31,
        awayScore: 28,
        isPlayoff: true,
        playoffRound: 'superbowl',
      },
    ];
    const out = inferChampionshipOutcome({ seasonGames, meta: {} });
    expect(out.championshipGame?.id).toBe('s1_w22_2_3');
    expect(out.championTeamId).toBe(2);
    expect(out.runnerUpTeamId).toBe(3);
  });

  it('does not treat conference final as championship when no final marker', () => {
    const seasonGames = [
      { id: 'g21', week: 21, homeId: 1, awayId: 2, homeScore: 20, awayScore: 17, isPlayoff: true, playoffRound: 'conference' },
    ];
    const out = inferChampionshipOutcome({ seasonGames, meta: {} });
    expect(out.championshipGame).toBe(null);
    expect(out.championTeamId).toBe(null);
    expect(out.runnerUpTeamId).toBe(null);
  });

  it('uses meta.championTeamId when no final game is present', () => {
    const out = inferChampionshipOutcome({
      seasonGames: [{ id: 'g18', week: 18, homeId: 1, awayId: 2, homeScore: 10, awayScore: 7, isPlayoff: false }],
      meta: { championTeamId: 7, runnerUpTeamId: 8 },
    });
    expect(out.championshipGame).toBe(null);
    expect(out.championTeamId).toBe(7);
    expect(out.runnerUpTeamId).toBe(8);
  });

  it('matches meta.championshipGameId to a stored game', () => {
    const seasonGames = [
      { id: 'sb1', week: 22, homeId: 0, awayId: 1, homeScore: 14, awayScore: 10, isPlayoff: true, playoffRound: 'superbowl' },
    ];
    const out = inferChampionshipOutcome({ seasonGames, meta: { championshipGameId: 'sb1' } });
    expect(out.championshipGame?.id).toBe('sb1');
    expect(out.championTeamId).toBe(0);
    expect(out.runnerUpTeamId).toBe(1);
  });

  it('isChampionshipFinalGame rejects regular-season week 18', () => {
    expect(isChampionshipFinalGame({ week: 18, homeScore: 1, awayScore: 0, isPlayoff: false })).toBe(false);
  });
});
