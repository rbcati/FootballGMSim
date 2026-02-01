const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
      console.log('Navigating...');
      await page.goto('http://localhost:8000');
      await page.waitForTimeout(1000);

      // New League
      console.log('Starting league...');
      await page.evaluate(async () => {
          if (window.gameController) await window.gameController.startNewLeague();
      });
      await page.waitForSelector('#onboardModal');
      await page.click('#onboardStart');
      await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });

      // Live Game
      console.log('Starting live game...');
      await page.evaluate(() => {
          const userTeam = window.state.userTeamId;
          const oppTeam = userTeam === 0 ? 1 : 0;
          window.watchLiveGame(userTeam, oppTeam);
      });
      await page.waitForSelector('#game-sim', { state: 'visible' });
      await page.waitForTimeout(2000); // Wait for animations

      // Take Screenshot
      console.log('Taking screenshot...');
      await page.screenshot({ path: 'verification/live_game_ui.png' });
      console.log('Screenshot saved.');

  } catch (e) {
      console.error(e);
  } finally {
      await browser.close();
  }
})();
