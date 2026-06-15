/**
 * holdoutEngine.test.js — Player Holdouts V1 unit tests
 */
import { describe, it, expect } from 'vitest';
import {
  HOLDOUT_TRIGGERS,
  HOLDOUT_RESOLUTION,
  HOLDOUT_DEMAND_PREMIUMS,
  HOLDOUT_EXPIRY_WEEKS,
  evaluateHoldoutTriggers,
  applyHoldout,
  resolveHoldout,
  getHoldoutDemandPremium,
  isAvailableForGameDay,
  checkHoldoutTimeExpiry,
  ensureHoldout,
} from '../holdouts/holdoutEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    ovr: 80,
    age: 27,
    morale: 70,
    moraleEvents: [],
    teamId: 5,
    contract: { years: 3, yearsRemaining: 3 },
    ...overrides,
  };
}

function makePlayerWithEvent(type, delta = -12, season = 2025, week = 3) {
  return makePlayer({
    // Use multi-year contract so Trigger A doesn't accidentally fire in Trigger B/C tests
    contract: { years: 3, yearsRemaining: 3 },
    moraleEvents: [{
      type, delta, season, week,
      dedupeKey: `${type}-1-${season}-${week}`,
      reason: '',
      source: 'test',
    }],
  });
}

// ── ensureHoldout (hydration) ─────────────────────────────────────────────────

describe('ensureHoldout — old save hydration', () => {
  it('returns safe defaults when holdout field is missing', () => {
    const player = makePlayer();
    delete player.holdout;
    const h = ensureHoldout(player);
    expect(h.active).toBe(false);
    expect(h.reason).toBeNull();
    expect(h.startWeek).toBeNull();
    expect(h.startSeason).toBeNull();
    expect(h.demandPremium).toBe(0);
    expect(h.resolvedWeek).toBeNull();
    expect(h.resolvedSeason).toBeNull();
    expect(h.resolvedBy).toBeNull();
  });

  it('returns safe defaults when holdout is null', () => {
    const player = makePlayer({ holdout: null });
    const h = ensureHoldout(player);
    expect(h.active).toBe(false);
  });

  it('preserves existing holdout values', () => {
    const player = makePlayer({
      holdout: { active: true, reason: 'extension_rejected', startWeek: 3, startSeason: 2025, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    });
    const h = ensureHoldout(player);
    expect(h.active).toBe(true);
    expect(h.reason).toBe('extension_rejected');
    expect(h.demandPremium).toBe(0.12);
  });
});

// ── evaluateHoldoutTriggers — Trigger A ──────────────────────────────────────

describe('evaluateHoldoutTriggers — Trigger A (extension rejected)', () => {
  it('fires when morale < 45, final year, no extension offered this season and morale < 40', () => {
    const player = makePlayer({ morale: 38, contract: { years: 1, yearsRemaining: 1 } });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 38 } });
    expect(result).toBe(HOLDOUT_TRIGGERS.EXTENSION_REJECTED);
  });

  it('does NOT fire when morale >= 45', () => {
    const player = makePlayer({ morale: 45, contract: { years: 1, yearsRemaining: 1 } });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 45 } });
    expect(result).toBeNull();
  });

  it('does NOT fire when morale is 44 but > 40 with no extension offered', () => {
    const player = makePlayer({ morale: 44, contract: { years: 1, yearsRemaining: 1 } });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 44 } });
    // morale < 45 but not < 40, and no negative extension event
    expect(result).toBeNull();
  });

  it('fires when morale < 45, final year, negative CONTRACT_EXTENDED event exists', () => {
    const player = makePlayer({
      morale: 42,
      contract: { years: 1, yearsRemaining: 1 },
      moraleEvents: [{
        type: 'CONTRACT_EXTENDED',
        delta: -5,
        season: 2025,
        week: 4,
        dedupeKey: 'CONTRACT_EXTENDED-counter-1-2025',
        reason: 'Extension offer below demand',
        source: 'contract',
      }],
    });
    const result = evaluateHoldoutTriggers(player, 2025, 6, { moraleSummary: { score: 42 } });
    expect(result).toBe(HOLDOUT_TRIGGERS.EXTENSION_REJECTED);
  });

  it('does NOT fire when not in final year of contract', () => {
    const player = makePlayer({ morale: 38, contract: { years: 3, yearsRemaining: 3 } });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 38 } });
    expect(result).toBeNull();
  });

  it('does NOT fire when player is already on holdout', () => {
    const player = makePlayer({
      morale: 35,
      holdout: { active: true, reason: 'extension_rejected', startWeek: 3, startSeason: 2025, demandPremium: 0.12, resolvedWeek: null, resolvedSeason: null, resolvedBy: null },
    });
    const result = evaluateHoldoutTriggers(player, 2025, 6, { moraleSummary: { score: 35 } });
    expect(result).toBeNull();
  });

  it('does NOT fire a second time in the same season (already resolved)', () => {
    const player = makePlayer({
      morale: 35,
      holdout: { active: false, reason: 'extension_rejected', startWeek: 2, startSeason: 2025, demandPremium: 0.12, resolvedWeek: 6, resolvedSeason: 2025, resolvedBy: 'time_expired' },
    });
    const result = evaluateHoldoutTriggers(player, 2025, 7, { moraleSummary: { score: 35 } });
    expect(result).toBeNull();
  });

  it('does NOT fire for rookies', () => {
    const player = makePlayer({ morale: 38, contract: { years: 1, yearsRemaining: 1 }, draftYear: 2025 });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 38 } });
    expect(result).toBeNull();
  });

  it('does NOT fire for practice squad players', () => {
    const player = makePlayer({ morale: 38, contract: { years: 1, yearsRemaining: 1 }, status: 'practice_squad' });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 38 } });
    expect(result).toBeNull();
  });
});

// ── evaluateHoldoutTriggers — Trigger B ──────────────────────────────────────

describe('evaluateHoldoutTriggers — Trigger B (trade request denied)', () => {
  it('fires when morale < 38 and TRADE_REQUEST_DENIED event exists', () => {
    const player = makePlayerWithEvent('TRADE_REQUEST_DENIED', -12, 2025, 3);
    player.morale = 35;
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 35 } });
    expect(result).toBe(HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED);
  });

  it('does NOT fire when morale >= 38 even with TRADE_REQUEST_DENIED event', () => {
    const player = makePlayerWithEvent('TRADE_REQUEST_DENIED', -12, 2025, 3);
    player.morale = 38;
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 38 } });
    expect(result).toBeNull();
  });

  it('does NOT fire when TRADE_REQUEST_DENIED event absent', () => {
    const player = makePlayer({ morale: 35 });
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 35 } });
    expect(result).toBeNull();
  });

  it('Trigger B fires even when player also qualifies for Trigger A', () => {
    const player = makePlayerWithEvent('TRADE_REQUEST_DENIED', -12, 2025, 3);
    player.morale = 35;
    player.contract = { years: 1, yearsRemaining: 1 }; // final year: could trigger A
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 35 } });
    // B is checked first and fires
    expect(result).toBe(HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED);
  });
});

// ── evaluateHoldoutTriggers — Trigger C ──────────────────────────────────────

describe('evaluateHoldoutTriggers — Trigger C (starter role lost)', () => {
  it('fires in week 1 when morale < 42 and STARTER_ROLE_LOST event exists', () => {
    const player = makePlayerWithEvent('STARTER_ROLE_LOST', -8, 2025, 1);
    player.morale = 40;
    const result = evaluateHoldoutTriggers(player, 2025, 1, { moraleSummary: { score: 40 } });
    expect(result).toBe(HOLDOUT_TRIGGERS.STARTER_ROLE_LOST);
  });

  it('fires in week 4 (upper bound)', () => {
    const player = makePlayerWithEvent('STARTER_ROLE_LOST', -8, 2025, 4);
    player.morale = 38;
    const result = evaluateHoldoutTriggers(player, 2025, 4, { moraleSummary: { score: 38 } });
    expect(result).toBe(HOLDOUT_TRIGGERS.STARTER_ROLE_LOST);
  });

  it('does NOT fire in week 5+', () => {
    const player = makePlayerWithEvent('STARTER_ROLE_LOST', -8, 2025, 4);
    player.morale = 38;
    const result = evaluateHoldoutTriggers(player, 2025, 5, { moraleSummary: { score: 38 } });
    expect(result).toBeNull();
  });

  it('does NOT fire in week 6', () => {
    const player = makePlayerWithEvent('STARTER_ROLE_LOST', -8, 2025, 3);
    player.morale = 30;
    const result = evaluateHoldoutTriggers(player, 2025, 6, { moraleSummary: { score: 30 } });
    expect(result).toBeNull();
  });

  it('does NOT fire when morale >= 42', () => {
    const player = makePlayerWithEvent('STARTER_ROLE_LOST', -8, 2025, 1);
    player.morale = 42;
    const result = evaluateHoldoutTriggers(player, 2025, 2, { moraleSummary: { score: 42 } });
    expect(result).toBeNull();
  });
});

// ── applyHoldout ──────────────────────────────────────────────────────────────

describe('applyHoldout', () => {
  it('sets holdout.active = true with correct fields', () => {
    const player = makePlayer();
    const updated = applyHoldout(player, HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    expect(updated.holdout.active).toBe(true);
    expect(updated.holdout.reason).toBe(HOLDOUT_TRIGGERS.EXTENSION_REJECTED);
    expect(updated.holdout.startWeek).toBe(5);
    expect(updated.holdout.startSeason).toBe(2025);
    expect(updated.holdout.resolvedBy).toBeNull();
  });

  it('returns new object reference (pure)', () => {
    const player = makePlayer();
    const updated = applyHoldout(player, HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED, 2025, 3);
    expect(updated).not.toBe(player);
  });

  it('does not modify original player', () => {
    const player = makePlayer();
    applyHoldout(player, HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    expect(player.holdout).toBeUndefined();
  });
});

// ── getHoldoutDemandPremium ───────────────────────────────────────────────────

describe('getHoldoutDemandPremium', () => {
  it('returns 0.12 for extension_rejected trigger', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    expect(getHoldoutDemandPremium(player)).toBe(0.12);
  });

  it('returns 0.18 for trade_request_denied trigger', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED, 2025, 5);
    expect(getHoldoutDemandPremium(player)).toBe(0.18);
  });

  it('returns 0.08 for starter_role_lost trigger', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.STARTER_ROLE_LOST, 2025, 2);
    expect(getHoldoutDemandPremium(player)).toBe(0.08);
  });

  it('returns 0 when no active holdout', () => {
    const player = makePlayer();
    expect(getHoldoutDemandPremium(player)).toBe(0);
  });

  it('returns 0 after holdout resolved', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2025, 7);
    expect(getHoldoutDemandPremium(player)).toBe(0);
  });
});

// ── isAvailableForGameDay ─────────────────────────────────────────────────────

describe('isAvailableForGameDay', () => {
  it('returns false when holdout.active = true', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    expect(isAvailableForGameDay(player)).toBe(false);
  });

  it('returns true when holdout.active = false', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2025, 7);
    expect(isAvailableForGameDay(player)).toBe(true);
  });

  it('returns true when player has no holdout field (old save)', () => {
    const player = makePlayer();
    expect(isAvailableForGameDay(player)).toBe(true);
  });

  it('returns true when holdout is null', () => {
    const player = makePlayer({ holdout: null });
    expect(isAvailableForGameDay(player)).toBe(true);
  });
});

// ── resolveHoldout ────────────────────────────────────────────────────────────

describe('resolveHoldout', () => {
  it('gm_signed resolution clears holdout.active', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2025, 7);
    expect(player.holdout.active).toBe(false);
    expect(player.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.GM_SIGNED);
    expect(player.holdout.resolvedWeek).toBe(7);
    expect(player.holdout.resolvedSeason).toBe(2025);
  });

  it('gm_traded resolution clears holdout.active', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED, 2025, 3);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_TRADED, 2025, 5);
    expect(player.holdout.active).toBe(false);
    expect(player.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.GM_TRADED);
  });

  it('gm_released resolution clears holdout.active', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_RELEASED, 2025, 6);
    expect(player.holdout.active).toBe(false);
    expect(player.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.GM_RELEASED);
  });

  it('time_expired resolution clears holdout.active', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.TIME_EXPIRED, 2025, 8);
    expect(player.holdout.active).toBe(false);
    expect(player.holdout.resolvedBy).toBe(HOLDOUT_RESOLUTION.TIME_EXPIRED);
  });

  it('no-op when holdout is not active', () => {
    const player = makePlayer();
    const same = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2025, 7);
    expect(same).toBe(player);
  });

  it('returns new object reference when resolution applied', () => {
    const player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 5);
    const resolved = resolveHoldout(player, HOLDOUT_RESOLUTION.GM_SIGNED, 2025, 7);
    expect(resolved).not.toBe(player);
  });
});

// ── checkHoldoutTimeExpiry ────────────────────────────────────────────────────

describe('checkHoldoutTimeExpiry', () => {
  it('returns true when 4+ weeks elapsed', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    expect(checkHoldoutTimeExpiry(player, 2025, 8)).toBe(true);
  });

  it('returns true at exactly 4 weeks', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    expect(checkHoldoutTimeExpiry(player, 2025, 8)).toBe(true);
  });

  it('returns false when only 3 weeks elapsed', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 4);
    expect(checkHoldoutTimeExpiry(player, 2025, 7)).toBe(false);
  });

  it('returns false when holdout is not active', () => {
    const player = makePlayer();
    expect(checkHoldoutTimeExpiry(player, 2025, 8)).toBe(false);
  });

  it('returns false when seasons differ', () => {
    let player = applyHoldout(makePlayer(), HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2024, 4);
    expect(checkHoldoutTimeExpiry(player, 2025, 9)).toBe(false);
  });
});

// ── demand premiums per trigger ───────────────────────────────────────────────

describe('HOLDOUT_DEMAND_PREMIUMS', () => {
  it('extension_rejected premium is 12%', () => {
    expect(HOLDOUT_DEMAND_PREMIUMS[HOLDOUT_TRIGGERS.EXTENSION_REJECTED]).toBe(0.12);
  });

  it('trade_request_denied premium is 18%', () => {
    expect(HOLDOUT_DEMAND_PREMIUMS[HOLDOUT_TRIGGERS.TRADE_REQUEST_DENIED]).toBe(0.18);
  });

  it('starter_role_lost premium is 8%', () => {
    expect(HOLDOUT_DEMAND_PREMIUMS[HOLDOUT_TRIGGERS.STARTER_ROLE_LOST]).toBe(0.08);
  });
});

// ── only one holdout per player per season ────────────────────────────────────

describe('single holdout per season guard', () => {
  it('second trigger in same season does not fire after first resolves', () => {
    // Use final-year contract so the trigger would otherwise fire
    let player = makePlayer({ morale: 35, contract: { years: 1, yearsRemaining: 1 } });
    // First holdout declared
    player = applyHoldout(player, HOLDOUT_TRIGGERS.EXTENSION_REJECTED, 2025, 3);
    // Resolved
    player = resolveHoldout(player, HOLDOUT_RESOLUTION.TIME_EXPIRED, 2025, 7);
    // Attempt second trigger same season — should be blocked by single-season guard
    const result = evaluateHoldoutTriggers(player, 2025, 8, { moraleSummary: { score: 35 } });
    expect(result).toBeNull();
  });
});
