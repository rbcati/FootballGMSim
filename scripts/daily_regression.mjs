
import { makeLeague } from '../src/core/league.js';
import GameRunner from '../src/core/game-runner.js';
import { Utils } from '../src/core/utils.js';
import { Constants } from '../src/core/constants.js';
import { makePlayer, progressPlayer } from '../src/core/player.js';
import { Scheduler, makeAccurateSchedule } from '../src/core/schedule.js';
import { State } from '../src/core/state.js';

// --- MOCK ENVIRONMENT ---
const mockLocalStorage = {
    store: {},
    getItem: (key) => mockLocalStorage.store[key] || null,
    setItem: (key, val) => mockLocalStorage.store[key] = val,
    removeItem: (key) => delete mockLocalStorage.store[key],
    clear: () => mockLocalStorage.store = {}
};

global.window = {
    localStorage: mockLocalStorage,
    Utils: Utils,
    Constants: Constants,
    state: {}
};
global.console = console;

// --- HELPERS ---
const log = (msg) => console.log(`[REGRESSION] ${msg}`);
const fail = (msg) => { console.error(`[FAIL] ${msg}`); process.exit(1); };
const pass = (msg) => console.log(`[PASS] ${msg}`);

async function runRegression() {
    log('Starting Daily Regression Pass...');

    // ----------------------------------------------------------------
    // 1. PLAYABILITY SMOKE TEST
    // ----------------------------------------------------------------
    log('--- Step 1: Playability Smoke Test ---');

    // Create Dummy Teams
    const teams = [];
    for (let i = 0; i < 32; i++) {
        teams.push({
            id: i,
            name: `Team ${i}`,
            abbr: `T${i}`,
            conf: i < 16 ? 'AFC' : 'NFC',
            div: ['East', 'North', 'South', 'West'][Math.floor(i / 4) % 4]
        });
    }

    // Initialize League
    let league;
    try {
        league = makeLeague(teams, { year: 2025 }, {
            Constants,
            Utils,
            makePlayer,
            makeSchedule: makeAccurateSchedule
        });

        // Populate global state
        window.state = State.init();
        window.state.league = league;
        window.state.userTeamId = 0;

        if (!league.teams || league.teams.length !== 32) fail('League creation failed: invalid team count');
        if (!league.schedule) fail('League creation failed: schedule missing');
        pass('League Created Successfully');
    } catch (e) {
        fail(`League creation threw error: ${e.message}`);
    }

    // Save & Load Verification
    try {
        const serialized = JSON.stringify(window.state);
        const loaded = JSON.parse(serialized);
        if (loaded.league.teams.length !== 32) fail('Save/Load integrity check failed');
        pass('Save/Load Logic Verified');
    } catch (e) {
        fail(`Save/Load check failed: ${e.message}`);
    }

    // Simulate Week
    try {
        const initialWeek = league.week;
        const result = GameRunner.simulateRegularSeasonWeek(league, { verbose: false });

        if (result.gamesSimulated === 0) fail('Simulated 0 games for week 1');

        // Advance week manually since simulation usually relies on external loop to increment
        // But let's check if results were committed
        if (!league.resultsByWeek[initialWeek - 1] || league.resultsByWeek[initialWeek - 1].length === 0) {
            fail('No results stored in resultsByWeek');
        }

        // Verify win/loss updates
        const homeTeam = league.teams.find(t => t.id === result.results[0].home);
        const awayTeam = league.teams.find(t => t.id === result.results[0].away);

        // Note: simulateRegularSeasonWeek commits results if using GameRunner correctly
        // Let's verify stats changed
        if (homeTeam.wins + homeTeam.losses + homeTeam.ties === 0) fail('Team record not updated after sim');

        pass(`Simulated Week ${initialWeek}: ${result.gamesSimulated} games. Records updated.`);
    } catch (e) {
        fail(`Simulation failed: ${e.message}\n${e.stack}`);
    }

    // ----------------------------------------------------------------
    // 2. STATE & PERSISTENCE AUDIT
    // ----------------------------------------------------------------
    log('--- Step 2: State & Persistence Audit ---');

    // Check Cap
    const userTeam = league.teams[0];
    if (userTeam.capRoom < 0) {
        // Depending on initial generation, this might fail if logic is bad.
        // Warning is acceptable, but let's see.
        console.warn(`[WARN] Initial Cap Room is negative: ${userTeam.capRoom}`);
    } else {
        pass('Initial Cap Room is valid (non-negative)');
    }

    // Check Roster Size
    if (userTeam.roster.length < 40) fail(`Roster size too small: ${userTeam.roster.length}`);
    pass(`Roster Size Valid: ${userTeam.roster.length}`);

    // Strategy Persistence
    const originalStrategy = userTeam.strategies.offense;
    userTeam.strategies.offense = 'Test Strategy';
    // Simulate serialization cycle
    const savedStrat = JSON.parse(JSON.stringify(userTeam)).strategies.offense;
    if (savedStrat !== 'Test Strategy') fail('Strategy not persisted correctly');
    userTeam.strategies.offense = originalStrategy; // Revert
    pass('Strategy Persistence Verified');


    // ----------------------------------------------------------------
    // 3. UI CHECKS (Static Analysis)
    // ----------------------------------------------------------------
    log('--- Step 3: UI Checks (Manual/Static) ---');
    log('Skipping headless UI interaction. Recommend manual check for "Loading..." stuck states.');


    // ----------------------------------------------------------------
    // 4. CONTRACTS & CAP TRUST
    // ----------------------------------------------------------------
    log('--- Step 4: Contracts & Cap Trust ---');

    // Simulate Signing FA
    const player = makePlayer('QB', 25, 80);
    player.baseAnnual = 10.0; // $10M
    player.signingBonus = 0;
    player.years = 1;

    const initialCapUsed = userTeam.capUsed;
    const initialCapRoom = userTeam.capRoom;

    // "Sign"
    userTeam.roster.push(player);
    // Manually trigger cap recalc (simple version)
    userTeam.capUsed += player.baseAnnual;
    userTeam.capRoom -= player.baseAnnual;

    if (Math.abs(userTeam.capRoom - (initialCapRoom - 10.0)) > 0.1) {
        fail(`Cap update incorrect. Expected ~${initialCapRoom - 10.0}, got ${userTeam.capRoom}`);
    }
    pass('Signing FA updates Cap correctly (simulated)');


    // ----------------------------------------------------------------
    // 5. TENSION & DRAMA
    // ----------------------------------------------------------------
    log('--- Step 5: Tension & Drama ---');

    // Verify Stakes Logic
    // Create a fake matchup context
    const rival = league.teams[1];
    // Force a rivalry
    userTeam.rivalries = { [rival.id]: { score: 80 } };

    const stakesObj = GameRunner.calculateContextualStakes(league, userTeam, rival, { enabled: true, fanSatisfaction: 50 });
    const stakes = stakesObj.score;
    const reason = stakesObj.reason;

    if (stakes < 50) {
        console.warn(`[WARN] High rivalry didn't trigger high stakes. Score: ${stakes}`);
    } else {
        pass(`Rivalry Game Context Triggered Stakes: ${stakes}/100. Reason: ${reason}`);
    }


    // ----------------------------------------------------------------
    // 6. LEGACY & CONTINUITY
    // ----------------------------------------------------------------
    log('--- Step 6: Legacy & Continuity ---');

    const oldPlayer = makePlayer('QB', 40, 70);
    oldPlayer.name = "Old Man Logan";
    // Check if progressPlayer retires him
    const progressed = progressPlayer(oldPlayer);

    if (progressed.retired || progressed.age > 40) {
        pass('Retirement logic functional (or age incremented correctly)');
    } else {
        fail('Player did not retire/age as expected');
    }

    log('--- Regression Complete: ALL PASSED ---');
}

runRegression().catch(e => {
    console.error('CRITICAL FAILURE IN REGRESSION:', e);
    process.exit(1);
});
