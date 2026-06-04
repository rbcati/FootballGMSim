import { describe, it, expect, beforeEach } from 'vitest';
import { cache } from '../cache.js';

describe('cache.restoreDirty', () => {
  beforeEach(() => {
    cache.reset();
    cache.hydrate({
      meta: { id: 'L1', currentSeasonId: 1 },
      teams: [{ id: 0, wins: 0 }, { id: 1, wins: 0 }],
      players: [{ id: 10, teamId: 0 }],
      draftPicks: [],
    });
  });

  it('re-marks a drained snapshot as dirty so a failed flush can retry', () => {
    cache.updateTeam(0, { wins: 1 });
    cache.updatePlayer(10, { teamId: 1 });
    expect(cache.isDirty()).toBe(true);

    // Simulate flushDirty's drain (clears flags) followed by a write failure.
    const snapshot = cache.drainDirty();
    expect(cache.isDirty()).toBe(false);

    cache.restoreDirty(snapshot);
    expect(cache.isDirty()).toBe(true);

    // The restored snapshot must still carry the same ids on the next drain.
    const redrained = cache.drainDirty();
    expect(redrained.teams).toContain(0);
    expect(redrained.players).toContain(10);
  });

  it('preserves the meta dirty flag through a restore', () => {
    cache.setMeta({ currentWeek: 5 });
    const snapshot = cache.drainDirty();
    expect(snapshot.meta).toBe(true);
    expect(cache.isDirty()).toBe(false);

    cache.restoreDirty(snapshot);
    expect(cache.isDirty()).toBe(true);
    expect(cache.drainDirty().meta).toBe(true);
  });

  it('is a no-op for an empty or invalid snapshot', () => {
    expect(cache.isDirty()).toBe(false);
    cache.restoreDirty(null);
    cache.restoreDirty({});
    expect(cache.isDirty()).toBe(false);
  });
});
