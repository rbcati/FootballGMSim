/**
 * aiExtensionEngine.unit.test.js
 *
 * Unit tests for the AI Contract Extensions V1 pure engine.
 * Covers shouldAIExtendPlayer, computeAIExtensionOffer,
 * willPlayerAcceptAIExtension, getAIExtensionTargets, and determinism.
 *
 * No worker/UI/cache/DB imports — pure module only.
 */

import { describe, it, expect } from 'vitest';
import {
  AI_EXTENSION_FACTORS,
  shouldAIExtendPlayer,
  computeAIExtensionOffer,
  willPlayerAcceptAIExtension,
  getAIExtensionTargets,
} from '../../src/core/contracts/aiExtensionEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return { id: 10, name: 'Test FC', wins: 10, losses: 6, capRoom: 50, ...overrides };
}

function makePlayer(overrides = {}) {
  return {
    id: 101,
    name: 'John Doe',
    pos: 'WR',
    ovr: 80,
    age: 26,
    contractYearsLeft: 1,
    negotiationStatus: null,
    holdout: { active: false },
    ...overrides,
  };
}

// ── shouldAIExtendPlayer ──────────────────────────────────────────────────────

describe('shouldAIExtendPlayer', () => {
  it('returns true for contender + OVR >= threshold + adequate cap', () => {
    const team   = makeTeam({ capRoom: 50 });
    const player = makePlayer({ ovr: 75, age: 26 }); // >= contender threshold 72
    expect(shouldAIExtendPlayer(team, player, 'contender', 50)).toBe(true);
  });

  it('returns false for player with OVR below contender threshold', () => {
    const player = makePlayer({ ovr: 70 }); // < 72
    expect(shouldAIExtendPlayer(makeTeam(), player, 'contender', 50)).toBe(false);
  });

  it('returns false for player on active holdout', () => {
    const player = makePlayer({ ovr: 80, holdout: { active: true } });
    expect(shouldAIExtendPlayer(makeTeam(), player, 'contender', 50)).toBe(false);
  });

  it('returns false when player age >= 34', () => {
    const player = makePlayer({ ovr: 90, age: 34 });
    expect(shouldAIExtendPlayer(makeTeam(), player, 'contender', 50)).toBe(false);
  });

  it('returns false for seller team with OVR < 80', () => {
    const player = makePlayer({ ovr: 79 });
    expect(shouldAIExtendPlayer(makeTeam(), player, 'seller', 50)).toBe(false);
  });

  it('returns true for seller team with franchise anchor (OVR >= 80)', () => {
    const player = makePlayer({ ovr: 80, contractYearsLeft: 1 });
    expect(shouldAIExtendPlayer(makeTeam({ capRoom: 100 }), player, 'seller', 100)).toBe(true);
  });

  it('returns false when contractYearsLeft !== 1', () => {
    const player = makePlayer({ ovr: 80, contractYearsLeft: 2 });
    expect(shouldAIExtendPlayer(makeTeam(), player, 'contender', 50)).toBe(false);
  });

  it('returns false when cap is insufficient (capSpace < estimated need)', () => {
    const player = makePlayer({ ovr: 80 });
    // estimated demand ~ (80-60)*0.4 = 8, offer = 8*1.02 = 8.16, buffer = 8.16*1.1 = 8.98
    // capSpace = 1 is clearly insufficient
    expect(shouldAIExtendPlayer(makeTeam({ capRoom: 1 }), player, 'contender', 1)).toBe(false);
  });

  it('returns false for rebuild posture when player age > 26', () => {
    const player = makePlayer({ ovr: 75, age: 27 }); // ovr >= rebuild threshold 60, but age > 26
    expect(shouldAIExtendPlayer(makeTeam({ capRoom: 100 }), player, 'rebuild', 100)).toBe(false);
  });

  it('returns true for rebuild posture when player age <= 26', () => {
    const player = makePlayer({ ovr: 62, age: 24, contractYearsLeft: 1 });
    expect(shouldAIExtendPlayer(makeTeam({ capRoom: 100 }), player, 'rebuild', 100)).toBe(true);
  });

  it('returns false when negotiationStatus is SIGNED (already extended)', () => {
    const player = makePlayer({ ovr: 80, negotiationStatus: 'SIGNED' });
    expect(shouldAIExtendPlayer(makeTeam(), player, 'contender', 50)).toBe(false);
  });
});

// ── computeAIExtensionOffer ───────────────────────────────────────────────────

describe('computeAIExtensionOffer', () => {
  it('amount = adjustedDemand × offerFactor for contender posture', () => {
    const team    = makeTeam();
    const player  = makePlayer({ age: 26 });
    const demand  = 20;
    const offer   = computeAIExtensionOffer(team, player, demand, 'contender', 100);
    const expected = Math.round(demand * AI_EXTENSION_FACTORS.contender.offerFactor * 10) / 10;
    expect(offer.amount).toBe(expected);
  });

  it('amount = adjustedDemand × offerFactor for rebuild posture', () => {
    const demand = 10;
    const offer  = computeAIExtensionOffer(makeTeam(), makePlayer({ age: 24 }), demand, 'rebuild', 100);
    const expected = Math.round(demand * AI_EXTENSION_FACTORS.rebuild.offerFactor * 10) / 10;
    expect(offer.amount).toBe(expected);
  });

  it('years = maxYears for age <= 25 (contender)', () => {
    const offer = computeAIExtensionOffer(makeTeam(), makePlayer({ age: 25 }), 15, 'contender', 100);
    expect(offer.years).toBe(AI_EXTENSION_FACTORS.contender.maxYears); // 4
  });

  it('years = maxYears - 1 for age 26-29 (contender)', () => {
    const offer = computeAIExtensionOffer(makeTeam(), makePlayer({ age: 28 }), 15, 'contender', 100);
    expect(offer.years).toBe(AI_EXTENSION_FACTORS.contender.maxYears - 1); // 3
  });

  it('years = 2 for age 30-32', () => {
    const offer = computeAIExtensionOffer(makeTeam(), makePlayer({ age: 31 }), 15, 'contender', 100);
    expect(offer.years).toBe(2);
  });

  it('years = 1 for age >= 33', () => {
    const offer = computeAIExtensionOffer(makeTeam(), makePlayer({ age: 33 }), 15, 'contender', 100);
    expect(offer.years).toBe(1);
  });

  it('amount is capped at 30% of capSpace', () => {
    const demand  = 30;
    const capSpace = 50;
    const offer   = computeAIExtensionOffer(makeTeam(), makePlayer({ age: 26 }), demand, 'contender', capSpace);
    expect(offer.amount).toBeLessThanOrEqual(capSpace * 0.30 + 0.001);
  });

  it('signingBonus = 25% of total contract value (amount × years)', () => {
    const demand  = 20;
    const offer   = computeAIExtensionOffer(makeTeam(), makePlayer({ age: 26 }), demand, 'contender', 200);
    const expected = Math.round(offer.amount * offer.years * 0.25 * 10) / 10;
    expect(offer.signingBonus).toBe(expected);
  });

  it('includes teamId from team object', () => {
    const team  = makeTeam({ id: 42 });
    const offer = computeAIExtensionOffer(team, makePlayer(), 10, 'middle', 100);
    expect(offer.teamId).toBe(42);
  });
});

// ── willPlayerAcceptAIExtension ───────────────────────────────────────────────

describe('willPlayerAcceptAIExtension', () => {
  it('accepts when offer.amount >= 0.95 × demand (default threshold)', () => {
    const player = makePlayer({ morale: 70 });
    const demand = 20;
    const offer  = { amount: demand * 0.95 }; // exactly at threshold
    expect(willPlayerAcceptAIExtension(player, offer, demand, { score: 70 })).toBe(true);
  });

  it('rejects when offer.amount < 0.95 × demand', () => {
    const demand = 20;
    const offer  = { amount: demand * 0.94 }; // below threshold
    expect(willPlayerAcceptAIExtension(makePlayer(), offer, demand, { score: 70 })).toBe(false);
  });

  it('requires 1.05 × demand when morale < 40 (disgruntled player)', () => {
    const demand = 20;
    const offer  = { amount: demand * 1.00 }; // meets normal but not disgruntled threshold
    expect(willPlayerAcceptAIExtension(makePlayer(), offer, demand, { score: 35 })).toBe(false);
  });

  it('accepts at 1.05 × demand when morale < 40', () => {
    const demand = 20;
    const offer  = { amount: demand * 1.05 };
    expect(willPlayerAcceptAIExtension(makePlayer(), offer, demand, { score: 35 })).toBe(true);
  });

  it('accepts at 0.92 × demand when morale > 75 (happy player)', () => {
    const demand = 20;
    const offer  = { amount: demand * 0.92 };
    expect(willPlayerAcceptAIExtension(makePlayer(), offer, demand, { score: 80 })).toBe(true);
  });

  it('rejects at 0.91 × demand even when morale > 75', () => {
    const demand = 20;
    const offer  = { amount: demand * 0.91 };
    expect(willPlayerAcceptAIExtension(makePlayer(), offer, demand, { score: 80 })).toBe(false);
  });

  it('HOF inducted player requires exactly 1.00 × demand (no discount)', () => {
    const demand = 20;
    const player = makePlayer({ hofStatus: 'inducted', morale: 90 });
    const offerExact  = { amount: demand };
    const offerBelow  = { amount: demand * 0.99 };
    expect(willPlayerAcceptAIExtension(player, offerExact, demand, { score: 90 })).toBe(true);
    expect(willPlayerAcceptAIExtension(player, offerBelow, demand, { score: 90 })).toBe(false);
  });

  it('is deterministic: same inputs always produce same output', () => {
    const player = makePlayer({ morale: 68 });
    const demand = 15;
    const offer  = { amount: 14.5 };
    const ms     = { score: 68 };
    const r1 = willPlayerAcceptAIExtension(player, offer, demand, ms);
    const r2 = willPlayerAcceptAIExtension(player, offer, demand, ms);
    expect(r1).toBe(r2);
  });
});

// ── getAIExtensionTargets ─────────────────────────────────────────────────────

describe('getAIExtensionTargets', () => {
  it('returns at most 3 players per team per offseason', () => {
    const team   = makeTeam({ capRoom: 200 });
    // 5 eligible players
    const players = Array.from({ length: 5 }, (_, i) => makePlayer({
      id: 100 + i, ovr: 75, age: 25, contractYearsLeft: 1,
    }));
    const targets = getAIExtensionTargets(team, players, 'contender', 200, {
      demandByPlayerId: new Map(players.map((p) => [p.id, { baseAnnual: 10 }])),
    });
    expect(targets.length).toBeLessThanOrEqual(3);
  });

  it('sorts by OVR desc, then age asc', () => {
    const team    = makeTeam({ capRoom: 300 });
    const players = [
      makePlayer({ id: 1, ovr: 75, age: 28 }),
      makePlayer({ id: 2, ovr: 80, age: 26 }),
      makePlayer({ id: 3, ovr: 80, age: 25 }),
    ];
    const demandMap = new Map(players.map((p) => [p.id, { baseAnnual: 8 }]));
    const targets = getAIExtensionTargets(team, players, 'contender', 300, { demandByPlayerId: demandMap });
    expect(targets[0].id).toBe(3); // OVR 80, age 25 — highest OVR, youngest
    expect(targets[1].id).toBe(2); // OVR 80, age 26
    expect(targets[2].id).toBe(1); // OVR 75, age 28
  });

  it('excludes players on active holdout', () => {
    const team    = makeTeam({ capRoom: 200 });
    const players = [
      makePlayer({ id: 1, ovr: 80, holdout: { active: true } }),
      makePlayer({ id: 2, ovr: 78 }),
    ];
    const demandMap = new Map(players.map((p) => [p.id, { baseAnnual: 10 }]));
    const targets = getAIExtensionTargets(team, players, 'contender', 200, { demandByPlayerId: demandMap });
    const ids = targets.map((p) => p.id);
    expect(ids).not.toContain(1);
    expect(ids).toContain(2);
  });

  it('accumulates cap usage across extensions (max 3 enforced even with 5 eligible players)', () => {
    // 5 eligible players, all high OVR, plenty of cap — enforced max is 3
    const team = makeTeam({ capRoom: 500 });
    const players = Array.from({ length: 5 }, (_, i) => makePlayer({
      id: 100 + i, ovr: 75, age: 24,
    }));
    const demandMap = new Map(players.map((p) => [p.id, { baseAnnual: 5 }]));
    const targets = getAIExtensionTargets(team, players, 'contender', 500, { demandByPlayerId: demandMap });
    expect(targets.length).toBeLessThanOrEqual(3);
  });
});

// ── Determinism guarantee ─────────────────────────────────────────────────────

describe('Determinism', () => {
  it('same inputs to getAIExtensionTargets always produce same output', () => {
    const team   = makeTeam({ capRoom: 100 });
    const players = [
      makePlayer({ id: 1, ovr: 80, age: 25 }),
      makePlayer({ id: 2, ovr: 74, age: 27 }),
      makePlayer({ id: 3, ovr: 72, age: 24 }),
    ];
    const demandMap = new Map(players.map((p) => [p.id, { baseAnnual: 12 }]));
    const r1 = getAIExtensionTargets(team, players, 'contender', 100, { demandByPlayerId: demandMap });
    const r2 = getAIExtensionTargets(team, players, 'contender', 100, { demandByPlayerId: demandMap });
    expect(r1.map((p) => p.id)).toEqual(r2.map((p) => p.id));
  });
});
