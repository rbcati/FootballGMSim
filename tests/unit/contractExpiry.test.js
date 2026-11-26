import { describe, expect, it } from 'vitest';
import { planContractExpiry, expiryReason, wasRecommitted } from '../../src/core/contracts/contractExpiry.js';
import { buildResignAdvanceGate, isKeyExpiringPlayer } from '../../src/ui/utils/offseasonActionCenter.js';

const player = (id, years, patch = {}) => ({ id, name: `P${id}`, pos: 'WR', teamId: 0, status: 'active', ovr: 70, contract: { years, yearsTotal: Math.max(years, 1), baseAnnual: 2 }, ...patch });

describe('planContractExpiry', () => {
  for (const id of [0, 7, 'opaque-player']) {
    it(`releases unresolved expiring contracts and keeps re-committed ones (id ${JSON.stringify(id)})`, () => {
      const plan = planContractExpiry([
        player(id, 1, { extensionDecision: 'let_walk' }),
        player(`${id}-d`, 1, { extensionDecision: 'deferred' }),
        player(`${id}-p`, 1),
        player(`${id}-e`, 4, { extensionDecision: 'extended' }),
        player(`${id}-t`, 1, { extensionDecision: 'tagged' }),
        player(`${id}-ft`, 1, { extensionDecision: 'franchise_tagged' }),
        player(`${id}-rfa`, 1, { extensionDecision: 'rfa_tendered' }),
        player(`${id}-v`, 3, { contract: { years: 3, yearsRemaining: 3, baseAnnual: 9 } }),
      ]);
      expect(plan.releases.map((r) => [r.playerId, r.reason])).toEqual([
        [id, 'let_walk'], [`${id}-d`, 'deferred'], [`${id}-p`, 'unresolved'],
      ]);
      expect(plan.retained).toEqual([`${id}-e`, `${id}-t`, `${id}-ft`, `${id}-rfa`]);
      expect(plan.decrements).toEqual([{ playerId: `${id}-v`, contract: { years: 2, yearsRemaining: 2, baseAnnual: 9 } }]);
    });
  }

  it('ignores free agents, retirees, prospects and team-less rows and never mutates input', () => {
    const rows = [
      player(1, 1, { teamId: null, status: 'free_agent' }),
      player(2, 1, { status: 'retired' }),
      player(3, 1, { teamId: null, status: 'draft_eligible' }),
      player(4, 2, { teamId: 'FA' }),
    ];
    const frozen = structuredClone(rows);
    const plan = planContractExpiry(rows);
    expect(plan).toEqual({ releases: [], decrements: [], retained: [] });
    expect(rows).toEqual(frozen);
  });

  it('classifies reasons and recommitment', () => {
    expect(expiryReason({ extensionDecision: 'let_walk' })).toBe('let_walk');
    expect(expiryReason({ extensionDecision: 'deferred' })).toBe('deferred');
    expect(expiryReason({})).toBe('unresolved');
    expect(wasRecommitted({ extensionDecision: 'extended' })).toBe(true);
    expect(wasRecommitted({ extensionDecision: 'pending' })).toBe(false);
  });
});

describe('buildResignAdvanceGate', () => {
  const league = (roster) => ({ userTeamId: 0, teams: [{ id: 0, roster }] });
  it('names every unresolved expiring player and splits key from other', () => {
    const gate = buildResignAdvanceGate(league([
      player(1, 1, { name: 'Raymond Bridges', pos: 'QB', ovr: 80 }),
      player(2, 1, { name: 'Gardner', pos: 'WR', ovr: 60, extensionDecision: 'deferred' }),
      player(3, 1, { name: 'Walker', extensionDecision: 'let_walk' }),
      player(4, 1, { name: 'Ext', extensionDecision: 'extended' }),
      player(5, 3, { name: 'Signed' }),
    ]));
    expect(gate.total).toBe(2);
    expect(gate.keyNames).toEqual(['Raymond Bridges (QB)']);
    expect(gate.otherNames).toEqual(['Gardner (WR, Decide Later)']);
  });
  it('uses one key definition shared with the Re-signing Center', () => {
    expect(isKeyExpiringPlayer({ pos: 'CB', ovr: 50 })).toBe(true);
    expect(isKeyExpiringPlayer({ pos: 'WR', ovr: 74 })).toBe(true);
    expect(isKeyExpiringPlayer({ pos: 'WR', ovr: 73 })).toBe(false);
  });
});
