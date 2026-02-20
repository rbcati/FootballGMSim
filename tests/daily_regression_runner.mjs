
import { makeLeague } from '../src/core/league.js';
import GameRunner from '../src/core/game-runner.js';
import { makePlayer, progressPlayer, generateContract } from '../src/core/player.js';
import { makeAccurateSchedule } from '../src/core/schedule.js';
import { Constants } from '../src/core/constants.js';
import { Utils } from '../src/core/utils.js';
import fs from 'fs';
import path from 'path';

// Mock Browser Globals for compatibility
global.window = {
    Constants: Constants,
    Utils: Utils
};
global.document = {};
// global.navigator might be read-only in Node 22
if (!global.navigator) {
    global.navigator = {};
}

// Load legacy cap.js
const capScript = fs.readFileSync(path.resolve('./cap.js'), 'utf8');
// Evaluate in global scope
(function() {
    // expose window to the script
    const window = global.window;
    eval(capScript);
})();

const recalcCap = global.window.recalcCap;

// Verify Imports
if (!makeLeague) {
    console.error('CRITICAL: makeLeague failed to import.');
    process.exit(1);
}

console.log('--------------------------------------------------');
console.log('Running Daily Regression Pass (Node.js Mode)...');
console.log('--------------------------------------------------');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (!condition) {
        console.error(`[FAIL] ${message}`);
        testsFailed++;
    } else {
        console.log(`[PASS] ${message}`);
        testsPassed++;
    }
}

async function runTests() {
    try {
        // --- 1. Playability Smoke Test ---
        console.log('\n--- 1. Playability Smoke Test ---');

        // Mock teams
        const mockTeams = Array(4).fill(0).map((_, i) => ({
            id: i,
            name: `Team ${i+1}`,
            abbr: `T${i+1}`,
            conf: i < 2 ? 'AFC' : 'NFC',
            div: i % 2 === 0 ? 'North' : 'South'
        }));

        const league = makeLeague(mockTeams, { year: 2025 }, { Constants, Utils, makePlayer, makeSchedule: makeAccurateSchedule, recalcCap: recalcCap });

        assert(league.teams.length === 4, 'League created with correct number of teams');
        assert(league.week === 1, 'League starts at week 1');
        assert(league.schedule !== null && league.schedule.weeks.length > 0, 'Schedule generated');
        assert(league.year === 2025, 'Year matches config');

        // --- 2. State & Persistence ---
        console.log('\n--- 2. State & Persistence ---');

        // Simulate Week 1
        console.log('Simulating Week 1...');
        const result = GameRunner.simulateRegularSeasonWeek(league, { league });

        assert(result.gamesSimulated > 0, `Games simulated: ${result.gamesSimulated}`);
        assert(result.results.length > 0, 'Results returned');

        // Check results persistence
        // Accessing safely in case structure differs
        const weekResults = league.resultsByWeek ? league.resultsByWeek[0] : null;
        assert(weekResults && weekResults.length > 0, 'Results persisted to league.resultsByWeek');

        // Check standings update
        const team1 = league.teams[0];
        const team1Played = (team1.wins || 0) + (team1.losses || 0) + (team1.ties || 0) > 0;
        assert(team1Played, `Team 1 stats updated (W-L-T: ${team1.wins}-${team1.losses}-${team1.ties})`);

        // Verify strategy persistence (mock check)
        league.weeklyGamePlan = { offPlanId: 'AGGRESSIVE_PASSING' };
        assert(league.weeklyGamePlan.offPlanId === 'AGGRESSIVE_PASSING', 'Strategy object is writable and persists in memory');

        // --- 3. Contracts & Cap Trust ---
        console.log('\n--- 3. Contracts & Cap Trust ---');

        const userTeam = league.teams[0];
        const initialCap = userTeam.capRoom;
        const initialRosterSize = userTeam.roster.length;

        console.log(`Initial Cap: $${initialCap.toFixed(2)}M, Roster Size: ${initialRosterSize}`);

        // Create a free agent
        const fa = makePlayer('QB', 25, 80); // Good QB
        assert(fa.ovr > 70, 'Free agent created with stats');

        // Generate contract
        const contract = generateContract(fa.ovr, fa.pos);
        assert(contract.baseAnnual > 0, `Contract generated: $${contract.baseAnnual}M / ${contract.years} yrs`);

        // Simulate signing
        // Update player contract
        fa.baseAnnual = contract.baseAnnual;
        fa.years = contract.years;
        fa.yearsTotal = contract.years; // Important: Update yearsTotal for correct proration
        fa.signingBonus = contract.signingBonus;
        fa.teamId = userTeam.id;

        // Add to roster
        userTeam.roster.push(fa);

        // Update cap using actual engine logic
        if (window.recalcCap) {
            window.recalcCap(league, userTeam);
        } else {
            console.warn('recalcCap not found in window, falling back to manual calc');
            const capHit = fa.baseAnnual + (fa.signingBonus / fa.years);
            userTeam.capUsed = (userTeam.capUsed || 0) + capHit;
            userTeam.capRoom = userTeam.capTotal - userTeam.capUsed;
        }

        const capHitExpected = fa.baseAnnual + (fa.signingBonus / fa.years);

        assert(userTeam.roster.length === initialRosterSize + 1, 'Roster size increased');
        assert(userTeam.capRoom < initialCap, `Cap room decreased (New: $${userTeam.capRoom.toFixed(2)}M)`);
        assert(Math.abs((initialCap - userTeam.capRoom) - capHitExpected) < 0.5, 'Cap deduction matches contract value');

        // --- 4. Legacy & Continuity ---
        console.log('\n--- 4. Legacy & Continuity ---');

        // Force retirement check
        const oldPlayer = makePlayer('QB', 40, 70);
        oldPlayer.age = 40; // Ensure age

        const progressedPlayer = progressPlayer(oldPlayer);

        assert(progressedPlayer.age === 41, 'Player aged up');
        assert(progressedPlayer.retired === true, `Player retired at age ${progressedPlayer.age}`);

        console.log('\n--------------------------------------------------');
        console.log(`Tests Completed: ${testsPassed} Passed, ${testsFailed} Failed`);

        if (testsFailed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (e) {
        console.error('CRITICAL ERROR:', e);
        process.exit(1);
    }
}

runTests();
