
import { simGameStats } from './src/game-simulator.js';
import { createPlayer } from './src/player-factory.js';
import { Utils } from './src/utils.js';

// Mock Data
const mockTeam = (id, abbr, offStr, defStr) => {
    const roster = [];
    // 1 QB, 2 RB, 5 WR, 2 TE, 5 OL, 5 DL, 5 LB, 5 DB, 1 K, 1 P
    roster.push(createPlayer('QB', 80));
    roster.push(createPlayer('RB', 80));
    roster.push(createPlayer('RB', 75));
    for(let i=0; i<5; i++) roster.push(createPlayer('WR', 80));
    for(let i=0; i<2; i++) roster.push(createPlayer('TE', 75));
    for(let i=0; i<5; i++) roster.push(createPlayer('OL', 80));
    for(let i=0; i<5; i++) roster.push(createPlayer('DL', 80));
    for(let i=0; i<5; i++) roster.push(createPlayer('LB', 80));
    for(let i=0; i<5; i++) roster.push(createPlayer('CB', 80)); // Use CB/S logic if needed, simplify to CB
    roster.push(createPlayer('K', 80));
    roster.push(createPlayer('P', 80));

    // Assign IDs
    roster.forEach((p, i) => p.id = `${abbr}_${i}`);

    return {
        id, abbr, name: abbr + " Team",
        roster,
        staff: {},
        ratings: { off: offStr, def: defStr }
    };
};

const home = mockTeam(1, 'HOM', 85, 80);
const away = mockTeam(2, 'AWY', 80, 85);

// Run Simulation
const result = simGameStats(home, away, { verbose: false });

console.log(`Score: ${result.homeScore} - ${result.awayScore}`);

// Calculate Box Score Points for Home
let homeBoxPoints = 0;
let homeTDs = 0;
let homeFGs = 0;
let homeXPs = 0;

home.roster.forEach(p => {
    if (p.stats && p.stats.game) {
        const s = p.stats.game;
        if (s.rushTD) { homeTDs += s.rushTD; homeBoxPoints += s.rushTD * 6; }
        if (s.recTD) { homeTDs += s.recTD; homeBoxPoints += s.recTD * 6; }
        if (s.fgMade) { homeFGs += s.fgMade; homeBoxPoints += s.fgMade * 3; }
        if (s.xpMade) { homeXPs += s.xpMade; homeBoxPoints += s.xpMade * 1; }
        // 2PT not tracked in player stats explicitly in the code I saw,
        // usually it's just score += 8 in simulation.
    }
});

console.log(`Home Box Points: ${homeBoxPoints} (TDs: ${homeTDs}, FGs: ${homeFGs}, XPs: ${homeXPs})`);
console.log(`Home Actual Score: ${result.homeScore}`);
console.log(`Difference: ${result.homeScore - homeBoxPoints}`);

if (result.homeScore !== homeBoxPoints) {
    console.log("FAIL: Score Inconsistency Detected");
} else {
    console.log("PASS: Scores Match");
}
