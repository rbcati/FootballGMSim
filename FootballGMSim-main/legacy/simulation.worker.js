/*
 * Simulation Worker
 * Handles heavy simulation logic in a background thread.
 */

import GameRunner from './game-runner.js';

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

      // A. Teams that played (and thus have stat/record/rivalry updates)
      const teamsInvolvedIds = new Set();
      if (simResult.results) {
          simResult.results.forEach(res => {
            if (res.home !== undefined && res.home !== null) teamsInvolvedIds.add(res.home);
            if (res.away !== undefined && res.away !== null) teamsInvolvedIds.add(res.away);
          });
      }

      // Filter updated teams from the mutated league object
      const updatedTeams = league.teams.filter(t => teamsInvolvedIds.has(t.id));

      // B. Schedule Updates (Game IDs that are now 'played')
      // Note: We might want to just return the results and let main thread mark them,
      // but simResult.results contains the finalized game objects.
      // We'll return the results array which serves as the schedule update manifest.

      // 3. Construct Payload
      const response = {
        success: true,
        week: simResult.week,
        gamesSimulated: simResult.gamesSimulated,
        results: simResult.results,
        updatedTeams: updatedTeams, // The "Delta"
        // Also pass back weekly game plan if it was modified (GameRunner resets it)
        weeklyGamePlan: league.weeklyGamePlan,
        // Pass back strategy history if modified
        strategyHistory: league.strategyHistory
      };

      // 4. Send back to Main Thread
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
