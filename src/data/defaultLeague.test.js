import { describe, it, expect } from 'vitest';
import { buildDefaultLeague } from './defaultLeague.ts';
import { validatePickOwnership, validateTradePickAssets } from '../core/trades/draftPickIntegrity.js';

describe('fallback draft calendar', () => {
  for (const year of [undefined, 2025, 2026, 2031]) {
    it(`creates starting-year and next-two-year assets for ${year ?? 'default'}`, () => {
      const league = buildDefaultLeague(year == null ? {} : { year });
      const start = year ?? 2026;
      const picks = league.teams.flatMap(team => team.picks);
      expect(league.year).toBe(start);
      expect(picks).toHaveLength(32 * 7 * 3);
      expect(new Set(picks.map(p => p.id)).size).toBe(picks.length);
      expect([...new Set(picks.map(p => p.season))]).toEqual([start, start + 1, start + 2]);
      expect(validatePickOwnership(league).valid).toBe(true);
      for (const team of league.teams) {
        for (const pick of team.picks) {
          expect(pick.id).toBe(`safe-pick-${team.id}-${pick.season}-${pick.round}`);
          expect(pick.originalOwner).toBe(team.id);
          expect(pick.currentOwner).toBe(team.id);
        }
        expect(validateTradePickAssets(league, team.picks.map(p => p.id), team.id).valid).toBe(true);
      }
    });
  }
});
