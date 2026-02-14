const { test, expect } = require('@playwright/test');

test.describe('Performance Benchmark: Roster Rendering', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the app
        await page.goto('http://localhost:3000');

        // Wait for app to be ready - this depends on how the app loads
        try {
            await page.waitForSelector('#hub', { timeout: 5000 });
        } catch (e) {
            console.log('Hub not found, maybe onboarding?');
        }

        // Setup large roster mock common for all tests
        await page.evaluate(() => {
            // Hide existing views to prevent overlap
            document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.modal').forEach(el => el.style.display = 'none');

            // Create 100 players (reduced for functional tests to be faster)
            const players = Array.from({ length: 100 }, (_, i) => ({
                id: `p${i}`,
                name: `Player ${i}`,
                pos: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'][i % 11],
                age: 20 + (i % 15),
                ovr: 70 + (i % 30),
                displayOvr: 70 + (i % 30),
                stats: { season: { gamesPlayed: 10, passYd: i, passTD: i % 5 } },
                depthChart: { depthPosition: (i % 3) + 1, playbookKnowledge: 80, chemistry: 80 },
                years: 1,
                baseAnnual: 5.5,
                injuries: [],
                abilities: [],
                developmentStatus: 'NORMAL',
                morale: 80
            }));

            // Mock state structure required by renderRoster
            window.state = window.state || {};
            window.state.league = window.state.league || {};
            window.state.league.teams = window.state.league.teams || [];

            // Ensure at least one team exists at index 0
            if (!window.state.league.teams[0]) {
                window.state.league.teams[0] = {
                    id: 0,
                    name: 'Benchmark Team',
                    abbr: 'BNCH',
                    roster: []
                };
            }

            // Assign large roster to team 0
            window.state.league.teams[0].roster = players;
            window.state.userTeamId = 0;
            window.state.viewTeamId = 0;
            window.state.rosterViewMode = 'table'; // Force table view

            // Ensure DOM elements exist
            let rosterTable = document.getElementById('rosterTable');
            if (!rosterTable) {
                rosterTable = document.createElement('table');
                rosterTable.id = 'rosterTable';
                // Ensure it's visible and on top
                rosterTable.style.position = 'fixed';
                rosterTable.style.top = '0';
                rosterTable.style.left = '0';
                rosterTable.style.width = '100%';
                rosterTable.style.height = '100%';
                rosterTable.style.zIndex = '10000';
                rosterTable.style.backgroundColor = 'white';
                document.body.appendChild(rosterTable);
                // Also need a tbody
                rosterTable.appendChild(document.createElement('tbody'));
            } else {
                 rosterTable.style.display = 'table'; // Force show
            }

            // Ensure other elements renderRoster might look for exist
            if (!document.getElementById('rosterTeam')) {
                const sel = document.createElement('select');
                sel.id = 'rosterTeam';
                document.body.appendChild(sel);
            }
             if (!document.getElementById('rosterTitle')) {
                const div = document.createElement('div');
                div.id = 'rosterTitle';
                document.body.appendChild(div);
            }

            // Render the roster initially
            window.renderRoster();
        });
    });

    test('Measure renderRoster execution time with large roster', async ({ page }) => {
        // Increase roster size for benchmark
        await page.evaluate(() => {
            const morePlayers = Array.from({ length: 1000 }, (_, i) => ({
                 id: `p${i}`,
                 name: `Player ${i}`,
                 pos: 'QB',
                 stats: { season: {} },
                 depthChart: {},
                 ratings: {}
            }));
            window.state.league.teams[0].roster = morePlayers;
        });

        // Run benchmark
        const result = await page.evaluate(() => {
            const iterations = 10;
            let totalTime = 0;

            // Warmup
            window.renderRoster();

            for (let i = 0; i < iterations; i++) {
                const start = performance.now();
                window.renderRoster();
                const end = performance.now();
                totalTime += (end - start);
            }

            return {
                avgTime: totalTime / iterations,
                totalTime: totalTime,
                iterations: iterations
            };
        });

        console.log(`Average renderRoster time (1000 players): ${result.avgTime.toFixed(2)}ms`);
        expect(result.avgTime).toBeLessThan(5000);
    });

    test('Verify player click functionality', async ({ page }) => {
        // Mock showPlayerDetails
        await page.evaluate(() => {
            window.detailsClicked = false;
            window.clickedPlayerId = null;
            window.showPlayerDetails = (player) => {
                window.detailsClicked = true;
                window.clickedPlayerId = player.id;
            };

            // Dispatch click manually to avoid visibility issues
            const tr = document.querySelector('tr[data-player-id="p0"]');
            if (tr) tr.click();
        });

        // Verify mock was called
        const result = await page.evaluate(() => ({
            clicked: window.detailsClicked,
            id: window.clickedPlayerId
        }));

        expect(result.clicked).toBe(true);
        expect(result.id).toBe('p0');
    });

    test('Verify checkbox click does NOT trigger details', async ({ page }) => {
         await page.evaluate(() => {
            window.detailsClicked = false;
            window.showPlayerDetails = () => { window.detailsClicked = true; };

            const checkbox = document.querySelector('tr[data-player-id="p0"] input[type="checkbox"]');
            if (checkbox) checkbox.click();
        });

        // Verify mock was NOT called
        const clicked = await page.evaluate(() => window.detailsClicked);
        expect(clicked).toBe(false);
    });

    test('Verify player name link click triggers details (but separate handler)', async ({ page }) => {
         await page.evaluate(() => {
            window.detailsClicked = false;
            window.clickedPlayerId = null;
            window.showPlayerDetails = (player) => {
                window.detailsClicked = true;
                window.clickedPlayerId = player.id;
            };

            const link = document.querySelector('tr[data-player-id="p0"] .player-name-link');
            if (link) link.click();
        });

        // Verify mock was called
        const result = await page.evaluate(() => ({
            clicked: window.detailsClicked,
            id: window.clickedPlayerId
        }));

        expect(result.clicked).toBe(true);
        expect(result.id).toBe('p0');
    });

    test('Verify no duplicate listeners on re-render', async ({ page }) => {
        await page.evaluate(() => {
            window.detailsClickedCount = 0;
            window.showPlayerDetails = () => { window.detailsClickedCount++; };

            // Render twice (creates new tbody each time)
            window.renderRoster();
            window.renderRoster();

            // Click once
            const tr = document.querySelector('tr[data-player-id="p0"]');
            if (tr) tr.click();
        });

        const count = await page.evaluate(() => window.detailsClickedCount);
        expect(count).toBe(1);
    });
});
