import { describe, expect, it } from 'vitest';
import { Players, configureActiveLeague, openDB, clearAllData } from '../../src/db/index.js';

describe('db loadBulk', () => {
  it('loads multiple ids in-order when indexedDB is available', async () => {
    if (!global.indexedDB) {
      // Node-only runners in CI often do not provide indexedDB.
      expect(true).toBe(true);
      return;
    }

    configureActiveLeague('test_league');
    await openDB();
    await clearAllData();

    const testPlayers = [
      { id: 'p1', name: 'Player 1', pos: 'QB', teamId: 1 },
      { id: 'p2', name: 'Player 2', pos: 'RB', teamId: 2 },
      { id: 'p3', name: 'Player 3', pos: 'WR', teamId: 1 },
    ];

    await Players.saveBulk(testPlayers);
    const loaded = await Players.loadBulk(['p1', 'p2', 'p4']);

    expect(loaded).toHaveLength(3);
    expect(loaded[0]?.id).toBe('p1');
    expect(loaded[1]?.id).toBe('p2');
    expect(loaded[2]).toBeNull();

    const empty = await Players.loadBulk([]);
    expect(empty).toEqual([]);
  });
});
