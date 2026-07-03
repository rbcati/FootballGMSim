import { describe, it, expect } from 'vitest';
import { getZeroStats, getZeroTeamStats } from '../../src/state/statsSchema.js';

// Quarantine guarantee: the stat schema is pure data, importable without a
// browser environment and without initializing any global state.

describe('statsSchema — getZeroStats', () => {
  it('is importable in a plain node environment without window/global state', () => {
    expect(typeof window).toBe('undefined');
    expect(globalThis.state).toBeUndefined();
    expect(typeof getZeroStats).toBe('function');
  });

  it('returns every tracked stat family zeroed', () => {
    const stats = getZeroStats();

    // One representative key per family — archival relies on these existing.
    expect(stats).toMatchObject({
      gamesPlayed: 0,
      passYd: 0,
      rushYd: 0,
      recYd: 0,
      tackles: 0,
      sacksAllowed: 0,
      fgMade: 0,
    });

    // Every value in the schema starts at exactly 0.
    for (const [key, value] of Object.entries(stats)) {
      expect(value, `stat ${key} must start at 0`).toBe(0);
    }
  });

  it('returns a fresh object per call (no shared mutable schema)', () => {
    const a = getZeroStats();
    const b = getZeroStats();
    expect(a).not.toBe(b);
    a.passYd = 300;
    expect(b.passYd).toBe(0);
  });

  it('matches the schema re-exported by the legacy state module', async () => {
    const legacy = await import('../../src/core/state.js');
    expect(legacy.getZeroStats).toBe(getZeroStats);
    expect(Object.keys(legacy.getZeroStats())).toEqual(Object.keys(getZeroStats()));
  });
});

describe('statsSchema — getZeroTeamStats', () => {
  it('returns the zeroed team schema', () => {
    const stats = getZeroTeamStats();
    expect(stats).toMatchObject({
      wins: 0, losses: 0, ties: 0,
      ptsFor: 0, ptsAgainst: 0,
      thirdDownAttempts: 0, redZoneTrips: 0,
    });
    for (const [key, value] of Object.entries(stats)) {
      expect(value, `team stat ${key} must start at 0`).toBe(0);
    }
  });
});
