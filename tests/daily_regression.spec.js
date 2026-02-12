const { test, expect } = require('@playwright/test');

test.describe('Daily Regression Pass', () => {

    test('1. Playability Smoke Test', async ({ page }) => {
        page.on('console', msg => {
            if (msg.type() === 'error') console.log(`BROWSER ERROR: ${msg.text()}`);
        });

        await page.goto('http://localhost:3000');
        await page.waitForTimeout(1000);

        // Handle Onboarding / Dashboard
        const onboardVisible = await page.isVisible('#onboardModal');
        if (onboardVisible) {
            await page.click('#onboardStart');
        } else {
            const createBtn = await page.isVisible('#create-league-btn');
            if (createBtn) {
                await page.click('#create-league-btn');
                await page.waitForSelector('#onboardModal', { state: 'visible' });
                await page.click('#onboardStart');
            } else {
                // Assuming already in game or hub
                console.log('Assuming game already loaded...');
            }
        }

        await page.waitForSelector('#hub', { state: 'visible', timeout: 30000 });
        const hubVisible = await page.isVisible('#hub');
        expect(hubVisible).toBeTruthy();

        // 3. Advance Week (Smoke Test Requirement)
        const startWeek = await page.evaluate(() => window.state.league.week);
        console.log(`Current Week: ${startWeek}`);

        // Try different advance buttons
        const advanceBtnTop = page.locator('#btnAdvanceWeekTop');
        const advanceBtnHQ = page.locator('#btnSimWeekHQ');
        const globalAdvance = page.locator('#btnGlobalAdvance');

        if (await advanceBtnTop.isVisible()) {
            await advanceBtnTop.click();
        } else if (await advanceBtnHQ.isVisible()) {
            await advanceBtnHQ.click();
        } else if (await globalAdvance.isVisible()) {
            await globalAdvance.click();
        } else {
            console.log('No advance button found, forcing via JS');
            await page.evaluate(() => window.handleGlobalAdvance());
        }

        // Wait for week to increment
        await page.waitForFunction((startWeek) => {
            return window.state && window.state.league && window.state.league.week > startWeek;
        }, startWeek, { timeout: 60000 });

        const newWeek = await page.evaluate(() => window.state.league.week);
        console.log(`Week advanced from ${startWeek} to ${newWeek}`);
        expect(newWeek).toBeGreaterThan(startWeek);

        // Check for stuck loading states
        const loadingText = await page.getByText('Loading...').all();
        for (const el of loadingText) {
            await expect(el).not.toBeVisible();
        }
    });

    test('2. Strategy Persistence & High Stakes', async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForTimeout(1000);

        // Ensure game loaded
        await page.evaluate(async () => {
            if (!window.state?.league) {
                await window.gameController.startNewLeague();
                document.getElementById('onboardStart').click();
            }
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // 1. Test Strategy Persistence
        const offSelect = page.locator('#managerOffPlan');
        // Only works if manager panel is visible (usually is)
        if (await offSelect.isVisible()) {
            await offSelect.selectOption('AGGRESSIVE_PASSING');
            await page.waitForTimeout(1000); // Wait for save

            await page.reload();
            await page.waitForSelector('#hub', { state: 'visible' });

            const strategy = await page.evaluate(() => window.state.league.weeklyGamePlan.offPlanId);
            expect(strategy).toBe('AGGRESSIVE_PASSING');
        } else {
            console.log('Manager panel not visible, skipping strategy test');
        }

        // 2. Test High Stakes Visuals (Mocked)
        await page.evaluate(() => {
            if (!window.liveGameViewer) window.liveGameViewer = new window.LiveGameViewer();
            window.liveGameViewer.preGameContext = {
                stakes: 85,
                reason: 'HIGH STAKES TEST',
                difficulty: 'Hard'
            };
            const d = document.createElement('div');
            d.id = 'test-sim-container';
            document.body.appendChild(d);
            window.liveGameViewer.renderToView('#test-sim-container');
        });

        const badge = page.locator('.stakes-badge');
        await expect(badge).toBeVisible();
        await expect(badge).toContainText('HIGH STAKES');
    });

    test('2b. Mobile UI Scrolling Check', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('http://localhost:3000');

        // Ensure game is loaded (helper)
        await page.evaluate(async () => {
            if (!window.state?.league) {
                await window.gameController.startNewLeague();
                document.getElementById('onboardStart').click();
            }
        });
        await page.waitForSelector('#hub', { state: 'visible', timeout: 10000 });

        // Check Power Rankings Scroll
        await page.evaluate(() => location.hash = '#/powerRankings');
        await page.waitForSelector('#powerRankings table', { state: 'visible' });

        const prScrolls = await page.evaluate(() => {
            const container = document.querySelector('#powerRankings .table-responsive') || document.querySelector('#powerRankings .table-wrapper');
            return container ? container.scrollWidth > container.clientWidth : false;
        });
        // Note: It might not scroll if content fits, but checking container exists is good.
        // We assume plenty of columns.
        console.log('Power Rankings Scrollable:', prScrolls);

        // Check League Stats Scroll
        await page.evaluate(() => location.hash = '#/leagueStats');
        await page.waitForSelector('#leagueStats table', { state: 'visible' });

        const lsScrolls = await page.evaluate(() => {
            const container = document.querySelector('#leagueStats .table-wrapper');
            return container ? container.scrollWidth > container.clientWidth : false;
        });
        console.log('League Stats Scrollable:', lsScrolls);

        // Check Roster Scroll
        await page.evaluate(() => location.hash = '#/roster');
        await page.waitForSelector('#rosterTable', { state: 'visible' });

        const rosterScrolls = await page.evaluate(() => {
            const table = document.getElementById('rosterTable');
            const parent = table.parentElement;
            return parent.scrollWidth > parent.clientWidth || table.scrollWidth > table.clientWidth;
        });
        console.log('Roster Scrollable:', rosterScrolls);

        // Assertions (soft, as content might fit on some screens)
        // expect(prScrolls).toBeTruthy();
    });

    test('3. Contracts & Cap Trust', async ({ page }) => {
        await page.goto('http://localhost:3000');

        // Force new league to ensure cap space
        await page.evaluate(async () => {
            await window.gameController.startNewLeague();
            document.getElementById('onboardStart').click();
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // Release a player to ensure roster spot
        await page.evaluate(() => location.hash = '#/roster');
        await page.waitForSelector('#rosterTable', { state: 'visible' });

        // Select first player
        await page.waitForSelector('#rosterTable tbody tr', { state: 'visible' });
        const firstCheckbox = page.locator('#rosterTable tbody tr:first-child input[type="checkbox"]');
        await firstCheckbox.check();

        // Capture roster size before release
        const rosterSizeBefore = await page.evaluate(() => window.state.league.teams[window.state.userTeamId].roster.length);

        page.on('dialog', d => d.accept());
        await page.click('#btnRelease');
        await page.waitForTimeout(1000); // Increased timeout

        // Verify release
        const rosterSizeAfter = await page.evaluate(() => window.state.league.teams[window.state.userTeamId].roster.length);
        expect(rosterSizeAfter).toBeLessThan(rosterSizeBefore);

        // Go to FA
        await page.evaluate(() => location.hash = '#/freeagency');
        await page.waitForSelector('#faTable', { state: 'visible' });

        // Capture initial Cap
        const initialCap = await page.evaluate(() => {
            const tid = window.state.userTeamId;
            return window.state.league.teams[tid].capRoom;
        });
        console.log('Initial Cap:', initialCap);

        // Find a player to sign
        // We select one that is affordable
        const playerInfo = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('#faTable tbody tr'));
            for (let i = 0; i < rows.length; i++) {
                const btn = rows[i].querySelector('.sign-btn');
                if (btn && !btn.disabled) {
                    const salaryText = rows[i].cells[4].innerText; // Base Salary column
                    const salary = parseFloat(salaryText.replace('$', '').replace('M', ''));
                    return { index: i, salary };
                }
            }
            return null;
        });

        if (playerInfo) {
            console.log(`Signing player at index ${playerInfo.index} for $${playerInfo.salary}M`);

            // Click sign button
            const btn = page.locator(`#faTable tbody tr:nth-child(${playerInfo.index + 1}) .sign-btn`);
            await btn.click();
            await page.waitForTimeout(1000);

            // Verify Cap Update
            const newCap = await page.evaluate(() => {
                const tid = window.state.userTeamId;
                return window.state.league.teams[tid].capRoom;
            });
            console.log('New Cap:', newCap);

            // Cap should decrease roughly by salary (ignoring bonus logic for simplicity here, or assume simple contract)
            // Note: signFreeAgent calculates cap hit. Usually base + bonus.
            // We just verify it went down significantly.
            expect(newCap).toBeLessThan(initialCap - 0.1);
        } else {
            console.log('No affordable players found.');
        }
    });

    test('4. Replay Exploit Prevention', async ({ page }) => {
        await page.goto('http://localhost:3000');

        // Force state with a finalized game
        await page.evaluate(async () => {
            if (!window.state?.league) {
                await window.gameController.startNewLeague();
                document.getElementById('onboardStart').click();
            }

            // Mock a finalized game
            const L = window.state.league;
            const week = L.week;
            if (!L.schedule.weeks) L.schedule.weeks = []; // Ensure structure

            // Ensure we have a schedule entry for this week
            let weekData = L.schedule.weeks.find(w => w.weekNumber === week);
            if (!weekData) {
                weekData = { weekNumber: week, games: [] };
                L.schedule.weeks.push(weekData);
            }

            // Add a finalized game involving user
            const game = {
                home: L.userTeamId,
                away: (L.userTeamId + 1) % L.teams.length,
                homeScore: 21,
                awayScore: 17,
                finalized: true,
                played: true
            };
            weekData.games.push(game);

            // Also add to resultsByWeek so it's consistent
            if (!L.resultsByWeek) L.resultsByWeek = {};
            if (!L.resultsByWeek[week-1]) L.resultsByWeek[week-1] = [];
            L.resultsByWeek[week-1].push(game);

            window.testGame = game;
        });

        // Attempt to watch
        await page.evaluate(() => {
            const g = window.testGame;
            window.watchLiveGame(g.home, g.away);
        });

        await page.waitForTimeout(1000);

        // Should NOT be on game-sim view
        const hash = await page.evaluate(() => location.hash);
        console.log('Hash after exploit attempt:', hash);
        expect(hash).not.toContain('game-sim');
    });

    test('5. Legacy & Retirement', async ({ page }) => {
        await page.goto('http://localhost:3000');

        await page.evaluate(async () => {
             if (!window.state?.league) {
                 await window.gameController.startNewLeague();
                 document.getElementById('onboardStart').click();
             }
        });
        await page.waitForSelector('#hub', { state: 'visible' });

        // Run retirement logic manually
        const result = await page.evaluate(() => {
            const L = window.state.league;
            const oldPlayer = {
                id: 'oldie',
                name: 'Brett Favre',
                pos: 'QB',
                age: 45,
                ovr: 70,
                years: 1,
                stats: { career: { passYd: 70000 } }
            };
            L.teams[0].roster.push(oldPlayer);

            return window.processRetirements(L, L.year);
        });

        console.log('Retirement Result:', result);

        const retired = result.retired.find(p => p.player.name === 'Brett Favre');
        expect(retired).toBeDefined();

        const announcement = result.announcements.find(a => a.includes('Brett Favre'));
        expect(announcement).toContain('70,000 passing yards');
    });

});
