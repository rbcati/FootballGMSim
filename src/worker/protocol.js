/**
 * protocol.js
 *
 * Single source of truth for all message types exchanged between
 * the UI thread and the game worker.
 *
 * Usage pattern:
 *   import { toWorker, toUI } from '../worker/protocol.js';
 *   worker.postMessage({ type: toWorker.ADVANCE_WEEK, payload: { ... } });
 *
 * Every message carries:
 *   { type: string, payload: any, id?: string }
 *
 * `id` is a correlation token so the UI can match responses to requests.
 * The worker always echoes back the same `id` it received.
 */

// ─────────────────────────────────────────────
// Messages that the UI sends TO the worker
// ─────────────────────────────────────────────
export const toWorker = Object.freeze({
  /** Bootstrap: load an existing save or create a fresh league */
  INIT:               'INIT',
  NEW_LEAGUE:         'NEW_LEAGUE',

  /** Regular-season flow */
  ADVANCE_WEEK:       'ADVANCE_WEEK',      // simulate the current week
  SIM_TO_WEEK:        'SIM_TO_WEEK',       // fast-forward to a specific week
  SIM_TO_PLAYOFFS:    'SIM_TO_PLAYOFFS',   // sim all remaining reg-season weeks

  /** Playoffs */
  ADVANCE_PLAYOFFS:   'ADVANCE_PLAYOFFS',  // simulate the next playoff round

  /** Draft */
  GET_DRAFT_STATE:    'GET_DRAFT_STATE',   // fetch current draft state (silent)
  START_DRAFT:        'START_DRAFT',       // initialise draft (idempotent)
  MAKE_DRAFT_PICK:    'MAKE_DRAFT_PICK',   // { playerId }
  SIM_DRAFT_PICK:     'SIM_DRAFT_PICK',    // AI picks until user's turn

  /** Free agency */
  SIGN_PLAYER:        'SIGN_PLAYER',       // { playerId, teamId, contract }
  SUBMIT_OFFER:       'SUBMIT_OFFER',      // { playerId, teamId, contract }
  ADVANCE_FREE_AGENCY_DAY: 'ADVANCE_FREE_AGENCY_DAY', // {}
  RELEASE_PLAYER:     'RELEASE_PLAYER',    // { playerId, teamId }
  PROCESS_FA_WAVE:    'PROCESS_FA_WAVE',   // AI teams act in FA

  /** Trades */
  TRADE_OFFER:        'TRADE_OFFER',       // { fromTeamId, toTeamId, offering, receiving }
  RESPOND_TRADE:      'RESPOND_TRADE',     // { tradeId, accepted }

  /** Contracts */
  EXTEND_CONTRACT:    'EXTEND_CONTRACT',   // { playerId, teamId, contract }
  RESTRUCTURE_CONTRACT: 'RESTRUCTURE_CONTRACT',

  /** Offseason */
  ADVANCE_OFFSEASON:  'ADVANCE_OFFSEASON', // move through offseason phases
  START_NEW_SEASON:   'START_NEW_SEASON',  // finalize offseason → week 1

  /** Historical data (lazy-loaded on demand) */
  GET_SEASON_HISTORY: 'GET_SEASON_HISTORY',   // { seasonId }
  GET_PLAYER_CAREER:  'GET_PLAYER_CAREER',    // { playerId }
  GET_ALL_SEASONS:    'GET_ALL_SEASONS',      // summary list for history browser
  GET_GAME_LOG:       'GET_GAME_LOG',         // { seasonId, teamId? }

  /** Save management */
  GET_ALL_SAVES:      'GET_ALL_SAVES',        // list all available leagues
  LOAD_SAVE:          'LOAD_SAVE',            // { leagueId }
  DELETE_SAVE:        'DELETE_SAVE',          // { leagueId }
  SAVE_NOW:           'SAVE_NOW',             // force immediate DB flush
  RESET_LEAGUE:       'RESET_LEAGUE',         // wipe everything

  /** Settings */
  SET_USER_TEAM:      'SET_USER_TEAM',        // { teamId }
  UPDATE_SETTINGS:    'UPDATE_SETTINGS',      // { settings }

  /** Roster / Free Agency */
  GET_ROSTER:         'GET_ROSTER',           // { teamId }
  GET_FREE_AGENTS:    'GET_FREE_AGENTS',      // {}

  /** Coaching */
  HIRE_COACH:         'HIRE_COACH',           // { teamId, coachId, role }
  FIRE_COACH:         'FIRE_COACH',           // { teamId, role }
  GET_AVAILABLE_COACHES: 'GET_AVAILABLE_COACHES', // {}

  /** Box score retrieval */
  GET_BOX_SCORE:      'GET_BOX_SCORE',        // { gameId }

  /** Franchise / analytics data */
  GET_TEAM_PROFILE:   'GET_TEAM_PROFILE',     // { teamId }
  GET_LEAGUE_LEADERS: 'GET_LEAGUE_LEADERS',   // { mode: 'season'|'alltime' }

  /** Mid-season award races & All-Pro projections */
  GET_AWARD_RACES:    'GET_AWARD_RACES',      // {}
});

// ─────────────────────────────────────────────
// Messages the worker sends TO the UI
// ─────────────────────────────────────────────
export const toUI = Object.freeze({
  /** Sent after any mutation – contains only the slice of state that changed */
  STATE_UPDATE:       'STATE_UPDATE',

  /**
   * Full snapshot of the "view state" the UI needs to render.
   * Sent once after INIT/NEW_LEAGUE and after phase transitions.
   */
  FULL_STATE:         'FULL_STATE',

  /** Simulation progress (for multi-game batch operations) */
  SIM_PROGRESS:       'SIM_PROGRESS',         // { done, total, currentGame }

  /** A single game result (live ticker feed) */
  GAME_EVENT:         'GAME_EVENT',           // { gameId, event }

  /** Simulation of a week is fully done */
  WEEK_COMPLETE:      'WEEK_COMPLETE',        // { week, results, standings }

  /** Playoffs round done */
  PLAYOFFS_ROUND_COMPLETE: 'PLAYOFFS_ROUND_COMPLETE',

  /** Offseason phase advanced */
  OFFSEASON_PHASE:    'OFFSEASON_PHASE',      // { phase }

  /** Draft state */
  DRAFT_STATE:        'DRAFT_STATE',          // { picks, currentPick, available }
  DRAFT_PICK_MADE:    'DRAFT_PICK_MADE',      // { pick }

  /** Async data responses (lazy history) */
  SEASON_HISTORY:     'SEASON_HISTORY',       // { seasonId, data }
  PLAYER_CAREER:      'PLAYER_CAREER',        // { playerId, data }
  ALL_SEASONS:        'ALL_SEASONS',          // { seasons[] }
  GAME_LOG:           'GAME_LOG',             // { games[] }
  ALL_SAVES:          'ALL_SAVES',            // { saves[] }

  /** Trade response from AI */
  TRADE_RESPONSE:     'TRADE_RESPONSE',       // { accepted, offerValue, receiveValue, reason }

  /** Roster / FA data responses */
  ROSTER_DATA:        'ROSTER_DATA',          // { teamId, team, players[] }
  FREE_AGENT_DATA:    'FREE_AGENT_DATA',      // { freeAgents[] }

  /** Coaching Data */
  AVAILABLE_COACHES:  'AVAILABLE_COACHES',    // { coaches[] }

  /** Box score response */
  BOX_SCORE:          'BOX_SCORE',            // { gameId, game }

  /** Franchise / analytics responses */
  TEAM_PROFILE:       'TEAM_PROFILE',         // { team, franchise, currentPlayers }
  LEAGUE_LEADERS:     'LEAGUE_LEADERS',       // { mode, categories }
  AWARD_RACES:        'AWARD_RACES',          // { week, year, awards, allPro }

  /** Non-fatal notices */
  NOTIFICATION:       'NOTIFICATION',         // { level: 'info'|'warn', message }

  /** Worker is ready after startup */
  READY:              'READY',

  /** Save completed */
  SAVED:              'SAVED',

  /** Fatal worker error */
  ERROR:              'ERROR',               // { message, stack? }
});

/**
 * Lightweight helper to create a typed worker message with an auto-incremented
 * correlation id.  Import and use instead of writing raw objects.
 *
 *   send(toWorker.ADVANCE_WEEK)
 *   send(toWorker.MAKE_DRAFT_PICK, { pickIndex: 0, playerId: 'abc' })
 */
let _seq = 0;
export function send(type, payload = {}) {
  return { type, payload, id: `msg_${++_seq}` };
}
