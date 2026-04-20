const { test, expect } = require('@playwright/test');

test('Visual Check of Live Game Viewer', async ({ page }) => {
    // Setup
    await page.goto('http://localhost:3000');

    // Check if modal is already open
    const modalVisible = await page.isVisible('#onboardModal');

    if (!modalVisible) {
        // Only click if modal is NOT visible
        const newLeagueBtn = page.locator('button:has-text("New League")');
        if (await newLeagueBtn.isVisible()) {
             await newLeagueBtn.click({ force: true });
        }
    }

    await page.waitForSelector('#onboardModal', { state: 'visible' });

    // Wait for teams
    await page.waitForFunction(() => {
        const sel = document.getElementById('onboardTeam');
        return sel && sel.options.length > 1;
    });

    await page.selectOption('#onboardTeam', { index: 1 });
    await page.click('#onboardStart');
    await page.waitForSelector('#hub', { state: 'visible' });

    // Watch Game
    const watchBtn = page.locator('button:has-text("Watch Game")');
    if (await watchBtn.isVisible()) {
        await watchBtn.click();
        await page.waitForSelector('#game-sim', { state: 'visible' });

        // Wait for UI to render
        await page.waitForSelector('.live-game-log-card');

        // Take Screenshot
        await page.screenshot({ path: 'live_game_viewer.png', fullPage: true });

        // Assertions for classes
        const logCard = page.locator('.live-game-log-card');
        await expect(logCard).toHaveCSS('display', 'flex');

        const dashboard = page.locator('.live-game-dashboard');
        await expect(dashboard).toHaveCSS('display', 'grid');
    } else {
        console.log("No game to watch");
    }
});
