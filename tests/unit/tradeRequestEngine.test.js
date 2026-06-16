/**
 * tradeRequestEngine.test.js — Trade Requests V1 unit tests
 */

import { describe, expect, it } from 'vitest';
import {
  TRADE_REQUEST_REASONS,
  STONEWALL_THRESHOLDS,
  TRADE_VALUE_MODIFIERS,
  TRADE_REQUEST_MORALE_EVENTS,
  TRADE_REQUEST_MORALE_DELTAS,
  shouldPlayerRequestTrade,
  getTradeRequestReason,
  computeTradeValueModifier,
  resolveTradeRequest,
  evaluateWeeklyStonewall,
  getActiveTradeRequests,
} from '../../src/core/trades/tradeRequestEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mkPlayer = (overrides = {}) => ({
  id: 101,
  name: 'Test Player',
  pos: 'WR',
  ovr: 80,
  age: 27,
  morale: 70,
  teamId: 1,
  contract: { baseAnnual: 8, yearsRemaining: 2, yearsTotal: 4 },
  holdout: { active: false },
  tradeRequest: null,
  onTradeBlock: false,
  ...overrides,
});

const mkTeam = (overrides = {}) => ({
  id: 1,
  name: 'Test Team',
  abbr: 'TST',
  ...overrides,
});

// ── TRADE_REQUEST_REASONS sanity ──────────────────────────────────────────────

describe('TRADE_REQUEST_REASONS', () => {
  it('contains all four reason keys', () => {
    expect(Object.keys(TRADE_REQUEST_REASONS)).toEqual(
      expect.arrayContaining(['playing_time', 'scheme_fit', 'contract', 'personal']),
    );
  });
});

// ── shouldPlayerRequestTrade ──────────────────────────────────────────────────

describe('shouldPlayerRequestTrade', () => {
  it('returns true for playing_time trigger (depthRank >= 2 AND morale < 45)', () => {
    const player = mkPlayer({ morale: 40 });
    const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, { depthRank: 2 });
    expect(result).toBe(true);
  });

  it('returns true for scheme_fit trigger (misfit AND morale < 55)', () => {
    const player = mkPlayer({ morale: 50 });
    const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, {
      depthRank: 0,
      isPositionMisfitForScheme: true,
    });
    expect(result).toBe(true);
  });

  it('returns true for contract trigger (yearsRemaining === 1, no extension, morale < 50)', () => {
    const player = mkPlayer({
      morale: 45,
      contract: { baseAnnual: 8, yearsRemaining: 1, yearsTotal: 3 },
      extensionOfferedThisSeason: false,
    });
    const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, { depthRank: 0 });
    expect(result).toBe(true);
  });

  it('returns false when contractYearsLeft === 0 (UFA)', () => {
    const player = mkPlayer({
      morale: 30,
      contract: { baseAnnual: 8, yearsRemaining: 0, yearsTotal: 3 },
    });
    const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, { depthRank: 3 });
    expect(result).toBe(false);
  });

  it('returns false when trade request already exists', () => {
    const player = mkPlayer({
      morale: 30,
      tradeRequest: { status: 'pending', requestedSeason: 1, requestedWeek: 1, stonewalledWeeks: 0, reason: 'personal' },
    });
    const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, { depthRank: 3 });
    expect(result).toBe(false);
  });

  it('returns false when on active holdout', () => {
    const player = mkPlayer({
      morale: 30,
      holdout: { active: true, reason: 'extension_rejected' },
    });
    const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, { depthRank: 3 });
    expect(result).toBe(false);
  });

  it('returns false when morale is too high for playing_time trigger', () => {
    const player = mkPlayer({ morale: 60 });
    const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, { depthRank: 2 });
    expect(result).toBe(false);
  });

  it('personal reason fires at approximately 3% rate (seeded)', () => {
    // Run many iterations with different player ids
    let fired = 0;
    const total = 1000;
    for (let i = 0; i < total; i++) {
      const player = mkPlayer({ id: i, morale: 30 });
      // No other triggers apply
      const result = shouldPlayerRequestTrade(player, mkTeam(), 1, 5, { depthRank: 0, isPositionMisfitForScheme: false });
      if (result) fired++;
    }
    // Expect roughly 3% (allow 1-6% range for deterministic LCG)
    expect(fired / total).toBeGreaterThan(0.01);
    expect(fired / total).toBeLessThan(0.08);
  });
});

// ── getTradeRequestReason ─────────────────────────────────────────────────────

describe('getTradeRequestReason', () => {
  it('returns playing_time when depthRank >= 2 AND morale < 45', () => {
    const player = mkPlayer({ morale: 40 });
    expect(getTradeRequestReason(player, mkTeam(), { depthRank: 2 }, 1)).toBe('playing_time');
  });

  it('returns scheme_fit when misfit AND morale < 55', () => {
    const player = mkPlayer({ morale: 50 });
    expect(
      getTradeRequestReason(player, mkTeam(), { depthRank: 0, isPositionMisfitForScheme: true }, 1),
    ).toBe('scheme_fit');
  });

  it('returns contract when 1yr left, no extension, morale < 50', () => {
    const player = mkPlayer({
      morale: 45,
      contract: { baseAnnual: 8, yearsRemaining: 1, yearsTotal: 3 },
    });
    expect(getTradeRequestReason(player, mkTeam(), { depthRank: 0 }, 1)).toBe('contract');
  });

  it('returns null when no triggers match', () => {
    const player = mkPlayer({ morale: 80 });
    expect(getTradeRequestReason(player, mkTeam(), { depthRank: 0 }, 1)).toBeNull();
  });

  it('returns null when extension was offered for contract trigger', () => {
    const player = mkPlayer({
      morale: 45,
      contract: { baseAnnual: 8, yearsRemaining: 1, yearsTotal: 3 },
      extensionOfferedThisSeason: true,
    });
    expect(getTradeRequestReason(player, mkTeam(), { depthRank: 0 }, 1)).toBeNull();
  });
});

// ── computeTradeValueModifier ─────────────────────────────────────────────────

describe('computeTradeValueModifier', () => {
  it('returns stonewall penalty when stonewalledWeeks >= 4', () => {
    const player = mkPlayer({
      tradeRequest: { status: 'pending', stonewalledWeeks: 4, reason: 'playing_time', requestedSeason: 1, requestedWeek: 2 },
    });
    const mod = computeTradeValueModifier(player);
    expect(mod).not.toBeNull();
    expect(mod.modifier).toBe(TRADE_VALUE_MODIFIERS.stonewalledRequest);
    expect(mod.modifier).toBe(-0.12);
  });

  it('returns stonewall penalty at 7 weeks too', () => {
    const player = mkPlayer({
      tradeRequest: { status: 'pending', stonewalledWeeks: 7, reason: 'personal', requestedSeason: 1, requestedWeek: 1 },
    });
    const mod = computeTradeValueModifier(player);
    expect(mod.modifier).toBe(-0.12);
  });

  it('returns onTradeBlock penalty when listed', () => {
    const player = mkPlayer({ onTradeBlock: true });
    const mod = computeTradeValueModifier(player);
    expect(mod).not.toBeNull();
    expect(mod.modifier).toBe(TRADE_VALUE_MODIFIERS.onTradeBlock);
    expect(mod.modifier).toBe(-0.08);
  });

  it('returns withdrawn recovery when request was withdrawn', () => {
    const player = mkPlayer({
      tradeRequest: { status: 'withdrawn', stonewalledWeeks: 1, reason: 'contract', requestedSeason: 1, requestedWeek: 3 },
    });
    const mod = computeTradeValueModifier(player);
    expect(mod).not.toBeNull();
    expect(mod.modifier).toBe(TRADE_VALUE_MODIFIERS.withdrawn);
    expect(mod.modifier).toBe(0.05);
  });

  it('returns null when no trade request and not on block', () => {
    const player = mkPlayer();
    expect(computeTradeValueModifier(player)).toBeNull();
  });

  it('returns null for less than 4 stonewall weeks', () => {
    const player = mkPlayer({
      tradeRequest: { status: 'pending', stonewalledWeeks: 3, reason: 'playing_time', requestedSeason: 1, requestedWeek: 1 },
    });
    const mod = computeTradeValueModifier(player);
    // No stonewall penalty below 4 weeks, and not on block
    expect(mod).toBeNull();
  });
});

// ── resolveTradeRequest ───────────────────────────────────────────────────────

describe('resolveTradeRequest', () => {
  const baseRequest = {
    status: 'pending',
    requestedSeason: 1,
    requestedWeek: 3,
    stonewalledWeeks: 0,
    reason: 'playing_time',
  };

  it('honor: sets status to honored and onTradeBlock = true', () => {
    const player = mkPlayer({ tradeRequest: baseRequest });
    const { updatedPlayer, moraleEvents } = resolveTradeRequest(player, 'honor', { season: 1, week: 5 });

    expect(updatedPlayer.tradeRequest.status).toBe('honored');
    expect(updatedPlayer.onTradeBlock).toBe(true);
    expect(moraleEvents).toHaveLength(1);
    expect(moraleEvents[0].type).toBe(TRADE_REQUEST_MORALE_EVENTS.TRADE_REQUEST_HONORED);
    expect(moraleEvents[0].delta).toBe(TRADE_REQUEST_MORALE_DELTAS.TRADE_REQUEST_HONORED);
  });

  it('extend: sets status to withdrawn and returns correct morale event', () => {
    const player = mkPlayer({ tradeRequest: baseRequest });
    const { updatedPlayer, moraleEvents } = resolveTradeRequest(player, 'extend', { season: 1, week: 5 });

    expect(updatedPlayer.tradeRequest.status).toBe('withdrawn');
    expect(updatedPlayer.onTradeBlock).toBe(false);
    expect(moraleEvents).toHaveLength(1);
    expect(moraleEvents[0].type).toBe(TRADE_REQUEST_MORALE_EVENTS.TRADE_REQUEST_WITHDRAWN_EXTENSION);
    expect(moraleEvents[0].delta).toBe(TRADE_REQUEST_MORALE_DELTAS.TRADE_REQUEST_WITHDRAWN_EXTENSION);
  });

  it('stonewall: increments stonewalledWeeks and keeps status pending', () => {
    const player = mkPlayer({ tradeRequest: { ...baseRequest, stonewalledWeeks: 2 } });
    const { updatedPlayer } = resolveTradeRequest(player, 'stonewall', { season: 1, week: 6 });

    expect(updatedPlayer.tradeRequest.status).toBe('pending');
    expect(updatedPlayer.tradeRequest.stonewalledWeeks).toBe(3);
  });

  it('stonewall at week 4 emits morale hit event', () => {
    const player = mkPlayer({ tradeRequest: { ...baseRequest, stonewalledWeeks: 3 } });
    const { moraleEvents } = resolveTradeRequest(player, 'stonewall', { season: 1, week: 7 });

    expect(moraleEvents).toHaveLength(1);
    expect(moraleEvents[0].type).toBe(TRADE_REQUEST_MORALE_EVENTS.TRADE_REQUEST_STONEWALLED);
    expect(moraleEvents[0].delta).toBe(STONEWALL_THRESHOLDS.weeks_4_6.moraleHit); // -4
  });

  it('stonewall at week 1-3 emits no morale events', () => {
    const player = mkPlayer({ tradeRequest: { ...baseRequest, stonewalledWeeks: 0 } });
    const { moraleEvents } = resolveTradeRequest(player, 'stonewall', { season: 1, week: 4 });

    expect(moraleEvents).toHaveLength(0);
  });

  it('does not mutate input player', () => {
    const player = mkPlayer({ tradeRequest: baseRequest });
    const original = JSON.parse(JSON.stringify(player));
    resolveTradeRequest(player, 'honor', { season: 1, week: 5 });
    expect(player).toEqual(original);
  });

  it('does not mutate input tradeRequest', () => {
    const req = { ...baseRequest };
    const player = mkPlayer({ tradeRequest: req });
    resolveTradeRequest(player, 'stonewall', { season: 1, week: 5 });
    expect(req.stonewalledWeeks).toBe(0);
  });
});

// ── evaluateWeeklyStonewall ───────────────────────────────────────────────────

describe('evaluateWeeklyStonewall', () => {
  it('returns zero hits for weeks 1-3', () => {
    const player = mkPlayer({ tradeRequest: { stonewalledWeeks: 2 } });
    const result = evaluateWeeklyStonewall(player);
    expect(result.moraleHit).toBe(0);
    expect(result.teamMoraleHit).toBe(0);
  });

  it('returns -4/-2 hits for weeks 4-6', () => {
    const player = mkPlayer({ tradeRequest: { stonewalledWeeks: 5 } });
    const result = evaluateWeeklyStonewall(player);
    expect(result.moraleHit).toBe(-4);
    expect(result.teamMoraleHit).toBe(-2);
  });

  it('returns -8/-4 hits for weeks 7+', () => {
    const player = mkPlayer({ tradeRequest: { stonewalledWeeks: 9 } });
    const result = evaluateWeeklyStonewall(player);
    expect(result.moraleHit).toBe(-8);
    expect(result.teamMoraleHit).toBe(-4);
  });

  it('returns zero hits for week 0 (no stonewall)', () => {
    const player = mkPlayer({ tradeRequest: { stonewalledWeeks: 0 } });
    const result = evaluateWeeklyStonewall(player);
    expect(result.moraleHit).toBe(0);
  });

  it('returns zero hits when no tradeRequest', () => {
    const player = mkPlayer({ tradeRequest: null });
    const result = evaluateWeeklyStonewall(player);
    expect(result.moraleHit).toBe(0);
  });

  it('returns correct threshold at exact boundary (4)', () => {
    const player = mkPlayer({ tradeRequest: { stonewalledWeeks: 4 } });
    expect(evaluateWeeklyStonewall(player)).toEqual(STONEWALL_THRESHOLDS.weeks_4_6);
  });

  it('returns correct threshold at exact boundary (7)', () => {
    const player = mkPlayer({ tradeRequest: { stonewalledWeeks: 7 } });
    expect(evaluateWeeklyStonewall(player)).toEqual(STONEWALL_THRESHOLDS.weeks_7plus);
  });
});

// ── getActiveTradeRequests ────────────────────────────────────────────────────

describe('getActiveTradeRequests', () => {
  it('returns alerts for players with pending requests on the team', () => {
    const players = [
      mkPlayer({ id: 1, teamId: 1, tradeRequest: { status: 'pending', stonewalledWeeks: 0, reason: 'playing_time', requestedWeek: 3, requestedSeason: 1 } }),
      mkPlayer({ id: 2, teamId: 1, tradeRequest: null }),
      mkPlayer({ id: 3, teamId: 2, tradeRequest: { status: 'pending', stonewalledWeeks: 0, reason: 'contract', requestedWeek: 2, requestedSeason: 1 } }),
    ];
    const alerts = getActiveTradeRequests(mkTeam({ id: 1 }), players);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].playerId).toBe(1);
    expect(alerts[0].reason).toBe('playing_time');
  });

  it('excludes honored and withdrawn requests', () => {
    const players = [
      mkPlayer({ id: 1, teamId: 1, tradeRequest: { status: 'honored', stonewalledWeeks: 0, reason: 'contract', requestedWeek: 1, requestedSeason: 1 } }),
      mkPlayer({ id: 2, teamId: 1, tradeRequest: { status: 'withdrawn', stonewalledWeeks: 1, reason: 'personal', requestedWeek: 2, requestedSeason: 1 } }),
    ];
    const alerts = getActiveTradeRequests(mkTeam({ id: 1 }), players);
    expect(alerts).toHaveLength(0);
  });

  it('returns empty array for team with no players', () => {
    expect(getActiveTradeRequests(mkTeam({ id: 99 }), [])).toEqual([]);
  });

  it('returns empty array for null team', () => {
    expect(getActiveTradeRequests(null, [])).toEqual([]);
  });

  it('includes stonewalledWeeks in alerts', () => {
    const players = [
      mkPlayer({ id: 1, teamId: 1, tradeRequest: { status: 'pending', stonewalledWeeks: 5, reason: 'scheme_fit', requestedWeek: 1, requestedSeason: 1 } }),
    ];
    const alerts = getActiveTradeRequests(mkTeam({ id: 1 }), players);
    expect(alerts[0].stonewalledWeeks).toBe(5);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('Determinism', () => {
  it('same inputs always produce same shouldPlayerRequestTrade output', () => {
    const player = mkPlayer({ id: 42, morale: 30 });
    const team = mkTeam();
    const r1 = shouldPlayerRequestTrade(player, team, 3, 5, { depthRank: 0 });
    const r2 = shouldPlayerRequestTrade(player, team, 3, 5, { depthRank: 0 });
    expect(r1).toBe(r2);
  });

  it('same inputs always produce same resolveTradeRequest output', () => {
    const player = mkPlayer({
      tradeRequest: { status: 'pending', stonewalledWeeks: 0, reason: 'contract', requestedSeason: 1, requestedWeek: 3 },
    });
    const r1 = resolveTradeRequest(player, 'honor', { season: 1, week: 5 });
    const r2 = resolveTradeRequest(player, 'honor', { season: 1, week: 5 });
    expect(r1.updatedPlayer).toEqual(r2.updatedPlayer);
    expect(r1.moraleEvents).toEqual(r2.moraleEvents);
  });

  it('same inputs always produce same computeTradeValueModifier output', () => {
    const player = mkPlayer({
      tradeRequest: { status: 'pending', stonewalledWeeks: 6, reason: 'playing_time', requestedSeason: 1, requestedWeek: 1 },
    });
    expect(computeTradeValueModifier(player)).toEqual(computeTradeValueModifier(player));
  });
});

// ── Old save hydration ────────────────────────────────────────────────────────

describe('Old save hydration (missing fields)', () => {
  it('shouldPlayerRequestTrade handles player without tradeRequest field', () => {
    const player = { id: 1, morale: 80, teamId: 1, contract: { yearsRemaining: 2 } };
    expect(() => shouldPlayerRequestTrade(player, mkTeam(), 1, 5, {})).not.toThrow();
  });

  it('computeTradeValueModifier returns null for player without tradeRequest', () => {
    const player = { id: 1, morale: 80, teamId: 1 };
    expect(computeTradeValueModifier(player)).toBeNull();
  });

  it('evaluateWeeklyStonewall handles missing tradeRequest field gracefully', () => {
    const player = { id: 1 };
    const result = evaluateWeeklyStonewall(player);
    expect(result.moraleHit).toBe(0);
  });

  it('getActiveTradeRequests handles players without tradeRequest field', () => {
    const players = [{ id: 1, teamId: 1, name: 'Old Player', pos: 'QB', ovr: 80 }];
    expect(() => getActiveTradeRequests(mkTeam({ id: 1 }), players)).not.toThrow();
    expect(getActiveTradeRequests(mkTeam({ id: 1 }), players)).toHaveLength(0);
  });
});
