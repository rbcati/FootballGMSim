const { test, expect } = require('@playwright/test');

test('Verify New Game Juice Features', async ({ page }) => {
  // 1. Go to page to load scripts
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');

  // 2. Setup Mocks
  await page.evaluate(() => {
    window.soundMockCalls = {
      playDenied: 0,
      playStreakFire: 0,
      playLevelUp: 0,
      playDefenseStop: 0,
      playCrowdBuildup: 0
    };

    window.particleMockCalls = [];

    // Mock SoundManager
    if (window.soundManager) {
      window.soundManager.playDenied = () => { window.soundMockCalls.playDenied++; console.log('Mock: playDenied'); };
      window.soundManager.playStreakFire = () => { window.soundMockCalls.playStreakFire++; console.log('Mock: playStreakFire'); };
      window.soundManager.playLevelUp = () => { window.soundMockCalls.playLevelUp++; console.log('Mock: playLevelUp'); };
      window.soundManager.playDefenseStop = () => { window.soundMockCalls.playDefenseStop++; console.log('Mock: playDefenseStop'); };
      window.soundManager.playCrowdBuildup = () => { window.soundMockCalls.playCrowdBuildup++; console.log('Mock: playCrowdBuildup'); };

      // Stub others to avoid noise
      window.soundManager.playTouchdown = () => {};
      window.soundManager.playPing = () => {};
      window.soundManager.playHeartbeat = () => {};
    }

    // Mock LiveGameViewer Init
    if (!window.liveGameViewer) return;

    // Inject Container
    const container = document.createElement('div');
    container.id = 'game-sim';
    document.body.appendChild(container);

    // Init Game
    const home = { id: 1, abbr: 'HOME', name: 'Home Team', roster: [], color: '#0000ff' };
    const away = { id: 2, abbr: 'AWAY', name: 'Away Team', roster: [], color: '#ff0000' };
    window.liveGameViewer.initGame(home, away, 1);
    window.liveGameViewer.renderToView('#game-sim');

    // Mock FieldEffects
    if (window.liveGameViewer.fieldEffects) {
        window.liveGameViewer.fieldEffects.spawnParticles = (pct, type) => {
            console.log('Particle:', type);
            window.particleMockCalls.push({pct, type});
        };
    }

    // Force UI check
    window.liveGameViewer.checkUI = () => true;
  });

  // 3. Test Denied Sequence (Turnover on Downs)
  await page.evaluate(() => {
    const play = {
      result: 'turnover_downs',
      yards: 0,
      message: 'Stopped at the line!',
      type: 'play',
      playType: 'run',
      yardLine: 50
    };
    window.liveGameViewer.renderPlay(play);
  });

  // Verify Denied
  let soundCalls = await page.evaluate(() => window.soundMockCalls);
  expect(soundCalls.playDenied).toBe(1);

  let particles = await page.evaluate(() => window.particleMockCalls);
  const wallParticle = particles.find(p => p.type === 'wall');
  expect(wallParticle).toBeDefined();

  // Verify Overlay Class (via DOM check)
  const deniedOverlay = await page.evaluate(() => !!document.querySelector('.game-event-overlay.denied'));
  expect(deniedOverlay).toBe(true);

  // 4. Test Streak Fire (Combo >= 3)
  await page.evaluate(() => {
    window.liveGameViewer.combo = 3; // Set high combo
    const play = {
      result: 'big_play',
      yards: 20,
      message: 'Another big gain!',
      type: 'play',
      playType: 'pass',
      yardLine: 30,
      offense: 1, // User
      defense: 2
    };
    window.liveGameViewer.renderPlay(play);
  });

  soundCalls = await page.evaluate(() => window.soundMockCalls);
  expect(soundCalls.playStreakFire).toBe(1);

  // 5. Test Crowd Buildup (Critical 4th Down)
  await page.evaluate(async () => {
    // Set critical conditions
    window.liveGameViewer.gameState.quarter = 4;
    window.liveGameViewer.gameState.home.score = 20;
    window.liveGameViewer.gameState.away.score = 24; // Diff 4

    const play = {
      down: 4,
      playType: 'run',
      result: 'run',
      yards: 1,
      type: 'play'
    };

    // Trigger animation manually or via wrapper
    // animatePlay is async
    await window.liveGameViewer.animatePlay(play, { yardLine: 50, possession: 'home' });
  });

  soundCalls = await page.evaluate(() => window.soundMockCalls);
  expect(soundCalls.playCrowdBuildup).toBe(1);

  // 6. Test Level Up (Victory Screen)
  await page.evaluate(async () => {
    // Force Game Over with Win
    window.liveGameViewer.gameState.home.score = 21;
    window.liveGameViewer.gameState.away.score = 10;
    window.liveGameViewer.isGameEnded = false; // Reset for endGame logic

    // Trigger End Game Overlay
    window.liveGameViewer.endGame();

    // Wait for timeout (1500ms)
    await new Promise(r => setTimeout(r, 1600));
  });

  soundCalls = await page.evaluate(() => window.soundMockCalls);
  expect(soundCalls.playLevelUp).toBe(1);

});
