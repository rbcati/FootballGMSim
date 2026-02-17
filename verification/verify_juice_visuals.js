const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // 1. Navigate to app
  await page.goto('http://localhost:3000');

  // 2. Wait for load
  await page.waitForTimeout(2000);

  // 3. Inject logic to start a game and trigger effects
  await page.evaluate(() => {
      // Mock game state
      window.state = {
          league: {
              teams: [
                  { id: 0, name: 'Home Team', abbr: 'HOM', color: '#003366', roster: [] },
                  { id: 1, name: 'Away Team', abbr: 'AWY', color: '#990000', roster: [] }
              ]
          },
          userTeamId: 0
      };

      // Force init game
      window.watchLiveGame(0, 1);

      // Wait a bit for render
      setTimeout(() => {
          const viewer = window.liveGameViewer;
          if (viewer) {
              // 1. Force High Momentum
              viewer.gameState.momentum = 90;
              viewer.updateFieldState(20, true);

              // 2. Trigger Denied Overlay manually
              viewer.triggerVisualFeedback('denied', 'DENIED!');

              // 3. Trigger XP Float
              viewer.triggerFloatText('+50 XP', 'xp-float');
          }
      }, 1000);
  });

  // 4. Wait for effects to appear
  await page.waitForTimeout(2000);

  // 5. Take screenshot
  await page.screenshot({ path: 'verification/juice_visuals.png' });

  await browser.close();
})();
