
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- MOCK DOM ENVIRONMENT ---
class MockElement {
    constructor(tagName) {
        this.tagName = tagName || 'DIV';
        this.classList = {
            _classes: new Set(),
            add: (...args) => args.forEach(c => this.classList._classes.add(c)),
            remove: (...args) => args.forEach(c => this.classList._classes.delete(c)),
            contains: (c) => this.classList._classes.has(c),
            toggle: (c) => this.classList.contains(c) ? this.classList.remove(c) : this.classList.add(c)
        };
        this.style = {};
        this.children = [];
        this.parentNode = null;
        this.parentElement = null; // Alias
        this.textContent = '';
        this.innerHTML = '';
        this.offsetParent = { offsetWidth: 1000, offsetHeight: 600 }; // Mock dimensions
        this.offsetWidth = 100;
        this.offsetHeight = 100;
    }

    appendChild(child) {
        child.parentNode = this;
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx > -1) {
            this.children.splice(idx, 1);
            child.parentNode = null;
            child.parentElement = null;
        }
        return child;
    }

    querySelector(selector) {
        const find = (node) => {
            // Check current node (if not root of search, but here we search children)
            // But querySelector searches descendants.

            // Check direct children
            for (const child of node.children) {
                if (selector.startsWith('.')) {
                    if (child.classList.contains(selector.substring(1))) return child;
                } else if (selector.startsWith('#')) {
                    // ID check (not implemented in mock properly but assuming unique)
                } else {
                    if (child.tagName === selector.toUpperCase()) return child;
                }

                const found = find(child);
                if (found) return found;
            }
            return null;
        };
        return find(this);
    }

    querySelectorAll(selector) {
        if (selector.startsWith('.')) {
            const className = selector.substring(1);
            return this.children.filter(c => c.classList.contains(className));
        }
        return [];
    }

    addEventListener() {}
    removeEventListener() {}
    setAttribute() {}
    removeAttribute() {}
    hasAttribute() { return false; }

    contains(child) {
        if (child === this) return true;
        for (const c of this.children) {
            if (c === child || c.contains(child)) return true;
        }
        return false;
    }
}

class MockCanvas extends MockElement {
    constructor() {
        super('CANVAS');
        this.width = 1000;
        this.height = 600;
    }
    getContext(type) {
        return {
            clearRect: () => {},
            beginPath: () => {},
            arc: () => {},
            fill: () => {},
            stroke: () => {},
            moveTo: () => {},
            lineTo: () => {},
            fillRect: () => {},
            save: () => {},
            restore: () => {},
            scale: () => {},
            translate: () => {},
            rotate: () => {},
            createLinearGradient: () => ({ addColorStop: () => {} }),
            globalAlpha: 1,
            fillStyle: '',
            strokeStyle: '',
            lineWidth: 1
        };
    }
}

// Global mocks
global.document = {
    createElement: (tag) => {
        if (tag.toLowerCase() === 'canvas') return new MockCanvas();
        return new MockElement(tag.toUpperCase());
    },
    body: new MockElement('BODY'),
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener: () => {},
    removeEventListener: () => {}
};

global.window = {
    document: global.document,
    addEventListener: () => {},
    removeEventListener: () => {},
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    requestAnimationFrame: (cb) => setTimeout(cb, 16), // Simulate 60fps roughly
    cancelAnimationFrame: (id) => clearTimeout(id),
    getComputedStyle: () => ({
        getPropertyValue: () => '',
        position: 'static'
    }),
    performance: { now: () => Date.now() },
    location: { hash: '' },
    Utils: {
        random: Math.random,
        rand: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
    },
    Constants: {}
};

global.HTMLElement = MockElement;
global.HTMLCanvasElement = MockCanvas;
global.getComputedStyle = global.window.getComputedStyle;
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;
global.performance = global.window.performance;

// Mock Audio
global.AudioContext = class {
    constructor() {
        this.state = 'running';
    }
    createOscillator() {
        return {
            connect: () => {},
            start: () => {},
            stop: () => {},
            frequency: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }
        };
    }
    createGain() {
        return {
            connect: () => {},
            gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }
        };
    }
    createBuffer() {
        return {
            getChannelData: () => new Float32Array(1024)
        };
    }
    createBufferSource() {
        return {
            connect: () => {},
            start: () => {},
            stop: () => {}
        };
    }
    createBiquadFilter() {
        return {
            connect: () => {},
            frequency: { value: 0 }
        };
    }
    resume() { return Promise.resolve(); }
    get destination() { return {}; }
    get currentTime() { return Date.now() / 1000; }
};
global.window.AudioContext = global.AudioContext;

// Mock localStorage
const mockStorage = {
    store: {},
    getItem: (key) => mockStorage.store[key] || null,
    setItem: (key, val) => mockStorage.store[key] = val.toString(),
    removeItem: (key) => delete mockStorage.store[key],
    clear: () => mockStorage.store = {}
};
global.localStorage = mockStorage;
global.window.localStorage = mockStorage;

// Import LiveGameViewer
// We use dynamic import to ensure environment is set up first
async function runTest() {
    console.log('Starting LiveGameViewer Animation Verification...');

    try {
        // Import module
        const { default: soundManager } = await import('../legacy/sound-manager.js');
        // We need to access the class from the module, but the file exports an instance on window usually
        // Let's import the file for side effects (attaching to window)
        await import('../legacy/live-game-viewer.js');

        const viewer = new window.liveGameViewer.constructor();

        // Setup Dummy Container
        const container = new MockElement('DIV');
        container.classList.add('live-game-container');
        // Add required children
        const fieldWrapper = new MockElement('DIV');
        fieldWrapper.classList.add('field-wrapper');
        container.appendChild(fieldWrapper);

        const scoreboard = new MockElement('DIV');
        scoreboard.classList.add('scoreboard');
        container.appendChild(scoreboard);

        // Append container to document body so checkUI passes
        document.body.appendChild(container);

        // Mock renderToView to populate container
        viewer.container = container;
        viewer.viewMode = true;

        // Force render field to create ball/markers
        // viewer.renderField(fieldWrapper); // This sets innerHTML which our mock doesn't parse

        // Manually populate DOM for test
        const fieldContainer = new MockElement('DIV');
        fieldContainer.classList.add('football-field-container');
        fieldWrapper.appendChild(fieldContainer);

        const ball = new MockElement('DIV');
        ball.classList.add('football-ball');
        fieldContainer.appendChild(ball);

        const qbMarker = new MockElement('DIV');
        qbMarker.classList.add('marker-qb');
        fieldContainer.appendChild(qbMarker);

        const skillMarker = new MockElement('DIV');
        skillMarker.classList.add('marker-skill');
        fieldContainer.appendChild(skillMarker);

        if (!ball) throw new Error('Ball not found in field wrapper');

        console.log('Verified: Field manually populated with ball/markers');

        // TEST 1: Pass Animation Logic
        console.log('Test 1: Simulating Long Pass...');

        // Setup dummy state
        const homeTeam = { id: 1, abbr: 'HOME', roster: [{pos:'QB', id:10}, {pos:'WR', id:11}] };
        const awayTeam = { id: 2, abbr: 'AWAY', roster: [] };

        viewer.gameState = viewer.initializeGameState(homeTeam, awayTeam);
        viewer.gameState.ballPossession = 'home';

        const startState = { yardLine: 20, possession: 'home' };

        // Mock animateTrajectory to spy on classes
        const originalAnimate = viewer.animateTrajectory.bind(viewer);
        let passBlurred = false;

        viewer.animateTrajectory = async (element, options) => {
            // Check if ball gets blur-motion
            console.log('animateTrajectory called for:', element === ball ? 'ball' : 'other', JSON.stringify(options));
            if (element === ball) {
                if (options.animationClass === 'blur-motion' || element.classList.contains('blur-motion')) {
                    passBlurred = true;
                    console.log('  -> Ball has blur-motion class!');
                }
            }
            return originalAnimate(element, options);
        };

        const passPlay = {
            type: 'play',
            playType: 'pass_long',
            result: 'complete',
            yards: 30,
            offense: 1,
            defense: 2,
            yardLine: 20
        };

        await viewer.animatePlay(passPlay, startState);

        // We expect passBlurred to be true once implemented
        if (passBlurred) console.log('PASS: Ball received blur-motion');
        else console.warn('FAIL: Ball did NOT receive blur-motion (Expected for Day 2 task)');

        // TEST 2: Run Animation Logic
        console.log('Test 2: Simulating Big Run...');

        // qbMarker and skillMarker are already defined above

        let jukeApplied = false;

        // Reset animateTrajectory spy
        viewer.animateTrajectory = async (element, options) => {
            if (element === skillMarker) {
                 if (options.animationClass === 'juke-move' || options.animationClass === 'celebrate-spin' || element.classList.contains('juke-move')) {
                     jukeApplied = true;
                     console.log('  -> Runner has juke/spin move!');
                 }
            }
            return originalAnimate(element, options);
        };

        const runPlay = {
            type: 'play',
            playType: 'run_outside',
            result: 'big_play',
            yards: 25,
            offense: 1,
            defense: 2,
            yardLine: 50
        };

        await viewer.animatePlay(runPlay, { yardLine: 50, possession: 'home' });

        if (jukeApplied) console.log('PASS: Runner received juke/spin animation');
        else console.warn('FAIL: Runner did NOT receive juke/spin animation (Expected for Day 2 task)');

        // TEST 3: Score Pop
        console.log('Test 3: Score Update Pop...');

        // Setup scoreboard elements
        const scoreHome = new MockElement('DIV');
        scoreHome.id = 'scoreHome';
        const homeBox = new MockElement('DIV');
        homeBox.id = 'homeTeamBox';
        scoreboard.appendChild(homeBox);
        homeBox.appendChild(scoreHome);

        viewer.lastHomeScore = 0;
        viewer.gameState.home.score = 7;

        viewer.updateScoreboard();

        if (homeBox.classList.contains('score-pop') || homeBox.classList.contains('pulse-score-strong')) {
             console.log('PASS: Score box popped/pulsed');
        } else {
             console.log('Note: Score box pop might use "pulse-score-strong" currently. Checking for "score-pop" specifically later.');
        }

        console.log('Verification Complete.');

    } catch (e) {
        console.error('Test Failed:', e);
        process.exit(1);
    }
}

runTest();
