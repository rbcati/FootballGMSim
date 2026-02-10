const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 375, height: 667 }, // iPhone SE
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:3000');

    // Ensure league
    await page.waitForTimeout(2000);
    await page.evaluate(async () => {
         if (!window.state || !window.state.league) {
             if (window.gameController) {
                 await window.gameController.startNewLeague();
             } else {
                 console.error('No gameController');
             }
             const startBtn = document.getElementById('onboardStart');
             if (startBtn) startBtn.click();
         }
    });

    await page.waitForSelector('#hub', { state: 'visible', timeout: 10000 });

    // Start Live Game
    await page.evaluate(async () => {
        // Mock game state context if needed or just start first game
        const L = window.state.league;
        const game = L.schedule.weeks[0].games[0]; // First game

        // Ensure viewer
        if (!window.liveGameViewer) window.liveGameViewer = new window.LiveGameViewer();

        // Mock team objects if needed (watchLiveGame handles ID lookup)
        window.watchLiveGame(game.home, game.away);
    });

    await page.waitForSelector('.live-game-header', { state: 'visible', timeout: 10000 });

    // Wait for render
    await page.waitForTimeout(1000);

    // Screenshot
    await page.screenshot({ path: 'verification/mobile_live_game.png', fullPage: true });
    console.log('Screenshot saved to verification/mobile_live_game.png');

  } catch (e) {
    console.error('Verification failed:', e);
  } finally {
    await browser.close();
  }
})();
