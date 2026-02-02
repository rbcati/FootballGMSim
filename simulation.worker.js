/*
 * Simulation Worker
 * Handles heavy simulation logic in a background thread.
 */

// Import Core Simulation Logic
// Note: These modules must be refactored to be pure (no DOM/window dependencies)
// import GameRunner from './game-runner.js';
// import { validateLeagueState } from './simulation.js';

// Mock dependencies if necessary during migration
const GameRunner = {
  simulateRegularSeasonWeek: (league, options) => {
    // Placeholder for actual logic import
    console.log('Worker: Simulating week...');
    return { gamesSimulated: 0, results: [] };
  }
};

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'SIM_WEEK') {
    try {
      const { league, options } = payload;

      if (!league) {
        throw new Error('No league state provided to worker');
      }

      console.log(`[Worker] Starting simulation for Week ${league.week}`);

      // 1. Run Simulation
      // The GameRunner modifies the 'league' object in-place (mutations)
      const simResult = GameRunner.simulateRegularSeasonWeek(league, options);

      // 2. Identify Changes (Delta Calculation)
      // Since we modified 'league' in place, we extract the changed parts.
      // Optimization: In a real implementation, we might track dirty flags.
      // For now, we return the specific objects we know change during a week.

      // A. Teams that played (and thus have stat/record updates)
      // We can filter this by checking which teams were in the results.
      const teamsInvolvedIds = new Set();
      simResult.results.forEach(res => {
        teamsInvolvedIds.add(res.home); // ID
        teamsInvolvedIds.add(res.away); // ID
      });

      const updatedTeams = league.teams.filter(t => teamsInvolvedIds.has(t.id));

      // B. Schedule Updates (Game IDs that are now 'played')
      const scheduleUpdates = simResult.results.map(r => r.id); // Assuming game objects have unique IDs

      // 3. Construct Payload
      const response = {
        success: true,
        week: league.week,
        gamesSimulated: simResult.gamesSimulated,
        results: simResult.results,
        updatedTeams: updatedTeams, // The "Delta"
        scheduleUpdates: scheduleUpdates
      };

      // 4. Send back to Main Thread
      // postMessage uses Structured Clone (Deep Copy)
      self.postMessage({ type: 'SIM_COMPLETE', payload: response });

    } catch (error) {
      console.error('[Worker] Simulation failed:', error);
      self.postMessage({
        type: 'SIM_ERROR',
        payload: { message: error.message, stack: error.stack }
      });
    }
  } else {
    console.warn('[Worker] Unknown message type:', type);
  }
};
