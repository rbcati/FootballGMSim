import { cache } from './src/db/cache.js';
import { Constants } from './src/core/constants.js';
import AiLogic from './src/core/ai-logic.js';

// Setup mock data for the benchmark
const setupMocks = () => {
    cache.setMeta({ userTeamId: 1, currentSeasonId: 1, currentWeek: 0 });

    const allTeams = [];
    for (let i = 1; i <= 32; i++) {
        allTeams.push({ id: i, deadCap: 0, deadMoneyNextYear: 0, capTotal: 255000000 });
    }

    cache._teams = allTeams;

    // Give each team 90 players (limit is 53)
    const allPlayers = [];
    let playerId = 1;
    for (const team of allTeams) {
        for (let j = 0; j < 90; j++) {
            const pos = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P'][j % 11];
            allPlayers.push({
                id: playerId++,
                teamId: team.id,
                pos,
                ovr: 60 + (j % 20),
                potential: 65,
                age: 24,
                contract: { signingBonus: 1000000, yearsTotal: 4, years: 3 }
            });
        }
    }
    cache._players = allPlayers;
};

// Mock Transactions with a delay to simulate async DB latency
import { Transactions } from './src/db/index.js';
Transactions.add = async (tx) => {
    return new Promise(resolve => setTimeout(resolve, 2)); // 2ms simulated latency per write
};
Transactions.addMany = async (txs) => {
    return new Promise(resolve => setTimeout(resolve, 5)); // 5ms simulated latency for bulk write
};

AiLogic.updateTeamCap = () => { return { ok: true, capRoom: 10000000, capUsed: 245000000 }; };

const runBenchmark = async () => {
    console.log("Setting up mock state...");
    setupMocks();

    console.log("Running executeAICutdowns...");
    const start = performance.now();
    await AiLogic.executeAICutdowns();
    const end = performance.now();

    console.log(`Execution Time: ${(end - start).toFixed(2)} ms`);
};

runBenchmark();
