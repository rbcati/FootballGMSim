import { describe, it, expect, vi } from 'vitest';
import { openResolvedBoxScore } from './boxScoreAccess.js';

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
});
