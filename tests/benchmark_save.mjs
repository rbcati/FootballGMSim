
// tests/benchmark_save.mjs

// Mock global objects required by league-dashboard.js
const mockLocalStorage = {
    store: {},
    getItem: (key) => mockLocalStorage.store[key] || null,
    setItem: (key, value) => { mockLocalStorage.store[key] = value; },
    removeItem: (key) => { delete mockLocalStorage.store[key]; },
    key: (i) => Object.keys(mockLocalStorage.store)[i],
    get length() { return Object.keys(mockLocalStorage.store).length; }
};

const mockElement = {
    style: {},
    innerHTML: '',
    addEventListener: () => {},
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    classList: { add: () => {}, remove: () => {} },
    remove: () => {},
    setAttribute: () => {},
    hidden: false,
    value: ''
};

global.window = {
    state: {},
    footballDB: null,
    setStatus: () => {},
    localStorage: mockLocalStorage,
    sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    location: { hash: '' }
};

global.document = {
    getElementById: () => mockElement,
    createElement: () => mockElement,
    querySelector: () => mockElement,
    addEventListener: () => {}
};

global.localStorage = global.window.localStorage;
global.sessionStorage = global.window.sessionStorage;
global.alert = () => {};
global.confirm = () => true;

// Mock IndexedDB
global.indexedDB = {
    open: () => ({
        result: {},
        addEventListener: () => {}
    })
};

// Import saveGame dynamically
let saveGame;

async function setup() {
    try {
        const module = await import('../league-dashboard.js');
        saveGame = module.saveGame;
        console.log('✅ Loaded saveGame from league-dashboard.js');
    } catch (e) {
        console.error('Failed to load module:', e);
        process.exit(1);
    }
}

function createLargeState() {
    const teams = [];
    for (let i = 0; i < 32; i++) {
        teams.push({
            id: i,
            name: `Team ${i}`,
            roster: Array(53).fill(0).map((_, j) => ({
                id: j,
                name: `Player ${j}`,
                stats: { season: {}, career: {} }
            }))
        });
    }

    // Add some history to bloat the state
    const history = [];
    for (let i = 0; i < 50; i++) {
        history.push({ year: 2020 + i, champion: 'Team 0' });
    }

    return {
        league: {
            year: 2025,
            teams: teams
        },
        userTeamId: 0,
        history: history,
        version: '4.0.0'
    };
}

async function runBenchmark() {
    await setup();

    const largeState = createLargeState();

    // Spy on localStorage.setItem
    let localStorageWrites = 0;
    let largeWrites = 0;
    const originalSetItem = global.localStorage.setItem;

    global.localStorage.setItem = (key, value) => {
        localStorageWrites++;
        if (key.startsWith('football_gm_league_')) {
            largeWrites++;
        }
        originalSetItem(key, value);
    };

    let footballDBCalls = 0;
    // Mock window.footballDB to succeed asynchronously
    global.window.footballDB = {
        saveLeague: async () => {
            footballDBCalls++;
            return new Promise(resolve => setTimeout(resolve, 10)); // mild delay
        }
    };

    console.log('--- Starting Benchmark (Optimized) ---');

    const start = performance.now();

    // Call saveGame - simulating manual save (default)
    await saveGame(largeState);

    const end = performance.now();

    console.log(`Execution time: ${(end - start).toFixed(2)}ms`);
    console.log(`Total localStorage.setItem calls: ${localStorageWrites}`);
    console.log(`Large state writes (DB_KEY_PREFIX): ${largeWrites}`);
    console.log(`IndexedDB saves: ${footballDBCalls}`);

    if (largeWrites === 0) {
        console.log('✅ OPTIMIZED: Large state write skipped.');
    } else {
        console.log('❌ FAILED: Large state write still happened.');
    }

    if (footballDBCalls === 1) {
        console.log('✅ VERIFIED: Saved to IndexedDB.');
    } else {
        console.log('❌ FAILED: Did not save to IndexedDB.');
    }

    // Reset spy
    localStorageWrites = 0;
    largeWrites = 0;
    footballDBCalls = 0;

    console.log('\n--- Testing "Unload" Scenario (Simulated) ---');
    // Once optimized, we will pass { isUnload: true } here
    await saveGame(largeState, { isUnload: true });

    console.log(`Total localStorage.setItem calls: ${localStorageWrites}`);
    console.log(`Large state writes: ${largeWrites}`);
    console.log(`IndexedDB saves: ${footballDBCalls}`);

    if (largeWrites > 0) {
         console.log('✅ CORRECT: Unload save performed synchronous write.');
    } else {
         console.log('❌ ERROR: Unload save missed synchronous write.');
    }
}

runBenchmark().catch(console.error);
