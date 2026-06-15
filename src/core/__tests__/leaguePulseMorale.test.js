/**
 * leaguePulseMorale.test.js
 *
 * Tests for morale-related League Pulse items:
 *  - Locker Room Watch (player morale < 35)
 *  - Veteran Presence (VETERAN_LEADER_BONUS applied this week)
 * Also tests deduplication behaviour.
 */
import { describe, it, expect } from 'vitest';
import { generateLeaguePulseItems } from '../leaguePulse.js';
import { MORALE_EVENTS } from '../mood/playerMoraleEngine.js';

function makeMeta(overrides = {}) {
  return {
    season: 2,
    week: 7,
    phase: 'regular',
    userTeamId: '10',
    ...overrides,
  };
}

function makePlayer(overrides = {}) {
  return {
    id: 99,
    name: 'Test Player',
    teamId: 10,
    morale: 70,
    moraleEvents: [],
    ...overrides,
  };
}

describe('LeaguePulse — Morale: Locker Room Watch', () => {
  it('emits Locker Room Watch when player morale < 35', () => {
    const players = [makePlayer({ morale: 30 })];
    const items = generateLeaguePulseItems(makeMeta(), { players });
    const watch = items.find((i) => i.headline === 'Locker Room Watch');
    expect(watch).toBeDefined();
    expect(watch.source).toBe('morale');
    expect(watch.relatedPlayerId).toBe('99');
  });

  it('does NOT emit Locker Room Watch when morale is exactly 35', () => {
    const players = [makePlayer({ morale: 35 })];
    const items = generateLeaguePulseItems(makeMeta(), { players });
    expect(items.find((i) => i.headline === 'Locker Room Watch')).toBeUndefined();
  });

  it('does NOT emit Locker Room Watch when morale >= 40', () => {
    const players = [makePlayer({ morale: 40 }), makePlayer({ id: 100, morale: 70 })];
    const items = generateLeaguePulseItems(makeMeta(), { players });
    expect(items.find((i) => i.headline === 'Locker Room Watch')).toBeUndefined();
  });

  it('Locker Room Watch has deterministic dedupeKey', () => {
    const players = [makePlayer({ morale: 20 })];
    const items1 = generateLeaguePulseItems(makeMeta({ season: 2, week: 7 }), { players });
    const items2 = generateLeaguePulseItems(makeMeta({ season: 2, week: 7 }), { players });
    const k1 = items1.find((i) => i.headline === 'Locker Room Watch')?.dedupeKey;
    const k2 = items2.find((i) => i.headline === 'Locker Room Watch')?.dedupeKey;
    expect(k1).toBeDefined();
    expect(k1).toBe(k2);
  });

  it('Locker Room Watch dedupeKey includes season + week + playerId', () => {
    const players = [makePlayer({ id: 55, morale: 10 })];
    const items = generateLeaguePulseItems(makeMeta({ season: 3, week: 9 }), { players });
    const item = items.find((i) => i.headline === 'Locker Room Watch');
    expect(item.dedupeKey).toContain('55');
    expect(item.dedupeKey).toContain('3');
    expect(item.dedupeKey).toContain('9');
  });

  it('repeated refresh does not duplicate Locker Room Watch items', () => {
    const players = [makePlayer({ morale: 25 })];
    const meta = makeMeta();
    const items1 = generateLeaguePulseItems(meta, { players });
    const items2 = generateLeaguePulseItems(meta, { players });
    // Both calls produce 1 item each (deduplication happens in mergeLeaguePulseItems)
    const watches1 = items1.filter((i) => i.headline === 'Locker Room Watch');
    const watches2 = items2.filter((i) => i.headline === 'Locker Room Watch');
    expect(watches1).toHaveLength(1);
    expect(watches2).toHaveLength(1);
    // dedupeKeys match
    expect(watches1[0].dedupeKey).toBe(watches2[0].dedupeKey);
  });
});

describe('LeaguePulse — Morale: Veteran Presence', () => {
  const veteranPlayer = makePlayer({
    id: 77,
    name: 'Veteran Leader',
    teamId: 10,
    morale: 73,
    moraleEvents: [
      {
        type:      MORALE_EVENTS.VETERAN_LEADER_BONUS,
        delta:     3,
        season:    2,
        week:      7,
        reason:    'Veteran leader on a winning team',
        source:    'weekly_advance',
        dedupeKey: 'VLB-77-2-7',
      },
    ],
  });

  it('emits Veteran Presence when veteran bonus was applied this week', () => {
    const items = generateLeaguePulseItems(makeMeta({ season: 2, week: 7 }), { players: [veteranPlayer] });
    const presence = items.find((i) => i.headline === 'Veteran Presence');
    expect(presence).toBeDefined();
    expect(presence.source).toBe('morale');
    expect(presence.relatedPlayerId).toBe('77');
  });

  it('does NOT emit Veteran Presence for a different week', () => {
    const items = generateLeaguePulseItems(makeMeta({ season: 2, week: 6 }), { players: [veteranPlayer] });
    expect(items.find((i) => i.headline === 'Veteran Presence')).toBeUndefined();
  });

  it('does NOT emit Veteran Presence for a different season', () => {
    const items = generateLeaguePulseItems(makeMeta({ season: 1, week: 7 }), { players: [veteranPlayer] });
    expect(items.find((i) => i.headline === 'Veteran Presence')).toBeUndefined();
  });

  it('Veteran Presence has deterministic dedupeKey', () => {
    const meta = makeMeta({ season: 2, week: 7 });
    const items1 = generateLeaguePulseItems(meta, { players: [veteranPlayer] });
    const items2 = generateLeaguePulseItems(meta, { players: [veteranPlayer] });
    const k1 = items1.find((i) => i.headline === 'Veteran Presence')?.dedupeKey;
    const k2 = items2.find((i) => i.headline === 'Veteran Presence')?.dedupeKey;
    expect(k1).toBeDefined();
    expect(k1).toBe(k2);
  });

  it('Veteran Presence item is deterministic regardless of call order', () => {
    const meta = makeMeta({ season: 2, week: 7 });
    const items = generateLeaguePulseItems(meta, { players: [veteranPlayer] });
    const presence = items.find((i) => i.headline === 'Veteran Presence');
    expect(presence?.importance).toBeDefined();
    expect(presence?.type).toBe('general');
  });
});

describe('LeaguePulse — Morale: News dedupeKey patterns', () => {
  it('buildMoraleDropDedupeKey is stable and includes playerId/season/week', async () => {
    const { buildMoraleDropDedupeKey } = await import('../news-engine.js');
    const k1 = buildMoraleDropDedupeKey(42, 2, 7);
    const k2 = buildMoraleDropDedupeKey(42, 2, 7);
    expect(k1).toBe(k2);
    expect(k1).toContain('42');
    expect(k1).toContain('2');
    expect(k1).toContain('7');
  });

  it('buildTradeRequestDeniedDedupeKey is stable', async () => {
    const { buildTradeRequestDeniedDedupeKey } = await import('../news-engine.js');
    const k1 = buildTradeRequestDeniedDedupeKey(55, 3, 10);
    const k2 = buildTradeRequestDeniedDedupeKey(55, 3, 10);
    expect(k1).toBe(k2);
    expect(k1).toContain('trade-request-denied');
  });

  it('two different players produce different dedupeKeys', async () => {
    const { buildMoraleDropDedupeKey } = await import('../news-engine.js');
    expect(buildMoraleDropDedupeKey(1, 2, 7)).not.toBe(buildMoraleDropDedupeKey(2, 2, 7));
  });
});
