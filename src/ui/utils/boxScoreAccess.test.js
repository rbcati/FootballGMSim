import { describe, it, expect, vi } from 'vitest';
import { buildCompletedGamePresentation, openResolvedBoxScore } from './boxScoreAccess.js';

describe('box score access clickthrough', () => {
  it('opens completed game scores when archive quality is available', () => {
    const onOpen = vi.fn();
    const game = {
      gameId: '2026_w7_1_2',
      played: true,
      homeId: 1,
      awayId: 2,
      homeScore: 24,
      awayScore: 17,
      summary: { storyline: 'Test game' },
    };

    const opened = openResolvedBoxScore(game, { seasonId: '2026', week: 7, source: 'unit_test' }, onOpen);
    expect(opened).toBe(true);
    expect(onOpen).toHaveBeenCalledWith('2026_w7_1_2');
  });

  it('still opens completed game scores when detailed archive is missing', () => {
    const onOpen = vi.fn();
    const game = {
      gameId: '2026_w8_3_4',
      played: true,
      homeId: 3,
      awayId: 4,
      homeScore: 13,
      awayScore: 10,
    };

    const opened = openResolvedBoxScore(game, { seasonId: '2026', week: 8, source: 'unit_test' }, onOpen);
    expect(opened).toBe(true);
    expect(onOpen).toHaveBeenCalledWith('2026_w8_3_4');
  });

  it('labels score-only and partial detail using Game Book view-model quality', () => {
    const scoreOnly = buildCompletedGamePresentation({
      gameId: '2026_w8_3_4',
      played: true,
      homeId: 3,
      awayId: 4,
      homeScore: 13,
      awayScore: 10,
    }, { seasonId: '2026', week: 8 });
    const driveOnly = buildCompletedGamePresentation({
      gameId: '2026_w9_3_4',
      played: true,
      homeId: 3,
      awayId: 4,
      homeScore: 20,
      awayScore: 17,
      driveSummary: [{ teamId: 3, quarter: 4, result: 'FG', points: 3 }],
    }, { seasonId: '2026', week: 9 });

    expect(scoreOnly.archiveQuality).toBe('score');
    expect(scoreOnly.statusLabel).toBe('Score only');
    expect(driveOnly.archiveQuality).toBe('partial');
    expect(driveOnly.statusLabel).toBe('Partial detail');
  });

  it('does not open pending or partial score rows via nullable/blank coercion', () => {
    const onOpen = vi.fn();
    const pendingRows = [
      { gameId: '2026_w1_1_2', played: true, homeId: 1, awayId: 2, homeScore: null, awayScore: null },
      { gameId: '2026_w1_1_2', played: true, homeId: 1, awayId: 2, homeScore: '', awayScore: '   ' },
      { gameId: '2026_w1_1_2', played: true, homeId: 1, awayId: 2, homeScore: 17, awayScore: null },
      { gameId: '2026_w1_1_2', played: false, homeId: 1, awayId: 2, homeScore: 0, awayScore: 0 },
    ];

    for (const game of pendingRows) {
      const presentation = buildCompletedGamePresentation(game, { seasonId: '2026', week: 1 });
      expect(presentation.canOpen).toBe(false);
      expect(presentation.displayScoreLine).toBe('AWY — - — HME');
      expect(openResolvedBoxScore(game, { seasonId: '2026', week: 1 }, onOpen)).toBe(false);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });
});
