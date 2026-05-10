/**
 * Dynasty soak runner — loads fake IndexedDB + worker in Node.
 * Must import `fake-indexeddb/auto` before this module (this file does not import it
 * so Vitest can register IDB in a setup file if needed). The CLI imports IDB first.
 */

import { toWorker, toUI } from '../worker/protocol.js';
import { runDynastySoakAudit } from '../core/dynastySoakAudit.js';

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

function mergeAudit(into, next, seasonLabel) {
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

/**
 * @param {object} opts
 * @param {number} [opts.seasons=5]
 * @param {number} [opts.seed=1383]
 * @param {number} [opts.simTimeoutMs]
 * @param {function} [opts.onBroadcast]
 */
/**
 * `SIM_TO_PHASE` may stop before `preseason` when the worker hits its per-call
 * iteration guard mid-pipeline; repeat until preseason or hard cap.
 */
async function simUntilPreseason(simTimeoutMs) {
  let lastMsg = null;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    lastMsg = await dispatchWorker(
      toWorker.SIM_TO_PHASE,
      { targetPhase: 'preseason' },
      { timeoutMs: simTimeoutMs },
    );
    if (lastMsg.type === toUI.ERROR) return lastMsg;
    const ph = String(lastMsg.payload?.phase ?? '');
    if (ph === 'preseason') return lastMsg;
  }
  return lastMsg;
}

export async function runDynastySoakOnce(opts = {}) {
  const seasons = Math.max(1, Math.min(50, Number(opts.seasons) || 5));
  const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1383;
  const simTimeoutMs = opts.simTimeoutMs ?? 3_600_000;

  globalThis.__dynastySoakBroadcast = opts.onBroadcast || null;
  /** @see persistSimSession in worker — avoids hundreds of IndexedDB flushes per batch sim */
  globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = true;

  const t0 = Date.now();
  try {
  await loadWorkerModule();

  await dispatchWorker(toWorker.INIT, {}, { timeoutMs: 120_000 });

  const bootMsg = await dispatchWorker(
    toWorker.USE_SAFE_STARTER_LEAGUE,
    {
      slotKey: 'save_slot_1',
      options: { rngSeed: seed, userTeamId: 0, name: `Dynasty Soak ${seed}` },
    },
    { timeoutMs: 180_000 },
  );
  if (bootMsg.type === toUI.ERROR) {
    throw new Error(bootMsg.payload?.message || 'USE_SAFE_STARTER_LEAGUE failed');
  }
  /** @type {any} */
  let view = bootMsg.payload;

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
  };

  for (let s = 1; s <= seasons; s += 1) {
    const yearBefore = Number(view?.year ?? 0);
    const phaseBefore = String(view?.phase ?? '');

    const simMsg = await simUntilPreseason(simTimeoutMs);
    if (simMsg.type === toUI.ERROR) {
      mergeAudit(aggregate, {
        passed: false,
        severity: 'error',
        seasonsSimmed: s,
        checks: [],
        warnings: [],
        failures: [{ code: 'sim_error', message: simMsg.payload?.message || 'SIM_TO_PHASE error' }],
        summary: aggregate.summary,
      }, `S${s}`);
      break;
    }
    view = simMsg.payload;
    const yearAfter = Number(view?.year ?? 0);
    const phaseAfter = String(view?.phase ?? '');
    if (phaseAfter !== 'preseason') {
      mergeAudit(aggregate, {
        passed: false,
        severity: 'error',
        seasonsSimmed: s,
        checks: [],
        warnings: [],
        failures: [{
          code: 'phase_not_preseason',
          message: `Expected preseason after sim; got ${phaseAfter} (was ${phaseBefore})`,
        }],
        summary: aggregate.summary,
      }, `S${s}`);
      aggregate.passed = false;
      break;
    }
    if (yearAfter <= yearBefore) {
      mergeAudit(aggregate, {
        passed: false,
        severity: 'error',
        seasonsSimmed: s,
        checks: [],
        warnings: [],
        failures: [{
          code: 'year_stuck',
          message: `Year did not advance (${yearBefore} -> ${yearAfter}); possible sim stall`,
        }],
        summary: aggregate.summary,
      }, `S${s}`);
      aggregate.passed = false;
      break;
    }

    const allSeasonsMsg = await dispatchWorker(toWorker.GET_ALL_SEASONS, {}, { timeoutMs: 120_000 });
    const txMsg = await dispatchWorker(toWorker.GET_TRANSACTIONS, { mode: 'recent', limit: 400 }, { timeoutMs: 120_000 });
    const txSeasonMsg = await dispatchWorker(
      toWorker.GET_TRANSACTIONS,
      { seasonId: view?.seasonId, limit: 200 },
      { timeoutMs: 120_000 },
    );
    const recordsMsg = await dispatchWorker(toWorker.GET_RECORDS, {}, { timeoutMs: 120_000 });
    const hofMsg = await dispatchWorker(toWorker.GET_HALL_OF_FAME, {}, { timeoutMs: 120_000 });
    const draftClassesMsg = await dispatchWorker(toWorker.GET_DRAFT_CLASSES, {}, { timeoutMs: 120_000 });

    const leagueHistory = view?.leagueHistory ?? [];
    const latestSeason = leagueHistory.length ? leagueHistory[leagueHistory.length - 1] : null;
    let seasonHistory = null;
    if (latestSeason?.id) {
      const histMsg = await dispatchWorker(toWorker.GET_SEASON_HISTORY, { seasonId: latestSeason.id }, { timeoutMs: 120_000 });
      if (histMsg.type !== toUI.ERROR) {
        seasonHistory = histMsg.payload?.data ?? null;
      }
    }

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

    /* cross-check second transaction query did not throw */
    if (txSeasonMsg.type === toUI.ERROR) {
      audit.failures.push({ code: 'get_transactions_season', message: txSeasonMsg.payload?.message || 'GET_TRANSACTIONS by season failed' });
      audit.passed = false;
    }

    mergeAudit(aggregate, audit, `S${s}`);

    await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 120_000 });
  }

  aggregate.severity = aggregate.failures.length ? 'error' : aggregate.warnings.length ? 'warn' : 'ok';
  aggregate.runtimeMs = Date.now() - t0;
  aggregate.seed = seed;
  aggregate.finalView = view;
  return aggregate;
  } finally {
    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = false;
  }
}
