import { describe, it, expect } from 'vitest';
import { createOffensiveLedger } from './offensiveLedger.ts';
import { validateOffensiveStatIntegrity, reconcilePlayerToTeam } from '../simulation/gameStatReconciliation.js';
import { chooseCreditedTouchdown } from '../simulation/touchdownAttribution.js';
import { accumulateStatLine } from '../simulation/statAggregation.js';
import { generateRBStats, generateReceiverStats } from '../simulation/statAccumulator.js';
import { Utils } from '../utils.js';
import { attributeAggregatePassing } from '../simulation/aggregatePassingAttribution.js';

describe('live offensive ownership', () => {
  it.each([0, 1, 2, 75, 250])('reconciles %i completed passes with shared targets, negative gains and TDs', (count) => {
    const ledger = createOffensiveLedger(['qb', 'rb', 'wr', 'te'], `seed=1804 count=${count}`);
    for (let i = 0; i < count; i++) ledger.credit({ type: 'pass', passerId: 'qb', targetId: ['rb', 'wr', 'te'][i % 3], complete: true, yards: i % 4 === 0 ? -3 : 15, touchdown: i % 7 === 1 });
    expect(ledger.totals.passComp).toBe(count);
    expect(validateOffensiveStatIntegrity(ledger.players).errors).toEqual([]);
    expect(reconcilePlayerToTeam(ledger.players, ledger.totals).ok).toBe(true);
  });

  it('supports a lone receiver, incomplete passes, picks and sacks without manufactured catches/carries', () => {
    const ledger = createOffensiveLedger(['qb', 'wr'], 'low-volume');
    ledger.credit({ type: 'pass', passerId: 'qb', targetId: 'wr', complete: false, yards: 0 });
    ledger.credit({ type: 'pass', passerId: 'qb', targetId: 'wr', complete: false, interception: true, yards: 0 });
    ledger.credit({ type: 'pass', passerId: 'qb', complete: false, sack: true, yards: -8 });
    expect(ledger.totals).toMatchObject({ passAtt: 2, passComp: 0, passYd: 0, rushAtt: 0, sacksAllowed: 1 });
    ledger.credit({ type: 'pass', passerId: 'qb', targetId: 'wr', complete: true, yards: -4 });
    expect(ledger.players.wr).toMatchObject({ receptions: 1, recYd: -4, longestCatch: -4 });
    expect(ledger.players.qb.longestPass).toBe(-4);
    expect(validateOffensiveStatIntegrity(ledger.players).errors).toEqual([]);
  });

  it('attributes rushing TDs, signed longest gains, designed QB runs, kneels and rotation', () => {
    const ledger = createOffensiveLedger(['qb', 'rb', 'backup'], 'rushing');
    expect(ledger.totals.rushAtt).toBe(0);
    ledger.credit({ type: 'rush', runnerId: 'rb', yards: -5 });
    ledger.credit({ type: 'rush', runnerId: 'rb', yards: -2 });
    expect(ledger.players.rb.longestRun).toBe(-2);
    ledger.credit({ type: 'rush', runnerId: 'backup', yards: 17, touchdown: true });
    ledger.credit({ type: 'rush', runnerId: 'qb', yards: 9 });
    ledger.credit({ type: 'rush', runnerId: 'qb', yards: -1 });
    expect(ledger.players.backup).toMatchObject({ rushAtt: 1, rushTD: 1, longestRun: 17 });
    expect(ledger.players.qb).toMatchObject({ rushAtt: 2, rushYd: 8, longestRun: 9 });
    expect(validateOffensiveStatIntegrity(ledger.players).errors).toEqual([]);
    expect(reconcilePlayerToTeam(ledger.players, ledger.totals).ok).toBe(true);
  });

  it('rejects ineligible, missing, duplicate and contradictory references before mutation', () => {
    const ledger = createOffensiveLedger(['qb', 'wr'], 'game=bad team=home');
    for (const play of [
      { type: 'pass', passerId: 'qb', targetId: 'inactive', complete: true, yards: 10 },
      { type: 'pass', passerId: 'qb', targetId: 'wr', complete: false, touchdown: true, yards: 0 },
      { type: 'pass', passerId: 'qb', targetId: 'wr', complete: true, interception: true, yards: 10 },
      { type: 'rush', runnerId: 'wrong-team', yards: 5 },
    ] as const) expect(() => ledger.credit(play)).toThrow(/Stat attribution game=bad team=home/);
    expect(ledger.players).toEqual({});
    expect(() => createOffensiveLedger(['qb', 'qb'], 'duplicate')).toThrow(/duplicate/);
  });

  it('keeps pre-substitution credits when another participant takes over', () => {
    const ledger = createOffensiveLedger(['qb1', 'qb2', 'wr', 'rb'], 'injury');
    ledger.credit({ type: 'pass', passerId: 'qb1', targetId: 'wr', complete: true, yards: 22, touchdown: true });
    const before = { ...ledger.players.qb1 };
    ledger.credit({ type: 'pass', passerId: 'qb2', targetId: 'rb', complete: true, yards: 7 });
    expect(ledger.players.qb1).toEqual(before);
    expect(validateOffensiveStatIntegrity(ledger.players).errors).toEqual([]);
  });
});

describe('aggregate engine participation and accumulation', () => {
  it.each([0, 1, 2, 200])('coordinates %i aggregate catches with QB participation including negative yards', (catches) => {
    for (const yards of catches ? [-17, 0, 499] : [0]) {
      const parts = attributeAggregatePassing(catches, yards, [10, 10]);
      expect(parts.reduce((sum, p) => sum + p.passComp, 0)).toBe(catches);
      expect(parts.reduce((sum, p) => sum + p.passYd, 0)).toBe(yards);
      for (const part of parts) if (!part.passComp) expect(part.passYd).toBe(0);
    }
  });
  it('uses existing randomized receiving weights without yards or TDs on zero catches across 500 seeds', () => {
    for (let seed = 1; seed <= 500; seed++) {
      Utils.setSeed(seed);
      const rb = generateRBStats({ pos: 'RB', ratings: { catching: 1 }, ovr: 60 }, 7, 14, 99, Utils, {}, 0.01);
      const wr = generateReceiverStats({ pos: 'WR', ratings: {}, ovr: 70 }, seed % 3, 7, 99, Utils);
      for (const s of [rb, wr]) {
        expect(s.recTD, `seed=${seed}`).toBeLessThanOrEqual(s.receptions);
        if (!s.receptions) expect(s.recYd, `seed=${seed}`).toBe(0);
      }
    }
  });

  it('does not exceed limited catch/carry TD capacity, even with extreme weights', () => {
    const scorers = [
      { p: { stats: { game: { receptions: 0, recYd: 0 } } }, type: 'WR', weight: 1000 },
      { p: { stats: { game: { receptions: 1, recTD: 0, rushAtt: 1, rushTD: 0, rushYd: 2 } } }, type: 'RB', weight: 1 },
    ];
    Utils.setSeed(1804);
    for (let i = 0; i < 2; i++) {
      const selected = chooseCreditedTouchdown(scorers, false, Utils)!;
      selected.p.stats.game[selected.stat]++;
    }
    expect(chooseCreditedTouchdown(scorers, false, Utils)).toBeNull();
    expect(scorers[1].p.stats.game).toMatchObject({ rushTD: 1, recTD: 1 });
  });

  it('sums counts but takes signed maxima and excludes rates', () => {
    const total = { rushAtt: 0, longestRun: 0 };
    accumulateStatLine({ rushAtt: 2, rushYd: -7, longestRun: -2, passerRating: 150 }, total);
    expect(total).toEqual({ rushAtt: 2, rushYd: -7, longestRun: -2 });
    accumulateStatLine({ rushAtt: 1, rushYd: -5, longestRun: -5 }, total);
    expect(total.longestRun).toBe(-2);
  });
});
