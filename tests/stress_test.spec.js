const { test, expect } = require('@playwright/test');

test.describe('Game Stability Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('http://localhost:3000');

    // Clear local storage to start fresh
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('Rapid click on Advance Week should not skip weeks', async ({ page }) => {
    // 1. Start New League
    // Handle the case where the dashboard shows up first
    const newLeagueBtn = page.locator('button:has-text("New League")');
    if (await newLeagueBtn.isVisible()) {
        await newLeagueBtn.click();
    } else {
        // Maybe we are already at onboarding or need to trigger it
        await page.evaluate(() => window.gameController.startNewLeague());
    }

    // Wait for onboarding modal
    await page.waitForSelector('#onboardModal', { state: 'visible' });

    // Wait for teams to load and select to be enabled
    await page.waitForFunction(() => {
        const select = document.getElementById('onboardTeam');
        return select && !select.disabled && select.options.length > 1;
    });

    // Select a team
    await page.selectOption('#onboardTeam', { index: 1 }); // Index 0 might be "No teams" or placeholder

    // Click Start Game
    await page.click('#onboardStart');

    // Wait for Hub to load
    await page.waitForSelector('#hub', { state: 'visible' });
    await page.waitForSelector('.week-label', { state: 'visible' });

    // Verify start at Week 1
    const weekLabel = page.locator('.week-label').first();
    await expect(weekLabel).toContainText('Week 1');

    // 2. Click Advance Week RAPIDLY
    const advanceBtn = page.locator('#btnAdvanceWeekTop');
    await expect(advanceBtn).toBeVisible();

    // Click 5 times as fast as possible
    // Use force: true to bypass any lingering overlays/modals
    console.log('Clicking Advance Week 5 times rapidly...');
    const clicks = [];
    for (let i = 0; i < 5; i++) {
        clicks.push(advanceBtn.click({ delay: 0, force: true }));
    }
    await Promise.all(clicks);

    // Wait for processing (spinner or text change)
    // We expect it to eventually settle at Week 2
    // Give it enough time to potentially mess up
    await page.waitForTimeout(5000);

    // Check resulting week
    // Use evaluate to get exact text to avoid flakiness
    const weekText = await weekLabel.innerText();
    console.log(`Final Week Text: "${weekText}"`);

    // Assertion: Should be Week 2. If it's Week 3 or more, we have a bug.
    expect(weekText).toContain('Week 2');
    expect(weekText).not.toContain('Week 3');
    expect(weekText).not.toContain('Week 4');
  });

  test('Watch Game Rapid Entry', async ({ page }) => {
     // Setup Game like above
     await page.evaluate(() => window.gameController.startNewLeague());
     await page.waitForSelector('#onboardModal', { state: 'visible' });
     await page.waitForFunction(() => document.getElementById('onboardTeam').options.length > 1);
     await page.selectOption('#onboardTeam', { index: 1 });
     await page.click('#onboardStart');
     await page.waitForSelector('#hub', { state: 'visible' });

     // Find "Watch Game" button
     const watchBtn = page.locator('button:has-text("Watch Game")');
     if (await watchBtn.isVisible()) {
         // Click twice rapidly
         console.log('Clicking Watch Game twice...');
         await Promise.all([
             watchBtn.click(),
             watchBtn.click()
         ]);

         // Verify we are in game-sim view
         await page.waitForSelector('#game-sim', { state: 'visible' });

         // Check if multiple games spawned or errors in console (Playwright handles console errors separately usually, but we can check DOM)
         // Hard to check visually if game is running 2x speed, but we can check if console logs "Starting live game" twice
         // For now, just ensure it doesn't crash
         await page.waitForTimeout(2000);
         expect(await page.locator('#game-sim').isVisible()).toBeTruthy();
     } else {
         console.log('No Watch Game button found (maybe game finished?)');
     }
  });

});
