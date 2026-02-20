
import assert from 'assert';
// We need to setup globals BEFORE importing live-game-viewer because it might run code on import or rely on globals during init
global.window = {
    state: {},
    location: { hash: '' },
    Utils: {
        random: Math.random,
        rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
        choice: (arr) => arr[Math.floor(Math.random() * arr.length)]
    },
    Constants: {
        SIMULATION: { HOME_ADVANTAGE: 2.5 }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    innerWidth: 1024,
    innerHeight: 768
};

global.document = {
    createElement: (tag) => {
        return {
            style: {},
            classList: { add: () => {}, remove: () => {}, contains: () => false },
            setAttribute: () => {},
            removeAttribute: () => {},
            appendChild: () => {},
            prepend: () => {},
            querySelector: () => {
                const el = {
                    style: {},
                    classList: { add: () => {}, remove: () => {}, contains: () => false },
                    offsetWidth: 100,
                    prepend: () => {},
                    appendChild: () => {},
                    hasAttribute: () => false,
                    setAttribute: () => {},
                    removeAttribute: () => {},
                    textContent: ''
                };
                el.querySelector = () => el;
                el.querySelectorAll = () => [el];
                return el;
            },
            querySelectorAll: () => [],
            addEventListener: () => {},
            getContext: () => ({
                clearRect: () => {},
                fillRect: () => {},
                beginPath: () => {},
                arc: () => {},
                fill: () => {},
                stroke: () => {},
                save: () => {},
                restore: () => {},
                translate: () => {},
                rotate: () => {},
            })
        };
    },
    body: {
        contains: () => true,
        appendChild: () => {},
        style: {}
    },
    querySelector: () => null,
    querySelectorAll: () => []
};

global.AudioContext = class {
    constructor() {
        this.state = 'running';
    }
    resume() { return Promise.resolve(); }
    createOscillator() {
        return {
            frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            connect: () => {},
            start: () => {},
            stop: () => {},
            type: 'sine'
        };
    }
    createGain() {
        return {
            gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            connect: () => {}
        };
    }
    createBufferSource() {
        return {
            buffer: null,
            connect: () => {},
            start: () => {},
            stop: () => {}
        };
    }
    createBuffer() { return { getChannelData: () => [] }; }
    createBiquadFilter() {
        return { frequency: { value: 0 }, connect: () => {} };
    }
    destination = {};
    currentTime = 0;
    sampleRate = 44100;
};
global.window.AudioContext = global.AudioContext;

global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};

global.HTMLElement = class {};
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
global.getComputedStyle = () => ({ getPropertyValue: () => '', position: 'static' });

// Now import
import { LiveGameViewer } from '../live-game-viewer.js';
import soundManager from '../sound-manager.js';

// Mock SoundManager methods
let soundCalls = {};
const mockSound = (method) => {
    soundCalls[method] = 0;
    // Replace the method on the imported instance
    soundManager[method] = () => {
        soundCalls[method]++;
        console.log(`[Sound] ${method} called`);
    };
};

['playTouchdown', 'playCheer', 'playBigPlay', 'playCatch', 'playTackle'].forEach(mockSound);

// Test
console.log('Starting Game Juice Verification...');

const viewer = new LiveGameViewer();
viewer.checkUI = () => true; // Bypass DOM check
viewer.isSkipping = false; // Ensure sounds play
viewer.viewMode = true;
viewer.container = global.document.createElement('div');
// Mock play-log-enhanced
const playLog = global.document.createElement('div');
playLog.className = 'play-log-enhanced';
viewer.container.appendChild(playLog);

// Mock Teams
const homeTeam = { id: 0, name: 'Home', roster: [], stats: { streak: 0 } };
const awayTeam = { id: 1, name: 'Away', roster: [], stats: { streak: 0 } };

// Initialize State
viewer.initGame(homeTeam, awayTeam, 0);
// Ensure gameState is populated (initGame calls initializeGameState)
if (!viewer.gameState) {
    viewer.gameState = viewer.initializeGameState(homeTeam, awayTeam);
}

// Test 1: Touchdown Sound
console.log('Testing Touchdown Sound...');
const tdPlay = {
    type: 'play',
    playType: 'run_inside',
    result: 'touchdown',
    yards: 50,
    offense: 0,
    defense: 1,
    message: 'Touchdown Home!',
    quarter: 1,
    time: 800,
    down: 1,
    distance: 10,
    yardLine: 100
};

viewer.renderPlay(tdPlay);

if (soundCalls.playTouchdown > 0) {
    console.log('✅ Touchdown sound triggered');
} else {
    console.error('❌ Touchdown sound NOT triggered');
    process.exit(1);
}

// Test 2: Combo Counter
console.log('Testing Combo Counter...');
// renderPlay for user (ID 0) offense success should inc combo
const initialCombo = viewer.combo;
console.log('Combo after TD:', viewer.combo);

const bigPlay = {
    type: 'play',
    playType: 'pass_long',
    result: 'big_play',
    yards: 30,
    offense: 0, // User
    defense: 1,
    message: 'Big Play!',
    quarter: 1,
    time: 750,
    down: 1,
    distance: 10,
    yardLine: 50
};

viewer.renderPlay(bigPlay);
console.log('Combo after Big Play:', viewer.combo);

if (viewer.combo > initialCombo) {
    console.log('✅ Combo counter increased');
} else {
    console.error('❌ Combo counter failed to increase');
    process.exit(1);
}

console.log('✅ All Game Juice verifications passed!');
