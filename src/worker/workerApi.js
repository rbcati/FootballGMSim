/**
 * workerApi.js
 *
 * The typed message contract between the main thread and the game worker, plus
 * the result-routing logic that interprets inbound worker messages.
 *
 * This module is the single import surface for the worker protocol:
 *  - `WorkerMessages` — the canonical command constants the UI sends.
 *  - `toWorker` / `toUI` — the full underlying protocol (re-exported).
 *  - `withRequestId` / `createRequestId` — correlation-token helpers. Every
 *    outbound message carries a `requestId`; the worker echoes it back so stale
 *    responses from earlier in-flight sims can never corrupt newer state.
 *  - `handleWorkerMessage(msg, setState)` — a pure function that routes an
 *    inbound message to the correct state update via the supplied `setState`
 *    (the reducer dispatch). Extracted from the `onmessage` handler so the
 *    routing table is testable in isolation.
 */

import { toWorker, toUI, send as buildMessage } from './protocol.js';

export { toWorker, toUI, buildMessage };

/**
 * Canonical command contract. These are the high-level simulation commands the
 * UI issues; the broader protocol (draft, free agency, saves, …) remains
 * available via the re-exported `toWorker` map.
 */
export const WorkerMessages = Object.freeze({
  SIM_GAME: 'SIM_GAME',
  SIM_SEASON: 'SIM_SEASON',
  SIM_PLAYOFFS: 'SIM_PLAYOFFS',
  ADVANCE_WEEK: toWorker.ADVANCE_WEEK,

  // Save-manifest mirror messages (previously inline string literals).
  SAVE_MANIFEST_UPDATE: 'SAVE_MANIFEST_UPDATE',
  SAVE_MANIFEST_REMOVE: 'SAVE_MANIFEST_REMOVE',
  SAVE_MANIFEST_REPLACE: 'SAVE_MANIFEST_REPLACE',
});

let _requestCounter = 0;

/**
 * Generate a unique correlation token for a worker request.
 */
export function createRequestId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `req_${Date.now().toString(36)}_${(++_requestCounter).toString(36)}`;
}

/**
 * Ensure a message carries a `requestId`. Reuses an existing `requestId`/`id`
 * when present (so a response can echo the same token), otherwise mints one.
 * The legacy `id` field is kept in sync for the existing correlation map.
 */
export function withRequestId(message = {}, requestId) {
  const rid = message.requestId ?? message.id ?? requestId ?? createRequestId();
  return { ...message, requestId: rid, id: message.id ?? rid };
}

/**
 * Read the correlation token from an inbound or outbound message.
 */
export function getRequestId(message = {}) {
  return message?.requestId ?? message?.id ?? null;
}

/**
 * Pure result-routing for inbound worker messages.
 *
 * Translates the "result-bearing" message types into reducer actions via
 * `setState`. Returns `true` when the message was fully handled here. Messages
 * that require stateful guards (FULL_STATE / STATE_UPDATE epoch + boot-scope
 * checks, ERROR boot-scope, save-manifest persistence, reload) are intentionally
 * left to the hook and return `false`.
 *
 * @param {{ type: string, payload?: object, requestId?: string }} msg
 * @param {(action: object) => void} setState - reducer dispatch
 * @returns {boolean} whether the message was handled
 */
export function handleWorkerMessage(msg, setState) {
  const { type, payload = {} } = msg ?? {};
  if (!type || typeof setState !== 'function') return false;

  switch (type) {
    case toUI.READY:
      setState({ type: 'WORKER_READY', hasSave: payload.hasSave, messageType: type });
      return true;

    case toUI.PROMPT_USER_GAME:
      setState({ type: 'PROMPT_USER_GAME' });
      return true;

    case toUI.PLAY_LOGS:
      setState({
        type: 'PLAY_LOGS',
        logs: payload.logs,
        liveStats: payload.liveStats,
        gameReasoningFlags: payload.gameReasoningFlags,
      });
      return true;

    case toUI.SIM_PROGRESS:
      setState({ type: 'SIM_PROGRESS', done: payload.done, total: payload.total });
      return true;

    case toUI.WEEK_COMPLETE:
      setState({
        type: 'WEEK_COMPLETE',
        week: payload.week,
        results: payload.results,
        nextWeek: payload.nextWeek,
        phase: payload.phase,
        standings: payload.standings,
      });
      return true;

    case toUI.OFFSEASON_PHASE:
      if (payload.phase) {
        setState({ type: 'STATE_UPDATE', payload: { phase: payload.phase } });
      }
      setState({ type: 'CLEAR_RESULTS' });
      if (payload.message) {
        setState({ type: 'NOTIFY', level: 'info', message: payload.message });
      }
      return true;

    case toUI.SEASON_START:
      setState({
        type: 'STATE_UPDATE',
        payload: {
          week: payload.week ?? 1,
          phase: payload.phase ?? 'preseason',
          year: payload.year,
        },
      });
      setState({ type: 'CLEAR_RESULTS' });
      return true;

    case toUI.DRAFT_TRADE_OFFER:
      setState({ type: 'DRAFT_TRADE_OFFER', proposal: payload.proposal });
      return true;

    case toUI.SAVED:
      setState({ type: 'IDLE' });
      return true;

    case toUI.SIM_BATCH_PROGRESS:
      setState({ type: 'BATCH_SIM_PROGRESS', currentWeek: payload.currentWeek, phase: payload.phase });
      return true;

    case toUI.SIM_BATCH_STATUS:
      setState({ type: 'BATCH_SIM_STATUS', status: payload.status, targetPhase: payload.targetPhase, stage: payload.stage });
      return true;

    case toUI.GAME_EVENT:
      setState({ type: 'GAME_EVENT', event: payload });
      return true;

    case toUI.NOTIFICATION:
      setState({ type: 'NOTIFY', level: payload.level, message: payload.message, retryable: payload.retryable ?? false });
      return true;

    default:
      // FULL_STATE, STATE_UPDATE, ERROR, RELOAD_REQUIRED, SAVE_MANIFEST_* and
      // any request/response-only messages are handled by the hook.
      return false;
  }
}
