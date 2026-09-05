import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bulkWrite,
  clearAllData,
  configureActiveLeague,
  Meta,
  Players,
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
});
