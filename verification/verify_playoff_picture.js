const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000');

  // Ensure league
  await page.evaluate(async () => {
       if (!window.state || !window.state.league) {
           await window.gameController.startNewLeague();
           document.getElementById('onboardStart').click();
       }
  });
  await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });

  // Mock state & Trigger recap
  await page.evaluate(() => {
      const L = window.state.league;
      L.week = 15;
      L.offseason = false;
      const userTeamId = window.state.userTeamId;

      window.calculateAllStandings = (league) => {
           const mockBubble = [{ id: userTeamId, name: 'User Team', wins: 8, losses: 6 }];
           return {
               playoffs: {
                   afc: {
                       playoffs: Array.from({length: 7}, (_, i) => ({ id: i + 999, name: `Team ${i}`, wins: 10, losses: 4 })),
                       bubble: mockBubble,
                       divisionWinners: []
                   },
                   nfc: {
                       playoffs: Array.from({length: 7}, (_, i) => ({ id: i + 2999, name: `Team ${i}`, wins: 10, losses: 4 })),
                       bubble: mockBubble,
                       divisionWinners: []
                   }
               }
           };
      };

      const results = [{
          home: userTeamId,
          away: 999,
          scoreHome: 24,
          scoreAway: 20
      }];
      window.showWeeklyRecap(15, results, []);
  });

  await page.waitForSelector('.weekly-recap-container');
  // Wait for animation
  await page.waitForTimeout(1000);

  await page.screenshot({ path: 'verification/playoff_picture.png' });
  await browser.close();
})();
