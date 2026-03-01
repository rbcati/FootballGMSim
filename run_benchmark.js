import { simulateBatch } from './src/core/game-simulator.js';

const teams = [];
for (let i = 0; i < 32; i++) {
    const roster = [];
    for (let j = 0; j < 53; j++) {
        roster.push({
            id: i * 100 + j,
            pos: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'][j % 11],
            ovr: 70,
            ratings: { speed: 70, throwPower: 70, awareness: 70 }
        });
    }
    teams.push({
        id: i,
        abbr: `T${i}`,
        name: `Team ${i}`,
        roster: roster,
        staff: [],
        strategies: {}
    });
}

const league = {
    week: 1,
    year: 2025,
    teams: teams,
    schedule: { weeks: [{ games: [] }] },
    resultsByWeek: {}
};

const games = [];
for (let i = 0; i < 16; i++) {
    games.push({
        home: teams[i],
        away: teams[16 + i],
        week: 1
    });
    league.schedule.weeks[0].games.push({
        home: i,
        away: 16 + i
    });
}

const iterCount = 1000;
let totalTime = 0;

for (let i = 0; i < iterCount; i++) {
    const l = JSON.parse(JSON.stringify(league));
    const g = games.map(game => ({
        ...game,
        home: l.teams[game.home.id],
        away: l.teams[game.away.id]
    }));

    const start = performance.now();
    simulateBatch(g, { league: l, verbose: false });
    const end = performance.now();
    totalTime += (end - start);
}

console.log(`Time taken per batch (average over ${iterCount} runs): ${totalTime / iterCount} ms`);
console.log(`Total time: ${totalTime} ms`);
