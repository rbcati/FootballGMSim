/*
 * Worker Entry Point
 * Handles game simulation and league generation in a background thread.
 */

import GameRunner from '../core/game-runner.js';
import { makeLeague } from '../core/league.js';

self.onmessage = async (e) => {
  const { type, payload, id } = e.data;

  try {
    let result;
    switch (type) {
      case 'SIM_WEEK':
        result = await handleSimWeek(payload);
        break;
      case 'GENERATE_LEAGUE':
        result = await handleGenerateLeague(payload);
        break;
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
    self.postMessage({ type: `${type}_SUCCESS`, payload: result, id });
  } catch (error) {
    console.error(`[Worker] Error processing ${type}:`, error);
    self.postMessage({ type: `${type}_ERROR`, payload: { message: error.message, stack: error.stack }, id });
  }
};

/**
 * Handles simulating a week.
 * @param {Object} payload - { league, options }
 */
async function handleSimWeek({ league, options }) {
  if (!league) throw new Error("No league provided");

  console.log(`[Worker] Simulating Week ${league.week}...`);
  const result = GameRunner.simulateRegularSeasonWeek(league, options);

  // Return the result (games, stats) and the updated league state if needed
  // In a full DB implementation, we would save to DB here and return just the IDs or status.
  // For now, we return the simulation result which includes game results.
  // We also return the modified league object to keep state in sync for this demo.
  return {
    results: result.results,
    gamesSimulated: result.gamesSimulated,
    week: result.week,
    // Return updated parts of league (e.g. teams with new stats)
    // For simplicity in this demo, we return the whole league, but this is heavy.
    // Ideally: save to DB, return nothing.
    league: league
  };
}

/**
 * Handles generating a new league.
 * @param {Object} payload - { teams, options }
 */
async function handleGenerateLeague({ teams, options }) {
  console.log('[Worker] Generating new league...');
  const league = makeLeague(teams, options);
  return league;
}
