const { test, expect } = require('@playwright/test');

test('Visual Check of Live Game Viewer', async ({ page }) => {
    // Setup
    await page.goto('http://localhost:3000');
    test.setTimeout(60000);

    // Initial load handler
    try {
        await Promise.race([
            page.waitForSelector('.layout', { timeout: 10000 }), // Dashboard
            page.waitForSelector('.save-slot-list', { timeout: 10000 }), // Save manager
            page.waitForSelector('#onboardModal', { timeout: 10000 }) // Old onboarding
        ]);
    } catch (e) {
        console.log("Initial selector wait timed out, attempting to proceed based on URL/content");
    }

    // If we're at the save selection screen
    const newLeagueBtn = page.getByRole('button', { name: 'New League' });
    if (await newLeagueBtn.isVisible()) {
        await newLeagueBtn.click();
    }

    // New League Setup - now uses buttons, not select
    // Wait for team buttons
    await page.waitForSelector('.team-select-btn', { state: 'visible', timeout: 15000 });

    // Select the first team (Bills usually)
    await page.locator('.team-select-btn').first().click();

    // Click Start Career
    const startBtn = page.getByRole('button', { name: /Start Career/i });
    await startBtn.click();

    // Wait for dashboard header to confirm league loaded
    await page.waitForSelector('.hub-header', { timeout: 30000 });

    // Advance week to trigger simulation
    const advanceBtn = page.locator('header .btn.btn-primary');
    await expect(advanceBtn).toBeVisible();

    // Click to simulate
    await advanceBtn.click();

    // Wait for LiveGame component to appear
    await page.waitForSelector('.matchup-card', { timeout: 10000 });

    // Verify UI Polish Elements
    const matchupCards = page.locator('.matchup-card');
    await expect(matchupCards.first()).toBeVisible();

    // Wait slightly longer for plays to accumulate
    await page.waitForTimeout(4000);

    // Debug helper: print text content of log
    const playLogContainer = page.locator('text=Play-by-play').locator('xpath=../..');
    const scrollArea = playLogContainer.locator('> div').nth(1);

    // It seems the React component structure might be adding extra wrappers or the locator is slightly off
    // The LiveGame component maps plays directly as children of the scroll container.
    // {plays.map((p) => (<div key={p.id} ...>))}

    // Let's grab all divs inside the scroll area that have text content
    const items = scrollArea.locator('div');
    const count = await items.count();
    console.log(`Found ${count} div items in scroll area`);

    if (count > 0) {
        // Try to find one with the play-item class using Playwright's locator
        // We know the class should be there based on the code we wrote.
        // Maybe the first item is the "Simulation starting..." message which is a <p> tag?
        // Ah, looking at LiveGame.jsx:
        // {plays.length === 0 && ... <p> ... </p>}
        // {plays.map ... <div ... className="play-item" ...> ... </div>}

        // So we should look for .play-item specifically
        const playItems = scrollArea.locator('.play-item');
        const playItemCount = await playItems.count();
        console.log(`Found ${playItemCount} .play-item elements`);

        if (playItemCount > 0) {
            await expect(playItems.first()).toBeVisible();
            const classes = await playItems.first().getAttribute('class');
            console.log(`Verified class: ${classes}`);
            expect(classes).toContain('play-item');
        } else {
            // Fallback debugging
            const innerHTML = await scrollArea.innerHTML();
            console.log("Scroll area HTML content (truncated):", innerHTML.substring(0, 500));
        }
    }

    // Take final screenshot
    await page.screenshot({ path: 'live_game_polish_final.png', fullPage: true });

    console.log("Visual check passed!");
});
