/**
 * workerContext.js — capability surface handed to extracted command handlers.
 *
 * The worker monolith (worker.js) still owns the runtime: self.onmessage, the
 * sequential message queue, boot/hydration, state epoch, outbound
 * serialization, and dirty-flush timing. Handlers extracted into
 * src/worker/handlers/ receive this context object instead of reaching into
 * worker.js module scope, which keeps them free of circular imports and
 * unit-testable with stub capabilities.
 *
 * This is intentionally NOT a new state model or store. Every capability is
 * an existing worker function (or the shared cache singleton) passed through
 * unchanged. Do not add new state here; add capabilities only when a migrated
 * handler already used the equivalent worker-scope function.
 */

/**
 * Capabilities every extracted handler can rely on:
 *  - cache: shared in-memory league cache (db/cache.js singleton)
 *  - post: post(type, payload, id) — outbound message; serialization,
 *    delta/epoch handling, and Transferables stay owned by worker.js
 *  - flushDirty: persist dirty cache entries (accumulator internals stay in
 *    worker.js — handlers only ask for a flush)
 *  - buildViewState: current UI view-model snapshot (for STATE_UPDATE posts)
 *  - getSafeMeta: normalized league meta accessor
 *  - getLeagueSetting: (key, fallback) league settings accessor
 *  - resolveTeamContext: resolve payload teamId → { ok, meta, teamId, team }
 *  - getOffseasonReturnSnapshot: chemistry-continuity snapshot lookup
 *  - getPendingOffersLedger / savePendingOffersLedger / syncPendingOfferLedger
 *    / buildDemandSnapshotForOffer: pending-offer ledger helpers (shared with
 *    unmigrated offseason systems, so they remain worker-owned)
 *  - resolvePendingFreeAgencyOffers: immediate FA offer resolution pipeline
 *  - buildDraftStateView: draft state view-model builder
 *  - startDraft: idempotent draft initialization (draft execution stays in
 *    worker.js)
 *  - getActiveLeagueId / openDB: DB connection liveness helpers for SAVE_NOW
 */
export const WORKER_CONTEXT_CAPABILITIES = Object.freeze([
  'cache',
  'post',
  'flushDirty',
  'buildViewState',
  'getSafeMeta',
  'getLeagueSetting',
  'resolveTeamContext',
  'getOffseasonReturnSnapshot',
  'getPendingOffersLedger',
  'savePendingOffersLedger',
  'syncPendingOfferLedger',
  'buildDemandSnapshotForOffer',
  'resolvePendingFreeAgencyOffers',
  'buildDraftStateView',
  'startDraft',
  'getActiveLeagueId',
  'openDB',
]);

/**
 * Build the frozen context object passed to registered command handlers.
 * Validates that every documented capability is present so a wiring mistake
 * fails loudly at worker boot instead of deep inside a handler.
 */
export function createWorkerContext(capabilities = {}) {
  const missing = WORKER_CONTEXT_CAPABILITIES.filter((name) => capabilities[name] == null);
  if (missing.length > 0) {
    throw new Error(`createWorkerContext: missing capabilities: ${missing.join(', ')}`);
  }
  return Object.freeze({ ...capabilities });
}
