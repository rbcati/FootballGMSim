
const { test, expect } = require('@playwright/test');

test('benchmark finalizeSeason logs fetching', async ({ page }) => {
  // Go to the app to ensure environment is set up
  // Assuming the server is running on port 3000 as per vite.config.js
  await page.goto('http://localhost:3000');

  // Evaluate the benchmark in the browser context
  const result = await page.evaluate(async () => {
    // Helper to clear DB
    const deleteDB = () => new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase("perf_test_db");
      req.onsuccess = resolve;
      req.onerror = resolve; // Resolve even if error (e.g. not found)
      req.onblocked = resolve;
    });

    await deleteDB();

    // Initialize DB
    if (!window.FootballDB) {
        throw new Error("FootballDB not found on window object");
    }

    // Monkey patch transaction to count
    let transactionCount = 0;
    const originalTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(...args) {
        transactionCount++;
        return originalTransaction.apply(this, args);
    };

    const db = new window.FootballDB("perf_test_db");
    await db.initPromise;

    const numGames = 5000;
    const logsPerGame = 2;
    const gameIds = [];

    // Populate data
    console.log(`Populating DB with ${numGames} games and ${logsPerGame} logs each...`);
    const populateStart = performance.now();

    // Create games and logs
    // We can do this in parallel to speed up setup
    const setupPromises = [];
    for (let i = 0; i < numGames; i++) {
        const gameId = 1000 + i;
        gameIds.push(gameId);
        setupPromises.push(db.addGame(gameId, 2024));
        for (let j = 0; j < logsPerGame; j++) {
            setupPromises.push(db.logPlay(gameId, 1, 'run', 5));
        }
    }
    await Promise.all(setupPromises);

    console.log(`Populate took: ${(performance.now() - populateStart).toFixed(2)}ms`);

    // Benchmark Current Implementation (N Transactions)
    transactionCount = 0;
    const startCurrent = performance.now();
    const logsPromises = gameIds.map(gameId => db.getLogsByGameId(gameId));
    const allLogsCurrent = await Promise.all(logsPromises);
    const durationCurrent = performance.now() - startCurrent;
    const txCountCurrent = transactionCount;

    let totalLogs = 0;
    for (const logs of allLogsCurrent) totalLogs += logs.length;

    transactionCount = 0;
    // Use the actual optimized implementation
    const startRange = performance.now();
    const logsRange = await db.getLogsByGameIds(gameIds);
    const durationRange = performance.now() - startRange;
    const txCountRange = transactionCount;

    return {
        durationCurrent,
        durationRange,
        txCountCurrent,
        txCountRange,
        totalLogs,
        totalLogsRange: logsRange.length,
        improvement: durationCurrent / durationRange
    };
  });

  console.log('Benchmark Results:', result);

  expect(result.totalLogs).toBe(result.totalLogsRange);
  // We expect significant improvement
  // But allow for variance in CI/Sandbox environments
  expect(result.durationRange).toBeLessThan(result.durationCurrent);
});
