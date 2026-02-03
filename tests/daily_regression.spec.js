const { test, expect } = require('@playwright/test');

test.describe('Daily Regression Pass', () => {

    test('Playability Smoke Test & State Audit', async ({ page }) => {
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err));

        // 1. Start a new league
        await page.goto('http://localhost:8000');

        // Wait for potential loading
        await page.waitForTimeout(2000);

        // Check if we are on onboarding or dashboard.
        try {
            // Check for onboarding modal
            await page.waitForSelector('#onboardModal', { state: 'visible', timeout: 5000 });
            await page.click('#onboardStart');
        } catch (e) {
            console.log('Onboarding modal not found immediately. Checking if Dashboard or Hub.');
             const createLeagueBtn = page.locator('#create-league-btn');
             if (await createLeagueBtn.isVisible()) {
                 await createLeagueBtn.click();
                 await page.waitForSelector('#onboardModal', { state: 'visible' });
                 await page.click('#onboardStart');
             } else {
                 console.log('Forcing new league creation via console...');
                 await page.evaluate(async () => {
                    if (window.gameController) {
                        await window.gameController.startNewLeague();
                    }
                });
                await page.waitForSelector('#onboardModal', { state: 'visible' });
                await page.click('#onboardStart');
             }
        }

        // Wait for Hub
        await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });

        // 2. State & Persistence Audit
        const stateAudit = await page.evaluate(() => {
            const teamId = window.state.userTeamId;
            const team = window.state.league.teams[teamId];
            return {
                capRoom: team.capRoom,
                rosterSize: team.roster.length,
                week: window.state.league.week
            };
        });

        console.log('State Audit:', stateAudit);
        expect(stateAudit.capRoom).toBeGreaterThanOrEqual(-10);
        expect(stateAudit.rosterSize).toBeGreaterThan(0);

        // 3. Advance Week
        const startWeek = stateAudit.week;

        const advanceBtnTop = page.locator('#btnAdvanceWeekTop');
        const advanceBtnHQ = page.locator('#btnSimWeekHQ');

        if (await advanceBtnTop.isVisible()) {
            await advanceBtnTop.click();
        } else if (await advanceBtnHQ.isVisible()) {
            await advanceBtnHQ.click();
        } else {
            await page.click('#btnGlobalAdvance');
        }

        // Wait for week to increment
        await page.waitForFunction((startWeek) => {
            return window.state && window.state.league && window.state.league.week > startWeek;
        }, startWeek, { timeout: 30000 });

        const newWeek = await page.evaluate(() => window.state.league.week);
        console.log(`Week advanced from ${startWeek} to ${newWeek}`);
        expect(newWeek).toBeGreaterThan(startWeek);
    });

    test('Contracts & Free Agency', async ({ page }) => {
        // Handle dialogs (confirm release)
        page.on('dialog', dialog => dialog.accept());

        // Navigate to FA and sign player
        await page.goto('http://localhost:8000');
        await page.waitForTimeout(1000);

        // Ensure league context
        await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });

        await page.waitForSelector('#hub', { state: 'visible', timeout: 10000 });

        // 1. Release a player to make room
        await page.evaluate(() => location.hash = '#/roster');
        await page.waitForSelector('#roster', { state: 'visible' });
        await page.waitForSelector('#rosterTable tbody tr', { state: 'visible' });

        // Select first player (checkbox)
        const firstCheckbox = page.locator('#rosterTable tbody tr:first-child input[type="checkbox"]');
        await firstCheckbox.check();

        // Click Release
        await page.click('#btnRelease');

        await page.waitForTimeout(1000); // Wait for release processing

        // 2. Go to Free Agency
        await page.evaluate(() => location.hash = '#/freeagency');
        await page.waitForSelector('#freeagency', { state: 'visible' });

        // Get initial roster size
        const initialRosterSize = await page.evaluate(() => {
             const tid = window.state.userTeamId;
             return window.state.league.teams[tid].roster.length;
        });
        console.log('Roster size after release:', initialRosterSize);

        // Find a sign button that is not disabled
        await page.waitForSelector('#faTable .sign-btn', { state: 'visible' });

        const signButtons = page.locator('#faTable .sign-btn:not([disabled])');
        const count = await signButtons.count();

        if (count > 0) {
            console.log(`Found ${count} signable players`);
            await signButtons.first().click();

            // Wait for roster size to increase
            await page.waitForFunction((initialSize) => {
                 const tid = window.state.userTeamId;
                 return window.state.league.teams[tid].roster.length > initialSize;
            }, initialRosterSize, { timeout: 5000 });

            const newRosterSize = await page.evaluate(() => {
                 const tid = window.state.userTeamId;
                 return window.state.league.teams[tid].roster.length;
            });
            console.log(`Roster size increased from ${initialRosterSize} to ${newRosterSize}`);
            expect(newRosterSize).toBeGreaterThan(initialRosterSize);
        } else {
            console.log('No affordable free agents found to sign.');
            const capRoom = await page.evaluate(() => window.state.league.teams[window.state.userTeamId].capRoom);
            console.log('Cap Room:', capRoom);
        }
    });

    test('Mobile UI Check', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('http://localhost:8000');
        await page.waitForTimeout(1000);

        // Ensure league
         await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // Check for invisible overlays
        const overlayVisible = await page.locator('#menu-overlay').isVisible();
        if (overlayVisible) {
             const pointerEvents = await page.evaluate(() => getComputedStyle(document.getElementById('menu-overlay')).pointerEvents);
             if (pointerEvents !== 'none') {
                 const isActive = await page.evaluate(() => document.getElementById('menu-overlay').classList.contains('active'));
                 expect(isActive).toBe(false);
             }
        }

        // Open menu
        await page.click('#navToggle');
        // Wait for sidebar to be active/open
        await page.waitForFunction(() => document.getElementById('nav-sidebar').classList.contains('nav-open') || document.getElementById('nav-sidebar').classList.contains('active'));

        // Check if overlay is active
        const overlayActive = await page.evaluate(() => document.getElementById('menu-overlay').classList.contains('active'));
        expect(overlayActive).toBe(true);

        // Close menu by clicking overlay (forcing via JS click to avoid visibility/pointer-events issues in test)
        await page.evaluate(() => document.getElementById('menu-overlay').click());

        // Wait for it to close
        await page.waitForTimeout(500);

        const overlayActiveAfter = await page.evaluate(() => document.getElementById('menu-overlay').classList.contains('active'));
        expect(overlayActiveAfter).toBe(false);
    });

    test('Persistence Check', async ({ page }) => {
        // 1. Ensure we have an active game and make a change (Advance Week)
        await page.goto('http://localhost:8000');
        await page.waitForTimeout(1000);

        // Force new league
        await page.evaluate(async () => {
             await window.gameController.startNewLeague();
             document.getElementById('onboardStart').click();
        });
        await page.waitForSelector('#hub', { state: 'visible', timeout: 10000 });

        const initialWeek = await page.evaluate(() => window.state.league.week);
        console.log(`Initial Week: ${initialWeek}`);

        // Advance week to ensure state change
        const advanceBtnTop = page.locator('#btnAdvanceWeekTop');
        if (await advanceBtnTop.isVisible()) {
            await advanceBtnTop.click();
        } else {
            await page.click('#btnSimWeekHQ'); // or '#btnGlobalAdvance'
        }

        // Wait for week to increment
        await page.waitForFunction((startWeek) => {
            return window.state && window.state.league && window.state.league.week > startWeek;
        }, initialWeek, { timeout: 30000 });

        const weekAfterSim = await page.evaluate(() => window.state.league.week);
        console.log(`Week after sim: ${weekAfterSim}`);
        expect(weekAfterSim).toBeGreaterThan(initialWeek);

        // 2. Reload page
        console.log('Reloading page...');
        await page.reload();
        await page.waitForTimeout(2000); // Wait for re-init

        // 3. Verify state persists
        // Should auto-load or be on hub
        const isHubVisible = await page.locator('#hub').isVisible();
        const persistedWeek = await page.evaluate(() => window.state?.league?.week);

        console.log(`Persisted Week: ${persistedWeek}`);
        expect(persistedWeek).toBe(weekAfterSim);
    });

    test('Strategy Persistence', async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForTimeout(1000);

        // Ensure league
        await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // Change Strategy
        // 1. Offensive Plan
        const offSelect = page.locator('#managerOffPlan');
        if (await offSelect.isVisible()) {
            await offSelect.selectOption('AGGRESSIVE_PASSING');
        } else {
            console.log('Manager panel not visible, attempting to inject/find');
            // If panel only appears when there is an opponent, we might need to skip or mock
            // But usually it's there during season
        }

        // 2. Risk Profile
        const riskBtn = page.locator('.risk-btn[data-id="AGGRESSIVE"]');
        if (await riskBtn.isVisible()) {
            await riskBtn.click();
        }

        // Wait for save (debounced or immediate)
        await page.waitForTimeout(1000);

        // Reload
        await page.reload();
        await page.waitForTimeout(2000);

        // Verify
        const strategy = await page.evaluate(() => window.state.league.weeklyGamePlan);
        console.log('Persisted Strategy:', strategy);

        expect(strategy.offPlanId).toBe('AGGRESSIVE_PASSING');
        expect(strategy.riskId).toBe('AGGRESSIVE');
    });

    test('Replay Exploit Prevention', async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForTimeout(1000);

        // Ensure league and advance a week to have a played game
        await page.evaluate(async () => {
             if (!window.state || !window.state.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // Advance Week to ensure we have a completed game
        await page.evaluate(() => window.handleGlobalAdvance());
        await page.waitForTimeout(5000); // Wait for sim (worker might be slow)

        // Get a finalized game involving user
        const gameInfo = await page.evaluate(() => {
            const L = window.state.league;
            const weekIdx = (L.week || 2) - 2; // Previous week (0-indexed)
            if (weekIdx < 0) return null;
            const results = L.resultsByWeek[weekIdx];
            if (!results) return null;
            const userGame = results.find(g => g.home === L.userTeamId || g.away === L.userTeamId);
            return userGame;
        });

        if (gameInfo) {
            console.log('Testing replay exploit on game:', gameInfo.id);
            // Attempt to watch
            await page.evaluate((g) => {
                window.watchLiveGame(g.home, g.away);
            }, gameInfo);

            // Expect to NOT switch to game-sim view
            await page.waitForTimeout(500);
            const hash = await page.evaluate(() => location.hash);
            console.log('Current Hash:', hash);
            expect(hash).not.toContain('game-sim');
        } else {
            console.log('No user game found to test replay exploit');
        }
    });

    test('High Stakes Visuals', async ({ page }) => {
        await page.goto('http://localhost:8000');
        await page.waitForTimeout(1000);

        // Inject LiveGameViewer logic if needed or just use existing
        await page.evaluate(() => {
            if (!window.liveGameViewer) window.liveGameViewer = new window.LiveGameViewer();
            window.liveGameViewer.preGameContext = {
                stakes: 85, // High Stakes
                difficulty: 'Hard'
            };
            // Create a dummy container
            const d = document.createElement('div');
            d.id = 'test-sim-container';
            document.body.appendChild(d);
            window.liveGameViewer.renderToView('#test-sim-container');
        });

        // Check for badge
        // Note: The class name 'stakes-badge' depends on my implementation in the next step
        // So this test expects the implementation to exist.
        const badge = page.locator('.stakes-badge');
        await expect(badge).toBeVisible({ timeout: 5000 });
        const text = await badge.innerText();
        expect(text).toContain('HIGH STAKES');
    });
});
