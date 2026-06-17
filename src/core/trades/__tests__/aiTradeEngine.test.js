/**
 * aiTradeEngine.test.js — Comprehensive tests for the AI trade pursuit engine
 */

import { describe, it, expect } from 'vitest';

import {
  POSITION_NEED_WEIGHT,
  AI_OFFER_AGGRESSION,
  computeAIPositionNeed,
  computeAIOfferValue,
  buildAITradeOffer,
  shouldAIUpdateOffer,
  improveAIOffer,
  evaluateCounterOffer,
  getAITradeBlockTargets,
} from '../aiTradeEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: 1,
    name: 'Test Player',
    pos: 'WR',
    ovr: 82,
    age: 26,
    morale: 70,
    teamId: 10,
    onTradeBlock: false,
    contract: { yearsRemaining: 3, baseAnnual: 8.0, signingBonus: 2.0, yearsTotal: 4 },
    ...overrides,
  };
}

function makeTeam(overrides = {}) {
  return { id: 5, name: 'Test AI Team', abbrev: 'TAI', isHuman: false, ...overrides };
}

function makePick(overrides = {}) {
  return {
    id: 'pick_1',
    assetType: 'pick',
    round: 1,
    currentTeamId: 5,
    season: 2025,
    ...overrides,
  };
}

function makeOffer(overrides = {}) {
  return {
    offerId:          'ai_5_1_s2025w5_abc12345',
    aiTeamId:         5,
    aiTeamName:       'Test AI Team',
    aiTeamAbbrev:     'TAI',
    targetPlayerId:   1,
    targetPlayerName: 'Test Player',
    targetPlayerPos:  'WR',
    targetPlayerOvr:  82,
    offerPlayers:     [],
    offerPicks:       [makePick()],
    bundleValue:      900,
    acquisitionValue: 880,
    positionNeed:     0.8,
    aggression:       'HIGH',
    status:           'pending',
    createdSeason:    2025,
    createdWeek:      5,
    expiresWeek:      8,
    ...overrides,
  };
}

// ── Module exports ────────────────────────────────────────────────────────────

describe('module exports', () => {
  it('exports POSITION_NEED_WEIGHT with expected keys', () => {
    expect(POSITION_NEED_WEIGHT).toBeDefined();
    expect(POSITION_NEED_WEIGHT.QB).toBe(1.5);
    expect(POSITION_NEED_WEIGHT.RB).toBe(0.75);
    expect(POSITION_NEED_WEIGHT.WR).toBe(1.2);
    expect(Object.isFrozen(POSITION_NEED_WEIGHT)).toBe(true);
  });

  it('exports AI_OFFER_AGGRESSION with four levels', () => {
    expect(AI_OFFER_AGGRESSION).toBeDefined();
    expect(AI_OFFER_AGGRESSION.LOW).toBeLessThan(AI_OFFER_AGGRESSION.MEDIUM);
    expect(AI_OFFER_AGGRESSION.MEDIUM).toBeLessThan(AI_OFFER_AGGRESSION.HIGH);
    expect(AI_OFFER_AGGRESSION.HIGH).toBeLessThan(AI_OFFER_AGGRESSION.MAX);
    expect(Object.isFrozen(AI_OFFER_AGGRESSION)).toBe(true);
  });
});

// ── computeAIPositionNeed ─────────────────────────────────────────────────────

describe('computeAIPositionNeed', () => {
  it('returns 0.5 when aiTeam is falsy', () => {
    expect(computeAIPositionNeed(null, 'WR', [])).toBe(0.5);
    expect(computeAIPositionNeed(undefined, 'WR', [])).toBe(0.5);
  });

  it('returns 0.5 when players array is not an array', () => {
    expect(computeAIPositionNeed(makeTeam(), 'WR', null)).toBe(0.5);
  });

  it('returns high need (>= 1.0) when team has NO starters at position', () => {
    const aiTeam = makeTeam({ id: 5 });
    // No WR players on team 5
    const players = [makePlayer({ id: 99, teamId: 5, pos: 'QB', ovr: 80 })];
    const need = computeAIPositionNeed(aiTeam, 'WR', players);
    expect(need).toBeGreaterThanOrEqual(1.0);
  });

  it('returns moderate need when team is below full starter count', () => {
    const aiTeam = makeTeam({ id: 5 });
    // Only 1 WR starter (needs 3)
    const players = [makePlayer({ id: 1, teamId: 5, pos: 'WR', ovr: 75 })];
    const need = computeAIPositionNeed(aiTeam, 'WR', players);
    expect(need).toBeGreaterThan(0.25);
    expect(need).toBeLessThanOrEqual(1.0);
  });

  it('returns low need when team is fully stocked at position', () => {
    const aiTeam = makeTeam({ id: 5 });
    // 3 quality WRs (starter threshold 70+)
    const players = [
      makePlayer({ id: 1, teamId: 5, pos: 'WR', ovr: 85 }),
      makePlayer({ id: 2, teamId: 5, pos: 'WR', ovr: 80 }),
      makePlayer({ id: 3, teamId: 5, pos: 'WR', ovr: 74 }),
    ];
    const need = computeAIPositionNeed(aiTeam, 'WR', players);
    expect(need).toBeLessThan(0.5);
  });

  it('correctly filters by teamId — other teams\' players ignored', () => {
    const aiTeam = makeTeam({ id: 5 });
    // 3 WRs but all on team 10, not team 5
    const players = [
      makePlayer({ id: 1, teamId: 10, pos: 'WR', ovr: 85 }),
      makePlayer({ id: 2, teamId: 10, pos: 'WR', ovr: 80 }),
      makePlayer({ id: 3, teamId: 10, pos: 'WR', ovr: 74 }),
    ];
    const need = computeAIPositionNeed(aiTeam, 'WR', players);
    // Team 5 has 0 WRs → high need
    expect(need).toBeGreaterThanOrEqual(1.0);
  });
});

// ── computeAIOfferValue ───────────────────────────────────────────────────────

describe('computeAIOfferValue', () => {
  it('returns 0 for null player', () => {
    expect(computeAIOfferValue(null, makeTeam(), {}, 42)).toBe(0);
  });

  it('returns a positive number for a valid player', () => {
    const player = makePlayer({ ovr: 82, onTradeBlock: false });
    const value = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 42);
    expect(value).toBeGreaterThan(0);
  });

  it('MAX aggression gives higher offer than LOW aggression for same player', () => {
    const player = makePlayer({ ovr: 82 });
    const vHigh = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'MAX' }, 42);
    const vLow  = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'LOW' }, 42);
    expect(vHigh).toBeGreaterThan(vLow);
  });

  it('higher positionNeed increases offer value', () => {
    const player = makePlayer({ ovr: 82 });
    const vHigh = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.9, aggression: 'MEDIUM' }, 42);
    const vLow  = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.1, aggression: 'MEDIUM' }, 42);
    expect(vHigh).toBeGreaterThan(vLow);
  });

  it('player on trade block gets discounted offer (modifier = -0.08)', () => {
    const playerOff  = makePlayer({ ovr: 82, onTradeBlock: false });
    const playerOn   = makePlayer({ ovr: 82, onTradeBlock: true });
    const vOff = computeAIOfferValue(playerOff, makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 42);
    const vOn  = computeAIOfferValue(playerOn,  makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 42);
    expect(vOn).toBeLessThan(vOff);
  });

  it('is deterministic — same seed gives same result', () => {
    const player = makePlayer({ ovr: 80 });
    const v1 = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 999);
    const v2 = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 999);
    expect(v1).toBe(v2);
  });

  it('different seeds give different results', () => {
    const player = makePlayer({ ovr: 80 });
    const v1 = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 111);
    const v2 = computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 222);
    expect(v1).not.toBe(v2);
  });
});

// ── buildAITradeOffer ─────────────────────────────────────────────────────────

describe('buildAITradeOffer', () => {
  it('returns null when targetPlayer is null', () => {
    expect(buildAITradeOffer(null, makeTeam(), [], [], 2025, 5, 42)).toBeNull();
  });

  it('returns null when aiTeam is null', () => {
    expect(buildAITradeOffer(makePlayer(), null, [], [], 2025, 5, 42)).toBeNull();
  });

  it('returns null if AI has no tradeable assets', () => {
    const target = makePlayer({ id: 1, pos: 'WR', ovr: 82, teamId: 10, onTradeBlock: true });
    const aiTeam = makeTeam({ id: 5 });
    // AI has only their one QB starter (protected) and no picks
    const aiPlayers = [makePlayer({ id: 99, teamId: 5, pos: 'QB', ovr: 85 })];
    const result = buildAITradeOffer(target, aiTeam, aiPlayers, [], 2025, 5, 42);
    // Can't hit 70% with nothing
    expect(result).toBeNull();
  });

  it('returns a valid offer when AI has sufficient picks', () => {
    const target = makePlayer({ id: 1, pos: 'WR', ovr: 75, teamId: 10, onTradeBlock: true });
    const aiTeam = makeTeam({ id: 5 });
    const aiPlayers = [];
    const aiPicks = [
      makePick({ id: 'p1', round: 1, currentTeamId: 5, season: 2025 }),
      makePick({ id: 'p2', round: 2, currentTeamId: 5, season: 2025 }),
    ];
    const offer = buildAITradeOffer(target, aiTeam, aiPlayers, aiPicks, 2025, 5, 42);
    expect(offer).not.toBeNull();
    expect(offer.status).toBe('pending');
    expect(offer.aiTeamId).toBe(5);
    expect(offer.targetPlayerId).toBe(1);
    expect(offer.bundleValue).toBeGreaterThan(0);
    expect(offer.acquisitionValue).toBeGreaterThan(0);
  });

  it('offer offerId is stable for same inputs', () => {
    const target   = makePlayer({ id: 1, pos: 'WR', ovr: 75, teamId: 10 });
    const aiTeam   = makeTeam({ id: 5 });
    const aiPicks  = [makePick({ id: 'p1', round: 1, currentTeamId: 5 })];
    const o1 = buildAITradeOffer(target, aiTeam, [], aiPicks, 2025, 5, 42);
    const o2 = buildAITradeOffer(target, aiTeam, [], aiPicks, 2025, 5, 42);
    expect(o1?.offerId).toBe(o2?.offerId);
  });

  it('does NOT include depth-rank-1 starter in offerPlayers', () => {
    const target   = makePlayer({ id: 1, pos: 'WR', ovr: 80, teamId: 10 });
    const aiTeam   = makeTeam({ id: 5 });
    // AI has one elite QB (protected) and one backup QB (offerrable) and plenty of picks
    const aiPlayers = [
      makePlayer({ id: 50, teamId: 5, pos: 'QB', ovr: 88 }),  // starter — protected
      makePlayer({ id: 51, teamId: 5, pos: 'QB', ovr: 65 }),  // backup — offerrable
    ];
    const aiPicks   = [makePick({ id: 'p1', round: 1, currentTeamId: 5 })];
    const offer = buildAITradeOffer(target, aiTeam, aiPlayers, aiPicks, 2025, 5, 42);
    if (offer) {
      const offeredIds = offer.offerPlayers.map(p => p.id);
      expect(offeredIds).not.toContain(50); // starter not offered
    }
  });

  it('expiresWeek is createdWeek + 3', () => {
    const target  = makePlayer({ id: 1, pos: 'WR', ovr: 75, teamId: 10 });
    const aiPicks = [makePick({ id: 'p1', round: 1, currentTeamId: 5 })];
    const offer   = buildAITradeOffer(target, makeTeam({ id: 5 }), [], aiPicks, 2025, 6, 42);
    if (offer) {
      expect(offer.expiresWeek).toBe(9);
    }
  });

  it('bundleValue >= acquisitionValue * 0.70 (otherwise returns null)', () => {
    const target  = makePlayer({ id: 1, pos: 'WR', ovr: 85, teamId: 10 });
    const aiPicks = [makePick({ id: 'p1', round: 1, currentTeamId: 5 })];
    const offer   = buildAITradeOffer(target, makeTeam({ id: 5 }), [], aiPicks, 2025, 5, 42);
    if (offer) {
      expect(offer.bundleValue).toBeGreaterThanOrEqual(offer.acquisitionValue * 0.70);
    }
  });
});

// ── shouldAIUpdateOffer ───────────────────────────────────────────────────────

describe('shouldAIUpdateOffer', () => {
  it('returns false for null offer', () => {
    expect(shouldAIUpdateOffer(null, null, 2025, 5)).toBe(false);
  });

  it('returns false for non-pending offer', () => {
    const offer = makeOffer({ status: 'accepted' });
    expect(shouldAIUpdateOffer(offer, makePlayer(), 2025, 9)).toBe(false);
  });

  it('returns false when still within validity window', () => {
    const offer = makeOffer({ status: 'pending', createdSeason: 2025, createdWeek: 5, expiresWeek: 8 });
    expect(shouldAIUpdateOffer(offer, makePlayer(), 2025, 7)).toBe(false);
  });

  it('returns true when week > expiresWeek', () => {
    const offer = makeOffer({ status: 'pending', createdSeason: 2025, createdWeek: 5, expiresWeek: 8 });
    expect(shouldAIUpdateOffer(offer, makePlayer(), 2025, 9)).toBe(true);
  });

  it('returns true when offer is from a prior season', () => {
    const offer = makeOffer({ status: 'pending', createdSeason: 2024, createdWeek: 18, expiresWeek: 21 });
    expect(shouldAIUpdateOffer(offer, makePlayer(), 2025, 1)).toBe(true);
  });
});

// ── improveAIOffer ────────────────────────────────────────────────────────────

describe('improveAIOffer', () => {
  it('returns null for null offer', () => {
    expect(improveAIOffer(null, makePlayer(), makeTeam(), [], [], 2025, 5, 42)).toBeNull();
  });

  it('returns null for non-pending offer', () => {
    const offer = makeOffer({ status: 'rejected' });
    expect(improveAIOffer(offer, makePlayer(), makeTeam(), [], [], 2025, 5, 42)).toBeNull();
  });

  it('improved offer has higher acquisitionValue than original', () => {
    const target   = makePlayer({ id: 1, pos: 'WR', ovr: 75, teamId: 10 });
    const original = makeOffer({ status: 'pending', aggression: 'MEDIUM', acquisitionValue: 800 });
    const aiPicks  = [
      makePick({ id: 'p1', round: 1, currentTeamId: 5 }),
      makePick({ id: 'p2', round: 2, currentTeamId: 5 }),
    ];
    const improved = improveAIOffer(original, target, makeTeam({ id: 5 }), [], aiPicks, 2025, 6, 99);
    if (improved) {
      expect(improved.acquisitionValue).toBeGreaterThan(original.acquisitionValue);
    }
  });

  it('improved offer steps aggression up one level', () => {
    const target   = makePlayer({ id: 1, pos: 'WR', ovr: 75, teamId: 10 });
    const original = makeOffer({ status: 'pending', aggression: 'MEDIUM' });
    const aiPicks  = [makePick({ id: 'p1', round: 1, currentTeamId: 5 })];
    const improved = improveAIOffer(original, target, makeTeam({ id: 5 }), [], aiPicks, 2025, 6, 99);
    if (improved) {
      expect(improved.aggression).toBe('HIGH');
    }
  });

  it('improved offer sets improved: true', () => {
    const target   = makePlayer({ id: 1, pos: 'WR', ovr: 75, teamId: 10 });
    const original = makeOffer({ status: 'pending', aggression: 'LOW' });
    const aiPicks  = [makePick({ id: 'p1', round: 1, currentTeamId: 5 })];
    const improved = improveAIOffer(original, target, makeTeam({ id: 5 }), [], aiPicks, 2025, 6, 99);
    if (improved) {
      expect(improved.improved).toBe(true);
    }
  });

  it('aggression does not exceed MAX', () => {
    const target   = makePlayer({ id: 1, pos: 'WR', ovr: 75, teamId: 10 });
    const original = makeOffer({ status: 'pending', aggression: 'MAX' });
    const aiPicks  = [makePick({ id: 'p1', round: 1, currentTeamId: 5 })];
    const improved = improveAIOffer(original, target, makeTeam({ id: 5 }), [], aiPicks, 2025, 6, 99);
    if (improved) {
      expect(improved.aggression).toBe('MAX');
    }
  });
});

// ── evaluateCounterOffer ──────────────────────────────────────────────────────

describe('evaluateCounterOffer', () => {
  it('returns "reject" for null originalOffer', () => {
    expect(evaluateCounterOffer(null, { aiReceivesValue: 900 }, makeTeam(), 42)).toBe('reject');
  });

  it('returns "reject" for null preComputedValues', () => {
    expect(evaluateCounterOffer(makeOffer(), null, makeTeam(), 42)).toBe('reject');
  });

  it('returns "accept" when aiReceivesValue >= 90% of acquisitionValue', () => {
    const offer = makeOffer({ acquisitionValue: 1000 });
    const result = evaluateCounterOffer(offer, { aiReceivesValue: 950 }, makeTeam(), 42);
    expect(result).toBe('accept');
  });

  it('returns "accept" at exactly 90% threshold', () => {
    const offer = makeOffer({ acquisitionValue: 1000 });
    expect(evaluateCounterOffer(offer, { aiReceivesValue: 900 }, makeTeam(), 42)).toBe('accept');
  });

  it('returns "reject" when aiReceivesValue < 60% of acquisitionValue', () => {
    const offer = makeOffer({ acquisitionValue: 1000 });
    expect(evaluateCounterOffer(offer, { aiReceivesValue: 550 }, makeTeam(), 42)).toBe('reject');
  });

  it('returns "counter" or "reject" in the 60–90% range (seeded)', () => {
    const offer  = makeOffer({ acquisitionValue: 1000 });
    const result = evaluateCounterOffer(offer, { aiReceivesValue: 750 }, makeTeam(), 42);
    expect(['counter', 'reject']).toContain(result);
  });

  it('is deterministic in the middle zone', () => {
    const offer  = makeOffer({ acquisitionValue: 1000 });
    const r1 = evaluateCounterOffer(offer, { aiReceivesValue: 750 }, makeTeam(), 12345);
    const r2 = evaluateCounterOffer(offer, { aiReceivesValue: 750 }, makeTeam(), 12345);
    expect(r1).toBe(r2);
  });

  it('returns "reject" when acquisitionValue is 0', () => {
    const offer = makeOffer({ acquisitionValue: 0 });
    expect(evaluateCounterOffer(offer, { aiReceivesValue: 0 }, makeTeam(), 42)).toBe('reject');
  });
});

// ── getAITradeBlockTargets ────────────────────────────────────────────────────

describe('getAITradeBlockTargets', () => {
  it('returns [] when userTeam is null', () => {
    expect(getAITradeBlockTargets(null, [], [], 2025, 5)).toEqual([]);
  });

  it('returns [] when no block players', () => {
    const userTeam = makeTeam({ id: 10, isHuman: true });
    const players  = [makePlayer({ id: 1, teamId: 10, onTradeBlock: false })];
    const teams    = [userTeam, makeTeam({ id: 5 })];
    expect(getAITradeBlockTargets(userTeam, players, teams, 2025, 5)).toEqual([]);
  });

  it('returns [] when no AI teams exist', () => {
    const userTeam = makeTeam({ id: 10, isHuman: true });
    const players  = [makePlayer({ id: 1, teamId: 10, onTradeBlock: true })];
    const teams    = [userTeam]; // no AI teams
    expect(getAITradeBlockTargets(userTeam, players, teams, 2025, 5)).toEqual([]);
  });

  it('returns up to 3 AI teams per block player', () => {
    const userTeam = makeTeam({ id: 10, isHuman: true });
    const players  = [makePlayer({ id: 1, teamId: 10, onTradeBlock: true })];
    const aiTeams  = [1, 2, 3, 4, 5].map(id => makeTeam({ id }));
    const targets  = getAITradeBlockTargets(userTeam, players, [userTeam, ...aiTeams], 2025, 5);
    expect(targets.length).toBeLessThanOrEqual(3);
    expect(targets.length).toBeGreaterThan(0);
  });

  it('each result has { aiTeam, targetPlayerId }', () => {
    const userTeam = makeTeam({ id: 10 });
    const players  = [makePlayer({ id: 1, teamId: 10, onTradeBlock: true })];
    const teams    = [userTeam, makeTeam({ id: 5 }), makeTeam({ id: 6 })];
    const targets  = getAITradeBlockTargets(userTeam, players, teams, 2025, 5);
    for (const t of targets) {
      expect(t).toHaveProperty('aiTeam');
      expect(t).toHaveProperty('targetPlayerId');
      expect(t.targetPlayerId).toBe(1);
    }
  });

  it('does not include the user\'s own team as a pursuer', () => {
    const userTeam = makeTeam({ id: 10, isHuman: true });
    const players  = [makePlayer({ id: 1, teamId: 10, onTradeBlock: true })];
    const teams    = [userTeam, makeTeam({ id: 5 })];
    const targets  = getAITradeBlockTargets(userTeam, players, teams, 2025, 5);
    for (const t of targets) {
      expect(Number(t.aiTeam.id)).not.toBe(10);
    }
  });

  it('is deterministic — same inputs produce same output', () => {
    const userTeam = makeTeam({ id: 10 });
    const players  = [makePlayer({ id: 1, teamId: 10, onTradeBlock: true })];
    const teams    = [userTeam, makeTeam({ id: 5 }), makeTeam({ id: 6 }), makeTeam({ id: 7 })];
    const r1 = getAITradeBlockTargets(userTeam, players, teams, 2025, 5);
    const r2 = getAITradeBlockTargets(userTeam, players, teams, 2025, 5);
    expect(r1.map(t => t.aiTeam.id)).toEqual(r2.map(t => t.aiTeam.id));
  });

  it('handles multiple block players independently', () => {
    const userTeam = makeTeam({ id: 10 });
    const players  = [
      makePlayer({ id: 1, teamId: 10, pos: 'WR', onTradeBlock: true }),
      makePlayer({ id: 2, teamId: 10, pos: 'QB', onTradeBlock: true }),
    ];
    const teams    = [userTeam, makeTeam({ id: 5 }), makeTeam({ id: 6 }), makeTeam({ id: 7 })];
    const targets  = getAITradeBlockTargets(userTeam, players, teams, 2025, 5);
    const ids1     = targets.filter(t => t.targetPlayerId === 1);
    const ids2     = targets.filter(t => t.targetPlayerId === 2);
    expect(ids1.length).toBeGreaterThan(0);
    expect(ids2.length).toBeGreaterThan(0);
  });
});

// ── No Math.random guardrail ──────────────────────────────────────────────────

describe('No Math.random guardrail', () => {
  it('computeAIOfferValue produces consistent values without Math.random', () => {
    const player = makePlayer({ ovr: 80 });
    const calls  = Array.from({ length: 10 }, () =>
      computeAIOfferValue(player, makeTeam(), { positionNeed: 0.5, aggression: 'MEDIUM' }, 42),
    );
    expect(new Set(calls).size).toBe(1);
  });

  it('getAITradeBlockTargets produces consistent ordering without Math.random', () => {
    const userTeam = makeTeam({ id: 10 });
    const players  = [makePlayer({ id: 1, teamId: 10, onTradeBlock: true })];
    const teams    = [userTeam, makeTeam({ id: 5 }), makeTeam({ id: 6 }), makeTeam({ id: 7 })];
    const results  = Array.from({ length: 5 }, () =>
      getAITradeBlockTargets(userTeam, players, teams, 2025, 5).map(t => t.aiTeam.id),
    );
    const first = JSON.stringify(results[0]);
    expect(results.every(r => JSON.stringify(r) === first)).toBe(true);
  });
});
