/*
 * Simulation Worker
 * Handles heavy simulation logic in a background thread.
 */

// Import Core Simulation Logic
import GameRunner from './game-runner.js';
import GameSimulator from './game-simulator.js';
import newsEngine from './news-engine.js';
import { runWeeklyTraining } from './training.js';

// Polyfill minimal window/self if needed by imports (though we patched GameRunner)
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    // self.window = self; // Some libraries might check window
}

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
      // GameRunner.simulateRegularSeasonWeek modifies the 'league' object in-place.
      // We pass { render: false } to skip UI updates (which we patched out anyway, but good practice).
      const simResult = GameRunner.simulateRegularSeasonWeek(league, { render: false, ...options });

      // 2. Identify Changes (Delta Calculation)

      // A. Teams that played (and thus have stat/record updates)
      const teamsInvolvedIds = new Set();
      simResult.results.forEach(res => {
        teamsInvolvedIds.add(res.home); // ID
        teamsInvolvedIds.add(res.away); // ID
      });

      // Filter updated teams from the mutated league object
      const updatedTeams = league.teams.filter(t => teamsInvolvedIds.has(t.id));

      // B. Schedule Updates (Game IDs that are now 'played')
      const scheduleUpdates = simResult.results.map(r => r.id);

      // C. News (GameRunner runs newsEngine which appends to league.news)
      // We return the FULL news array for simplicity/safety, or just the new items if we tracked length.
      // Since news array grows, sending the whole array (usually small-ish per season) is safer than complex diffing for now.
      const news = league.news || [];

      // D. Interactive Events?
      // GameRunner might generate pendingEvent but it relies on window.state.pendingEvent.
      // In our patched GameRunner, we skipped assigning to window.state inside worker.
      // But newsEngine.generateInteractiveEvent returns the event.
      // We can try to generate it here if GameRunner didn't catch it.
      let pendingEvent = null;
      if (newsEngine && newsEngine.generateInteractiveEvent) {
          // We need to re-run this logic or capture it?
          // GameRunner logic:
          // if (event) window.state.pendingEvent = event;
          // Since we patched GameRunner to check for window.state, it skipped assignment.
          // So we should run it here and send it back.
          try {
             const event = newsEngine.generateInteractiveEvent(league);
             if (event) pendingEvent = event;
          } catch(err) {
              console.warn("Worker: Error generating interactive event", err);
          }
      }

      // 3. Construct Payload
      const response = {
        success: true,
        week: league.week, // GameRunner increments league.week
        gamesSimulated: simResult.gamesSimulated,
        results: simResult.results, // These go into resultsByWeek
        updatedTeams: updatedTeams, // The "Delta"
        scheduleUpdates: scheduleUpdates,
        news: news,
        pendingEvent: pendingEvent
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
