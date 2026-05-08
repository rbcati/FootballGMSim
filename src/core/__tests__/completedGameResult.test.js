import { describe, expect, it } from 'vitest';
import {
  COMPLETED_GAME_RESULT_SCHEMA_VERSION,
  buildCompletedGameEnrichment,
  resolveWinnerTeamId,
} from '../completedGameResult.js';

describe('completedGameResult', () => {
  it('resolves winner and null on ties', () => {
    expect(resolveWinnerTeamId(1, 2, 24, 17)).toBe(1);
    expect(resolveWinnerTeamId(1, 2, 10, 31)).toBe(2);
    expect(resolveWinnerTeamId(1, 2, 14, 14)).toBeNull();
  });

  it('buildCompletedGameEnrichment attaches schema version, narrative, and performer snapshot', () => {
    const league = { seasonId: '2032', week: 5, phase: 'regular', year: 2032 };
    const homeBox = {
      qb1: {
        name: 'Passer',
        pos: 'QB',
        playerId: 'qb1',
        teamId: 1,
        stats: { passAtt: 30, passComp: 20, passYd: 265, passTD: 2, interceptions: 1 },
      },
    };
    const awayBox = {
      dl1: {
        name: 'Rusher',
        pos: 'DL',
        playerId: 'dl1',
        teamId: 2,
        stats: { sacks: 2, tackles: 5 },
      },
    };
    const out = buildCompletedGameEnrichment({
      league,
      gameData: { phase: 'regular', scoringSummary: [] },
      homeTeamId: 1,
      awayTeamId: 2,
      homeScore: 21,
      awayScore: 17,
      homeAbbr: 'HOM',
      awayAbbr: 'AWY',
      isPlayoff: false,
      teamStats: {
        home: { totalYards: 340, passYards: 265, turnovers: 1 },
        away: { totalYards: 280, passYards: 200, turnovers: 2 },
      },
      homeBox,
      awayBox,
      scoringSummary: [],
    });

    expect(out.resultSchemaVersion).toBe(COMPLETED_GAME_RESULT_SCHEMA_VERSION);
    expect(out.seasonId).toBe('2032');
    expect(out.week).toBe(5);
    expect(out.phase).toBe('regular');
    expect(out.winnerTeamId).toBe(1);
    expect(out.gameNarrative.length).toBeGreaterThan(0);
    expect(out.topPerformers?.offenseLabel).toContain('265');
    expect(out.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
