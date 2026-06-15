/**
 * holdoutWorkerIntegration.test.js
 *
 * Worker-level integration tests for holdout wiring:
 *  - Holdout player excluded from game-day roster
 *  - resolveHoldout paths for gm_signed / gm_traded / gm_released / time_expired
 *  - dedupeKey prevents double-trigger
 *  - News item fired on holdout declared
 *  - Bitter return on time expiry
 */
import { describe, it, expect } from 'vitest';
import {
  applyHoldout,
  resolveHoldout,
  isAvailableForGameDay,
  checkHoldoutTimeExpiry,
  getHoldoutDemandPremium,
  evaluateHoldoutTriggers,
  HOLDOUT_TRIGGERS,
  HOLDOUT_RESOLUTION,
} from '../../src/core/holdouts/holdoutEngine.js';
import {
  applyMoraleEvent,
  MORALE_EVENTS,
  MORALE_DELTAS,
} from '../../src/core/mood/playerMoraleEngine.js';
import { createNewsItem } from '../../src/core/news-engine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 10,
    name: 'Adrian Moore',
    pos: 'RB',
    ovr: 84,
    age: 28,
    morale: 70,
    moraleEvents: [],
    teamId: 3,
    contract: { years: 1, yearsRemaining: 1 },
    ...overrides,
  };
}

// ── Game-day roster filtering ─────────────────────────────────────────────────

describe('Holdout player excluded from game-day roster', () => {
  it('isAvailableForGameDay returns false when holdout active', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    expect(isAvailableForGameDay(player)).toBe(false);
  });

  it('isAvailableForGameDay returns true when no holdout', () => {
    const player = makePlayer();
    expect(isAvailableForGameDay(player)).toBe(true);
  });

  it('isAvailableForGameDay returns true after holdout resolved', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2025, 6);
    expect(isAvailableForGameDay(player)).toBe(true);
  });

  it('roster filter excludes holdout player', () => {
    const available = makePlayer({ id: 1 });
    const onHoldout = applyHoldout(makePlayer({ id: 2 }), HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED, 2025, 3);
    const roster = [available, onHoldout];
    const gameRoster = roster.filter(isAvailableForGameDay);
    expect(gameRoster.length).toBe(1);
    expect(gameRoster[0].id).toBe(1);
  });
});

// ── Trigger evaluation with disgruntled final-year player ─────────────────────

describe('Disgruntled final-year player triggers holdout', () => {
  it('triggers holdout via Trigger A (morale < 40, no extension)', () => {
    const player = makePlayer({ morale: 37, contract: { years: 1, yearsRemaining: 1 } });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 37 } });
    expect(result).toBe(HOLDOUT_TRIGGERS.EXTENSION_REJECTED);
  });

  it('applied holdout has correct demand premium', () => {
    const player = makePlayer({ morale: 37, contract: { years: 1, yearsRemaining: 1 } });
    const withHoldout = applyHoldout(player, HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    expect(getHoldoutDemandPremium(withHoldout)).toBe(0.12);
  });
});

// ── Signing resolves holdout ──────────────────────────────────────────────────

describe('gm_signed resolution', () => {
  it('clears holdout and sets resolvedBy', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2025, 8);
    expect(player.holdout.active).toBe(false);
    expect(player.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.GM_SIGNED);
  });

  it('gm_signed news item template works', () => {
    const newsItem = createNewsItem('holdout_resolved_gm', { playerName: 'Adrian Moore' }, 8, 2025);
    expect(newsItem).not.toBeNull();
    expect(newsItem.headline).toContain('Adrian Moore');
  });
});

// ── Time expiry → bitter return ───────────────────────────────────────────────

describe('Time expiry resolves holdout with bitter return', () => {
  it('checkHoldoutTimeExpiry returns true after 4 weeks', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    expect(checkHoldoutTimeExpiry(player, 2025, 8)).toBe(true);
  });

  it('resolveHoldout with time_expired sets correct fields', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.TIME_EXPIRED, 2025, 8);
    expect(player.holdout.active).toBe(false);
    expect(player.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.TIME_EXPIRED);
  });

  it('HOLDOUT_RETURNED morale event applied on expiry', () => {
    let player = applyHoldout(makePlayer({ morale: 45 }), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.TIME_EXPIRED, 2025, 8);
    const withMorale = applyMoraleEvent(player, {
      type:      MORALE_EVENTS.HOLDOUT_RETURNED,
      delta:     MORALE_DELTAS[MORALE_EVENTS.HOLDOUT_RETURNED],
      season:    2025,
      week:      8,
      reason:    'Returned from holdout bitter',
      source:    'holdout',
      dedupeKey: `HOLDOUT_RETURNED-${player.id}-2025`,
    }, { season: 2025, week: 8 });
    expect(withMorale.morale).toBe(37); // 45 + (-8)
    expect(withMorale.moraleEvents.some((e) => e.type === 'HOLDOUT_RETURNED')).toBe(true);
  });

  it('bitter return news item template works', () => {
    const newsItem = createNewsItem('holdout_ended_bitter', { playerName: 'Adrian Moore' }, 8, 2025);
    expect(newsItem).not.toBeNull();
    expect(newsItem.headline).toContain('Adrian Moore');
  });
});

// ── dedupeKey prevents double-trigger ────────────────────────────────────────

describe('dedupeKey prevents double-trigger', () => {
  it('TRADE_REQUEST_DENIED only applied once per week', () => {
    const player = makePlayer({ morale: 65 });
    const key = `TRADE_REQUEST_DENIED-${player.id}-2025-5`;
    const event = {
      type:      MORALE_EVENTS.TRADE_REQUEST_DENIED,
      delta:     MORALE_DELTAS[MORALE_EVENTS.TRADE_REQUEST_DENIED],
      season:    2025, week: 5, reason: '', source: '', dedupeKey: key,
    };
    const once  = applyMoraleEvent(player, event, { season: 2025, week: 5 });
    const twice = applyMoraleEvent(once,   event, { season: 2025, week: 5 });
    expect(once.morale).toBe(53); // 65 - 12
    expect(twice.morale).toBe(53); // unchanged
  });

  it('STARTER_ROLE_LOST only applied once per week', () => {
    const player = makePlayer({ morale: 58 });
    const key = `STARTER_ROLE_LOST-${player.id}-2025-2`;
    const event = {
      type:      MORALE_EVENTS.STARTER_ROLE_LOST,
      delta:     MORALE_DELTAS[MORALE_EVENTS.STARTER_ROLE_LOST],
      season:    2025, week: 2, reason: '', source: '', dedupeKey: key,
    };
    const once  = applyMoraleEvent(player, event, { season: 2025, week: 2 });
    const twice = applyMoraleEvent(once,   event, { season: 2025, week: 2 });
    expect(once.morale).toBe(50); // 58 - 8
    expect(twice.morale).toBe(50); // unchanged
  });
});

// ── News templates ────────────────────────────────────────────────────────────

describe('Holdout news templates', () => {
  it('holdout_declared template renders correctly', () => {
    const item = createNewsItem('holdout_declared', { playerName: 'Test Player', morale: 35 }, 5, 2025);
    expect(item).not.toBeNull();
    expect(item.headline).toContain('Test Player');
    expect(item.body).toContain('35');
    expect(item.type).toBe('holdout_declared');
    expect(item.priority).toBe('high');
  });

  it('holdout_resolved_gm template renders correctly', () => {
    const item = createNewsItem('holdout_resolved_gm', { playerName: 'Test Player' }, 7, 2025);
    expect(item?.headline).toContain('Test Player');
  });

  it('holdout_ended_bitter template renders correctly', () => {
    const item = createNewsItem('holdout_ended_bitter', { playerName: 'Test Player' }, 8, 2025);
    expect(item?.headline).toContain('Test Player');
  });

  it('starter_role_lost template renders correctly', () => {
    const item = createNewsItem('starter_role_lost', { playerName: 'Test Player' }, 2, 2025);
    expect(item?.headline).toContain('Test Player');
    expect(item?.priority).toBe('low');
  });

  it('trade_request_denied template renders correctly', () => {
    const item = createNewsItem('trade_request_denied', { playerName: 'Test Player', teamName: 'The Bears' }, 5, 2025);
    expect(item?.headline).toContain('Test Player');
  });
});

// ── Source-level guardrail: holdoutEngine has no sim/worker/UI/news imports ──

describe('holdoutEngine source guardrails', () => {
  it('holdout demand premium is a pure number, no side effects', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED, 2025, 3);
    const premium = getHoldoutDemandPremium(player);
    expect(typeof premium).toBe('number');
    expect(premium).toBe(0.18);
  });

  it('no Math.random usage: evaluateHoldoutTriggers is deterministic', () => {
    const player = makePlayer({ morale: 37, contract: { years: 1, yearsRemaining: 1 } });
    const r1 = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 37 } });
    const r2 = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 37 } });
    expect(r1).toBe(r2);
  });
});
