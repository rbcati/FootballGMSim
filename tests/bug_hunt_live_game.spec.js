const { test, expect } = require('@playwright/test');

test.describe('Live Game Bug Hunt', () => {
  test('Rapid Clicking and Refresh Persistence', async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', exception => console.log(`PAGE ERROR: "${exception}"`));

    // 1. Setup: Start a new game
    await page.goto('http://localhost:8000');

    // Wait for initial load
    await page.waitForTimeout(1000);

    // Force init new league via console to avoid UI ambiguity
    console.log('Forcing New League...');
    await page.evaluate(async () => {
        if (window.gameController) {
            await window.gameController.startNewLeague();
        } else {
            console.error('gameController missing!');
        }
    });

    // Handle Onboarding Modal - Wait for it to appear
    const onboardModal = page.locator('#onboardModal');
    await expect(onboardModal).toBeVisible({ timeout: 10000 });

    // Click Start
    await page.click('#onboardStart');

    // Wait for Hub
    await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });

    // Debug availability
    await page.evaluate(() => {
        console.log('Checking window.watchLiveGame:', typeof window.watchLiveGame);
        console.log('Checking window.liveGameViewer:', !!window.liveGameViewer);
    });

    // 2. Start a Live Game
    console.log('Starting Live Game...');
    await page.evaluate(() => {
        if (typeof window.watchLiveGame !== 'function') {
            throw new Error('window.watchLiveGame is missing!');
        }
        const userTeam = window.state.userTeamId;
        const oppTeam = userTeam === 0 ? 1 : 0;
        window.watchLiveGame(userTeam, oppTeam);
    });

    // Wait for Game Sim View
    await page.waitForSelector('#game-sim', { state: 'visible' });
    await page.waitForSelector('#btnNextPlay', { state: 'visible' });

    // 3. Rapid Clicking Test
    console.log('Testing Rapid Clicking...');
    const nextPlayBtn = page.locator('#btnNextPlay');

    // Click 10 times fast
    for (let i = 0; i < 10; i++) {
        await nextPlayBtn.click();
        // No wait, just spam
    }

    const isDisabled = await nextPlayBtn.isDisabled();
    console.log(`Button disabled state after rapid clicks: ${isDisabled}`);

    // Allow some time for plays to process
    await page.waitForTimeout(2000);

    // 4. Refresh Persistence Test
    console.log('Testing Refresh Persistence...');
    // Capture some state before refresh
    const scoreboardText = await page.locator('.scoreboard').innerText();
    console.log('Scoreboard before refresh:', scoreboardText);

    await page.reload();
    await page.waitForTimeout(2000); // Wait for init

    // Check if we are back in the game
    const isGameVisible = await page.locator('#game-sim').isVisible();
    console.log(`Game visible after refresh: ${isGameVisible}`);

    if (isGameVisible) {
        const scoresAfter = await page.locator('.scoreboard').innerText();
        console.log('Scoreboard after refresh:', scoresAfter);
        expect(scoresAfter).toBe(scoreboardText); // Should match if persisted
    } else {
        console.log('Game state LOST after refresh.');
        // Fail the test to confirm bug
        expect(isGameVisible).toBe(true);
    }
  });
});
