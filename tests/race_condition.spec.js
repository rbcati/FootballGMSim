const { test, expect } = require('@playwright/test');

test('Live Game: Skip to End Race Condition', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // 1. Setup Game (Assume server running at localhost:8000)
  await page.goto('http://localhost:8000/');

  // Wait for game controller to initialize
  await page.waitForFunction(() => window.initNewGame, { timeout: 10000 });

  // Wait for init
  await page.waitForSelector('#onboardStart', { timeout: 10000 });
  await page.click('#onboardStart');

  // Go to Hub
  await page.waitForSelector('#hub', { timeout: 15000 });

  // Wait for league to be initialized
  await page.waitForFunction(() => window.state && window.state.league && window.state.league.teams && window.state.league.teams.length > 0, { timeout: 10000 });

  // Start a live game (mock function call)
  // We need to find valid team IDs. State should be initialized.
  await page.evaluate(async () => {
      const L = window.state.league;
      const home = L.teams[0];
      const away = L.teams[1];
      console.log('Starting live game with teams:', home.id, away.id);
      // Ensure we use the global function
      await window.watchLiveGame(home.id, away.id);
  });

  // Wait for modal or view
  // watchLiveGame sets hash to #/game-sim usually, or opens modal.
  // The code says: window.liveGameViewer.renderToView('#game-sim');
  // So we wait for #game-sim to have content.
  await page.waitForSelector('.live-game-header', { timeout: 10000 });

  // 2. Trigger Race Condition
  // Call displayNextPlay and then immediately skipToEnd
  await page.evaluate(async () => {
      const viewer = window.liveGameViewer;

      // Force slow animation to ensure we can hit the race window
      viewer.tempo = 'slow';

      // Start a play (this triggers async animatePlay)
      viewer.displayNextPlay();

      // Immediately skip (this triggers synchronous simulation loop and sets isSkipping)
      // This mimics the user clicking "Skip" while a play is animating
      viewer.skipToEnd();
  });

  // 3. Verify No Double Game End / State is Clean
  // We check if the game completed successfully and we are not stuck.
  // The 'Game Over' overlay should appear.
  // We look for "Final:" text or the overlay class.
  try {
      await page.waitForSelector('.game-over-overlay', { timeout: 5000 });
  } catch (e) {
      console.log('Overlay did not appear in time, checking if game ended otherwise');
  }

  // Check if "Final" score is displayed in the log or header
  // .game-end class in play log
  const gameEndLog = await page.locator('.play-item.game-end').count();
  expect(gameEndLog).toBeGreaterThan(0);

  // Check internal state
  const isComplete = await page.evaluate(() => {
      return window.liveGameViewer.gameState.gameComplete;
  });
  expect(isComplete).toBe(true);
});
