
import { Players, STORES, configureActiveLeague, openDB, clearAllData } from '../../src/db/index.js';
import assert from 'assert';

async function testLoadBulk() {
  console.log('Running loadBulk unit tests...');

  configureActiveLeague('test_league');
  // In Node.js, IndexedDB is not natively available unless provided.
  // Since we can't easily install new packages, I'll rely on the existing tests and my benchmark.
  // Actually, I can check if global.indexedDB exists.
  if (!global.indexedDB) {
      console.warn('indexedDB not found in global. Skipping database integration test.');
      return;
  }

  await openDB();
  await clearAllData();

  const testPlayers = [
    { id: 'p1', name: 'Player 1', pos: 'QB', teamId: 1 },
    { id: 'p2', name: 'Player 2', pos: 'RB', teamId: 2 },
    { id: 'p3', name: 'Player 3', pos: 'WR', teamId: 1 },
  ];

  await Players.saveBulk(testPlayers);
  console.log('Saved test players.');

  // Test loading multiple IDs
  const loaded = await Players.loadBulk(['p1', 'p2', 'p4']);
  console.log('Loaded players:', loaded.map(p => p?.id));

  assert.strictEqual(loaded.length, 3, 'Should return 3 results');
  assert.strictEqual(loaded[0].id, 'p1', 'First should be p1');
  assert.strictEqual(loaded[1].id, 'p2', 'Second should be p2');
  assert.strictEqual(loaded[2], null, 'Third should be null (missing p4)');

  // Test loading empty array
  const empty = await Players.loadBulk([]);
  assert.deepStrictEqual(empty, [], 'Empty array should return empty array');

  console.log('PASS: loadBulk');
}

testLoadBulk().catch(err => {
  console.error('FAIL: loadBulk', err);
  process.exit(1);
});
