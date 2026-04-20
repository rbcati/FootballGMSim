import { describe, expect, it } from 'vitest';
import { coerceLeaderboardSelection } from './leaderboardFilters.js';

describe('coerceLeaderboardSelection', () => {
  const categories = {
    passing: { passYards: [{ playerId: 1 }], passTDs: [] },
    rushing: { rushYards: [{ playerId: 2 }] },
  };

  it('keeps valid category and stat selection', () => {
    const out = coerceLeaderboardSelection({ categories, selection: { category: 'passing', statKey: 'passYards' } });
    expect(out.category).toBe('passing');
    expect(out.statKey).toBe('passYards');
  });

  it('falls back to first available category/stat when selection is stale', () => {
    const out = coerceLeaderboardSelection({ categories, selection: { category: 'defense', statKey: 'sacks' } });
    expect(out.category).toBe('passing');
    expect(out.statKey).toBe('passYards');
  });
});
