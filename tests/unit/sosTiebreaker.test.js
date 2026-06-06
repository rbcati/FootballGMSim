import { describe, it, expect } from 'vitest';
import { buildDraftOrder, computeStrengthOfSchedule } from '../../src/worker/modding/ruleEngine.js';
import { getZeroStats } from '../../src/core/state.js';

// Wave 4 Fix 4: draft-order tiebreaker uses Strength of Schedule (not point
// differential), with a seeded coin-flip fallback.

const teams = [
  { id: 0, wins: 2, losses: 15, ptsFor: 200, ptsAgainst: 480 }, // weak team, tough schedule
  { id: 1, wins: 2, losses: 15, ptsFor: 320, ptsAgainst: 360 }, // weak team, soft schedule
  { id: 2, wins: 14, losses: 3 },
  { id: 3, wins: 13, losses: 4 },
];

// Team 0 plays the strong teams (2 & 3); team 1 plays nobody strong (each other / 0).
const schedule = {
  weeks: [
    { games: [{ home: 0, away: 2 }, { home: 1, away: 3 }] },
    { games: [{ home: 0, away: 3 }, { home: 1, away: 0 }] },
    { games: [{ home: 2, away: 0 }, { home: 3, away: 1 }] },
  ],
};

describe('SOS draft tiebreaker', () => {
  it('computes average opponent win% per team', () => {
    const sos = computeStrengthOfSchedule(teams, schedule);
    // Team 0 faced 2 (.82) and 3 (.76) repeatedly → high SOS; team 1 faced weak/0 → lower.
    expect(sos.get(0)).toBeGreaterThan(sos.get(1));
  });

  it('breaks a win-tie by SOS so the softer schedule drafts earlier', () => {
    const order = buildDraftOrder(teams, { draftOrderLogic: 'reverse_standings' }, null, () => 0.5, { schedule });
    // Teams 0 and 1 both have 2 wins; team 1 (softer schedule, lower SOS) picks first.
    expect(order.indexOf(1)).toBeLessThan(order.indexOf(0));
  });

  it('ignores point differential as a tiebreaker (anti-tank)', () => {
    // Team 0 has a far worse point diff but a TOUGHER schedule: it must NOT pick
    // ahead of team 1 just for losing by more.
    const order = buildDraftOrder(teams, { draftOrderLogic: 'reverse_standings' }, null, () => 0.5, { schedule });
    expect(order[0]).toBe(1);
  });

  it('falls back to a seeded coin-flip when wins and SOS tie', () => {
    const tied = [{ id: 5, wins: 4, losses: 13 }, { id: 6, wins: 4, losses: 13 }];
    // rng assigns keys in id order: id5 → 0.9, id6 → 0.1 ⇒ id6 (lower key) drafts first.
    const seq = [0.9, 0.1];
    let i = 0;
    const order = buildDraftOrder(tied, { draftOrderLogic: 'reverse_standings' }, null, () => seq[i++]);
    expect(order).toEqual([6, 5]);
  });
});

describe('career stat schema (Fix 2 source of truth)', () => {
  it('exposes the full per-season schema with fields the old archive dropped', () => {
    const schema = getZeroStats();
    // Fields that the old ~16-field career line silently dropped:
    for (const key of ['yardsAfterCatch', 'pressures', 'passesDefended', 'tacklesForLoss', 'longestPass', 'puntYards']) {
      expect(schema).toHaveProperty(key);
    }
    expect(Object.keys(schema).length).toBeGreaterThan(40);
  });
});
