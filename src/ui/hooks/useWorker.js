/**
 * useWorker.js
 *
 * React hook that owns the game Web Worker singleton for the lifetime of the app.
 *
 * Responsibilities:
 *  - Spawn the worker once on mount, terminate on unmount
 *  - Route every inbound worker message to the correct state setter
 *  - Expose a stable `send(type, payload)` function for the UI to use
 *  - Expose a `request(type, payload)` function that returns a Promise
 *    resolved when the worker echoes back the matching correlation id
 *  - Track a loading/simulating flag
 *  - Expose the latest view-state snapshot and last week's results
 *
 * The hook does NOT store the full league object.  It only stores the
 * view-model slices the worker sends back (buildViewState shape).
 */

import { useEffect, useRef, useCallback, useReducer } from 'react';
import { toWorker, toUI, send as buildMsg } from '../../worker/protocol.js';

// ── State shape ───────────────────────────────────────────────────────────────

const INITIAL_STATE = {
  /** true while the worker is handling a command */
  busy:         false,
  /** true while multi-game sim is in progress */
  simulating:   false,
  /** progress 0-100 during simulation */
  simProgress:  0,
  /** worker announced it loaded + ready */
  workerReady:  false,
  /** true if a save exists (worker confirmed on INIT) */
  hasSave:      false,
  /** the view-model slice from the worker */
  league:       null,   // { seasonId, year, week, phase, userTeamId, teams[] }
  /** results from the last simulated week */
  lastResults:  null,
  /**
   * Live game events received during the current simulation.
   * Each entry: { gameId, week, homeId, awayId, homeName, awayName,
   *               homeAbbr, awayAbbr, homeScore, awayScore }
   * Cleared when a new simulation starts.
   */
  gameEvents:   [],
  /** last error message */
  error:        null,
  /** notification queue */
  notifications:[],
};

function reducer(state, action) {
  switch (action.type) {
    case 'BUSY':
      return { ...state, busy: true, error: null };
    // CLEAR_BUSY is used by silent (read-only) requests so they don't
    // accidentally zero out simulating/simProgress mid-simulation.
    case 'CLEAR_BUSY':
      return { ...state, busy: false };
    case 'IDLE':
      return { ...state, busy: false, simulating: false, simProgress: 0 };
    case 'WORKER_READY':
      return { ...state, workerReady: true, hasSave: action.hasSave ?? false, busy: false };
    case 'FULL_STATE':
      return { ...state, busy: false, simulating: false, league: action.payload };
    case 'STATE_UPDATE':
      // Also clear busy: send()-based actions (signPlayer, releasePlayer, setUserTeam)
      // respond with STATE_UPDATE and have no other mechanism to clear the flag.
      return { ...state, busy: false, league: { ...(state.league ?? {}), ...action.payload } };
    case 'SIM_START':
      return { ...state, simulating: true, simProgress: 0, gameEvents: [] };
    case 'SIM_PROGRESS':
      return {
        ...state,
        simProgress: action.total > 0
          ? Math.round((action.done / action.total) * 100)
          : 0,
      };
    case 'WEEK_COMPLETE':
      return {
        ...state,
        simulating:  false,
        busy:        false,
        simProgress: 100,
        lastResults: action.results,
        league:      {
          ...(state.league ?? {}),
          week:  action.nextWeek,
          phase: action.phase,
          teams: action.standings ?? state.league?.teams,
        },
      };
    case 'GAME_EVENT':
      return { ...state, gameEvents: [...state.gameEvents, action.event] };
    case 'ERROR':
      return { ...state, busy: false, simulating: false, error: action.message };
    case 'NOTIFY':
      return {
        ...state,
        notifications: [
          ...state.notifications.slice(-9),   // keep last 10
          { id: Date.now(), level: action.level, message: action.message },
        ],
      };
    case 'DISMISS_NOTIFY':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.id),
      };
    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useWorker() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  /** Ref to the worker instance so it can be used inside callbacks without re-renders. */
  const workerRef = useRef(null);

  /**
   * Pending promise resolvers keyed by message correlation id.
   * Map<id, { resolve, reject }>
   */
  const pendingRef = useRef(new Map());

  // ── Spawn worker once ──────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL('../../worker/worker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, payload = {}, id } = event.data;

      // Resolve any waiting promise first.
      // Silent requests (getRoster, getFreeAgents, history lookups) never set
      // busy=true, so they must NOT dispatch IDLE which would zero out
      // simulating/simProgress mid-simulation.  Non-silent action requests
      // (submitTrade) do set busy=true and clear it via IDLE.
      if (id && pendingRef.current.has(id)) {
        const { resolve, silent } = pendingRef.current.get(id);
        pendingRef.current.delete(id);
        resolve({ type, payload });
        dispatch({ type: silent ? 'CLEAR_BUSY' : 'IDLE' });
      }

      // Then update React state
      switch (type) {
        case toUI.READY:
          dispatch({ type: 'WORKER_READY', hasSave: payload.hasSave });
          break;
        case toUI.FULL_STATE:
          dispatch({ type: 'FULL_STATE', payload });
          break;
        case toUI.STATE_UPDATE:
          dispatch({ type: 'STATE_UPDATE', payload });
          break;
        case toUI.SIM_PROGRESS:
          dispatch({ type: 'SIM_PROGRESS', done: payload.done, total: payload.total });
          break;
        case toUI.WEEK_COMPLETE:
          dispatch({
            type:       'WEEK_COMPLETE',
            results:    payload.results,
            nextWeek:   payload.nextWeek,
            phase:      payload.phase,
            standings:  payload.standings,
          });
          break;
        case toUI.SAVED:
          dispatch({ type: 'IDLE' });
          break;
        case toUI.ERROR:
          dispatch({ type: 'ERROR', message: payload.message });
          // Reject any pending promise too
          if (id && pendingRef.current.has(id)) {
            const { reject } = pendingRef.current.get(id);
            pendingRef.current.delete(id);
            reject(new Error(payload.message));
          }
          break;
        case toUI.GAME_EVENT:
          dispatch({ type: 'GAME_EVENT', event: payload });
          break;
        case toUI.NOTIFICATION:
          dispatch({ type: 'NOTIFY', level: payload.level, message: payload.message });
          break;
        default:
          // Other message types (draft, career stats, history, box score) are handled
          // exclusively via the pending promise map — no extra dispatch needed.
          break;
      }
    };

    worker.onerror = (err) => {
      console.error('[useWorker] Worker threw:', err);
      dispatch({ type: 'ERROR', message: err.message ?? 'Unknown worker error' });
    };

    // Kick off initialization
    worker.postMessage(buildMsg(toWorker.INIT));

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── send (fire-and-forget) ─────────────────────────────────────────────────
  const send = useCallback((type, payload = {}) => {
    if (!workerRef.current) return;
    dispatch({ type: 'BUSY' });
    workerRef.current.postMessage(buildMsg(type, payload));
  }, []);

  // ── request (returns a Promise resolved on worker reply) ──────────────────
  // Pass { silent: true } for read-only fetches (getRoster, getFreeAgents,
  // history queries) so they do NOT set busy=true and lock the Advance button.
  const request = useCallback((type, payload = {}, { silent = false } = {}) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not ready'));
        return;
      }
      const msg = buildMsg(type, payload);
      pendingRef.current.set(msg.id, { resolve, reject, silent });
      if (!silent) dispatch({ type: 'BUSY' });
      workerRef.current.postMessage(msg);
    });
  }, []);

  // ── Convenience action wrappers ────────────────────────────────────────────

  const actions = {
    /** Load existing save or show new-league screen. */
    init: ()                   => send(toWorker.INIT),

    /** Generate a new league. teams = array of team definitions. */
    newLeague: (teams, options) => {
      dispatch({ type: 'BUSY' });
      send(toWorker.NEW_LEAGUE, { teams, options });
    },

    /** Simulate the current week. */
    advanceWeek: () => {
      dispatch({ type: 'SIM_START' });
      send(toWorker.ADVANCE_WEEK);
    },

    /** Fast-forward to a specific week. */
    simToWeek: (targetWeek)    => send(toWorker.SIM_TO_WEEK, { targetWeek }),

    /** Sim all remaining regular-season weeks. */
    simToPlayoffs: ()          => send(toWorker.SIM_TO_PLAYOFFS),

    /** Fetch a specific season's history (returns a Promise). */
    getSeasonHistory: (seasonId) => request(toWorker.GET_SEASON_HISTORY, { seasonId }, { silent: true }),

    /** Fetch a player's career stats (returns a Promise). */
    getPlayerCareer: (playerId)  => request(toWorker.GET_PLAYER_CAREER, { playerId }, { silent: true }),

    /** Fetch all season summaries for the history browser. */
    getAllSeasons: ()             => request(toWorker.GET_ALL_SEASONS, {}, { silent: true }),

    /** Force an immediate DB flush. */
    save: ()                     => send(toWorker.SAVE_NOW),

    /** Wipe the save and restart. */
    reset: ()                    => send(toWorker.RESET_LEAGUE),

    /** Set which team the human manages. */
    setUserTeam: (teamId)        => send(toWorker.SET_USER_TEAM, { teamId }),

    /** Sign a free agent. */
    signPlayer: (playerId, teamId, contract) =>
      send(toWorker.SIGN_PLAYER, { playerId, teamId, contract }),

    /** Release a player. */
    releasePlayer: (playerId, teamId) =>
      send(toWorker.RELEASE_PLAYER, { playerId, teamId }),

    /** Fetch a team's roster (returns a Promise — does NOT set busy). */
    getRoster: (teamId) => request(toWorker.GET_ROSTER, { teamId }, { silent: true }),

    /** Fetch the free agent pool (returns a Promise — does NOT set busy). */
    getFreeAgents: () => request(toWorker.GET_FREE_AGENTS, {}, { silent: true }),

    /** Submit a trade offer to an AI team (returns a Promise). */
    submitTrade: (fromTeamId, toTeamId, offering, receiving) =>
      request(toWorker.TRADE_OFFER, { fromTeamId, toTeamId, offering, receiving }),

    /** Fetch the full box score for a completed game (returns a Promise). */
    getBoxScore: (gameId) =>
      request(toWorker.GET_BOX_SCORE, { gameId }, { silent: true }),

    /** Dismiss a notification. */
    dismissNotification: (id) =>
      dispatch({ type: 'DISMISS_NOTIFY', id }),
  };

  return { state, actions };
}
