const { test, expect } = require('@playwright/test');

test.describe('Edge Cases & Performance', () => {

    test('Rapid Click on Advance Week (Debounce Check)', async ({ page }) => {
        // 1. Setup
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(1000);

        // Ensure league exists
        await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });

        const initialWeek = await page.evaluate(() => window.state.league.week);

        // 2. Click Advance Week Rapidly
        const advanceBtnTop = page.locator('#btnAdvanceWeekTop');
        const advanceBtnHQ = page.locator('#btnSimWeekHQ');

        const btn = (await advanceBtnTop.isVisible()) ? advanceBtnTop : ((await advanceBtnHQ.isVisible()) ? advanceBtnHQ : page.locator('#btnGlobalAdvance'));

        console.log("Rapid clicking advance button...");

        // Spam clicks using evaluate to bypass Playwright's auto-wait
        await btn.evaluate(node => {
            for (let i = 0; i < 5; i++) {
                node.click();
            }
        });

        // Wait for processing
        await page.waitForTimeout(5000);

        // 3. Verify Week only advanced by 1
        const newWeek = await page.evaluate(() => window.state.league.week);
        console.log(`Week advanced from ${initialWeek} to ${newWeek}`);

        expect(newWeek).toBe(initialWeek + 1);
    });

    test('Refresh During Live Game', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(1000);

        // Ensure league
        await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible', timeout: 10000 });

        // Force Game Start
        await page.evaluate(() => {
            const L = window.state.league;
            // Fake a game if none exist
            const home = L.teams[0];
            const away = L.teams[1];

            // Inject fake game into schedule if needed or just use Watch
            if (window.watchLiveGame) {
                window.watchLiveGame(home.id, away.id);
            }
        });

        await page.waitForSelector('#game-sim', { state: 'visible', timeout: 10000 });

        // Wait for some plays
        await page.waitForTimeout(3000);

        // Refresh page
        console.log("Refreshing page during game...");
        await page.reload();
        await page.waitForTimeout(3000); // Wait for app init

        const isHub = await page.locator('#hub').isVisible();
        const isGame = await page.locator('#game-sim').isVisible();

        console.log(`After refresh: Hub visible=${isHub}, Game visible=${isGame}`);

        // Either staying in game (restored) or going to Hub (safe fallback) is acceptable
        expect(isHub || isGame).toBe(true);
    });

    test('Mobile Interactions', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(1000);

         // Ensure league
        await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // Click Hamburger
        await page.click('#navToggle');

        // Wait for menu to open using class check
        await page.waitForFunction(() => {
            const sidebar = document.getElementById('nav-sidebar');
            return sidebar && sidebar.classList.contains('nav-open');
        });

        // Wait for transition
        await page.waitForTimeout(500);

        // Use bottom nav as alternative if sidebar is tricky, but let's try sidebar first
        const rosterLink = page.locator('.nav-item[href="#/roster"]').first();

        // Ensure visible
        if (await rosterLink.isVisible()) {
            // Try JS click to bypass viewport issues in test environment
            await rosterLink.evaluate(node => node.click());
        } else {
            console.log("Sidebar link not visible, trying bottom nav...");
            await page.locator('.nav-item-bottom[href="#/roster"]').evaluate(node => node.click());
        }

        // Wait for roster
        await page.waitForSelector('#roster', { state: 'visible', timeout: 5000 });

        // Verify table is visible
        const table = page.locator('#rosterTable');
        await expect(table).toBeVisible();
    });

    test('Large Score UI Check', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(1000);

        // Ensure league
        await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // Start a game and inject scores
        await page.evaluate(() => {
            const L = window.state.league;
            window.watchLiveGame(L.teams[0].id, L.teams[1].id);
        });

        await page.waitForSelector('#game-sim', { state: 'visible' });

        // Inject High Score
        await page.evaluate(() => {
            if (window.liveGameViewer && window.liveGameViewer.gameState) {
                window.liveGameViewer.gameState.home.score = 105;
                window.liveGameViewer.gameState.away.score = 99;
                window.liveGameViewer.renderGame();
            }
        });

        // Check Font Size
        const fontSize = await page.evaluate(() => {
            const el = document.getElementById('scoreHome');
            return window.getComputedStyle(el).fontSize;
        });

        console.log(`Score Font Size: ${fontSize}`);
        // Default is 2rem (32px), we expect 1.5rem (24px) for > 2 digits
        // 1.5rem = 24px (assuming 16px base) or relative.
        // Let's just check if it's smaller or if the style attribute is set.

        const hasStyle = await page.evaluate(() => {
             const el = document.getElementById('scoreHome');
             return el.style.fontSize === '1.5rem';
        });

        expect(hasStyle).toBe(true);
    });
});
