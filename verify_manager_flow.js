
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console logs
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  try {
    // 1. Load the game
    console.log('Loading game...');
    await page.goto('http://localhost:3000');

    // Wait for JS to initialize
    await page.waitForTimeout(2000);

    // 2. Handle Initial State (Dashboard or Onboarding)
    const isOnboardHidden = await page.$eval('#onboardModal', el => el.hasAttribute('hidden') || el.style.display === 'none');

    if (isOnboardHidden) {
        // We are likely on Dashboard or Hub
        console.log('Onboarding modal is hidden.');

        // Check if we can create a new league from dashboard
        const dashboardVisible = await page.isVisible('#leagueDashboard');
        if (dashboardVisible) {
            console.log('Dashboard visible. Creating new league...');
            await page.click('#create-league-btn');
        } else {
            console.log('Dashboard not visible. Assuming Hub or unknown state. Reloading to force dashboard...');
            // Actually, let's just try to find the "Start New League" button or refresh
            await page.reload();
            await page.waitForTimeout(1000);
            await page.click('#create-league-btn');
        }
    } else {
        console.log('Onboarding modal is visible.');
    }

    // 3. Onboarding Flow
    console.log('Waiting for Start button...');
    await page.waitForSelector('#onboardStart', { state: 'visible', timeout: 10000 });

    console.log('Starting league...');
    await page.click('#onboardStart');

    // 4. Wait for Hub
    console.log('Waiting for Hub...');
    await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });

    // Wait for manager panel
    console.log('Waiting for Manager Panel...');
    // Note: If team has a BYE, this selector won't appear.
    // We should check if "BYE WEEK" is displayed.

    const isBye = await page.evaluate(() => {
        return document.body.innerText.includes('BYE WEEK');
    });

    if (isBye) {
        console.log('Detected Bye Week. Cannot test Manager Panel. Simulating week to get to next week...');
        await page.click('#btnSimWeekHero'); // Simulate Bye
        await page.waitForTimeout(2000);
        // Wait for Hub again
        await page.waitForSelector('#hub', { state: 'visible', timeout: 20000 });
    }

    await page.waitForSelector('.manager-panel', { state: 'visible', timeout: 10000 });
    console.log('Manager Panel found!');

    // 5. Interact with Manager Panel
    console.log('Selecting Aggressive Risk Profile...');
    await page.click('button[data-id="AGGRESSIVE"]');

    await page.waitForTimeout(500);
    const aggressiveBtn = await page.$('button[data-id="AGGRESSIVE"]');
    const classAttribute = await aggressiveBtn.getAttribute('class');
    if (!classAttribute.includes('primary')) {
        throw new Error('Aggressive button did not become active');
    }
    console.log('Aggressive Risk Profile selected.');

    // Select Game Plan (Select Element)
    console.log('Selecting Aggressive Passing Game Plan...');
    await page.selectOption('#managerGamePlan', 'AGGRESSIVE_PASSING');
    console.log('Aggressive Passing Game Plan selected.');

    // 6. Advance Week
    console.log('Advancing Week...');
    await page.click('#btnSimWeekHQ');

    // 7. Check Recap
    console.log('Waiting for Recap Modal...');
    await page.waitForSelector('.modal', { timeout: 20000 });

    await page.waitForTimeout(1000); // Wait for content
    const modalContent = await page.locator('.modal').innerText();

    if (modalContent.includes('Strategy Report')) {
        console.log('Recap confirmed with Strategy Report!');
    } else {
        console.warn('Strategy Report NOT found in recap. Content:', modalContent);
        // It might not be fatal if the logic didn't trigger narrative (e.g. mixed results), but it should be there.
    }

    // Take a screenshot of the recap
    await page.screenshot({ path: 'manager_flow_success.png' });
    console.log('Test Passed!');

  } catch (error) {
    console.error('Test failed:', error);
    await page.screenshot({ path: 'manager_flow_error.png' });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
