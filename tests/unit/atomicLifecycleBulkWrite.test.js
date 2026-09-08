import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bulkWrite,
  clearAllData,
  configureActiveLeague,
  Meta,
  News,
  PlayerStats,
  Players,
  Seasons,
  Transactions,
} from '../../src/db/index.js';

describe('atomic lifecycle bulk writes', () => {
  beforeEach(async () => {
    configureActiveLeague(`atomic-lifecycle-${Date.now()}-${Math.random()}`);
    await clearAllData();
  });

  it('commits hot state and staged transactions together', async () => {
    await bulkWrite({
      meta: { year: 2031, phase: 'preseason' },
      players: [{ id: 10, teamId: 1, status: 'active' }],
      transactions: [{ type: 'SIGN', teamId: 1, details: { playerId: 10 } }],
    });

    expect(await Meta.load()).toEqual(expect.objectContaining({ year: 2031, phase: 'preseason' }));
    expect(await Players.load(10)).toEqual(expect.objectContaining({ teamId: 1 }));
    expect(await Transactions.loadRecent()).toEqual([
      expect.objectContaining({ type: 'SIGN', teamId: 1 }),
    ]);
  });

  it('aborts every store when a staged transaction cannot be cloned', async () => {
    await bulkWrite({
      meta: { year: 2030, phase: 'draft' },
      players: [{ id: 10, teamId: null, status: 'free_agent' }],
    });

    await expect(bulkWrite({
      meta: { year: 2031, phase: 'preseason' },
      players: [{ id: 10, teamId: 1, status: 'active' }],
      transactions: [{ type: 'SIGN', uncloneable: () => true }],
    })).rejects.toBeTruthy();

    expect(await Meta.load()).toEqual(expect.objectContaining({ year: 2030, phase: 'draft' }));
    expect(await Players.load(10)).toEqual(expect.objectContaining({ teamId: null, status: 'free_agent' }));
    expect(await Transactions.loadRecent()).toEqual([]);
  });

  it('commits archive rows with rollover state and aborts all archive stores together', async () => {
    await bulkWrite({
      meta: { year: 2030, phase: 'draft', currentSeasonId: 's5' },
      players: [{ id: 10, teamId: null, status: 'free_agent' }],
    });

    await expect(bulkWrite({
      meta: { year: 2031, phase: 'preseason', currentSeasonId: 's6' },
      players: [{ id: 10, teamId: 1, status: 'active' }],
      seasonStats: [{ seasonId: 's5', playerId: 10, passingYards: 4200 }],
      seasons: [{ id: 's5', year: 2030, champion: { id: 2 } }],
      news: [{ type: 'AWARD', seasonId: 's5', text: 'MVP named' }],
      transactions: [
        { type: 'SIGN', teamId: 1, details: { playerId: 10 } },
        { type: 'RESTRUCTURE', uncloneable: () => true },
      ],
    })).rejects.toBeTruthy();

    expect(await Meta.load()).toEqual(expect.objectContaining({ year: 2030, phase: 'draft' }));
    expect(await Players.load(10)).toEqual(expect.objectContaining({ teamId: null }));
    expect(await Seasons.loadAll()).toEqual([]);
    expect(await PlayerStats.bySeason('s5')).toEqual([]);
    expect(await News.getRecent()).toEqual([]);
    expect(await Transactions.loadRecent()).toEqual([]);

    await bulkWrite({
      meta: { year: 2031, phase: 'preseason', currentSeasonId: 's6' },
      players: [{ id: 10, teamId: 1, status: 'active' }],
      seasonStats: [{ seasonId: 's5', playerId: 10, passingYards: 4200 }],
      seasons: [{ id: 's5', year: 2030, champion: { id: 2 } }],
      news: [{ type: 'AWARD', seasonId: 's5', text: 'MVP named' }],
      transactions: [{ type: 'SIGN', teamId: 1, details: { playerId: 10 } }],
    });

    expect(await Seasons.loadAll()).toEqual([expect.objectContaining({ id: 's5', year: 2030 })]);
    expect(await PlayerStats.bySeason('s5')).toEqual([expect.objectContaining({ playerId: 10, passingYards: 4200 })]);
    expect(await News.getRecent()).toEqual([expect.objectContaining({ type: 'AWARD', seasonId: 's5' })]);
    expect(await Transactions.loadRecent()).toEqual([expect.objectContaining({ type: 'SIGN' })]);
  });

});
