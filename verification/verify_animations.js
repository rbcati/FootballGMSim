const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(1000);

  // Init League
  await page.evaluate(async () => {
      if (window.gameController) await window.gameController.startNewLeague();
  });

  // Modal
  try {
      const modal = page.locator('#onboardModal');
      if (await modal.isVisible()) await page.click('#onboardStart');
  } catch (e) {}

  await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });

  // Start Game
  await page.evaluate(() => {
      const userTeam = window.state.userTeamId;
      const oppTeam = userTeam === 0 ? 1 : 0;
      window.watchLiveGame(userTeam, oppTeam);
  });

  await page.waitForSelector('#game-sim', { state: 'visible' });

  // Wait a bit for game to render and maybe a play to happen
  await page.waitForTimeout(5000);

  // Take screenshot
  await page.screenshot({ path: 'verification/live_game.png' });

  await browser.close();
})();
