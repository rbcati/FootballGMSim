/**
 * Dynasty soak runner — loads fake IndexedDB + worker in Node.
 * Must import `fake-indexeddb/auto` before this module (this file does not import it
 * so Vitest can register IDB in a setup file if needed). The CLI imports IDB first.
 */

import { toWorker, toUI } from '../worker/protocol.js';
import { Seasons, Transactions } from '../db/index.js';
import {
  runDynastySoakAudit,
  buildPersistenceAssertions,
} from '../core/dynastySoakAudit.js';

const RESPONSE_BY_REQUEST = {
  [toWorker.INIT]: [toUI.READY, toUI.ERROR],
  [toWorker.USE_SAFE_STARTER_LEAGUE]: [toUI.FULL_STATE, toUI.ERROR],
  [toWorker.SIM_TO_PHASE]: [toUI.FULL_STATE, toUI.ERROR],
  [toWorker.ADVANCE_WEEK]: [toUI.WEEK_COMPLETE, toUI.ERROR, toUI.FULL_STATE],
  [toWorker.GET_ALL_SEASONS]: [toUI.ALL_SEASONS, toUI.ERROR],
  [toWorker.GET_TRANSACTIONS]: [toUI.TRANSACTIONS, toUI.ERROR],
  [toWorker.GET_RECORDS]: [toUI.RECORDS, toUI.ERROR],
  [toWorker.GET_HALL_OF_FAME]: [toUI.HALL_OF_FAME, toUI.ERROR],
  [toWorker.GET_DRAFT_CLASSES]: [toUI.DRAFT_CLASSES, toUI.ERROR],
  [toWorker.GET_SEASON_HISTORY]: [toUI.SEASON_HISTORY, toUI.ERROR],
};

/** @type {Map<string, { resolve: Function, reject: Function, accept: Set<string>, timer: ReturnType<typeof setTimeout> }>} */
const waiters = new Map();

let msgSeq = 0;
function nextId() {
  msgSeq += 1;
  return `dynasty-soak-${msgSeq}`;
}

function ensureSelfBridge() {
  if (globalThis.self?.postMessage && typeof globalThis.self.onmessage === 'function') return;

  const bridge = {
    onmessage: null,
    postMessage(msg) {
      const { type, payload, id } = msg || {};
      if (id && waiters.has(id)) {
        const w = waiters.get(id);
        if (type === toUI.ERROR) {
          clearTimeout(w.timer);
          waiters.delete(id);
          w.reject(new Error(payload?.message || 'Worker ERROR'));
          return;
        }
        if (w.accept.has(type)) {
          clearTimeout(w.timer);
          waiters.delete(id);
          w.resolve({ type, payload, id });
          return;
        }
      }
      if (globalThis.__dynastySoakBroadcast) {
        globalThis.__dynastySoakBroadcast({ type, payload, id });
      }
    },
  };
  globalThis.self = bridge;
}

/**
 * @param {string} type - toWorker.*
 * @param {object} payload
 * @param {{ timeoutMs?: number }} [opts]
 */
export function dispatchWorker(type, payload = {}, opts = {}) {
  ensureSelfBridge();
  if (typeof globalThis.self.onmessage !== 'function') {
    return Promise.reject(new Error('Worker onmessage not registered; import worker/worker.js first'));
  }
  const id = nextId();
  const timeoutMs = opts.timeoutMs ?? 1_200_000;
  const acceptList = RESPONSE_BY_REQUEST[type] || [toUI.FULL_STATE, toUI.ERROR];
  const accept = new Set(acceptList);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (waiters.has(id)) {
        waiters.delete(id);
        reject(new Error(`Timeout ${timeoutMs}ms waiting for ${type} response (id=${id})`));
      }
    }, timeoutMs);
    waiters.set(id, { resolve, reject, accept, timer });
    queueMicrotask(() => {
      try {
        globalThis.self.onmessage({ data: { type, payload, id } });
      } catch (e) {
        clearTimeout(timer);
        waiters.delete(id);
        reject(e);
      }
    });
  });
}

let workerImportPromise = null;

export function loadWorkerModule() {
  if (!workerImportPromise) {
    ensureSelfBridge();
    workerImportPromise = import('../worker/worker.js');
  }
  return workerImportPromise;
}

export function mergeAudit(into, next, seasonLabel) {
  const prefix = `[${seasonLabel}]`;
  for (const f of next.failures || []) {
    into.failures.push({ ...f, message: `${prefix} ${f.message}`, code: f.code });
  }
  for (const w of next.warnings || []) {
    into.warnings.push({ ...w, message: `${prefix} ${w.message}`, code: w.code });
  }
  for (const c of next.checks || []) {
    into.checks.push({ ...c, message: `${prefix} ${c.message}` });
  }
  const ord = { ok: 0, warn: 1, fail: 2 };
  const nextSum = next.summary && typeof next.summary === 'object' ? next.summary : {};
  for (const key of Object.keys(into.summary)) {
    const a = into.summary[key];
    const b = nextSum[key] ?? 'ok';
    if (ord[b] > ord[a]) into.summary[key] = b;
  }
  into.passed = into.passed && next.passed;
  into.seasonsSimmed = Math.max(into.seasonsSimmed || 0, next.seasonsSimmed || 0);
}

function pushCheckpoint(checkpoints, name, ms, meta = null) {
  checkpoints.push({ name, ms, meta });
}

function topSlowCheckpoints(checkpoints, n = 10) {
  return [...checkpoints].sort((a, b) => b.ms - a.ms).slice(0, n);
}

/**
 * `SIM_TO_PHASE` may stop before `preseason` when the worker hits its per-call
 * iteration guard mid-pipeline; repeat until preseason or hard cap.
 * @param {number} simTimeoutMs
 * @param {{ checkpoints: object[], label: string }} ctx
 */
async function simUntilPreseason(simTimeoutMs, ctx) {
  let lastMsg = null;
  const attempts = [];
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const t = Date.now();
    lastMsg = await dispatchWorker(
      toWorker.SIM_TO_PHASE,
      { targetPhase: 'preseason' },
      { timeoutMs: simTimeoutMs },
    );
    const ms = Date.now() - t;
    const ph = String(lastMsg.payload?.phase ?? '');
    const yr = Number(lastMsg.payload?.year ?? 0);
    attempts.push({
      attempt,
      ms,
      phaseAfter: ph,
      yearAfter: yr,
      error: lastMsg.type === toUI.ERROR,
    });
    pushCheckpoint(ctx.checkpoints, `${ctx.label}.SIM_TO_PHASE`, ms, {
      attempt,
      phaseAfter: ph,
      yearAfter: yr,
    });
    if (lastMsg.type === toUI.ERROR) return { lastMsg, attempts };
    if (ph === 'preseason') return { lastMsg, attempts };
  }
  return { lastMsg, attempts };
}

function checkMaxRuntime(t0, maxRuntimeMs) {
  if (maxRuntimeMs == null || !Number.isFinite(maxRuntimeMs)) return;
  if (Date.now() - t0 > maxRuntimeMs) {
    const e = new Error(`max-runtime-ms exceeded (${maxRuntimeMs})`);
    e.code = 'max_runtime_exceeded';
    throw e;
  }
}

/**
 * @typedef {object} DynastySoakRunnerOptions
 * @property {number} [seasons=5]
 * @property {number} [seed=1383]
 * @property {boolean} [ci=false]
 * @property {boolean} [deepEachSeason=false]
 * @property {number} [simTimeoutMs]
 * @property {number} [phaseTimeoutMs] - alias override for simTimeoutMs / GET timeouts
 * @property {number|null} [maxRuntimeMs]
 * @property {function} [onBroadcast]
 */

/**
 * @param {DynastySoakRunnerOptions} opts
 */
export async function runDynastySoakOnce(opts = {}) {
  const seasons = Math.max(1, Math.min(50, Number(opts.seasons) || 5));
  const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1383;
  const ci = !!opts.ci;
  const deepEachSeason = !!opts.deepEachSeason;
  const phaseTimeoutMs = Number.isFinite(Number(opts.phaseTimeoutMs))
    ? Number(opts.phaseTimeoutMs)
    : Number.isFinite(Number(opts.simTimeoutMs))
      ? Number(opts.simTimeoutMs)
      : 3_600_000;
  const simTimeoutMs = phaseTimeoutMs;
  const maxRuntimeMs =
    opts.maxRuntimeMs === null || opts.maxRuntimeMs === undefined
      ? null
      : Number(opts.maxRuntimeMs);

  const checkpoints = [];
  const simAttemptsPerSeason = [];

  const aggregate = {
    passed: true,
    severity: 'ok',
    seasonsSimmed: 0,
    checks: [],
    warnings: [],
    failures: [],
    summary: {
      rosterHealth: 'ok',
      capHealth: 'ok',
      statHealth: 'ok',
      archiveHealth: 'ok',
      aiHealth: 'ok',
      transactionHealth: 'ok',
      draftHealth: 'ok',
      scoutingHealth: 'ok',
      developmentHealth: 'ok',
      historyHealth: 'ok',
    },
    checkpoints,
    simAttemptsPerSeason,
    timings: {
      bootMs: 0,
      topSlowCheckpoints: [],
      totalMs: 0,
    },
    harnessConfig: {
      ci,
      deepEachSeason,
      phaseTimeoutMs,
      maxRuntimeMs,
    },
    smallerLeagueNote:
      'Only 32-team safe starter leagues are supported for this harness. Smaller default leagues are deferred (playoff seeding and conference balance are coupled to 32 teams).',
    persistenceAssertions: [],
  };

  globalThis.__dynastySoakBroadcast = opts.onBroadcast || null;
  globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = true;
  globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = true;
  globalThis.__DYNASTY_SOAK_PROFILE__ = true;
  globalThis.__DYNASTY_SOAK_LAST_BATCH__ = undefined;

  const t0 = Date.now();
  /** @type {any} */
  let view = null;
  let lastReportSummary = null;

  try {
    await loadWorkerModule();

    let t = Date.now();
    await dispatchWorker(toWorker.INIT, {}, { timeoutMs: Math.min(120_000, phaseTimeoutMs) });
    pushCheckpoint(checkpoints, 'boot.INIT', Date.now() - t, null);

    checkMaxRuntime(t0, maxRuntimeMs);

    t = Date.now();
    const bootMsg = await dispatchWorker(
      toWorker.USE_SAFE_STARTER_LEAGUE,
      {
        slotKey: 'save_slot_1',
        options: { rngSeed: seed, userTeamId: 0, name: `Dynasty Soak ${seed}` },
      },
      { timeoutMs: Math.min(180_000, phaseTimeoutMs) },
    );
    pushCheckpoint(checkpoints, 'boot.USE_SAFE_STARTER_LEAGUE', Date.now() - t, null);

    if (bootMsg.type === toUI.ERROR) {
      throw new Error(bootMsg.payload?.message || 'USE_SAFE_STARTER_LEAGUE failed');
    }
    view = bootMsg.payload;

    for (let s = 1; s <= seasons; s += 1) {
      checkMaxRuntime(t0, maxRuntimeMs);
      const yearBefore = Number(view?.year ?? 0);
      const phaseBefore = String(view?.phase ?? '');
      const fullProbes = deepEachSeason || s === seasons;

      const simCtx = { checkpoints, label: `S${s}` };
      const { lastMsg: simMsg, attempts } = await simUntilPreseason(simTimeoutMs, simCtx);
      simAttemptsPerSeason.push({ season: s, attempts });

      if (simMsg.type === toUI.ERROR) {
        mergeAudit(
          aggregate,
          {
            passed: false,
            severity: 'error',
            seasonsSimmed: s,
            checks: [],
            warnings: [],
            failures: [{ code: 'sim_error', message: simMsg.payload?.message || 'SIM_TO_PHASE error' }],
            summary: aggregate.summary,
          },
          `S${s}`,
        );
        break;
      }
      view = simMsg.payload;
      const yearAfter = Number(view?.year ?? 0);
      const phaseAfter = String(view?.phase ?? '');

      if (phaseAfter !== 'preseason') {
        mergeAudit(
          aggregate,
          {
            passed: false,
            severity: 'error',
            seasonsSimmed: s,
            checks: [],
            warnings: [],
            failures: [
              {
                code: 'phase_not_preseason',
                message: `Expected preseason after sim; got ${phaseAfter} (was ${phaseBefore})`,
              },
            ],
            summary: aggregate.summary,
          },
          `S${s}`,
        );
        aggregate.passed = false;
        break;
      }
      if (yearAfter <= yearBefore) {
        mergeAudit(
          aggregate,
          {
            passed: false,
            severity: 'error',
            seasonsSimmed: s,
            checks: [],
            warnings: [],
            failures: [
              {
                code: 'year_stuck',
                message: `Year did not advance (${yearBefore} -> ${yearAfter}); possible sim stall`,
              },
            ],
            summary: aggregate.summary,
          },
          `S${s}`,
        );
        aggregate.passed = false;
        break;
      }

      let tProbe = Date.now();
      const allSeasonsMsg = await dispatchWorker(toWorker.GET_ALL_SEASONS, {}, { timeoutMs: phaseTimeoutMs });
      pushCheckpoint(checkpoints, `S${s}.GET_ALL_SEASONS`, Date.now() - tProbe, { fullProbes });

      const leagueHistory = view?.leagueHistory ?? [];
      const latestSeason = leagueHistory.length ? leagueHistory[leagueHistory.length - 1] : null;
      const latestSeasonId = latestSeason?.id ?? null;

      tProbe = Date.now();
      const txMsg = await dispatchWorker(
        toWorker.GET_TRANSACTIONS,
        { mode: 'recent', limit: 400 },
        { timeoutMs: phaseTimeoutMs },
      );
      pushCheckpoint(checkpoints, `S${s}.GET_TRANSACTIONS_recent`, Date.now() - tProbe, null);

      let txSeasonMsg;
      if (fullProbes) {
        tProbe = Date.now();
        txSeasonMsg = await dispatchWorker(
          toWorker.GET_TRANSACTIONS,
          { seasonId: latestSeasonId ?? view?.seasonId, limit: 200 },
          { timeoutMs: phaseTimeoutMs },
        );
        pushCheckpoint(checkpoints, `S${s}.GET_TRANSACTIONS_season`, Date.now() - tProbe, null);
      } else {
        txSeasonMsg = { type: toUI.TRANSACTIONS, payload: { transactions: [] } };
      }

      let recordsMsg;
      let hofMsg;
      let draftClassesMsg;
      if (fullProbes) {
        tProbe = Date.now();
        recordsMsg = await dispatchWorker(toWorker.GET_RECORDS, {}, { timeoutMs: phaseTimeoutMs });
        pushCheckpoint(checkpoints, `S${s}.GET_RECORDS`, Date.now() - tProbe, null);

        tProbe = Date.now();
        hofMsg = await dispatchWorker(toWorker.GET_HALL_OF_FAME, {}, { timeoutMs: phaseTimeoutMs });
        pushCheckpoint(checkpoints, `S${s}.GET_HALL_OF_FAME`, Date.now() - tProbe, null);

        tProbe = Date.now();
        draftClassesMsg = await dispatchWorker(toWorker.GET_DRAFT_CLASSES, {}, { timeoutMs: phaseTimeoutMs });
        pushCheckpoint(checkpoints, `S${s}.GET_DRAFT_CLASSES`, Date.now() - tProbe, null);
      } else {
        recordsMsg = { type: toUI.RECORDS, payload: null };
        hofMsg = { type: toUI.HALL_OF_FAME, payload: null };
        draftClassesMsg = { type: toUI.DRAFT_CLASSES, payload: { classes: [] } };
      }

      let seasonHistory = null;
      let getSeasonHistoryOk = null;
      let getSeasonHistorySkipped = !fullProbes;
      if (fullProbes && latestSeason?.id) {
        tProbe = Date.now();
        const histMsg = await dispatchWorker(
          toWorker.GET_SEASON_HISTORY,
          { seasonId: latestSeason.id },
          { timeoutMs: phaseTimeoutMs },
        );
        pushCheckpoint(checkpoints, `S${s}.GET_SEASON_HISTORY`, Date.now() - tProbe, null);
        if (histMsg.type !== toUI.ERROR) {
          seasonHistory = histMsg.payload?.data ?? null;
          getSeasonHistoryOk = true;
        } else {
          getSeasonHistoryOk = false;
        }
      } else {
        getSeasonHistoryOk = fullProbes ? null : true;
      }

      const txSeasonRows = txSeasonMsg.payload?.transactions ?? [];
      let dbLatestSeason = null;
      let dbAllSeasons = null;
      let dbTransactions = null;
      let dbProbeError = null;
      if (fullProbes && latestSeasonId) {
        tProbe = Date.now();
        try {
          [dbLatestSeason, dbAllSeasons, dbTransactions] = await Promise.all([
            Seasons.load(latestSeasonId),
            Seasons.loadRecent(200),
            Transactions.bySeason(latestSeasonId),
          ]);
        } catch (err) {
          dbProbeError = err;
        }
        pushCheckpoint(checkpoints, `S${s}.DB_PERSISTENCE_PROBES`, Date.now() - tProbe, {
          latestSeasonId,
          dbProbeOk: !dbProbeError,
        });
      }

      tProbe = Date.now();
      const audit = runDynastySoakAudit({
        viewState: view,
        seasonIndex: s,
        allSeasons: allSeasonsMsg.payload?.seasons ?? null,
        seasonHistory,
        transactions: txMsg.payload?.transactions ?? [],
        recordsPayload: recordsMsg.payload ?? null,
        hofPayload: hofMsg.payload ?? null,
        draftClassesPayload: draftClassesMsg.payload ?? null,
      });
      pushCheckpoint(checkpoints, `S${s}.runDynastySoakAudit`, Date.now() - tProbe, null);
      lastReportSummary = audit.reportSummary ?? null;

      if (fullProbes && txSeasonMsg.type === toUI.ERROR) {
        audit.failures.push({
          code: 'get_transactions_season',
          message: txSeasonMsg.payload?.message || 'GET_TRANSACTIONS by season failed',
        });
        audit.passed = false;
      }

      mergeAudit(aggregate, audit, `S${s}`);

      if (fullProbes) {
        const draftClassCount = Array.isArray(draftClassesMsg.payload?.classes)
          ? draftClassesMsg.payload.classes.length
          : 0;
        const expectTx = s >= 2;
        const expectStats = s >= 2;
        const persInput = {
          viewState: view,
          transactionsRecent: txMsg.payload?.transactions ?? [],
          expectTransactions: expectTx,
          expectStatRows: expectStats,
          expectTimelineRows: expectTx,
          seasonTxQueryOk: txSeasonMsg.type !== toUI.ERROR,
          transactionsSeason: txSeasonRows,
          allSeasons: allSeasonsMsg.payload?.seasons ?? null,
          latestSeasonId,
          seasonHistory,
          dbLatestSeasonFound: latestSeasonId ? !!dbLatestSeason : null,
          dbAllSeasons,
          dbTransactions: dbTransactions ?? [],
          expectedTransactionTypes: expectTx ? ['draft', 'retirement', 'signing'] : [],
          getSeasonHistoryOk: dbProbeError ? false : getSeasonHistoryOk,
          getSeasonHistorySkipped,
          recordsProbeOk:
            recordsMsg.type === toUI.ERROR
              ? false
              : !!(recordsMsg.payload?.recordBook || recordsMsg.payload?.records),
          recordsProbeSkipped: false,
          hofProbeOk:
            hofMsg.type === toUI.ERROR ? false : !hofMsg.payload || Array.isArray(hofMsg.payload?.players),
          hofProbeSkipped: false,
          draftClassesProbeOk: draftClassesMsg.type !== toUI.ERROR,
          draftClassesProbeSkipped: false,
          draftClassCount,
        };
        const pers = buildPersistenceAssertions(persInput);
        aggregate.persistenceAssertions = pers.assertions;
        if (!pers.allOk) {
          aggregate.passed = false;
          mergeAudit(
            aggregate,
            {
              passed: false,
              severity: 'error',
              seasonsSimmed: s,
              checks: [],
              warnings: [],
              failures: [
                {
                  code: 'persistence_probe_failed',
                  message: 'One or more persistence probes failed; see persistenceAssertions in latest.json',
                },
              ],
              summary: aggregate.summary,
            },
            `S${s}`,
          );
        }
      }

      tProbe = Date.now();
      await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: phaseTimeoutMs });
      pushCheckpoint(checkpoints, `S${s}.ADVANCE_WEEK`, Date.now() - tProbe, null);
    }

    aggregate.severity = aggregate.failures.length ? 'error' : aggregate.warnings.length ? 'warn' : 'ok';
    aggregate.runtimeMs = Date.now() - t0;
    aggregate.seed = seed;
    aggregate.finalPhase = view?.phase ?? null;
    aggregate.finalYear = view?.year ?? null;
    aggregate.reportSummary = lastReportSummary;
    aggregate.timings.bootMs = checkpoints.filter((c) => c.name.startsWith('boot.')).reduce((a, c) => a + c.ms, 0);
    aggregate.timings.topSlowCheckpoints = topSlowCheckpoints(checkpoints);
    aggregate.timings.totalMs = aggregate.runtimeMs;
    aggregate.dynastySoakSimBatch = view?.dynastySoakSimBatch ?? null;

    return aggregate;
  } catch (e) {
    aggregate.passed = false;
    aggregate.severity = 'error';
    aggregate.failures.push({ code: e?.code || 'runner_fatal', message: e?.message || String(e) });
    aggregate.runtimeMs = Date.now() - t0;
    aggregate.seed = seed;
    aggregate.finalPhase = view?.phase ?? null;
    aggregate.finalYear = view?.year ?? null;
    aggregate.reportSummary = lastReportSummary;
    aggregate.timings.bootMs = checkpoints.filter((c) => c.name.startsWith('boot.')).reduce((a, c) => a + c.ms, 0);
    aggregate.timings.topSlowCheckpoints = topSlowCheckpoints(checkpoints);
    aggregate.timings.totalMs = aggregate.runtimeMs;
    return aggregate;
  } finally {
    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = false;
    globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = false;
    globalThis.__DYNASTY_SOAK_PROFILE__ = false;
    globalThis.__DYNASTY_SOAK_LAST_BATCH__ = undefined;
  }
}
