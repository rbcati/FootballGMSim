import { describe, expect, it } from 'vitest';
import {
  getSafeLeagueLeaderCategories,
  getSafePhaseContext,
  getSafeStandingsRows,
  safeGetLeagueState,
} from './selectors.js';

describe('state selectors safety', () => {
  it('normalizes partial league payloads', () => {
    const safe = safeGetLeagueState({ phase: null, teams: null, schedule: null });
    expect(Array.isArray(safe.teams)).toBe(true);
    expect(Array.isArray(safe.schedule.weeks)).toBe(true);
    expect(safe.phase).toBe('regular');
  });

  it('returns default standings rows without throwing on missing stats', () => {
    const rows = getSafeStandingsRows({
      teams: [{ id: 1, name: 'Test', abbr: 'TST', conf: 'AFC', div: 'East' }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].wins).toBe(0);
    expect(rows[0].recentResults).toEqual([]);
  });

  it('returns phase-safe context defaults', () => {
    const context = getSafePhaseContext(null);
    expect(context.phase).toBe('regular');
    expect(context.hasSchedule).toBe(false);
  });

  it('normalizes missing leader categories into empty arrays', () => {
    const categories = getSafeLeagueLeaderCategories({ passing: { passYards: null } });
    expect(Array.isArray(categories.passing.passYards)).toBe(true);
    expect(categories.passing.passYards).toEqual([]);
  });
});
