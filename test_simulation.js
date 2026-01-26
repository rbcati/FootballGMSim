
import { Constants } from './constants.js';
import { Utils } from './utils.js';
import { makeLeague } from './league.js';
import { simulateWeek, simGameStats } from './simulation.js';
import { updateAdvancedStats, calculateWAR } from './player.js';

// --- MOCK GLOBAL WINDOW ---
const windowMock = {
    Constants: Constants,
    Utils: Utils,
    state: {
        league: null,
        year: 2025,
        season: 1,
        week: 1,
        userTeamId: 0,
        playoffs: null
    },
    setStatus: (msg) => console.log(`[STATUS] ${msg}`),
    saveState: () => console.log('[SAVE] State saved'),
    renderStandings: () => console.log('[RENDER] Standings rendered'),
    renderHub: () => console.log('[RENDER] Hub rendered'),
    updateCapSidebar: () => {},
    calculateOvr: (pos, ratings) => {
        // Simple mock OVR calculator
        return 75;
    },
    tagAbilities: (player) => {},
    generateContract: (ovr, pos) => ({ years: 3, baseAnnual: 5, signingBonus: 1, guaranteedPct: 0.5 }),
    canPlayerPlay: (p) => !p.injuryWeeks,
    getEffectiveRating: (p) => p.ovr,
    updateAllTeamRatings: (league) => {},
    processWeeklyDepthChartUpdates: (team) => {},
    generateDraftClass: (year) => console.log(`[DRAFT] Generated draft class for ${year}`),
    localStorage: {
        getItem: (key) => null,
        setItem: (key, val) => {},
        removeItem: (key) => {}
    }
};

// Assign to globalThis to mimic browser 'window'
global.window = windowMock;
global.window.window = global.window; // Self-reference

// --- TEST SETUP ---
console.log('--- Starting Simulation Test ---');

// 1. Create Teams
const teamsData = [
    { name: 'Team A', abbr: 'TMA' },
    { name: 'Team B', abbr: 'TMB' },
    { name: 'Team C', abbr: 'TMC' },
    { name: 'Team D', abbr: 'TMD' }
];

console.log('Creating League...');
const league = makeLeague(teamsData, {
    Constants,
    Utils,
    makeSchedule: (teams) => {
        // Simple round-robin schedule for 4 teams
        // Week 1: 0v1, 2v3
        // Week 2: 0v2, 1v3
        // Week 3: 0v3, 1v2
        return [
            { games: [{ home: 0, away: 1 }, { home: 2, away: 3 }] },
            { games: [{ home: 0, away: 2 }, { home: 1, away: 3 }] },
            { games: [{ home: 0, away: 3 }, { home: 1, away: 2 }] }
        ];
    }
});

if (!league) {
    console.error('Failed to create league');
    process.exit(1);
}

// Attach to state
window.state.league = league;

// 2. Simulate Week 1
console.log('\n--- Simulating Week 1 ---');
simulateWeek({ render: true });

// Verify results
const week1Results = league.resultsByWeek[0];
if (!week1Results || week1Results.length !== 2) {
    console.error('Week 1 simulation failed or produced incorrect number of games');
} else {
    console.log('Week 1 Results:', week1Results.map(g => `${g.awayTeamName} ${g.scoreAway} @ ${g.homeTeamName} ${g.scoreHome}`).join(', '));
}

// Verify Stats Accumulation
const team0 = league.teams[0];
console.log(`\nTeam 0 Record: ${team0.wins}-${team0.losses}-${team0.ties}`);
if (team0.stats.season.gamesPlayed !== 1) {
    console.error('Team 0 stats not updated correctly');
}

// 3. Simulate Week 2
console.log('\n--- Simulating Week 2 ---');
simulateWeek({ render: true });

// 4. Simulate Week 3
console.log('\n--- Simulating Week 3 ---');
simulateWeek({ render: true });

console.log('\n--- Final Standings ---');
league.teams.forEach(t => {
    console.log(`${t.name}: ${t.wins}-${t.losses}`);
});

console.log('\n--- Test Complete ---');
