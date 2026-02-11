
const fs = require('fs');
const path = require('path');

// Mock Browser Environment
const window = {
    Constants: { SIMULATION: { HOME_ADVANTAGE: 2.5 } },
    Utils: {
        rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
        random: () => Math.random()
    },
    state: {
        league: {
            weeklyGamePlan: {},
            week: 1,
            teams: []
        }
    },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    getComputedStyle: () => ({ getPropertyValue: () => '#fff' }),
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    liveGameViewer: null,
    watchLiveGame: null,
    setStatus: (msg, type) => console.log(`[STATUS ${type}] ${msg}`)
};

const document = {
    body: {
        contains: () => true,
        appendChild: () => {},
        getPropertyValue: () => ''
    },
    querySelector: () => ({
        addEventListener: () => {},
        querySelectorAll: () => [],
        querySelector: () => null,
        appendChild: () => {},
        innerHTML: '',
        style: {},
        classList: { add: () => {}, remove: () => {} }
    }),
    createElement: () => ({
        className: '',
        style: {},
        classList: { add: () => {}, remove: () => {} },
        addEventListener: () => {},
        remove: () => {}
    })
};

const console = global.console;

// Mock dependencies
const soundManager = {
    playClick: () => {},
    playCatch: () => {},
    playTackle: () => {},
    playKick: () => {},
    playTouchdown: () => {},
    playHorns: () => {},
    playCheer: () => {},
    playPing: () => {},
    playComboBreaker: () => {},
    playFailure: () => {},
    playMomentumShift: () => {},
    playFirstDown: () => {},
    playDefenseStop: () => {},
    playIntercept: () => {},
    playFumble: () => {},
    playInterception: () => {},
    playFieldGoalMiss: () => {},
    playCrowdGasp: () => {},
    playSack: () => {},
    playShockwave: () => {},
    playBigPlay: () => {},
    playFieldGoal: () => {},
    playVictory: () => {},
    playWhistle: () => {},
    setupGlobalSounds: () => {}
};

class FieldEffects {
    constructor() {}
    startWeather() {}
    resize() {}
    destroy() {}
    spawnParticles() {}
}

const launchConfetti = () => {};
const commitGameResult = () => ({ success: true });

// Read and evaluate source file
const sourcePath = path.join(__dirname, '../live-game-viewer.js');
let code = fs.readFileSync(sourcePath, 'utf8');

// Strip imports
code = code.replace(/^import .*$/gm, '');

// Evaluate in context
const run = new Function('window', 'document', 'console', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'soundManager', 'launchConfetti', 'FieldEffects', 'commitGameResult', 'localStorage', code);

run(window, document, console, setTimeout, clearTimeout, window.requestAnimationFrame, soundManager, launchConfetti, FieldEffects, commitGameResult, window.localStorage);

// Run Tests
async function runTests() {
    console.log('Starting Dynamic Difficulty Verification...');
    const viewer = window.liveGameViewer;

    if (!viewer) {
        console.error('❌ LiveGameViewer not initialized');
        process.exit(1);
    }

    // 1. Test Adaptive AI Trigger (Streak >= 3)
    console.log('\n--- Test 1: Adaptive AI Trigger (Streak >= 3) ---');
    const userTeamWin = {
        id: 1, name: 'Winners', abbr: 'WIN', ovr: 80, roster: [],
        stats: { streak: 3, wins: 5 }
    };
    const oppTeam = {
        id: 2, name: 'Opponents', abbr: 'OPP', ovr: 80, roster: [],
        stats: { streak: 0, wins: 0 }
    };

    viewer.initGame(userTeamWin, oppTeam, 1);

    if (viewer.preGameContext.adaptiveAI === true) {
        console.log('✅ Adaptive AI correctly enabled (3-game streak)');
    } else {
        console.error('❌ Adaptive AI NOT enabled for 3-game streak');
        console.log('Context:', viewer.preGameContext);
        process.exit(1);
    }

    // 2. Test Adaptive AI Inactive (Streak < 3)
    console.log('\n--- Test 2: Adaptive AI Inactive (Streak < 3) ---');
    const userTeamLoss = {
        id: 1, name: 'Losers', abbr: 'LOS', ovr: 80, roster: [],
        stats: { streak: 2, wins: 2 }
    };
    viewer.initGame(userTeamLoss, oppTeam, 1);

    if (!viewer.preGameContext.adaptiveAI) {
        console.log('✅ Adaptive AI correctly disabled (< 3 streak)');
    } else {
        console.error('❌ Adaptive AI enabled incorrectly');
        console.log('Context:', viewer.preGameContext);
        process.exit(1);
    }

    // 3. Test Difficulty Modifier Execution
    console.log('\n--- Test 3: Difficulty Modifier Execution ---');
    // Force enable
    viewer.preGameContext.adaptiveAI = true;
    viewer.userTeamId = 1;

    // Set state: User (Home) leading heavily
    viewer.gameState.home.score = 28;
    viewer.gameState.away.score = 0;
    viewer.gameState.ballPossession = 'home'; // User Offense

    try {
        const play = viewer.generatePlay(
            viewer.gameState.home,
            viewer.gameState.away,
            viewer.gameState,
            true, // isUserTeam
            30, 0
        );
        console.log(`✅ generatePlay executed successfully with Adaptive AI active.`);
        console.log(`   Play Result: ${play.result} (${play.yards} yards)`);
    } catch (e) {
        console.error('❌ generatePlay crashed with Adaptive AI:', e);
        process.exit(1);
    }

    // 4. Test Weather Generation (Winter)
    console.log('\n--- Test 4: Weather Generation ---');
    window.state.league.week = 15; // Late season
    let weatherCounts = { clear: 0, rain: 0, snow: 0 };

    for(let i=0; i<50; i++) {
        viewer.initGame(userTeamWin, oppTeam, 1);
        const w = viewer.preGameContext.weather || 'clear';
        weatherCounts[w] = (weatherCounts[w] || 0) + 1;
    }

    console.log('Weather Distribution (50 games):', weatherCounts);
    if (weatherCounts.snow > 0 || weatherCounts.rain > 0) {
        console.log('✅ Weather variation confirmed');
    } else {
        console.warn('⚠️ No weather variation found (check probability logic)');
    }

    console.log('\n✅ All verification steps passed successfully.');
}

runTests();
