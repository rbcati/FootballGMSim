
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Setup JSDOM
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<body>
    <div id="game-sim"></div>
</body>
</html>
`, {
    url: "http://localhost/",
    pretendToBeVisual: true,
    resources: "usable",
    runScripts: "dangerously"
});

global.window = dom.window;
global.document = dom.window.document;
// global.navigator = dom.window.navigator; // Skip read-only
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock offsetParent for checkUI
Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetParent', {
    get() { return this.parentNode; }
});

// Mock Canvas
dom.window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect: () => {},
    fillRect: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    rect: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    fillStyle: '',
    globalAlpha: 1
});

// Mock LocalStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => store[key] = value.toString(),
        removeItem: (key) => delete store[key],
        clear: () => store = {}
    };
})();
Object.defineProperty(global.window, 'localStorage', { value: localStorageMock });

// Mock Utils
global.window.Utils = {
    random: () => Math.random(),
    rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
};

// Mock Imports
// We need to load modules. Since we are in Node, we can import them if we use absolute paths or handle resolution.
// But they have relative imports.
// A simple way is to read file content and eval, or rely on Node's module system if paths are correct.
// Since we are in `verification/` and files are in `src/` (actually root based on list_files), we need to adjust.
// The file listing showed files in root `.`.
// So `import ... from './game-simulator.js'` works if we run from root.

// We will run this script from root.

// Mock dependencies that might be troublesome
// We can't easily mock ES module imports inside other modules without a loader.
// So we will rely on the real files, but mock the side effects.

// Mock SoundManager before import? No, it exports an instance.
// We can patch the instance after import.

async function runTest() {
    console.log("Starting Juice Verification...");

    // Import Modules
    // Use dynamic import with absolute path to ensure we find them
    const rootDir = path.resolve(__dirname, '..');

    // Check if files exist
    if (!fs.existsSync(path.join(rootDir, 'live-game-viewer.js'))) {
        console.error("Could not find live-game-viewer.js");
        process.exit(1);
    }

    // Import LiveGameViewer
    const LiveGameViewerModule = await import(path.join('file://', rootDir, 'live-game-viewer.js'));
    const SoundManagerModule = await import(path.join('file://', rootDir, 'sound-manager.js'));

    // So importing it should execute the side effect of setting window.liveGameViewer

    if (!window.liveGameViewer) {
        console.error("window.liveGameViewer not initialized");
        process.exit(1);
    }

    const viewer = window.liveGameViewer;
    const soundManager = window.soundManager; // Should be set by sound-manager.js

    // Spy on SoundManager
    const soundLog = [];
    ['playTouchdown', 'playFailure', 'playIntercept', 'playFumble', 'playPing'].forEach(method => {
        const original = soundManager[method];
        soundManager[method] = () => {
            soundLog.push(method);
            if (original) original.call(soundManager);
        };
    });

    // Mock Viewer UI
    const container = document.getElementById('game-sim');
    // We need to initialize viewer with renderToView to set this.container
    viewer.preGameContext = { adaptiveAI: true, difficulty: 'Hard' }; // Force context
    viewer.renderToView('#game-sim');

    // Test 1: Touchdown Shake & Sound
    console.log("Testing Touchdown Juice...");
    const tdPlay = {
        type: 'play',
        playType: 'pass_long',
        result: 'touchdown',
        offense: 1,
        defense: 2,
        yards: 50,
        message: 'TOUCHDOWN!',
        quarter: 1,
        time: 800,
        down: 1,
        distance: 10,
        yardLine: 100
    };

    // Mock gameState
    viewer.gameState = {
        home: { team: { id: 1, abbr: 'HOM' }, score: 0, yardLine: 50, distance: 10, down: 1 },
        away: { team: { id: 2, abbr: 'AWY' }, score: 0, yardLine: 25, distance: 10, down: 1 },
        quarterScores: { home: [0,0,0,0], away: [0,0,0,0] },
        ballPossession: 'home',
        stats: { home: { players: {} }, away: { players: {} } },
        drive: { plays: 1, yards: 50 },
        momentum: 0
    };
    viewer.userTeamId = 1; // User is Home

    console.log("GameState:", JSON.stringify(viewer.gameState, null, 2));
    viewer.renderPlay(tdPlay);

    // Check Shake
    // Shake adds class to container
    const isShaking = container.classList.contains('shake') || container.classList.contains('shake-hard');
    if (isShaking) console.log("PASS: Container is shaking on TD");
    else console.error("FAIL: Container is NOT shaking on TD");

    // Check Sound
    if (soundLog.includes('playTouchdown')) console.log("PASS: playTouchdown called");
    else console.error("FAIL: playTouchdown NOT called");

    // Test 2: Interception Shake (Hard)
    console.log("Testing Interception Juice...");
    // Clear shake classes first (mock timeout)
    container.classList.remove('shake', 'shake-hard');

    const intPlay = {
        type: 'play',
        playType: 'pass_long',
        result: 'turnover',
        message: 'Interception!',
        offense: 1,
        defense: 2,
        yards: 0,
        quarter: 1,
        time: 750,
        down: 2,
        distance: 10,
        yardLine: 50
    };

    viewer.renderPlay(intPlay);

    const isHardShaking = container.classList.contains('shake-hard');
    if (isHardShaking) console.log("PASS: Container is shaking HARD on Interception");
    else console.error("FAIL: Container is NOT shaking HARD on Interception");

    // Test 3: Adaptive AI Warning
    console.log("Testing Adaptive AI Warning...");
    // Mock preGameContext
    viewer.preGameContext = { adaptiveAI: true };
    viewer.gameState.home.score = 14; // User leading
    viewer.gameState.away.score = 0;

    // We need to trigger generatePlay and see if it calls triggerFloatText
    // Spy on triggerFloatText
    let floatTextCalled = false;
    const originalFloat = viewer.triggerFloatText;
    viewer.triggerFloatText = (text, type) => {
        if (text.includes('AI ADAPTING')) {
            floatTextCalled = true;
            console.log("Visual Feedback Triggered: " + text);
        }
        originalFloat.call(viewer, text, type);
    };

    // Force random to trigger the 5% chance
    const originalRand = Math.random;
    Math.random = () => 0.01; // Always trigger

    const offense = { team: { id: 1 }, score: 14, players: { rbs: [], wrs: [], tes: [] } };
    const defense = { team: { id: 2 }, score: 0 };

    // Call generatePlay
    // generatePlay(offense, defense, gameState, isUserTeam, targetHomeScore, targetAwayScore)
    viewer.generatePlay(offense, defense, viewer.gameState, true, 20, 20);

    if (floatTextCalled) console.log("PASS: AI Adapting feedback shown");
    else console.error("FAIL: AI Adapting feedback NOT shown");

    // Restore Math.random
    Math.random = originalRand;

    // Test 4: Particle System (Field Effects)
    console.log("Testing Particle System...");
    if (viewer.fieldEffects) {
        // Mock spawnParticles
        let particlesSpawned = false;
        viewer.fieldEffects.spawnParticles = (pct, type) => {
            particlesSpawned = true;
            console.log(`Particles spawned: ${type} at ${pct}%`);
        };

        // Render a field goal to trigger particles
        const fgPlay = {
            type: 'play',
            playType: 'field_goal',
            result: 'field_goal',
            offense: 1,
            defense: 2,
            yards: 30,
            message: 'Good!',
            quarter: 1,
            time: 700,
            down: 4,
            distance: 5,
            yardLine: 80
        };
        viewer.renderPlay(fgPlay); // renderPlay doesn't trigger logic based effects usually, animatePlay does?
        // Wait, renderPlay triggers "JUICE" which spawns particles for Result!

        // Let's check renderPlay logic:
        /*
        if (play.result === 'field_goal') {
            // ...
            this.triggerVisualFeedback('goal', 'FIELD GOAL!');
            if (launchConfetti) launchConfetti();
        }
        */
       // Actually `animatePlay` spawns particles for field_goal result?
       // Let's check live-game-viewer.js
       /*
       if (play.result === 'field_goal' && this.fieldEffects) {
           this.fieldEffects.spawnParticles(endPct, 'field_goal');
       }
       */
       // This is in `animatePlay`.
       // `renderPlay` spawns particles for `touchdown` and `big_play`.

       // Trigger a touchdown again
       particlesSpawned = false;
       viewer.renderPlay(tdPlay);

       if (particlesSpawned) console.log("PASS: Particles spawned for TD");
       else console.error("FAIL: Particles NOT spawned for TD in renderPlay");

    } else {
        console.warn("FieldEffects not initialized");
    }

}

runTest().catch(console.error);
