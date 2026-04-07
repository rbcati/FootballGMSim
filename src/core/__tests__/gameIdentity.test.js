import { describe, it, expect } from 'vitest';
import { buildCanonicalGameId, buildArchivedGame } from '../gameIdentity.js';

describe('game identity helpers', () => {
  it('creates canonical ids shared across sim/watch flows', () => {
    expect(buildCanonicalGameId({ seasonId: '2030', week: 3, homeId: 8, awayId: 2 })).toBe('2030_w3_8_2');
  });

  it('archives minimal completed game payload for partial box scores', () => {
    const archived = buildArchivedGame({ seasonId: '2030', week: 3, homeId: 8, awayId: 2, homeScore: 24, awayScore: 17 });
    expect(archived.id).toBe('2030_w3_8_2');
    expect(archived.stats).toBe(null);
    expect(archived.homeScore).toBe(24);
  });
});
