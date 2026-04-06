const fs = require('fs');
let code = fs.readFileSync('tests/daily_regression.spec.js', 'utf8');

// The `uiStartLeagueTemplate` replacement didn't fully work for test 1 because of regex matching.
// Let's just manually replace the test 1 startup logic since it's breaking on "Assuming game already loaded..."
// Oh wait, `hasFranchiseBtn_smoke` was replaced with `uiStartLeagueTemplate`, but the "Assuming game already loaded..." is STILL being printed.
// Let's replace the whole top part of Test 1.

code = code.replace(/test\('1\. Playability Smoke Test', async \(\{ page \}\) => \{[\s\S]*?const hubVisible = await page\.isVisible\('\.app-header'\);/, `test('1. Playability Smoke Test', async ({ page }) => {
        await page.goto('http://localhost:5173');
        await page.waitForTimeout(1000);

        const createBtnVisible = await page.isVisible('button:has-text("Start New Franchise")');
        if (createBtnVisible) {
            await page.click('button:has-text("Start New Franchise")');
            await page.waitForSelector('.team-select-btn, .team-card', { state: 'visible' });
            await page.locator('.team-select-btn, .team-card').first().click();
            await page.waitForTimeout(500);
            await page.click('button:has-text("Continue")');
            await page.waitForTimeout(500);
            await page.click('button:has-text("Continue")');
            await page.waitForTimeout(500);
            await page.click('button:has-text("Start Dynasty")');

            // Wait for onboarding and skip it
            await page.waitForTimeout(2500);
            await page.evaluate(() => {
                const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Skip tour'));
                if (btn) btn.click();
            });
        }
        await page.waitForSelector('.app-header', { state: 'visible', timeout: 60000 });
        const hubVisible = await page.isVisible('.app-header');`);

fs.writeFileSync('tests/daily_regression.spec.js', code);
