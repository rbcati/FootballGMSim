/**
 * Long-Save Durability Harness — production lifecycle driver.
 *
 * This is a THIN driver. Its only responsibility is to invoke the REAL
 * production worker phases in the correct order with deterministic inputs and
 * to gather combined state for invariant evaluation. It re-implements NO
 * simulation / schedule / draft / progression / free-agency / offseason rules.
 *
 * Production paths used (verified against worker.js on main):
 *   - INIT                     → worker bootstrap
 *   - USE_SAFE_STARTER_LEAGUE  → real league initializer (buildDefaultLeague +
 *                                getPlayableLeagueValidation), seeded via
 *                                Utils.setSeed(options.rngSeed). Same path the
 *                                production UI uses as its safe-boot fallback.
 *   - SIM_TO_PHASE             → real batch orchestrator; the ONLY production
 *                                path that advances the offseason (ADVANCE_WEEK
 *                                is intentionally rejected during offseason).
 *   - SAVE_NOW / LOAD_SAVE     → real persistence + hydration path.
 *
 * Serialization surface for the full player pool (including free agents, which
 * are NOT part of the rostered-only FULL_STATE view) is read back through the
 * real DB layer (src/db/index.js) after SAVE_NOW.
 */
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { Players, Teams, DraftPicks, Meta, Seasons } from '../../src/db/index.js';
import { dispatchWorker as defaultDispatch, loadWorkerModule as defaultLoad } from '../../src/testSupport/dynastySoakRunner.js';

export const DEFAULT_SEED = 1684;
export const EXPECTED_TEAM_COUNT = 32;
export const SLOT_KEY = 'save_slot_1';

/** Phase → SIM_TO_PHASE target the driver stops at, mapped to a checkpoint id. */
export const CHECKPOINTS = Object.freeze({
  AFTER_INIT: 'afterInit',
  AFTER_REGULAR_SEASON: 'afterRegularSeason', // sim stopped at 'playoffs'
  AFTER_PLAYOFFS: 'afterPlayoffs', // sim stopped at 'offseason'
  AFTER_SEASON_ROLLOVER: 'afterSeasonRollover', // sim stopped at next 'preseason'
  AFTER_RELOAD: 'afterReload',
});

function ok(msg) {
  return msg && msg.type !== toUI.ERROR && msg?.payload?.ok !== false;
}

/**
 * @typedef {object} DriverOptions
 * @property {number} [seed]
 * @property {number} [phaseTimeoutMs]
 * @property {Function} [dispatch]
 * @property {Function} [loadWorker]
 * @property {Function} [onEvent] - (event) => void progress hook
 */

export class LifecycleDriver {
  /** @param {DriverOptions} [opts] */
  constructor(opts = {}) {
    this.seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : DEFAULT_SEED;
    this.phaseTimeoutMs = Number.isFinite(Number(opts.phaseTimeoutMs)) ? Number(opts.phaseTimeoutMs) : 1_800_000;
    this.dispatch = typeof opts.dispatch === 'function' ? opts.dispatch : defaultDispatch;
    this.loadWorker = typeof opts.loadWorker === 'function' ? opts.loadWorker : defaultLoad;
    this.onEvent = typeof opts.onEvent === 'function' ? opts.onEvent : () => {};
    this.view = null;
    this.booted = false;
  }

  emit(type, data) {
    this.onEvent({ type, ...data });
  }

  /** Boot the worker and initialize the real production league (seeded). */
  async initLeague() {
    // Deterministic + headless-friendly worker flags (do NOT change worker rules).
    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = true;
    globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = true;
    globalThis.__DYNASTY_SOAK_PROFILE__ = true;
    globalThis.__DYNASTY_SOAK_AUDIT_CHECKPOINT_ENABLED__ = false;

    await this.loadWorker();
    const t = Date.now();
    await this.dispatch(toWorker.INIT, {}, { timeoutMs: Math.min(120_000, this.phaseTimeoutMs) });
    const boot = await this.dispatch(
      toWorker.USE_SAFE_STARTER_LEAGUE,
      { slotKey: SLOT_KEY, options: { rngSeed: this.seed, userTeamId: 0, name: `Durability ${this.seed}` } },
      { timeoutMs: Math.min(180_000, this.phaseTimeoutMs) },
    );
    if (!ok(boot)) throw crashError('init', boot?.payload?.message || 'USE_SAFE_STARTER_LEAGUE failed', boot);
    this.view = boot.payload;
    this.booted = true;
    this.emit('init', { ms: Date.now() - t, phase: this.view.phase, year: this.view.year });
    return this.view;
  }

  /**
   * Drive SIM_TO_PHASE until the target phase (retrying to cross the per-call
   * iteration cap). Returns the latest view. Throws a crashError on worker ERROR.
   */
  async simToPhase(targetPhase, { checkpoint, maxCalls = 15 } = {}) {
    const t = Date.now();
    let calls = 0;
    let lastBatch = null;
    for (; calls < maxCalls; calls += 1) {
      let msg;
      try {
        msg = await this.dispatch(toWorker.SIM_TO_PHASE, { targetPhase }, { timeoutMs: this.phaseTimeoutMs });
      } catch (err) {
        // A dispatch rejection (e.g. per-phase timeout) is a lifecycle-level
        // stop; wrap it so the orchestrator can classify it (timeout ->
        // performance limitation) and attribute the checkpoint.
        throw crashError(checkpoint || targetPhase, err?.message || `SIM_TO_PHASE ${targetPhase} dispatch failed`, null);
      }
      if (!ok(msg)) throw crashError(checkpoint || targetPhase, msg?.payload?.message || `SIM_TO_PHASE ${targetPhase} failed`, msg);
      this.view = msg.payload;
      lastBatch = this.view?.dynastySoakSimBatch ?? null;
      if (matchesTarget(this.view.phase, targetPhase)) break;
      if (lastBatch && lastBatch.reachedTarget) break;
    }
    this.emit('simToPhase', { targetPhase, checkpoint, ms: Date.now() - t, calls: calls + 1, phase: this.view.phase, year: this.view.year });
    return { view: this.view, calls: calls + 1, ms: Date.now() - t, batch: lastBatch };
  }

  /** Force a DB flush through the real save path. */
  async save() {
    const msg = await this.dispatch(toWorker.SAVE_NOW, {}, { timeoutMs: Math.min(120_000, this.phaseTimeoutMs) });
    if (!ok(msg)) throw crashError('save', msg?.payload?.message || 'SAVE_NOW failed', msg);
    return true;
  }

  /** Reload through the real hydration path; refreshes this.view. */
  async reload() {
    const msg = await this.dispatch(toWorker.LOAD_SAVE, { leagueId: SLOT_KEY }, { timeoutMs: Math.min(180_000, this.phaseTimeoutMs) });
    if (!ok(msg)) throw crashError('reload', msg?.payload?.message || 'LOAD_SAVE failed', msg);
    this.view = msg.payload;
    this.emit('reload', { phase: this.view.phase, year: this.view.year });
    return this.view;
  }

  /**
   * Read the full serialized pool from the DB (the real save surface). Must be
   * called after save(). Returns null-safe collections including free agents.
   */
  async readDbPool() {
    const [players, teams, meta, seasons] = await Promise.all([
      Players.loadAll(), Teams.loadAll(), Meta.load(), Seasons.loadAll(),
    ]);
    // Draft picks are indexed by owner; gather across all known team ids.
    const teamIds = (teams || []).map((t) => t.id);
    const pickLists = await Promise.all(teamIds.map((id) => DraftPicks.byOwner(id).catch(() => [])));
    const picks = pickLists.flat();
    return { players: players || [], teams: teams || [], meta: meta || null, seasons: seasons || [], picks };
  }

  /**
   * Gather GET_* probe payloads used by some invariants. Bounded + best-effort;
   * a failing probe is recorded but does not abort the run.
   */
  async gatherProbes() {
    const probes = {};
    const tryGet = async (type, payload, key, pick) => {
      try {
        const msg = await this.dispatch(type, payload, { timeoutMs: this.phaseTimeoutMs });
        probes[key] = ok(msg) ? (pick ? pick(msg.payload) : msg.payload) : null;
      } catch {
        probes[key] = null;
      }
    };
    await tryGet(toWorker.GET_ALL_SEASONS, {}, 'allSeasons', (p) => p);
    await tryGet(toWorker.GET_DRAFT_CLASSES, {}, 'draftClasses', (p) => p);
    await tryGet(toWorker.GET_RECORDS, {}, 'records', (p) => p);
    return probes;
  }

  /**
   * Build the combined invariant context for the CURRENT view at a checkpoint.
   * @param {object} opts - { season, phase, includeDb, includeProbes, saveReload }
   */
  async buildContext({ season, phase, includeDb = false, includeProbes = false, saveReload = null }) {
    let db = null;
    if (includeDb) {
      await this.save();
      db = await this.readDbPool();
    }
    const probes = includeProbes ? await this.gatherProbes() : {};
    return {
      season,
      phase,
      week: this.view?.week ?? null,
      seed: this.seed,
      expectedTeamCount: EXPECTED_TEAM_COUNT,
      view: this.view,
      db,
      probes,
      saveReload,
    };
  }
}

function matchesTarget(phase, target) {
  const p = String(phase);
  if (target === 'offseason') return p === 'offseason' || p === 'offseason_resign';
  return p === target;
}

/** Create a structured lifecycle-crash error the orchestrator can classify. */
export function crashError(checkpoint, message, msg) {
  const e = new Error(message);
  e.isLifecycleCrash = true;
  e.checkpoint = checkpoint;
  e.workerPayload = msg?.payload ?? null;
  return e;
}
