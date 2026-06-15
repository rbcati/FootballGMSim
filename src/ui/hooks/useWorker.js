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

import { useEffect, useRef, useCallback, useReducer, useMemo } from 'react';
import { __invalidateStableRouteRequestCache } from "./useStableRouteRequest.js";
import { buildLeagueCacheScopeKey } from "../utils/requestLoopGuard.js";
import {
  toWorker,
  toUI,
  buildMessage as buildMsg,
  WorkerMessages,
  withRequestId,
  handleWorkerMessage,
} from '../../worker/workerApi.js';
import { applyLeagueDelta } from '../../worker/serialization.js';

const WORKER_REQUEST_TIMEOUT_MS = 20000;
const WORKER_TIMEOUT_BY_TYPE = Object.freeze({
  [toWorker.GET_DRAFT_STATE]: 120000,
});

// ── State shape ───────────────────────────────────────────────────────────────

export const INITIAL_WORKER_STATE = {
  /** true while the worker is handling a command */
  busy:         false,
  /** true while multi-game sim is in progress */
  simulating:   false,
  /** progress 0-100 during simulation */
  simProgress:  0,
  /** batch sim state (Sim to... operations) */
  batchSim:     null,   // { currentWeek, phase, targetPhase } or null
  /** worker announced it loaded + ready */
  workerReady:  false,
  /** true if a save exists (worker confirmed on INIT) */
  hasSave:      false,
  /** true once the first FULL_STATE baseline has been committed to the active state pool */
  isHydrated:   false,
  /** the view-model slice from the worker */
  league:       null,   // { seasonId, year, week, phase, userTeamId, teams[] }
  /** results from the last simulated week */
  lastResults:  null,
  /** week number that produced lastResults */
  lastSimWeek:  null,
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
  notificationMemory: {},
  promptUserGame: false,
  userGameLogs: null,
  userGameLiveStats: null,
  userGameReasoningFlags: null,
  lastWorkerMessageType: null,
};

function isWeeklyResultsPhase(phase) {
  return phase === 'preseason' || phase === 'regular' || phase === 'playoffs';
}

/**
 * Returns false only when the incoming STATE_UPDATE carries a `_stateEpoch`
 * that is strictly lower than the last accepted epoch, indicating the packet
 * pre-dates the most recent FULL_STATE baseline (e.g. a delayed delta from a
 * previous load or advance-week cycle that arrived after a new FULL_STATE).
 *
 * Safety rules:
 *  - Missing epoch (legacy payload, no `_stateEpoch`) → always accepted.
 *  - No baseline yet (lastAcceptedEpoch === 0)          → always accepted.
 *  - Equal epoch                                        → accepted (same session).
 *  - Higher epoch                                       → accepted (defensive).
 *  - Strictly lower epoch                               → DROPPED (stale packet).
 *
 * @param {object} payload           Raw STATE_UPDATE payload from the worker
 * @param {number} lastAcceptedEpoch Epoch value from the last accepted FULL_STATE
 * @returns {boolean} true → accept, false → drop
 */
export function shouldAcceptStateUpdate(payload = {}, lastAcceptedEpoch = 0) {
  const incomingEpoch = payload?._stateEpoch ?? null;
  // Legacy payloads without epoch: always accept to preserve existing behaviour.
  if (incomingEpoch === null) return true;
  // No baseline established yet: accept everything.
  if (lastAcceptedEpoch <= 0) return true;
  // Drop only clearly stale packets (incoming epoch < last accepted).
  return incomingEpoch >= lastAcceptedEpoch;
}

export function shouldAcceptBootScopedPayload(payload = {}, activeBootRequestId = null, ignoredBootRequestIds = []) {
  const requestId = payload?.bootRequestId ?? null;
  if (!requestId) return true;
  const ignored = ignoredBootRequestIds instanceof Set
    ? ignoredBootRequestIds
    : new Set(Array.isArray(ignoredBootRequestIds) ? ignoredBootRequestIds : []);
  if (ignored.has(requestId)) return false;
  if (activeBootRequestId && requestId !== activeBootRequestId) return false;
  return true;
}

export function workerReducer(state, action) {
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
      return { ...state, workerReady: true, hasSave: action.hasSave ?? false, busy: false, lastWorkerMessageType: action.messageType ?? state.lastWorkerMessageType };
    case 'FULL_STATE':
      return { ...state, busy: false, simulating: false, batchSim: null, isHydrated: true, league: action.payload, lastWorkerMessageType: action.messageType ?? state.lastWorkerMessageType };
    case 'STATE_UPDATE':
      // Also clear busy: send()-based actions (releasePlayer, setUserTeam)
      // respond with STATE_UPDATE and have no other mechanism to clear the flag.
      return {
        ...state,
        busy: false,
        lastWorkerMessageType: action.messageType ?? state.lastWorkerMessageType,
        league: { ...(state.league ?? {}), ...action.payload },
        ...(action.payload?.phase && !isWeeklyResultsPhase(action.payload.phase)
          ? { lastResults: [], lastSimWeek: null, gameEvents: [] }
          : {}),
      };
    case 'PROMPT_USER_GAME':
      return { ...state, busy: false, simulating: false, simProgress: 0, promptUserGame: true, userGameLogs: null };
    case 'PLAY_LOGS':
      return { ...state, busy: false, simulating: false, promptUserGame: false, userGameLogs: action.logs, userGameLiveStats: action.liveStats || null, userGameReasoningFlags: action.gameReasoningFlags || [] };
    case 'CLEAR_USER_GAME':
      return { ...state, promptUserGame: false, userGameLogs: null, userGameLiveStats: null, userGameReasoningFlags: null };
    case 'CLEAR_RESULTS':
      return { ...state, lastResults: [], lastSimWeek: null, gameEvents: [] };
    case 'SIM_START':
      return { ...state, simulating: true, simProgress: 0, gameEvents: [], promptUserGame: false, userGameLogs: null, userGameReasoningFlags: null };
    case 'BATCH_SIM_START':
      return { ...state, busy: true, batchSim: { currentWeek: 0, phase: '', targetPhase: action.targetPhase, status: 'running' } };
    case 'BATCH_SIM_PROGRESS':
      return { ...state, batchSim: { ...state.batchSim, currentWeek: action.currentWeek, phase: action.phase } };
    case 'BATCH_SIM_STATUS':
      return {
        ...state,
        busy: action.status === 'running' || action.status === 'cancelling',
        batchSim: action.status === 'idle'
          ? null
          : {
              ...(state.batchSim ?? {}),
              targetPhase: action.targetPhase ?? state.batchSim?.targetPhase ?? null,
              phase: action.stage ?? state.batchSim?.phase ?? '',
              status: action.status,
            },
      };
    case 'BATCH_SIM_DONE':
      return { ...state, busy: false, batchSim: null };
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
        lastSimWeek: action.week ?? null,
        league:      {
          ...(state.league ?? {}),
          week:  action.nextWeek,
          phase: action.phase,
          teams: action.standings ?? state.league?.teams,
        },
      };
    case 'GAME_EVENT':
      return { ...state, gameEvents: [...state.gameEvents, action.event] };
    case 'DRAFT_TRADE_OFFER':
      return { ...state, draftTradeProposal: action.proposal ?? null };
    case 'ERROR':
      return { ...state, busy: false, simulating: false, error: action.message, lastWorkerMessageType: action.messageType ?? state.lastWorkerMessageType };
    case 'WORKER_MESSAGE':
      return { ...state, lastWorkerMessageType: action.messageType ?? null };
    case 'NOTIFY':
      {
        const now = Date.now();
        const message = String(action.message ?? '').trim();
        const fingerprint = message.toLowerCase();
        const prev = state.notificationMemory?.[fingerprint];
        const dedupeWindowMs = 1000 * 60 * 2;
        if (prev && (now - prev.ts) < dedupeWindowMs) {
          return state;
        }
        return {
          ...state,
          notifications: [
            ...state.notifications.slice(-9),   // keep last 10
            { id: now, level: action.level, message, retryable: action.retryable ?? false },
          ],
          notificationMemory: {
            ...(state.notificationMemory ?? {}),
            [fingerprint]: { ts: now },
          },
        };
      }
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
  const [state, dispatch] = useReducer(workerReducer, INITIAL_WORKER_STATE);
  const leagueRef = useRef(null);
  useEffect(() => {
    leagueRef.current = state.league;
  }, [state.league]);

  /** Ref to the worker instance so it can be used inside callbacks without re-renders. */
  const workerRef = useRef(null);

  /**
   * Pending promise resolvers keyed by message correlation id.
   * Map<id, { resolve, reject }>
   */
  const pendingRef = useRef(new Map());
  const depthChartSaveRef = useRef({
    timerId: null,
    latestUpdates: null,
    waiters: [],
  });
  const activeBootRequestIdRef = useRef(null);
  const ignoredBootRequestIdsRef = useRef(new Set());
  const hasFullStateBaselineRef = useRef(false);
  /**
   * Last _stateEpoch value from an accepted FULL_STATE.
   * Used by the stale-packet guard to drop STATE_UPDATE messages whose epoch
   * is lower than the most recently accepted authoritative snapshot.
   */
  const lastAcceptedEpochRef = useRef(0);

  // ── Spawn worker once ──────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL('../../worker/worker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (event) => {
      const { type, payload = {}, id } = event.data;
      // Invalidate route-detail cache on material changes
      if (type === toUI.READY || type === toUI.FULL_STATE) {
        __invalidateStableRouteRequestCache(); // Full wipe for new saves/reset
      } else if (
        type === toUI.STATE_UPDATE ||
        type === toUI.WEEK_COMPLETE ||
        type === toUI.SEASON_START ||
        type === toUI.OFFSEASON_PHASE
      ) {
        const currentScope = buildLeagueCacheScopeKey(leagueRef.current);
        __invalidateStableRouteRequestCache(currentScope);
      }


      // Resolve/reject any waiting promise first.
      // Silent requests (getRoster, getFreeAgents, history lookups) never set
      // busy=true, so they must NOT dispatch IDLE which would zero out
      // simulating/simProgress mid-simulation.
      if (id && pendingRef.current.has(id)) {
        const { resolve, reject, silent, timeoutId } = pendingRef.current.get(id);
        pendingRef.current.delete(id);
        if (timeoutId) clearTimeout(timeoutId);
        if (type === toUI.ERROR) {
          const err = new Error(payload.message || 'Worker request failed');
          err.loadResult = payload?.loadResult ?? null;
          reject(err);
        }
        else resolve({ type, payload });
        dispatch({ type: silent ? 'CLEAR_BUSY' : 'IDLE' });
      }

      dispatch({ type: 'WORKER_MESSAGE', messageType: type });

      // Result-routing for straightforward result messages is owned by workerApi.
      // Stateful messages (epoch/boot-scope guards, manifest persistence, reload)
      // fall through to the switch below.
      if (handleWorkerMessage({ type, payload, requestId: id }, dispatch)) {
        return;
      }

      // Then update React state (stateful cases only)
      switch (type) {
        case toUI.FULL_STATE:
          if (!shouldAcceptBootScopedPayload(payload, activeBootRequestIdRef.current, ignoredBootRequestIdsRef.current)) {
            break;
          }
          // Record the epoch from this authoritative snapshot.  Any subsequent
          // STATE_UPDATE with a lower epoch will be treated as stale and dropped.
          // Reset tracking on every accepted FULL_STATE (new league, load, reset).
          if (payload?._stateEpoch != null) {
            lastAcceptedEpochRef.current = payload._stateEpoch;
          }
          if (payload?.bootRequestId && activeBootRequestIdRef.current === payload.bootRequestId) {
            activeBootRequestIdRef.current = null;
          }
          hasFullStateBaselineRef.current = true;
          dispatch({ type: 'FULL_STATE', payload, messageType: type });
          break;
        case toUI.STATE_UPDATE: {
          if (!hasFullStateBaselineRef.current) {
            worker.postMessage(withRequestId(buildMsg(toWorker.REQUEST_FULL_STATE)));
            break;
          }
          // Stale-epoch guard: drop STATE_UPDATE packets whose epoch pre-dates the
          // last accepted FULL_STATE baseline.  Triggers a fresh-state request so
          // the UI recovers to a consistent snapshot without any rollback risk.
          if (!shouldAcceptStateUpdate(payload, lastAcceptedEpochRef.current)) {
            worker.postMessage(withRequestId(buildMsg(toWorker.REQUEST_FULL_STATE)));
            break;
          }
          const merged = applyLeagueDelta(leagueRef.current ?? {}, payload);
          if (merged?._requiresFullState) {
            worker.postMessage(withRequestId(buildMsg(toWorker.REQUEST_FULL_STATE)));
            break;
          }
          dispatch({ type: 'STATE_UPDATE', payload: merged, messageType: type });
          break;
        }
        case toUI.ERROR:
          if (!shouldAcceptBootScopedPayload(payload, activeBootRequestIdRef.current, ignoredBootRequestIdsRef.current)) {
            break;
          }
          dispatch({ type: 'ERROR', message: payload.message, messageType: type });
          break;
        case toUI.RELOAD_REQUIRED:
          // The IDB was blocked or version-changed — a page reload is the only
          // safe recovery.  We notify the user then reload after a short delay
          // so they can read the message.
          console.warn('[useWorker] RELOAD_REQUIRED received:', payload?.reason);
          dispatch({ type: 'NOTIFY', level: 'warn', message: 'Database conflict detected — reloading to recover…' });
          setTimeout(() => window.location.reload(), 2000);
          break;
        case WorkerMessages.SAVE_MANIFEST_UPDATE:
          // Mirror save metadata to localStorage so iOS Safari can recover the
          // save list even if IndexedDB is wiped while the app is backgrounded.
          try {
            const existing = JSON.parse(localStorage.getItem('gmsim_save_manifest') || '[]');
            const idx = existing.findIndex(s => s.id === payload.id);
            if (idx >= 0) existing[idx] = payload;
            else existing.push(payload);
            localStorage.setItem('gmsim_save_manifest', JSON.stringify(existing));
          } catch (_e) { /* non-fatal */ }
          break;
        case WorkerMessages.SAVE_MANIFEST_REMOVE:
          try {
            const existing = JSON.parse(localStorage.getItem('gmsim_save_manifest') || '[]');
            localStorage.setItem(
              'gmsim_save_manifest',
              JSON.stringify(existing.filter((s) => s?.id !== payload?.id)),
            );
          } catch (_e) { /* non-fatal */ }
          break;
        case WorkerMessages.SAVE_MANIFEST_REPLACE:
          try {
            const next = Array.isArray(payload?.saves) ? payload.saves : [];
            localStorage.setItem('gmsim_save_manifest', JSON.stringify(next));
          } catch (_e) { /* non-fatal */ }
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
    worker.postMessage(withRequestId(buildMsg(toWorker.INIT)));

    return () => {
      const depthSave = depthChartSaveRef.current;
      if (depthSave?.timerId) clearTimeout(depthSave.timerId);
      for (const pending of pendingRef.current.values()) {
        if (pending?.timeoutId) clearTimeout(pending.timeoutId);
      }
      pendingRef.current.clear();
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── send (fire-and-forget) ─────────────────────────────────────────────────
  const send = useCallback((type, payload = {}) => {
    if (!workerRef.current) return;
    dispatch({ type: 'BUSY' });
    workerRef.current.postMessage(withRequestId(buildMsg(type, payload)));
  }, []);

  // ── request (returns a Promise resolved on worker reply) ──────────────────
  // Pass { silent: true } for read-only fetches (getRoster, getFreeAgents,
  // history queries) so they do NOT set busy=true and lock the Advance button.
  const request = useCallback((type, payload = {}, { silent = false, timeoutMs } = {}) => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not ready'));
        return;
      }
      const msg = withRequestId(buildMsg(type, payload));
      const effectiveTimeout = Number(timeoutMs) || WORKER_TIMEOUT_BY_TYPE[type] || WORKER_REQUEST_TIMEOUT_MS;
      const timeoutId = setTimeout(() => {
        if (!pendingRef.current.has(msg.id)) return;
        pendingRef.current.delete(msg.id);
        reject(new Error(`Worker timeout while handling ${type}`));
        if (type === toWorker.GET_DRAFT_STATE) {
          dispatch({ type: 'NOTIFY', level: 'warn', message: 'Draft state request timed out. Retry, cancel sim, or return to league screen.' });
          dispatch({ type: 'CLEAR_BUSY' });
          return;
        }
        dispatch({ type: 'ERROR', message: `Request timed out: ${type}. Please retry.` });
      }, effectiveTimeout);
      // Message IDs must be unique. If an id collision is somehow observed, warn
      // and skip rather than clobbering an in-flight request's resolver.
      if (pendingRef.current.has(msg.id)) {
        clearTimeout(timeoutId);
        console.warn(`[useWorker] Duplicate worker message id "${msg.id}" for ${type} — skipping to avoid collision.`);
        reject(new Error(`Duplicate worker message id: ${msg.id}`));
        return;
      }
      pendingRef.current.set(msg.id, { resolve, reject, silent, timeoutId });
      if (!silent) dispatch({ type: 'BUSY' });
      workerRef.current.postMessage(msg);
    });
  }, []);

  // ── Convenience action wrappers ────────────────────────────────────────────
  // IMPORTANT: wrapped in useMemo so the returned object reference is stable
  // across re-renders.  send/request are useCallback([]) and dispatch from
  // useReducer is always stable, so this object is created exactly once for the
  // lifetime of the hook.  Any child useEffect that lists `actions` as a
  // dependency will therefore NOT re-fire on ordinary state updates.

  const actions = useMemo(() => ({
    /** Load existing save or show new-league screen. */
    init: ()                   => send(toWorker.INIT),

    /** Fetch all saved leagues (returns Promise). */
    getAllSaves: ()            => request(toWorker.GET_ALL_SAVES, {}, { silent: true }),

    /** Load a specific save. */
    loadSave: (leagueId)       => request(toWorker.LOAD_SAVE, { leagueId }, { silent: false }),

    /** Delete a save (returns Promise with updated list). */
    deleteSave: (leagueId)     => request(toWorker.DELETE_SAVE, { leagueId }, { silent: true }),

    /** Rename a save (returns Promise with updated list). */
    renameSave: (leagueId, name) => request(toWorker.RENAME_SAVE, { leagueId, name }, { silent: true }),
    duplicateSave: (leagueId, name) => request(toWorker.DUPLICATE_SAVE, { leagueId, name }, { silent: true }),

    /** Generate a new league. teams = array of team definitions. */
    newLeague: (teams, options) =>
      (activeBootRequestIdRef.current = options?.bootRequestId ?? null,
      options?.bootRequestId ? ignoredBootRequestIdsRef.current.delete(options.bootRequestId) : null,
      request(toWorker.NEW_LEAGUE, { teams, options }, { silent: false })),
    setActiveBootRequestId: (requestId = null) => {
      activeBootRequestIdRef.current = requestId;
    },
    invalidateBootRequestId: (requestId = null) => {
      if (!requestId) {
        activeBootRequestIdRef.current = null;
        return;
      }
      ignoredBootRequestIdsRef.current.add(requestId);
      if (activeBootRequestIdRef.current === requestId) {
        activeBootRequestIdRef.current = null;
      }
    },
    hydrateLeagueSnapshot: (league, { bootRequestId = null } = {}) => {
      dispatch({ type: 'FULL_STATE', payload: { ...league, bootRequestId } });
    },
    useSafeStarterLeague: (slotKey, options = {}) => {
      if (options?.bootRequestId) {
        activeBootRequestIdRef.current = options.bootRequestId;
        ignoredBootRequestIdsRef.current.delete(options.bootRequestId);
      }
      return request(toWorker.USE_SAFE_STARTER_LEAGUE, { slotKey, options }, { silent: false });
    },

    /** Watch the user game (returns a Promise resolving to logs). */
    watchGame: (userTendency = 'BALANCED') => request(toWorker.WATCH_GAME, { userTendency }, { silent: false }),

    /** Simulate user game directly */
    simulateUserGame: () => {
      dispatch({ type: 'SIM_START' });
      send(toWorker.SIMULATE_USER_GAME);
    },

    clearUserGame: () => dispatch({ type: 'CLEAR_USER_GAME' }),

    /** Simulate the current week. */
    advanceWeek: (options = {}) => {
      dispatch({ type: 'SIM_START' });
      send(WorkerMessages.ADVANCE_WEEK, options);
    },

    /** Fast-forward to a specific week. */
    simToWeek: (targetWeek)    => send(toWorker.SIM_TO_WEEK, { targetWeek }),

    /** Sim all remaining regular-season weeks. */
    simToPlayoffs: ()          => send(toWorker.SIM_TO_PLAYOFFS),

    /** Batch sim to a target phase (playoffs, offseason, preseason/regular). */
    simToPhase: (targetPhase)  => {
      dispatch({ type: 'BATCH_SIM_START', targetPhase });
      send(toWorker.SIM_TO_PHASE, { targetPhase });
    },
    cancelSimToPhase: ()       => send(toWorker.CANCEL_SIM_TO_PHASE),
    retrySimToPhase: (targetPhase) => {
      dispatch({ type: 'BATCH_SIM_START', targetPhase });
      send(toWorker.SIM_TO_PHASE, { targetPhase });
    },

    /** Fetch a specific season's history (returns a Promise). */
    getSeasonHistory: (seasonId) => request(toWorker.GET_SEASON_HISTORY, { seasonId }, { silent: true }),

    /** Fetch a player's career stats (returns a Promise). */
    getPlayerCareer: (playerId)  => request(toWorker.GET_PLAYER_CAREER, { playerId }, { silent: true }),

    /** Fetch all season summaries for the history browser. */
    getAllSeasons: ()             => request(toWorker.GET_ALL_SEASONS, {}, { silent: true }),

    /** Fetch record book data. */
    getRecords: ()               => request(toWorker.GET_RECORDS, {}, { silent: true }),

    /** Fetch Hall of Fame inductees. */
    getHallOfFame: ()            => request(toWorker.GET_HALL_OF_FAME, {}, { silent: true }),

    /** Fetch league transaction log entries (returns a Promise). */
    getTransactions: (payload = {}) =>
      request(toWorker.GET_TRANSACTIONS, payload, { silent: true }),

    getDraftClasses: () => request(toWorker.GET_DRAFT_CLASSES, {}, { silent: true }),

    getDraftClass: (payload) => request(toWorker.GET_DRAFT_CLASS, payload, { silent: true }),

    getPlayerDraftContext: (playerId) =>
      request(toWorker.GET_PLAYER_DRAFT_CONTEXT, { playerId }, { silent: true }),

    /** Force an immediate DB flush. */
    save: ()                     => send(toWorker.SAVE_NOW),
    updateFranchiseChronicle: (entries) =>
      request(toWorker.UPDATE_FRANCHISE_CHRONICLE, { entries }, { silent: true }),

    loadSlot: (slotKey)          => request(toWorker.LOAD_SLOT, { slotKey }, { silent: false }),
    saveSlot: (slotKey)          => send(toWorker.SAVE_SLOT, { slotKey }),
    exportSave: (leagueId)       => request(toWorker.EXPORT_SAVE, { leagueId }, { silent: true }),
    importSave: (data, saveName) => request(toWorker.IMPORT_SAVE, { data, saveName }),
    exportLeagueConfig: ()       => request(toWorker.EXPORT_LEAGUE_CONFIG, {}, { silent: true }),
    importLeagueConfig: (config) => request(toWorker.IMPORT_LEAGUE_CONFIG, { config }),
    exportLeagueFile: ()         => request(toWorker.EXPORT_LEAGUE_FILE, {}, { silent: true }),
    importLeagueFile: (data, saveName) => request(toWorker.IMPORT_LEAGUE_FILE, { data, saveName }),
    importCustomRoster: (roster) => request(toWorker.IMPORT_CUSTOM_ROSTER, { roster }),
    importDraftClass: (draftClass) => request(toWorker.IMPORT_DRAFT_CLASS, { draftClass }),
    deleteSlot: (slotKey)        => request(toWorker.DELETE_SLOT, { slotKey }, { silent: true }),

    /** Wipe the save and restart. */
    reset: ()                    => send(toWorker.RESET_LEAGUE),

    /** Update league rules/settings. */
    updateSettings: (settings)   => send(toWorker.UPDATE_SETTINGS, { settings }),

    /** Commissioner mode controls. */
    toggleCommissionerMode: (enabled) => send(toWorker.TOGGLE_COMMISSIONER_MODE, { enabled }),
    applyCommissionerActions: (actionsList) => send(toWorker.APPLY_COMMISSIONER_ACTIONS, { actions: actionsList }),

    /** Set which team the human manages. */
    setUserTeam: (teamId)        => send(toWorker.SET_USER_TEAM, { teamId }),

    /** Sign a free agent. */
    signPlayer: (playerId, teamId, contract) =>
      request(toWorker.SIGN_PLAYER, { playerId, teamId, contract }),

    /** Submit an offer to a free agent. */
    submitOffer: (playerId, teamId, contract) =>
      request(toWorker.SUBMIT_OFFER, { playerId, teamId, contract }),

    /** Withdraw a pending free agency offer (releases its cap reservation). */
    withdrawOffer: (playerId, teamId) =>
      request(toWorker.WITHDRAW_OFFER, { playerId, teamId }),

    /** Release a player. */
    releasePlayer: (playerId, teamId) =>
      send(toWorker.RELEASE_PLAYER, { playerId, teamId }),
    bulkReleasePlayers: (teamId, playerIds) =>
      request(toWorker.BULK_RELEASE_PLAYERS, { teamId, playerIds }),

    /** Fetch a team's roster (returns a Promise — does NOT set busy). */
    getRoster: (teamId) => request(toWorker.GET_ROSTER, { teamId }, { silent: true }),
    repairRoster: (teamId) => request(toWorker.REPAIR_ROSTER, { teamId }),
    optimizeRoster: (teamId, mode = 'optimize') => request(toWorker.OPTIMIZE_ROSTER, { teamId, mode }),

    /** Fetch the free agent pool (returns a Promise — does NOT set busy). */
    getFreeAgents: () => request(toWorker.GET_FREE_AGENTS, {}, { silent: true }),

    /** Fetch available coaches (returns a Promise — does NOT set busy). */
    getAvailableCoaches: () => request(toWorker.GET_AVAILABLE_COACHES, {}, { silent: true }),
    getStaffState: () => request(toWorker.GET_STAFF_STATE, {}, { silent: true }),
    hireStaffMember: (payload) => request(toWorker.HIRE_STAFF_MEMBER, payload, { silent: true }),
    fireStaffMember: (payload) => request(toWorker.FIRE_STAFF_MEMBER, payload, { silent: true }),
    negotiateStaffContract: (payload) => request(toWorker.NEGOTIATE_STAFF_CONTRACT, payload, { silent: true }),
    updateDraftBoard: (payload) => send(toWorker.UPDATE_DRAFT_BOARD, payload),

    /** Fetch V1 coaching state for a team (returns a Promise). */
    getCoachingState: (teamId) => request(toWorker.GET_COACHING_STATE, teamId != null ? { teamId } : {}, { silent: true }),

    /** Hire a coach (returns a Promise with COACHING_STATE payload). */
    hireCoach: (payload) => request(toWorker.HIRE_COACH, payload),

    /** Fire a coach (returns a Promise with COACHING_STATE payload). */
    fireCoach: (payload) => request(toWorker.FIRE_COACH, payload),

    /** Extend a coach's contract (returns a Promise with COACHING_STATE payload). */
    contractExtensionCoach: (payload) => request(toWorker.CONTRACT_EXTENSION_COACH, payload),

    /** Submit a trade offer to an AI team (returns a Promise). */
    submitTrade: (fromTeamId, toTeamId, offering, receiving) =>
      request(toWorker.TRADE_OFFER, { fromTeamId, toTeamId, offering, receiving }),
    acceptIncomingTrade: (offerId) =>
      request(toWorker.ACCEPT_INCOMING_TRADE, { offerId }),
    rejectIncomingTrade: (offerId) =>
      request(toWorker.REJECT_INCOMING_TRADE, { offerId }),
    counterIncomingTrade: (offerId, offering, receiving) =>
      request(toWorker.COUNTER_INCOMING_TRADE, { offerId, offering, receiving }),
    toggleTradeBlock: (playerId, teamId) =>
      request(toWorker.TOGGLE_TRADE_BLOCK, { playerId, teamId }),
    updatePlayerManagement: (playerId, teamId, updates) =>
      request(toWorker.UPDATE_PLAYER_MANAGEMENT, { playerId, teamId, updates }),
    assignMentor: (mentorId, menteeId, teamId) =>
      request(toWorker.ASSIGN_MENTOR, { mentorId, menteeId, teamId }, { silent: true }),

    /** Get contract extension demand from AI (returns Promise). */
    getExtensionAsk: (playerId) =>
      request(toWorker.GET_EXTENSION_ASK, { playerId }, { silent: true }),

    /** Extend contract (returns Promise with new state). */
    extendContract: (playerId, teamId, contract) =>
      request(toWorker.EXTEND_CONTRACT, { playerId, teamId, contract }),

    /**
     * Restructure a player's contract — converts up to 50% of base salary into
     * prorated signing bonus, reducing current-year cap hit.
     * Returns a Promise resolving to the updated STATE_UPDATE payload.
     */
    restructureContract: (playerId, teamId) =>
      request(toWorker.RESTRUCTURE_CONTRACT, { playerId, teamId }),

    /** Applies the franchise tag to a pending free agent (returns a Promise) */
    applyFranchiseTag: (playerId, teamId) =>
      request(toWorker.APPLY_FRANCHISE_TAG, { playerId, teamId }),

    /** Fetch the full box score for a completed game (returns a Promise). */
    getBoxScore: (gameId) =>
      request(toWorker.GET_BOX_SCORE, { gameId }, { silent: true }),

    /** Fetch franchise history for a team (returns a Promise). */
    getTeamProfile: (teamId) =>
      request(toWorker.GET_TEAM_PROFILE, { teamId }, { silent: true }),

    /** Fetch league leaders (returns a Promise). mode: 'season' | 'alltime' */
    getLeagueLeaders: (mode = 'season') =>
      request(toWorker.GET_LEAGUE_LEADERS, { mode }, { silent: true }),

    /** Fetch dashboard leaders (returns a Promise). */
    getDashboardLeaders: () =>
      request(toWorker.GET_DASHBOARD_LEADERS, {}, { silent: true }),

    /** Fetch all player stats (returns a Promise). */
    getAllPlayerStats: (payload) =>
      request(toWorker.GET_ALL_PLAYER_STATS, payload, { silent: true }),

    /** Fetch analytics dashboard payload (returns a Promise). */
    getAnalyticsDashboard: () =>
      request(toWorker.GET_ANALYTICS_DASHBOARD, {}, { silent: true }),

    /** Fetch mid-season award races & All-Pro projections (returns a Promise). */
    getAwardRaces: () =>
      request(toWorker.GET_AWARD_RACES, {}, { silent: true }),

    /**
     * Fetch recent league news through the worker (UI never reads IndexedDB
     * directly). Resolves to an array of news items; rejects on worker error.
     */
    getNews: (limit = 10) =>
      request(toWorker.GET_NEWS, { limit }, { silent: true }).then((res) => {
        if (res?.payload?.error) throw new Error(res.payload.error);
        return Array.isArray(res?.payload?.news) ? res.payload.news : [];
      }),

    // ── Draft & Offseason ────────────────────────────────────────────────────

    /** Fetch the current draft state without initialising (returns a Promise). */
    getDraftState: () =>
      request(toWorker.GET_DRAFT_STATE, {}, { silent: true }),

    /**
     * Initialise the draft (idempotent — if already started, returns current
     * state).  Returns a Promise resolving to { type: DRAFT_STATE, payload }.
     */
    startDraft: () =>
      request(toWorker.START_DRAFT, {}, { silent: true }),

    /** User makes their draft pick.  Returns a Promise. */
    makeDraftPick: (playerId) =>
      request(toWorker.MAKE_DRAFT_PICK, { playerId }, { silent: true }),

    /** AI auto-picks until the user's next turn (or draft ends). Returns a Promise. */
    simDraftPick: () =>
      request(toWorker.SIM_DRAFT_PICK, {}, { silent: true }),

    /** Accept an AI draft trade-up proposal. */
    acceptDraftTrade: (proposal) =>
      request(toWorker.ACCEPT_DRAFT_TRADE, { proposal }, { silent: true }),

    /** Reject an AI draft trade-up proposal. */
    rejectDraftTrade: () =>
      request(toWorker.REJECT_DRAFT_TRADE, {}, { silent: true }),

    /**
     * Run player progression and retirements.
     * Sets busy=true so the UI can show a loading indicator.
     * Returns a Promise resolving to { type: OFFSEASON_PHASE, payload }.
     */
    advanceOffseason: () =>
      request(toWorker.ADVANCE_OFFSEASON, {}),

    /** Advance to the next day of Free Agency. */
    advanceFreeAgencyDay: () =>
      send(toWorker.ADVANCE_FREE_AGENCY_DAY),

    /** Finalise offseason → generate new schedule → Week 1. */
    startNewSeason: () => send(toWorker.START_NEW_SEASON),

    /** Update depth chart order for the user's team. */
    updateDepthChart: (updates) =>
      new Promise((resolve, reject) => {
        if (!updates) {
          resolve(null);
          return;
        }
        const depthSave = depthChartSaveRef.current;
        depthSave.latestUpdates = updates;
        depthSave.waiters.push({ resolve, reject });

        if (depthSave.timerId) clearTimeout(depthSave.timerId);
        depthSave.timerId = setTimeout(() => {
          const payloadToSend = depthSave.latestUpdates;
          const waiters = depthSave.waiters.splice(0);
          depthSave.latestUpdates = null;
          depthSave.timerId = null;

          request(toWorker.UPDATE_DEPTH_CHART, { updates: payloadToSend })
            .then((result) => waiters.forEach(({ resolve: done }) => done(result)))
            .catch((err) => waiters.forEach(({ reject: fail }) => fail(err)));
        }, 120);
      }),

    /** Update team strategy / GM decisions (fire-and-forget, non-blocking). */
    updateStrategy: (payload) =>
      send(toWorker.UPDATE_STRATEGY, payload),

    /**
     * Run a training drill for the user's team.
     * @param {string} teamId
     * @param {string} intensity - 'light' | 'normal' | 'hard'
     * @param {string} drillType - 'technique' | 'conditioning' | 'team_drills' | 'film_study'
     * @param {string[]} positionGroups - e.g. ['QB','WR'] or [] for all
     * Returns a Promise resolving to updated ROSTER_DATA.
     */
    conductDrill: (teamId, intensity, drillType, positionGroups) =>
      request(toWorker.CONDUCT_DRILL, { teamId, intensity, drillType, positionGroups }),

    /**
     * Persist hired medical/physio staff to the worker so their traits reduce
     * in-game injury chances.
     * @param {string|number} teamId
     * @param {Array} medStaff - Array of physio staff objects from StaffManagement
     */
    updateMedicalStaff: (teamId, medStaff) =>
      send(toWorker.UPDATE_MEDICAL_STAFF, { teamId, medStaff }),
    updateFranchiseInvestments: (teamId, updates) =>
      send(toWorker.UPDATE_FRANCHISE_INVESTMENTS, { teamId, updates }),

    /** Dismiss a notification. */
    dismissNotification: (id) =>
      dispatch({ type: 'DISMISS_NOTIFY', id }),
  // send/request are useCallback([]) — stable for life of hook.
  // dispatch from useReducer is guaranteed stable by React.
  }), [send, request, dispatch]);

  return { state, actions };
}
