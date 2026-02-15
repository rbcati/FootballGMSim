const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/index.html');
  await page.waitForTimeout(2000);

  await page.evaluate(() => {
      const modal = document.createElement('div');
      modal.className = 'modal gem-reveal-modal';
      modal.style.display = 'flex';
      modal.innerHTML = `
        <div class="reveal-card gem-status">
            <div class="reveal-header"><h2>Draft Result</h2></div>
            <div class="player-reveal-info">
                <h1>Test Player</h1>
                <p>QB | Test College</p>
                <div class="reveal-badge gem">💎 HIDDEN GEM</div>
                <div class="rating-reveal">
                    <div class="rating-box"><span class="label">True OVR</span><span class="value boosted">85</span></div>
                    <div class="rating-box"><span class="label">Potential</span><span class="value">95</span></div>
                </div>
                <p class="reveal-message">Better than expected!</p>
            </div>
        </div>
      `;
      document.body.appendChild(modal);
  });

  await page.screenshot({ path: 'verification/gem_reveal.png' });
  await browser.close();
})();
