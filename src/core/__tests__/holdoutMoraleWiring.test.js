/**
 * holdoutMoraleWiring.test.js
 *
 * Tests for new morale events: TRADE_REQUEST_DENIED, STARTER_ROLE_LOST,
 * HOLDOUT_RETURNED. Verifies constants, deltas, and dedupeKey guards.
 */
import { describe, it, expect } from 'vitest';
import {
  MORALE_EVENTS,
  MORALE_DELTAS,
  applyMoraleEvent,
} from '../mood/playerMoraleEngine.js';

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    morale: 70,
    moraleEvents: [],
    ...overrides,
  };
}

// ── HOLDOUT_RETURNED constant ─────────────────────────────────────────────────

describe('MORALE_EVENTS — HOLDOUT_RETURNED', () => {
  it('is defined in MORALE_EVENTS', () => {
    expect(MORALE_EVENTS.HOLDOUT_RETURNED).toBe('HOLDOUT_RETURNED');
  });

  it('has delta -8 in MORALE_DELTAS', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.HOLDOUT_RETURNED]).toBe(-8);
  });
});

// ── TRADE_REQUEST_DENIED constant ─────────────────────────────────────────────

describe('MORALE_EVENTS — TRADE_REQUEST_DENIED', () => {
  it('is defined in MORALE_EVENTS', () => {
    expect(MORALE_EVENTS.TRADE_REQUEST_DENIED).toBe('TRADE_REQUEST_DENIED');
  });

  it('has delta -12 in MORALE_DELTAS', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.TRADE_REQUEST_DENIED]).toBe(-12);
  });

  it('applies correctly via applyMoraleEvent', () => {
    const player = makePlayer({ morale: 60 });
    const updated = applyMoraleEvent(player, {
      type:      MORALE_EVENTS.TRADE_REQUEST_DENIED,
      season:    2025,
      week:      5,
      reason:    'Trade request denied',
      source:    'trade_rejection',
      dedupeKey: 'TRADE_REQUEST_DENIED-1-2025-5',
    }, { season: 2025, week: 5 });
    expect(updated.morale).toBe(48); // 60 + (-12)
    expect(updated.moraleEvents[0].type).toBe('TRADE_REQUEST_DENIED');
  });

  it('dedupeKey prevents double application (same season+week)', () => {
    const player = makePlayer({ morale: 60 });
    const key = 'TRADE_REQUEST_DENIED-1-2025-5';
    const event = { type: MORALE_EVENTS.TRADE_REQUEST_DENIED, season: 2025, week: 5, reason: '', source: '', dedupeKey: key };
    const once = applyMoraleEvent(player, event, { season: 2025, week: 5 });
    const twice = applyMoraleEvent(once, event, { season: 2025, week: 5 });
    expect(once.morale).toBe(48);
    expect(twice.morale).toBe(48); // unchanged
    expect(twice.moraleEvents.length).toBe(1);
  });
});

// ── STARTER_ROLE_LOST constant ────────────────────────────────────────────────

describe('MORALE_EVENTS — STARTER_ROLE_LOST', () => {
  it('is defined in MORALE_EVENTS', () => {
    expect(MORALE_EVENTS.STARTER_ROLE_LOST).toBe('STARTER_ROLE_LOST');
  });

  it('has delta -8 in MORALE_DELTAS (per V1 spec)', () => {
    expect(MORALE_DELTAS[MORALE_EVENTS.STARTER_ROLE_LOST]).toBe(-8);
  });

  it('applies correctly via applyMoraleEvent', () => {
    const player = makePlayer({ morale: 55 });
    const updated = applyMoraleEvent(player, {
      type:      MORALE_EVENTS.STARTER_ROLE_LOST,
      season:    2025,
      week:      2,
      reason:    'Lost starting role',
      source:    'depth_chart',
      dedupeKey: 'STARTER_ROLE_LOST-1-2025-2',
    }, { season: 2025, week: 2 });
    expect(updated.morale).toBe(47); // 55 + (-8)
    expect(updated.moraleEvents[0].type).toBe('STARTER_ROLE_LOST');
  });

  it('dedupeKey prevents double application', () => {
    const player = makePlayer({ morale: 55 });
    const key = 'STARTER_ROLE_LOST-1-2025-2';
    const event = { type: MORALE_EVENTS.STARTER_ROLE_LOST, season: 2025, week: 2, reason: '', source: '', dedupeKey: key };
    const once = applyMoraleEvent(player, event, { season: 2025, week: 2 });
    const twice = applyMoraleEvent(once, event, { season: 2025, week: 2 });
    expect(twice.morale).toBe(47); // only applied once
    expect(twice.moraleEvents.length).toBe(1);
  });
});

// ── HOLDOUT_RETURNED event ────────────────────────────────────────────────────

describe('HOLDOUT_RETURNED event application', () => {
  it('applies -8 delta', () => {
    const player = makePlayer({ morale: 42 });
    const updated = applyMoraleEvent(player, {
      type:      MORALE_EVENTS.HOLDOUT_RETURNED,
      delta:     MORALE_DELTAS[MORALE_EVENTS.HOLDOUT_RETURNED],
      season:    2025,
      week:      8,
      reason:    'Returned from holdout bitter',
      source:    'holdout',
      dedupeKey: 'HOLDOUT_RETURNED-1-2025',
    }, { season: 2025, week: 8 });
    expect(updated.morale).toBe(34); // 42 + (-8)
  });

  it('dedupeKey prevents double bitter event', () => {
    const player = makePlayer({ morale: 42 });
    const key = 'HOLDOUT_RETURNED-1-2025';
    const event = { type: MORALE_EVENTS.HOLDOUT_RETURNED, delta: -8, season: 2025, week: 8, reason: '', source: '', dedupeKey: key };
    const once = applyMoraleEvent(player, event, { season: 2025, week: 8 });
    const twice = applyMoraleEvent(once, event, { season: 2025, week: 8 });
    expect(twice.morale).toBe(34);
    expect(twice.moraleEvents.length).toBe(1);
  });
});
