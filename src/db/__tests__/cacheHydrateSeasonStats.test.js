import { describe, it, expect, beforeEach } from 'vitest';
import { cache } from '../cache.js';

/**
 * Regression for the persisted save/load League-Stats path (PR #1626 review).
 *
 * hydrate() clears _seasonStats and only restores meta/teams/players/draftPicks.
 * cache.hydrateSeasonStats() backfills the persisted current-season rows so
 * view-model consumers see real totals after a reload instead of zero leaders.
 */
describe('cache.hydrateSeasonStats', () => {
  beforeEach(() => {
    cache.reset();
    cache.hydrate({
      meta: { id: 'L1', currentSeasonId: 2026 },
      teams: [{ id: 1, wins: 1 }],
      players: [{ id: 'qb1', teamId: 1 }],
      draftPicks: [],
    });
  });

  it('starts empty after hydrate (the bug precondition)', () => {
    expect(cache.getSeasonStat('qb1')).toBeNull();
    expect(cache.getAllSeasonStats()).toHaveLength(0);
  });

  it('restores persisted DB rows so totals are readable again', () => {
    cache.hydrateSeasonStats([
      { playerId: 'qb1', teamId: 1, seasonId: 2026, totals: { passYd: 305, passTD: 3, gamesPlayed: 1 } },
    ]);
    const entry = cache.getSeasonStat('qb1');
    expect(entry).toBeTruthy();
    expect(entry.totals.passYd).toBe(305);
    expect(entry.teamId).toBe(1);
  });

  it('looks up restored rows by string OR numeric id', () => {
    cache.hydrateSeasonStats([{ playerId: 7, totals: { rushYd: 88 } }]);
    expect(cache.getSeasonStat(7).totals.rushYd).toBe(88);
    expect(cache.getSeasonStat('7').totals.rushYd).toBe(88);
  });

  it('does not clobber a fresher in-memory entry', () => {
    cache.updateSeasonStat('qb1', 1, { passYd: 400 }); // live, freshest
    cache.hydrateSeasonStats([{ playerId: 'qb1', totals: { passYd: 1 } }]);
    expect(cache.getSeasonStat('qb1').totals.passYd).toBe(400);
  });

  it('does not mark restored rows dirty (data came from the DB)', () => {
    cache.hydrateSeasonStats([{ playerId: 'qb1', totals: { passYd: 100 } }]);
    expect(cache.isDirty()).toBe(false);
  });

  it('tolerates malformed input without throwing', () => {
    expect(() => cache.hydrateSeasonStats(null)).not.toThrow();
    expect(() => cache.hydrateSeasonStats([null, undefined, {}, 42])).not.toThrow();
    expect(cache.getAllSeasonStats()).toHaveLength(0);
  });
});
