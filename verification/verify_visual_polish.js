const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Set viewport to a good size
  await page.setViewportSize({ width: 1280, height: 720 });

  // Navigate to app
  await page.goto('http://localhost:3000');

  // Wait for load
  await page.waitForLoadState('networkidle');

  // Trigger Visual Feedback directly in page context
  await page.evaluate(async () => {
      // Mock window.liveGameViewer if needed or use real one
      // We will FORCE create a container and trigger feedback

      const container = document.createElement('div');
      container.id = 'game-sim-verify';
      container.className = 'live-game-content'; // Apply styling
      container.style.width = '100%';
      container.style.height = '100%';
      container.style.position = 'relative';
      container.style.background = '#333';
      document.body.appendChild(container);

      // Inject CSS if missing (should be loaded though)

      // Manually trigger the overlay creation logic (mimicking live-game-viewer.js triggerVisualFeedback)
      const triggerFeedback = (type, text) => {
          const overlay = document.createElement('div');
          overlay.className = `game-event-overlay ${type} pop-in`;
          overlay.innerHTML = `<div class="event-text">${text}</div>`;
          container.appendChild(overlay);

          // Add some mock content behind it
          container.innerHTML += '<div style="color:white; padding:20px;">Game Content Background</div>';
      };

      // Trigger Defense Stop
      triggerFeedback('defense-stop', 'STOPPED!');

      // Also trigger a Big Play next to it (simulated)
      // triggerFeedback('big-play', 'BIG PLAY!');
  });

  // Wait for animation to be mid-way (popIn is 1.5s)
  await page.waitForTimeout(500);

  // Take screenshot
  await page.screenshot({ path: 'verification/visual_polish.png' });

  await browser.close();
})();
