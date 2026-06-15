/**
 * holdoutLeaguePulse.test.js — Holdout tension pulse item tests
 */
import { describe, it, expect } from 'vitest';
import { generateLeaguePulseItems } from '../leaguePulse.js';

function makeMeta(overrides = {}) {
  return {
    season: 2025,
    week: 5,
    phase: 'regular',
    userTeamId: '10',
    ...overrides,
  };
}

function makeHoldoutPlayer(teamId = 10, overrides = {}) {
  return {
    id: 99,
    name: 'Test Player',
    teamId,
    morale: 35,
    moraleEvents: [],
    holdout: {
      active: true,
      reason: 'extension_rejected',
      startWeek: 3,
      startSeason: 2025,
      demandPremium: 0.12,
      resolvedWeek: null,
      resolvedSeason: null,
      resolvedBy: null,
    },
    ...overrides,
  };
}

describe('LeaguePulse — Holdout Tension', () => {
  it('emits Locker Room Tension when user team has active holdout players', () => {
    const players = [makeHoldoutPlayer(10)];
    const items = generateLeaguePulseItems(makeMeta(), { players });
    const holdoutItem = items.find((i) => i.headline === 'Locker Room Tension');
    expect(holdoutItem).toBeDefined();
    expect(holdoutItem.source).toBe('holdout');
    expect(holdoutItem.importance).toBe(80);
  });

  it('does NOT emit Locker Room Tension when no active holdouts', () => {
    const players = [{ id: 1, teamId: 10, morale: 70, moraleEvents: [] }];
    const items = generateLeaguePulseItems(makeMeta(), { players });
    expect(items.find((i) => i.headline === 'Locker Room Tension')).toBeUndefined();
  });

  it('does NOT emit Locker Room Tension for opponent team holdouts', () => {
    const players = [makeHoldoutPlayer(99)]; // different team
    const items = generateLeaguePulseItems(makeMeta({ userTeamId: '10' }), { players });
    expect(items.find((i) => i.headline === 'Locker Room Tension')).toBeUndefined();
  });

  it('shows correct player count in body', () => {
    const players = [makeHoldoutPlayer(10), makeHoldoutPlayer(10, { id: 100 })];
    const items = generateLeaguePulseItems(makeMeta(), { players });
    const holdoutItem = items.find((i) => i.headline === 'Locker Room Tension');
    expect(holdoutItem?.body).toContain('2 players');
  });

  it('dedupeKey includes season and week', () => {
    const players = [makeHoldoutPlayer(10)];
    const items = generateLeaguePulseItems(makeMeta({ season: 2025, week: 5 }), { players });
    const holdoutItem = items.find((i) => i.headline === 'Locker Room Tension');
    expect(holdoutItem?.dedupeKey).toContain('2025');
    expect(holdoutItem?.dedupeKey).toContain('5');
  });

  it('does NOT emit Locker Room Tension when holdout.active = false', () => {
    const player = makeHoldoutPlayer(10, {
      holdout: { active: false, resolvedBy: 'gm_signed', resolvedSeason: 2025, resolvedWeek: 4, startWeek: 2, startSeason: 2025, demandPremium: 0 },
    });
    const items = generateLeaguePulseItems(makeMeta(), { players: [player] });
    expect(items.find((i) => i.headline === 'Locker Room Tension')).toBeUndefined();
  });
});
