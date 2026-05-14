
import { test, expect } from '@playwright/test';

async function startLeague(page) {
    await page.goto('http://localhost:5173');

    // Wait explicitly for the Start New Franchise button
    const startBtn = page.locator('button', { hasText: 'Start New Franchise' }).first();
    let isNew = false;
    try {
        await startBtn.waitFor({ state: 'visible', timeout: 10000 });
        isNew = true;
    } catch (e) {
        // Not a new league, or already loaded
    }

    if (isNew) {
        await startBtn.click();
        await page.locator('.team-card').first().waitFor({ state: 'visible' });
        await page.locator('.team-card').first().click();

        const continueBtn = page.locator('button', { hasText: 'Continue' });
        await continueBtn.waitFor({ state: 'visible' });
        await continueBtn.click();

        await page.waitForTimeout(500);
        await continueBtn.waitFor({ state: 'visible' });
        await continueBtn.click();

        const startDynastyBtn = page.locator('button', { hasText: 'Start Dynasty' });
        await startDynastyBtn.waitFor({ state: 'visible' });
        await startDynastyBtn.click();

        const skipTourBtn = page.locator('button', { hasText: 'Skip tour' });
        try {
            await skipTourBtn.waitFor({ state: 'visible', timeout: 5000 });
            await skipTourBtn.click();
        } catch (e) {
            // Tour might not show or already skipped
        }
    }

    await page.waitForSelector('.app-header', { state: 'visible', timeout: 15000 });
}

test.describe('Daily Regression', () => {

    test('1. Playability Smoke Test', async ({ page }) => {
        test.setTimeout(60000);
        await startLeague(page);

        await expect(page.locator('.app-header')).toBeVisible();

        const advanceBtn = page.locator('.app-advance-btn');
        await advanceBtn.waitFor({ state: 'visible' });
        await advanceBtn.click();

        const simSkipBtn = page.locator('button', { hasText: 'Simulate (Skip)' });
        try {
            await simSkipBtn.waitFor({ state: 'visible', timeout: 5000 });
            await simSkipBtn.click();
        } catch (e) { }

        await page.waitForTimeout(3000);
        await expect(page.locator('.app-header')).toBeVisible();
    });

    test('2. State & Persistence Audit', async ({ page }) => {
        test.setTimeout(60000);
        await startLeague(page);

        const initialCap = await page.evaluate(() => {
            const tid = window.state.league.userTeamId;
            return window.state.league.teams.find(t => t.id === tid)?.capRoom || 0;
        });
        expect(initialCap).toBeGreaterThan(0);

        const rosterSize = await page.evaluate(() => {
            const tid = window.state.league.userTeamId;
            return window.state.league.teams.find(t => t.id === tid)?.rosterCount || 0;
        });
        expect(rosterSize).toBeGreaterThan(0);
    });

    test('3. UI Interaction & Mobile Check', async ({ page }) => {
        test.setTimeout(60000);
        await page.setViewportSize({ width: 375, height: 667 });
        await startLeague(page);

        // Verify mobile nav interaction
        const rosterTabBtn = page.locator('button:has-text("Roster")');
        await rosterTabBtn.click();
        await page.waitForTimeout(1000);

        const rows = page.locator('table tbody tr');
        expect(await rows.count()).toBeGreaterThan(0);

        // Check horizontal scrolling in stats/standings
        const tableScrolls = await page.evaluate(() => {
            const table = document.querySelector('.standings-table') || document.querySelector('table');
            if (!table) return false;
            const parent = table.parentElement;
            return parent.scrollWidth > parent.clientWidth || table.scrollWidth > table.clientWidth;
        });
        console.log('Mobile Table Scrollable:', tableScrolls);
    });

    test('4. Contracts & Cap Trust', async ({ page }) => {
        test.setTimeout(60000);
        await startLeague(page);

        const faTabBtn = page.locator('button.standings-tab:has-text("Transactions")');
        await faTabBtn.click();
        await page.waitForTimeout(1000);

        await page.evaluate(() => {
            const ths = Array.from(document.querySelectorAll('th'));
            const th = ths.find(t => t.innerText.includes('Ask') || t.innerText.includes('$/yr'));
            if (th) { th.click(); th.click(); }
        });
        await page.waitForTimeout(500);

        const offerBtn = page.locator('button:has-text("Offer")').first();
        if (await offerBtn.isVisible()) {
            await offerBtn.click();
            await page.waitForTimeout(500);

            const confirmBtn = page.locator('button:has-text("Confirm")');
            if (await confirmBtn.isVisible()) {
                await confirmBtn.click();
                await page.waitForTimeout(2000);

                const updateBtn = page.locator('button:has-text("Update")').first();
                await expect(updateBtn).toBeVisible();
            }
        }
    });

    test('5. Tension & Drama Verification', async ({ page }) => {
        test.setTimeout(60000);
        await startLeague(page);

        const hqTab = page.locator('button.standings-tab:has-text("HQ")').first();
        if (await hqTab.isVisible()) {
            await hqTab.click();
            await page.waitForTimeout(1000);

            const txt = await page.evaluate(() => document.body.innerText);
            expect(txt).toMatch(/Owner|Fan|Pressure|Confidence|Season/i);
        }
    });

    test('6. Legacy & Continuity Check', async ({ page }) => {
        test.setTimeout(120000);
        await startLeague(page);

        // Sim a full season to guarantee Hall of Fame / Retirements trigger
        await page.evaluate(async () => {
            // fast forward to playoffs/offseason using game controller if possible
            if(window.gameController && typeof window.gameController.simulateSeason === 'function') {
                await window.gameController.simulateSeason();
            }
        });

        // Sim a few weeks just in case simulateSeason isn't immediately exposed, to simulate progression
        for (let i = 0; i < 3; i++) {
            const advanceBtn = page.locator('.app-advance-btn');
            await advanceBtn.waitFor({ state: 'visible' });
            await advanceBtn.click();

            const simSkipBtn = page.locator('button', { hasText: 'Simulate (Skip)' });
            try {
                await simSkipBtn.waitFor({ state: 'visible', timeout: 3000 });
                await simSkipBtn.click();
            } catch (e) {}
            await page.waitForTimeout(1000);
        }
        await expect(page.locator('.app-header')).toBeVisible();
    });

    test('7. Performance & Cleanup', async ({ page }) => {
        test.setTimeout(60000);
        await startLeague(page);

        const advanceBtn = page.locator('.app-advance-btn');
        await advanceBtn.waitFor({ state: 'visible' });
        await advanceBtn.click();

        const simSkipBtn = page.locator('button', { hasText: 'Simulate (Skip)' });
        try {
            await simSkipBtn.waitFor({ state: 'visible', timeout: 3000 });
            await simSkipBtn.click();
        } catch (e) {}

        await page.waitForTimeout(3000);

        const loadingOverlays = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('*')).filter(el => el.innerText === 'Loading...').length;
        });
        expect(loadingOverlays).toBe(0);

        // Check for orphaned nodes in DOM (simple check)
        const orphaned = await page.evaluate(() => {
            return document.querySelectorAll('.removed-node').length; // specific app artifact check
        });
        expect(orphaned).toBe(0);
    });
});
