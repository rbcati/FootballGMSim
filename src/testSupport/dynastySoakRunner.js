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
  [toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT]: [toUI.DYNASTY_AUDIT_CHECKPOINT, toUI.ERROR],
  [toWorker.SIM_TO_PHASE]: [toUI.FULL_STATE, toUI.ERROR],
  [toWorker.ADVANCE_WEEK]: [toUI.WEEK_COMPLETE, toUI.ERROR, toUI.FULL_STATE],
  [toWorker.SAVE_NOW]: [toUI.SAVED, toUI.ERROR],
  [toWorker.LOAD_SAVE]: [toUI.FULL_STATE, toUI.ERROR],
  [toWorker.LOAD_SLOT]: [toUI.FULL_STATE, toUI.ERROR],
  [toWorker.GET_ALL_SEASONS]: [toUI.ALL_SEASONS, toUI.ERROR],
  [toWorker.GET_TRANSACTIONS]: [toUI.TRANSACTIONS, toUI.ERROR],
  [toWorker.GET_RECORDS]: [toUI.RECORDS, toUI.ERROR],
  [toWorker.GET_HALL_OF_FAME]: [toUI.HALL_OF_FAME, toUI.ERROR],
  [toWorker.GET_DRAFT_CLASSES]: [toUI.DRAFT_CLASSES, toUI.ERROR],
  [toWorker.GET_DRAFT_CLASS]: [toUI.DRAFT_CLASS, toUI.ERROR],
  [toWorker.GET_SEASON_HISTORY]: [toUI.SEASON_HISTORY, toUI.ERROR],
};

/** @type {Map<string, { resolve: Function, reject: Function, accept: Set<string>, timer: ReturnType<typeof setTimeout> }>} */
const waiters = new Map();

export function probeHandlerSucceeded(msg) {
  return msg?.type !== toUI.ERROR && msg?.payload?.ok !== false;
}

export function payloadArrayHasRows(payload, key) {
  return Array.isArray(payload?.[key]) && payload[key].length > 0;
}

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


function annotateAuditCheckpointWithWorkerProbe(auditCheckpoint, name, ok, detail) {
  if (!auditCheckpoint || typeof auditCheckpoint !== 'object') return;
  if (!auditCheckpoint.exercised || typeof auditCheckpoint.exercised !== 'object') {
    auditCheckpoint.exercised = {};
  }
  auditCheckpoint.exercised[name] = {
    status: ok ? 'exercised' : 'failed',
    detail: String(detail || (ok ? 'handler probe ok' : 'handler probe failed')),
  };
  if (!ok) {
    auditCheckpoint.ok = false;
    if (!Array.isArray(auditCheckpoint.failures)) auditCheckpoint.failures = [];
    auditCheckpoint.failures.push({ system: name, error: auditCheckpoint.exercised[name].detail });
  }
}

function pushCheckpoint(checkpoints, name, ms, meta = null) {
  checkpoints.push({ name, ms, meta });
}

function topSlowCheckpoints(checkpoints, n = 10) {
  return [...checkpoints].sort((a, b) => b.ms - a.ms).slice(0, n);
}

function buildPhaseBreakdown(checkpoints) {
  const groups = {
    boot: { ms: 0, count: 0 },
    sim: { ms: 0, count: 0 },
    getProbes: { ms: 0, count: 0 },
    auditEvaluation: { ms: 0, count: 0 },
    finalAdvance: { ms: 0, count: 0 },
  };

  for (const checkpoint of checkpoints) {
    const name = String(checkpoint?.name ?? '');
    const ms = Number(checkpoint?.ms ?? 0);
    let bucket = null;
    if (name.startsWith('boot.')) bucket = groups.boot;
    else if (name.endsWith('.SIM_TO_PHASE')) bucket = groups.sim;
    else if (name.includes('AUDIT_CHECKPOINT')) bucket = groups.getProbes;
    else if (name.includes('.GET_')) bucket = groups.getProbes;
    else if (name.endsWith('.runDynastySoakAudit')) bucket = groups.auditEvaluation;
    else if (name.endsWith('.ADVANCE_WEEK') || name.includes('.ADVANCE_WEEK.')) bucket = groups.finalAdvance;
    if (!bucket) continue;
    bucket.ms += ms;
    bucket.count += 1;
  }

  return groups;
}

/**
 * `SIM_TO_PHASE` may stop before `preseason` when the worker hits its per-call
 * iteration guard mid-pipeline; repeat until preseason or hard cap.
 * @param {number} simTimeoutMs
 * @param {{ checkpoints: object[], label: string, phaseBefore?: string, yearBefore?: number }} ctx
 */
async function simUntilPreseason(simTimeoutMs, ctx, runnerDispatch = dispatchWorker) {
  let lastMsg = null;
  const attempts = [];
  let currentPhase = String(ctx.phaseBefore ?? '');
  let currentYear = Number(ctx.yearBefore ?? 0);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const phaseBefore = currentPhase;
    const yearBefore = currentYear;
    const t = Date.now();
    lastMsg = await runnerDispatch(
      toWorker.SIM_TO_PHASE,
      { targetPhase: 'preseason' },
      { timeoutMs: simTimeoutMs },
    );
    const ms = Date.now() - t;
    const ph = String(lastMsg.payload?.phase ?? '');
    const yr = Number(lastMsg.payload?.year ?? 0);
    const batch = lastMsg.payload?.dynastySoakSimBatch ?? null;
    const simBatchMeta = {
      iterationsUsed: batch?.iterationsUsed ?? null,
      reachedTarget: batch?.reachedTarget ?? null,
      hitIterationCap: batch?.hitIterationCap ?? null,
      lastPhase: batch?.lastPhase ?? null,
      targetPhase: batch?.targetPhase ?? 'preseason',
    };
    const meta = {
      attempt,
      phaseBefore,
      yearBefore,
      phaseAfter: ph,
      yearAfter: yr,
      ...simBatchMeta,
    };
    attempts.push({
      ...meta,
      ms,
      error: lastMsg.type === toUI.ERROR,
    });
    pushCheckpoint(ctx.checkpoints, `${ctx.label}.SIM_TO_PHASE`, ms, meta);
    if (lastMsg.type === toUI.ERROR) return { lastMsg, attempts };
    currentPhase = ph;
    currentYear = yr;
    if (ph === 'preseason') return { lastMsg, attempts };
  }
  return { lastMsg, attempts };
}


/**
 * When the current view is already in the target phase, SIM_TO_PHASE can return
 * immediately without crossing a season boundary. Advance at least one real
 * worker tick first so a preseason-starting soak still simulates a full season.
 * @param {any} view
 * @param {{ checkpoints: object[], label: string, phaseTimeoutMs: number, runnerDispatch?: Function }} ctx
 */
async function advanceOutOfCurrentTargetPhase(view, ctx) {
  const phaseBefore = String(view?.phase ?? '');
  const yearBefore = Number(view?.year ?? 0);
  let phaseAfter = phaseBefore;
  let yearAfter = yearBefore;
  let lastMsg = { payload: view };
  let currentView = view ?? {};
  let advances = 0;
  const runnerDispatch = ctx.runnerDispatch || dispatchWorker;
  const t = Date.now();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    advances += 1;
    lastMsg = await runnerDispatch(
      toWorker.ADVANCE_WEEK,
      { skipUserGame: true },
      { timeoutMs: ctx.phaseTimeoutMs },
    );
    if (lastMsg.type === toUI.ERROR) break;

    currentView = { ...currentView, ...(lastMsg.payload ?? {}) };
    lastMsg = { ...lastMsg, payload: currentView };
    phaseAfter = String(currentView.phase ?? '');
    yearAfter = Number(currentView.year ?? 0);

    if (phaseAfter !== phaseBefore || yearAfter !== yearBefore) break;
  }

  pushCheckpoint(ctx.checkpoints, `${ctx.label}.advance_out_of_${phaseBefore}`, Date.now() - t, {
    phaseBefore,
    phaseAfter,
    yearBefore,
    yearAfter,
    advances,
  });

  return { lastMsg, phaseBefore, phaseAfter, yearBefore, yearAfter, advances };
}

function checkMaxRuntime(t0, maxRuntimeMs) {
  if (maxRuntimeMs == null || !Number.isFinite(maxRuntimeMs)) return;
  if (Date.now() - t0 > maxRuntimeMs) {
    const e = new Error(`max-runtime-ms exceeded (${maxRuntimeMs})`);
    e.code = 'max_runtime_exceeded';
    throw e;
  }
}

function baseSummary() {
  return {
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
  };
}

function buildCiExerciseMatrix(regularWeekCount = 0) {
  const fullSeasonReason = 'CI profile runs a short real-worker phase path and does not complete a full season';
  return {
    realWorkerBoot: { status: 'exercised' },
    safeStarterLeague: { status: 'exercised' },
    preseasonAdvance: { status: 'pending' },
    regularWeeks: { status: regularWeekCount > 0 ? 'exercised' : 'pending', count: regularWeekCount },
    fullRegularSeason: { status: 'skipped', reason: fullSeasonReason },
    playoffs: { status: 'skipped', reason: 'CI profile does not complete a full season' },
    offseason: { status: 'skipped', reason: 'CI profile does not complete a full season' },
    freeAgency: { status: 'skipped', reason: 'CI profile does not enter offseason' },
    draft: { status: 'skipped', reason: 'CI profile does not enter draft' },
    fullSeasonArchive: { status: 'skipped', reason: 'CI profile does not create a completed-season archive' },
    persistenceFlush: { status: 'pending' },
    workerProbes: { status: 'pending' },
  };
}

function buildFullExerciseMatrix() {
  return {
    realWorkerBoot: { status: 'exercised' },
    safeStarterLeague: { status: 'exercised' },
    simToPhase: { status: 'exercised', detail: 'Full profile uses SIM_TO_PHASE to reach next preseason.' },
    fullRegularSeason: { status: 'exercised' },
    playoffs: { status: 'exercised' },
    offseason: { status: 'exercised' },
    freeAgency: { status: 'exercised' },
    draft: { status: 'exercised' },
    fullSeasonArchive: { status: 'exercised' },
    persistenceFlush: { status: 'exercised' },
    workerProbes: { status: 'exercised' },
  };
}

function createAggregate({ auditProfile, phasePath, seed, phaseTimeoutMs, maxRuntimeMs, deep, deepEachSeason, profileNotes }) {
  const checkpoints = [];
  const simAttemptsPerSeason = [];
  return {
    passed: true,
    severity: 'ok',
    seasonsSimmed: 0,
    checks: [],
    warnings: [],
    failures: [],
    summary: baseSummary(),
    checkpoints,
    simAttemptsPerSeason,
    timings: {
      bootMs: 0,
      phaseBreakdown: buildPhaseBreakdown([]),
      topSlowCheckpoints: [],
      totalMs: 0,
    },
    harnessConfig: {
      ci: auditProfile === 'ci',
      auditProfile,
      phasePath,
      deep: !!deep,
      deepEachSeason: !!deepEachSeason,
      phaseTimeoutMs,
      maxRuntimeMs,
      profileNotes,
    },
    auditProfile,
    phasePath,
    profileNotes,
    seed,
    smallerLeagueNote:
      'Only 32-team safe starter leagues are supported for this harness. Smaller default leagues are deferred (playoff seeding and conference balance are coupled to 32 teams).',
    persistenceAssertions: [],
    exerciseMatrix: auditProfile === 'ci' ? buildCiExerciseMatrix(0) : buildFullExerciseMatrix(),
  };
}

function finalizeAggregate(aggregate, t0, view, lastReportSummary = null) {
  aggregate.severity = aggregate.failures.length ? 'error' : aggregate.warnings.length ? 'warn' : 'ok';
  aggregate.runtimeMs = Date.now() - t0;
  aggregate.finalPhase = view?.phase ?? null;
  aggregate.finalYear = view?.year ?? null;
  aggregate.reportSummary = lastReportSummary;
  aggregate.timings.bootMs = aggregate.checkpoints.filter((c) => c.name.startsWith('boot.')).reduce((a, c) => a + c.ms, 0);
  aggregate.timings.topSlowCheckpoints = topSlowCheckpoints(aggregate.checkpoints);
  aggregate.timings.phaseBreakdown = buildPhaseBreakdown(aggregate.checkpoints);
  aggregate.timings.totalMs = aggregate.runtimeMs;
  aggregate.dynastySoakSimBatch = view?.dynastySoakSimBatch ?? null;
  return aggregate;
}

function mergeViewWithPayload(currentView, msg, latestBroadcastView) {
  if (latestBroadcastView && typeof latestBroadcastView === 'object') return latestBroadcastView;
  return { ...(currentView ?? {}), ...(msg?.payload ?? {}) };
}

async function timedDispatch({ checkpoints, name, runnerDispatch, type, payload = {}, timeoutMs, meta = null }) {
  const t = Date.now();
  const msg = await runnerDispatch(type, payload, { timeoutMs });
  pushCheckpoint(checkpoints, name, Date.now() - t, meta);
  return msg;
}


function countWarningsByCode(warnings = []) {
  const out = {};
  for (const warning of warnings || []) {
    const code = String(warning?.code ?? 'unknown');
    out[code] = (out[code] || 0) + 1;
  }
  return out;
}

const ECONOMY_AGGREGATE_FIELDS = [
  'teamsOverCap',
  'teamsWithPendingOfferOvercommit',
  'pendingOfferOvercommitCount',
  'duplicateExpensiveSameGroupOffers',
  'oldVeteranOffersByRebuildTeams',
  'contenderVeteranOfferCount',
  'severeQbNeedOfferCount',
  'premiumYoungPlayerTradeDiscountFlags',
  'expensiveVeteranSwapFlags',
  'cpuOfferCount',
  'unknownOfferValueCount',
];

function buildSeedSummary(result) {
  const economy = result?.reportSummary?.economyRegressionSnapshot ?? null;
  const completedSeasonCount = Array.isArray(result?.finalView?.leagueHistory)
    ? result.finalView.leagueHistory.length
    : (result?.reloadSummary?.after?.completedSeasonCount ?? result?.reportSummary?.completedSeasonCount ?? null);
  return {
    seed: result?.seed,
    passed: !!result?.passed,
    severity: result?.severity ?? 'unknown',
    runtimeMs: result?.runtimeMs ?? 0,
    seasonsSimmed: result?.seasonsSimmed ?? 0,
    finalPhase: result?.finalPhase ?? null,
    finalYear: result?.finalYear ?? null,
    completedSeasonCount,
    currentSeasonId: result?.reloadSummary?.after?.currentSeasonId ?? result?.finalView?.seasonId ?? null,
    userTeamId: result?.reloadSummary?.after?.userTeamId ?? result?.finalView?.userTeamId ?? null,
    failureCount: result?.failures?.length ?? 0,
    warningCount: result?.warnings?.length ?? 0,
    firstFailure: result?.failures?.[0]
      ? { code: result.failures[0].code, message: result.failures[0].message }
      : null,
    warningsByCode: countWarningsByCode(result?.warnings ?? []),
    economyRegressionSnapshot: economy,
    reloadSummary: result?.reloadSummary ?? null,
    persistenceAssertionFailures: (result?.persistenceAssertions ?? [])
      .filter((assertion) => assertion?.ok === false)
      .map((assertion) => ({ id: assertion.id, code: assertion.code, detail: assertion.detail })),
  };
}

function aggregateEconomy(seedSummaries) {
  const totals = {};
  for (const field of ECONOMY_AGGREGATE_FIELDS) totals[field] = 0;
  const skippedReasonsBySeed = [];
  const warningsBySeed = [];
  let snapshotsPresent = 0;
  for (const seedSummary of seedSummaries) {
    const eco = seedSummary.economyRegressionSnapshot;
    if (!eco || typeof eco !== 'object') {
      skippedReasonsBySeed.push({ seed: seedSummary.seed, code: 'economy_snapshot_missing', reason: 'No economyRegressionSnapshot was produced for this seed.' });
      continue;
    }
    snapshotsPresent += 1;
    for (const field of ECONOMY_AGGREGATE_FIELDS) {
      totals[field] += Number(eco[field] ?? 0) || 0;
    }
    if (Array.isArray(eco.skippedReasons) && eco.skippedReasons.length) {
      skippedReasonsBySeed.push(...eco.skippedReasons.map((row) => ({ seed: seedSummary.seed, ...row })));
    }
    if (Array.isArray(eco.warnings) && eco.warnings.length) {
      warningsBySeed.push({ seed: seedSummary.seed, warnings: eco.warnings });
    }
  }
  return { snapshotsPresent, totals, skippedReasonsBySeed, warningsBySeed };
}

function buildMultiSeedAggregate({ profileConfig, seedResults, t0 }) {
  const seedSummaries = seedResults.map(buildSeedSummary);
  const failuresBySeed = seedResults
    .filter((result) => !result?.passed || (result?.failures?.length ?? 0) > 0)
    .map((result) => ({ seed: result.seed, failures: result.failures ?? [], firstFailure: result.failures?.[0] ?? null }));
  const warningsBySeed = seedResults
    .filter((result) => (result?.warnings?.length ?? 0) > 0)
    .map((result) => ({ seed: result.seed, warnings: result.warnings ?? [], warningsByCode: countWarningsByCode(result.warnings ?? []) }));
  const persistenceWarningsBySeed = seedSummaries
    .filter((summary) => summary.persistenceAssertionFailures.length > 0)
    .map((summary) => ({ seed: summary.seed, assertionFailures: summary.persistenceAssertionFailures }));
  const economyAggregate = aggregateEconomy(seedSummaries);
  const totalRuntimeMs = Date.now() - t0;
  const passedSeeds = seedResults.filter((result) => !!result?.passed).length;
  const failedSeeds = seedResults.length - passedSeeds;
  const warningSeeds = seedResults.filter((result) => (result?.warnings?.length ?? 0) > 0).length;
  const passedWithoutWarnings = profileConfig.failOnWarnings
    ? failedSeeds === 0 && warningSeeds === 0
    : failedSeeds === 0;
  return {
    multiSeed: true,
    passed: passedWithoutWarnings,
    severity: failedSeeds > 0 ? 'error' : warningSeeds > 0 ? 'warn' : 'ok',
    auditProfile: profileConfig.auditProfile ?? 'multi-seed-ci',
    runnerProfile: profileConfig.runnerProfile ?? 'ci',
    phasePath: profileConfig.phasePath ?? 'short',
    seeds: seedResults.map((result) => result.seed),
    seedCount: seedResults.length,
    passCount: passedSeeds,
    failCount: failedSeeds,
    warningSeedCount: warningSeeds,
    runtimeMs: totalRuntimeMs,
    runtimeTotalMs: totalRuntimeMs,
    runtimePerSeed: Object.fromEntries(seedResults.map((result) => [String(result.seed), result.runtimeMs ?? 0])),
    seasons: profileConfig.seasons,
    failOnWarnings: !!profileConfig.failOnWarnings,
    profileNotes: profileConfig.profileNotes ?? [],
    harnessConfig: {
      auditProfile: profileConfig.auditProfile ?? 'multi-seed-ci',
      runnerProfile: profileConfig.runnerProfile ?? 'ci',
      phasePath: profileConfig.phasePath ?? 'short',
      seeds: seedResults.map((result) => result.seed),
      seasons: profileConfig.seasons,
      ci: (profileConfig.runnerProfile ?? 'ci') === 'ci',
      deep: !!profileConfig.deep,
      deepEachSeason: !!profileConfig.deepEachSeason,
      phaseTimeoutMs: profileConfig.phaseTimeoutMs,
      maxRuntimeMs: profileConfig.maxRuntimeMs,
      failOnWarnings: !!profileConfig.failOnWarnings,
    },
    seedSummaries,
    failuresBySeed,
    warningsBySeed,
    economyAggregate,
    persistenceReloadSummary: seedSummaries.map((summary) => ({
      seed: summary.seed,
      ok: summary.reloadSummary?.ok ?? null,
      before: summary.reloadSummary?.before ?? null,
      after: summary.reloadSummary?.after ?? null,
      mismatches: summary.reloadSummary?.mismatches ?? [],
    })),
    persistenceWarningsBySeed,
    results: seedResults,
    failures: failuresBySeed.flatMap((row) => row.failures.map((failure) => ({ ...failure, seed: row.seed, message: `[seed ${row.seed}] ${failure.message}` }))),
    warnings: warningsBySeed.flatMap((row) => row.warnings.map((warning) => ({ ...warning, seed: row.seed, message: `[seed ${row.seed}] ${warning.message}` }))),
  };
}

/**
 * @typedef {object} DynastySoakRunnerOptions
 * @property {number} [seasons=5]
 * @property {number} [seed=1383]
 * @property {boolean} [ci=false]
 * @property {boolean} [deep=false] - larger final-season transaction/draft/archive probes
 * @property {boolean} [deepEachSeason=false]
 * @property {number} [simTimeoutMs]
 * @property {number} [phaseTimeoutMs] - alias override for simTimeoutMs / GET timeouts
 * @property {number|null} [maxRuntimeMs]
 * @property {function} [onBroadcast]
 * @property {function} [dispatchWorker] - test hook for worker dispatches
 * @property {function} [loadWorkerModule] - test hook for worker module loading
 */

/**
 * @param {DynastySoakRunnerOptions} opts
 */
function snapshotReloadFields(view, transactionsRecent = []) {
  const leagueHistory = Array.isArray(view?.leagueHistory) ? view.leagueHistory : [];
  return {
    year: view?.year ?? null,
    phase: view?.phase ?? null,
    teamCount: Array.isArray(view?.teams) ? view.teams.length : null,
    currentSeasonId: view?.seasonId ?? view?.currentSeasonId ?? null,
    completedSeasonCount: leagueHistory.length,
    transactionCountSample: Array.isArray(transactionsRecent) ? transactionsRecent.length : null,
    userTeamId: view?.userTeamId ?? null,
  };
}

function compareReloadSummary(before, after) {
  const required = ['year', 'phase', 'teamCount', 'currentSeasonId', 'completedSeasonCount', 'userTeamId'];
  const mismatches = [];
  for (const key of required) {
    if (String(before?.[key] ?? '') !== String(after?.[key] ?? '')) {
      mismatches.push({ key, before: before?.[key] ?? null, after: after?.[key] ?? null });
    }
  }
  if (Number(after?.transactionCountSample ?? 0) < Math.min(5, Number(before?.transactionCountSample ?? 0))) {
    mismatches.push({ key: 'transactionCountSample', before: before?.transactionCountSample ?? null, after: after?.transactionCountSample ?? null });
  }
  return { ok: mismatches.length === 0, before, after, mismatches };
}

async function runFullDynastySoakOnce(opts = {}) {
  const seasons = Math.max(1, Math.min(50, Number(opts.seasons) || 5));
  const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1383;
  const ci = !!opts.ci;
  const deep = !!opts.deep;
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
  const runnerDispatch = typeof opts.dispatchWorker === 'function' ? opts.dispatchWorker : dispatchWorker;
  const requestedAuditProfile = String(opts.auditProfile ?? 'full');
  const runnerLoadWorkerModule = typeof opts.loadWorkerModule === 'function' ? opts.loadWorkerModule : loadWorkerModule;

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
      phaseBreakdown: buildPhaseBreakdown([]),
      topSlowCheckpoints: [],
      totalMs: 0,
    },
    harnessConfig: {
      ci,
      auditProfile: requestedAuditProfile,
      phasePath: 'full-season',
      deep,
      deepEachSeason,
      phaseTimeoutMs,
      maxRuntimeMs,
    },
    smallerLeagueNote:
      'Only 32-team safe starter leagues are supported for this harness. Smaller default leagues are deferred (playoff seeding and conference balance are coupled to 32 teams).',
    persistenceAssertions: [],
    auditProfile: requestedAuditProfile,
    phasePath: 'full-season',
    profileNotes: opts.profileNotes ?? ['Full profile preserves the legacy full-season SIM_TO_PHASE audit and may be slow.'],
    exerciseMatrix: buildFullExerciseMatrix(),
  };

  globalThis.__dynastySoakBroadcast = opts.onBroadcast || null;
  globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = true;
  globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = true;
  globalThis.__DYNASTY_SOAK_PROFILE__ = true;
  globalThis.__DYNASTY_SOAK_AUDIT_CHECKPOINT_ENABLED__ = false;
  globalThis.__DYNASTY_SOAK_LAST_BATCH__ = undefined;

  const t0 = Date.now();
  /** @type {any} */
  let view = null;
  let lastReportSummary = null;

  try {
    await runnerLoadWorkerModule();

    let t = Date.now();
    await runnerDispatch(toWorker.INIT, {}, { timeoutMs: Math.min(120_000, phaseTimeoutMs) });
    pushCheckpoint(checkpoints, 'boot.INIT', Date.now() - t, null);

    checkMaxRuntime(t0, maxRuntimeMs);

    t = Date.now();
    const bootMsg = await runnerDispatch(
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
      let yearBefore = Number(view?.year ?? 0);
      let phaseBefore = String(view?.phase ?? '');
      const fullProbes = deepEachSeason || s === seasons;
      const deepFinalProbes = deep && s === seasons;
      const recentTransactionLimit = deepFinalProbes ? 1_000 : 400;
      const seasonTransactionLimit = deepFinalProbes ? 1_000 : 200;

      if (phaseBefore === 'preseason') {
        const advanceResult = await advanceOutOfCurrentTargetPhase(view, {
          checkpoints,
          label: `S${s}`,
          phaseTimeoutMs,
          runnerDispatch,
        });
        if (advanceResult.lastMsg.type === toUI.ERROR) {
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
                  code: 'advance_out_of_preseason_error',
                  message: advanceResult.lastMsg.payload?.message || 'ADVANCE_WEEK error leaving preseason',
                },
              ],
              summary: aggregate.summary,
            },
            `S${s}`,
          );
          break;
        }
        view = advanceResult.lastMsg.payload;
        yearBefore = Number(view?.year ?? 0);
        phaseBefore = String(view?.phase ?? '');
      }

      const simCtx = { checkpoints, label: `S${s}`, phaseBefore, yearBefore };
      const { lastMsg: simMsg, attempts } = await simUntilPreseason(simTimeoutMs, simCtx, runnerDispatch);
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
      const allSeasonsMsg = await runnerDispatch(toWorker.GET_ALL_SEASONS, {}, { timeoutMs: phaseTimeoutMs });
      pushCheckpoint(checkpoints, `S${s}.GET_ALL_SEASONS`, Date.now() - tProbe, { fullProbes, deepFinalProbes });

      const leagueHistory = view?.leagueHistory ?? [];
      const latestSeason = leagueHistory.length ? leagueHistory[leagueHistory.length - 1] : null;
      const latestSeasonId = latestSeason?.id ?? null;

      tProbe = Date.now();
      const txMsg = await runnerDispatch(
        toWorker.GET_TRANSACTIONS,
        { mode: 'recent', limit: recentTransactionLimit },
        { timeoutMs: phaseTimeoutMs },
      );
      pushCheckpoint(checkpoints, `S${s}.GET_TRANSACTIONS_recent`, Date.now() - tProbe, null);

      let txSeasonMsg;
      if (fullProbes) {
        tProbe = Date.now();
        txSeasonMsg = await runnerDispatch(
          toWorker.GET_TRANSACTIONS,
          { seasonId: latestSeasonId ?? view?.seasonId, limit: seasonTransactionLimit },
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
        recordsMsg = await runnerDispatch(toWorker.GET_RECORDS, {}, { timeoutMs: phaseTimeoutMs });
        pushCheckpoint(checkpoints, `S${s}.GET_RECORDS`, Date.now() - tProbe, null);

        tProbe = Date.now();
        hofMsg = await runnerDispatch(toWorker.GET_HALL_OF_FAME, {}, { timeoutMs: phaseTimeoutMs });
        pushCheckpoint(checkpoints, `S${s}.GET_HALL_OF_FAME`, Date.now() - tProbe, null);

        tProbe = Date.now();
        draftClassesMsg = await runnerDispatch(toWorker.GET_DRAFT_CLASSES, {}, { timeoutMs: phaseTimeoutMs });
        pushCheckpoint(checkpoints, `S${s}.GET_DRAFT_CLASSES`, Date.now() - tProbe, null);
      } else {
        recordsMsg = { type: toUI.RECORDS, payload: null };
        hofMsg = { type: toUI.HALL_OF_FAME, payload: null };
        draftClassesMsg = { type: toUI.DRAFT_CLASSES, payload: { classes: [] } };
      }

      let seasonHistory = null;
      let getSeasonHistoryOk = null;
      const getSeasonHistorySkipped = !fullProbes;
      const deepFinalAssertions = [];
      if (fullProbes && latestSeason?.id) {
        tProbe = Date.now();
        const histMsg = await runnerDispatch(
          toWorker.GET_SEASON_HISTORY,
          { seasonId: latestSeason.id },
          { timeoutMs: phaseTimeoutMs },
        );
        pushCheckpoint(checkpoints, `S${s}.GET_SEASON_HISTORY`, Date.now() - tProbe, null);
        if (probeHandlerSucceeded(histMsg)) {
          seasonHistory = histMsg.payload?.data ?? null;
          getSeasonHistoryOk = true;
        } else {
          getSeasonHistoryOk = false;
        }

        if (deepFinalProbes) {
          const archiveSample = leagueHistory.slice(-4).filter((season) => season?.id);
          let archiveOk = true;
          for (const season of archiveSample) {
            tProbe = Date.now();
            const sampledHistMsg = await runnerDispatch(
              toWorker.GET_SEASON_HISTORY,
              { seasonId: season.id },
              { timeoutMs: phaseTimeoutMs },
            );
            pushCheckpoint(checkpoints, `S${s}.GET_SEASON_HISTORY_deep`, Date.now() - tProbe, {
              seasonId: season.id,
            });
            if (sampledHistMsg.type === toUI.ERROR || !sampledHistMsg.payload?.data) archiveOk = false;
          }
          deepFinalAssertions.push({
            id: 'deep_archive_history_sample',
            ok: archiveOk,
            detail: archiveSample.length
              ? `${archiveSample.length} archived season histories sampled`
              : 'no archived seasons available to sample',
          });
        }
      } else {
        getSeasonHistoryOk = fullProbes ? null : true;
      }

      if (deepFinalProbes && Array.isArray(draftClassesMsg?.payload?.classes)) {
        const draftClassSample = draftClassesMsg.payload.classes.slice(0, 4).filter((klass) => klass?.seasonId);
        let draftClassOk = true;
        for (const klass of draftClassSample) {
          tProbe = Date.now();
          const draftClassMsg = await runnerDispatch(
            toWorker.GET_DRAFT_CLASS,
            { seasonId: klass.seasonId },
            { timeoutMs: phaseTimeoutMs },
          );
          pushCheckpoint(checkpoints, `S${s}.GET_DRAFT_CLASS_deep`, Date.now() - tProbe, {
            seasonId: klass.seasonId,
          });
          if (draftClassMsg.type === toUI.ERROR || !draftClassMsg.payload?.model) draftClassOk = false;
        }
        deepFinalAssertions.push({
          id: 'deep_draft_class_model_sample',
          ok: draftClassOk,
          detail: draftClassSample.length
            ? `${draftClassSample.length} draft class models sampled`
            : 'no draft classes available to sample',
        });
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
        expectedTeamCount: 32,
        allSeasons: allSeasonsMsg.payload?.seasons ?? null,
        seasonHistory,
        transactions: txMsg.payload?.transactions ?? [],
        recordsPayload: recordsMsg.payload ?? null,
        hofPayload: hofMsg.payload ?? null,
        draftClassesPayload: draftClassesMsg.payload ?? null,
      });
      pushCheckpoint(checkpoints, `S${s}.runDynastySoakAudit`, Date.now() - tProbe, null);
      lastReportSummary = audit.reportSummary ?? null;

      if (fullProbes && !probeHandlerSucceeded(txSeasonMsg)) {
        audit.failures.push({
          code: 'get_transactions_season',
          message: txSeasonMsg.payload?.message || txSeasonMsg.payload?.error || 'GET_TRANSACTIONS by season failed',
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
        const expectDraftClasses = s >= 2;
        const transactionsRecentProbeOk = probeHandlerSucceeded(txMsg);
        const transactionsRecentHasExpectedData = payloadArrayHasRows(txMsg.payload, 'transactions');
        const draftClassesProbeOk = probeHandlerSucceeded(draftClassesMsg);
        const draftClassesHasExpectedData = payloadArrayHasRows(draftClassesMsg.payload, 'classes');
        const persInput = {
          viewState: view,
          transactionsRecent: txMsg.payload?.transactions ?? [],
          expectTransactions: expectTx,
          transactionsRecentProbeOk,
          transactionsRecentHasExpectedData,
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
            probeHandlerSucceeded(recordsMsg) && !!(recordsMsg.payload?.recordBook || recordsMsg.payload?.records),
          recordsProbeSkipped: false,
          hofProbeOk:
            probeHandlerSucceeded(hofMsg) && (!hofMsg.payload || Array.isArray(hofMsg.payload?.players)),
          hofProbeSkipped: false,
          draftClassesProbeOk,
          draftClassesProbeSkipped: false,
          draftClassesHasExpectedData,
          expectDraftClasses,
          draftClassCount,
        };
        const pers = buildPersistenceAssertions(persInput);
        const assertions = deepFinalProbes ? [...pers.assertions, ...deepFinalAssertions] : pers.assertions;
        aggregate.persistenceAssertions = assertions;
        if (!pers.allOk || deepFinalAssertions.some((assertion) => !assertion.ok)) {
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
      await runnerDispatch(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: phaseTimeoutMs });
      pushCheckpoint(checkpoints, `S${s}.ADVANCE_WEEK`, Date.now() - tProbe, null);
    }

    let finalRecentTransactions = [];
    try {
      const saveT = Date.now();
      const saveMsg = await runnerDispatch(toWorker.SAVE_NOW, {}, { timeoutMs: Math.min(120_000, phaseTimeoutMs) });
      pushCheckpoint(checkpoints, 'final.SAVE_NOW', Date.now() - saveT, null);
      const saveOk = probeHandlerSucceeded(saveMsg);
      aggregate.persistenceAssertions.push({
        id: 'final_save_now_flush',
        ok: saveOk,
        code: saveOk ? undefined : 'save_now_failed',
        detail: saveOk ? 'Final SAVE_NOW flush ok before reload proof' : (saveMsg.payload?.message || 'Final SAVE_NOW flush failed'),
      });
      const beforeTx = await runnerDispatch(toWorker.GET_TRANSACTIONS, { mode: 'recent', limit: 100 }, { timeoutMs: phaseTimeoutMs });
      finalRecentTransactions = beforeTx.payload?.transactions ?? [];
      const before = snapshotReloadFields(view, finalRecentTransactions);
      const loadT = Date.now();
      const loadMsg = await runnerDispatch(toWorker.LOAD_SAVE, { leagueId: 'save_slot_1' }, { timeoutMs: Math.min(180_000, phaseTimeoutMs) });
      pushCheckpoint(checkpoints, 'final.LOAD_SAVE', Date.now() - loadT, null);
      if (!probeHandlerSucceeded(loadMsg)) {
        aggregate.reloadSummary = { ok: false, before, after: null, mismatches: [{ key: 'LOAD_SAVE', before: 'ok', after: loadMsg.payload?.message || 'failed' }] };
      } else {
        view = loadMsg.payload;
        const reloadAllSeasons = await runnerDispatch(toWorker.GET_ALL_SEASONS, {}, { timeoutMs: phaseTimeoutMs });
        const reloadTx = await runnerDispatch(toWorker.GET_TRANSACTIONS, { mode: 'recent', limit: 100 }, { timeoutMs: phaseTimeoutMs });
        const reloadRecords = await runnerDispatch(toWorker.GET_RECORDS, {}, { timeoutMs: phaseTimeoutMs });
        const reloadHof = await runnerDispatch(toWorker.GET_HALL_OF_FAME, {}, { timeoutMs: phaseTimeoutMs });
        const reloadDraftClasses = await runnerDispatch(toWorker.GET_DRAFT_CLASSES, {}, { timeoutMs: phaseTimeoutMs });
        const reloadedLatest = Array.isArray(view?.leagueHistory) && view.leagueHistory.length ? view.leagueHistory[view.leagueHistory.length - 1] : null;
        let reloadHistoryOk = true;
        if (reloadedLatest?.id) {
          const reloadHistory = await runnerDispatch(toWorker.GET_SEASON_HISTORY, { seasonId: reloadedLatest.id }, { timeoutMs: phaseTimeoutMs });
          reloadHistoryOk = probeHandlerSucceeded(reloadHistory) && !!reloadHistory.payload?.data;
        }
        const after = snapshotReloadFields(view, reloadTx.payload?.transactions ?? []);
        aggregate.reloadSummary = compareReloadSummary(before, after);
        aggregate.reloadSummary.handlerProbeOk = {
          allSeasons: probeHandlerSucceeded(reloadAllSeasons),
          seasonHistory: reloadHistoryOk,
          recentTransactions: probeHandlerSucceeded(reloadTx),
          draftClasses: probeHandlerSucceeded(reloadDraftClasses),
          records: probeHandlerSucceeded(reloadRecords) && !!(reloadRecords.payload?.recordBook || reloadRecords.payload?.records),
          hallOfFame: probeHandlerSucceeded(reloadHof) && (!reloadHof.payload || Array.isArray(reloadHof.payload?.players)),
        };
        if (Object.values(aggregate.reloadSummary.handlerProbeOk).some((ok) => !ok)) {
          aggregate.reloadSummary.ok = false;
          aggregate.reloadSummary.mismatches.push({ key: 'reload_handler_probe', before: 'ok', after: JSON.stringify(aggregate.reloadSummary.handlerProbeOk) });
        }
      }
      aggregate.persistenceAssertions.push({
        id: 'reload_same_persistence_path',
        ok: aggregate.reloadSummary?.ok === true,
        code: aggregate.reloadSummary?.ok === true ? undefined : 'reload_corrupted_state',
        detail: aggregate.reloadSummary?.ok === true
          ? `Reload preserved year=${aggregate.reloadSummary.after.year} phase=${aggregate.reloadSummary.after.phase} seasons=${aggregate.reloadSummary.after.completedSeasonCount}`
          : `Reload mismatch: ${JSON.stringify(aggregate.reloadSummary?.mismatches ?? [])}`,
      });
      if (aggregate.reloadSummary?.ok !== true) {
        aggregate.passed = false;
        aggregate.failures.push({ code: 'reload_corrupted_state', message: 'Save/load proof lost or corrupted critical dynasty state; see reloadSummary.' });
      }
    } catch (err) {
      aggregate.passed = false;
      aggregate.reloadSummary = { ok: false, error: err?.message || String(err) };
      aggregate.failures.push({ code: 'reload_probe_throw', message: err?.message || String(err) });
    }

    aggregate.severity = aggregate.failures.length ? 'error' : aggregate.warnings.length ? 'warn' : 'ok';
    if (opts.failOnWarnings && aggregate.warnings.length > 0) aggregate.passed = false;
    aggregate.runtimeMs = Date.now() - t0;
    aggregate.seed = seed;
    aggregate.finalPhase = view?.phase ?? null;
    aggregate.finalYear = view?.year ?? null;
    aggregate.reportSummary = lastReportSummary;
    aggregate.finalView = view;
    aggregate.timings.bootMs = checkpoints.filter((c) => c.name.startsWith('boot.')).reduce((a, c) => a + c.ms, 0);
    aggregate.timings.topSlowCheckpoints = topSlowCheckpoints(checkpoints);
    aggregate.timings.phaseBreakdown = buildPhaseBreakdown(checkpoints);
    aggregate.timings.totalMs = aggregate.runtimeMs;
    aggregate.dynastySoakSimBatch = view?.dynastySoakSimBatch ?? null;
    aggregate.finalView = view;

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
    aggregate.timings.phaseBreakdown = buildPhaseBreakdown(checkpoints);
    aggregate.timings.totalMs = aggregate.runtimeMs;
    return aggregate;
  } finally {
    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = false;
    globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = false;
    globalThis.__DYNASTY_SOAK_PROFILE__ = false;
    globalThis.__DYNASTY_SOAK_AUDIT_CHECKPOINT_ENABLED__ = false;
    globalThis.__DYNASTY_SOAK_LAST_BATCH__ = undefined;
  }
}

async function runCiDynastySoakOnce(opts = {}) {
  const seed = Number.isFinite(Number(opts.seed)) ? Number(opts.seed) : 1383;
  const deep = !!opts.deep;
  const deepEachSeason = !!opts.deepEachSeason;
  const phaseTimeoutMs = Number.isFinite(Number(opts.phaseTimeoutMs))
    ? Number(opts.phaseTimeoutMs)
    : Number.isFinite(Number(opts.simTimeoutMs))
      ? Number(opts.simTimeoutMs)
      : 3_600_000;
  const maxRuntimeMs =
    opts.maxRuntimeMs === null || opts.maxRuntimeMs === undefined
      ? null
      : Number(opts.maxRuntimeMs);
  const ciWeeks = Math.max(1, Math.min(2, Number(opts.ciWeeks) || 2));
  const profileNotes = opts.profileNotes ?? [
    'CI profile runs a short real-worker phase path and does not complete a season.',
    'Use --audit-profile=full --seasons=1 for the full manual season audit.',
  ];
  const runnerDispatch = typeof opts.dispatchWorker === 'function' ? opts.dispatchWorker : dispatchWorker;
  const runnerLoadWorkerModule = typeof opts.loadWorkerModule === 'function' ? opts.loadWorkerModule : loadWorkerModule;
  const aggregate = createAggregate({
    auditProfile: 'ci',
    phasePath: 'short',
    seed,
    phaseTimeoutMs,
    maxRuntimeMs,
    deep,
    deepEachSeason,
    profileNotes,
  });
  const { checkpoints } = aggregate;
  const t0 = Date.now();
  let view = null;
  let lastReportSummary = null;
  let latestBroadcastView = null;
  const upstreamBroadcast = opts.onBroadcast || null;

  globalThis.__dynastySoakBroadcast = (msg) => {
    if (msg?.type === toUI.STATE_UPDATE || msg?.type === toUI.FULL_STATE) {
      latestBroadcastView = { ...(latestBroadcastView ?? view ?? {}), ...(msg.payload ?? {}) };
    }
    if (typeof upstreamBroadcast === 'function') upstreamBroadcast(msg);
  };
  globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = false;
  globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = false;
  globalThis.__DYNASTY_SOAK_PROFILE__ = true;
  globalThis.__DYNASTY_SOAK_AUDIT_CHECKPOINT_ENABLED__ = true;
  globalThis.__DYNASTY_SOAK_LAST_BATCH__ = undefined;

  try {
    await runnerLoadWorkerModule();

    await timedDispatch({
      checkpoints,
      name: 'boot.INIT',
      runnerDispatch,
      type: toWorker.INIT,
      timeoutMs: Math.min(120_000, phaseTimeoutMs),
    });
    aggregate.exerciseMatrix.realWorkerBoot = { status: 'exercised' };
    checkMaxRuntime(t0, maxRuntimeMs);

    const bootMsg = await timedDispatch({
      checkpoints,
      name: 'boot.USE_SAFE_STARTER_LEAGUE',
      runnerDispatch,
      type: toWorker.USE_SAFE_STARTER_LEAGUE,
      payload: {
        slotKey: 'save_slot_1',
        options: { rngSeed: seed, userTeamId: 0, name: `Dynasty Soak ${seed}` },
      },
      timeoutMs: Math.min(180_000, phaseTimeoutMs),
    });
    if (bootMsg.type === toUI.ERROR) throw new Error(bootMsg.payload?.message || 'USE_SAFE_STARTER_LEAGUE failed');
    view = bootMsg.payload;
    latestBroadcastView = view;
    aggregate.exerciseMatrix.safeStarterLeague = { status: 'exercised' };
    checkMaxRuntime(t0, maxRuntimeMs);

    if (String(view?.phase ?? '') === 'preseason') {
      latestBroadcastView = null;
      const msg = await timedDispatch({
        checkpoints,
        name: 'ci.ADVANCE_WEEK.preseason_to_regular',
        runnerDispatch,
        type: toWorker.ADVANCE_WEEK,
        payload: { skipUserGame: true },
        timeoutMs: phaseTimeoutMs,
        meta: { purpose: 'leave_preseason' },
      });
      if (msg.type === toUI.ERROR) throw new Error(msg.payload?.message || 'ADVANCE_WEEK failed leaving preseason');
      view = mergeViewWithPayload(view, msg, latestBroadcastView);
      aggregate.exerciseMatrix.preseasonAdvance = {
        status: String(view?.phase ?? '') === 'regular' ? 'exercised' : 'warning',
        detail: `phase=${view?.phase ?? 'unknown'}`,
      };
    } else {
      aggregate.exerciseMatrix.preseasonAdvance = {
        status: 'not_needed',
        detail: `Starter league began in phase ${view?.phase ?? 'unknown'}`,
      };
    }
    checkMaxRuntime(t0, maxRuntimeMs);

    let regularWeeksSimmed = 0;
    for (let i = 0; i < ciWeeks; i += 1) {
      if (String(view?.phase ?? '') !== 'regular') break;
      const weekBefore = Number(view?.currentWeek ?? 0);
      latestBroadcastView = null;
      const msg = await timedDispatch({
        checkpoints,
        name: `ci.ADVANCE_WEEK.regular_${i + 1}`,
        runnerDispatch,
        type: toWorker.ADVANCE_WEEK,
        payload: { skipUserGame: true },
        timeoutMs: phaseTimeoutMs,
        meta: { weekBefore },
      });
      if (msg.type === toUI.ERROR) throw new Error(msg.payload?.message || `ADVANCE_WEEK failed in CI regular week ${i + 1}`);
      view = mergeViewWithPayload(view, msg, latestBroadcastView);
      regularWeeksSimmed += 1;
      aggregate.exerciseMatrix.regularWeeks = { status: 'exercised', count: regularWeeksSimmed };
      checkMaxRuntime(t0, maxRuntimeMs);
    }

    if (regularWeeksSimmed === 0) {
      aggregate.passed = false;
      aggregate.failures.push({ code: 'ci_no_regular_weeks', message: 'CI profile did not simulate any real regular-season weeks.' });
      aggregate.exerciseMatrix.regularWeeks = { status: 'failed', count: 0 };
    }

    const saveMsg = await timedDispatch({
      checkpoints,
      name: 'ci.SAVE_NOW',
      runnerDispatch,
      type: toWorker.SAVE_NOW,
      timeoutMs: Math.min(120_000, phaseTimeoutMs),
    });
    const saveNowOk = probeHandlerSucceeded(saveMsg);
    aggregate.exerciseMatrix.persistenceFlush = saveNowOk
      ? { status: 'exercised' }
      : { status: 'failed', reason: saveMsg.payload?.message || 'SAVE_NOW failed' };
    checkMaxRuntime(t0, maxRuntimeMs);

    const checkpointMsg = await timedDispatch({
      checkpoints,
      name: 'ci.RUN_DYNASTY_AUDIT_CHECKPOINT',
      runnerDispatch,
      type: toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT,
      payload: { realWeeksSimulated: regularWeeksSimmed, auditProfile: 'ci' },
      timeoutMs: Math.min(180_000, phaseTimeoutMs),
      meta: { realWeeksSimulated: regularWeeksSimmed },
    });
    const auditCheckpoint = checkpointMsg.payload ?? null;
    aggregate.auditCheckpoint = auditCheckpoint;
    if (probeHandlerSucceeded(checkpointMsg) && auditCheckpoint?.ok === true && auditCheckpoint?.auditOnly === true && auditCheckpoint?.completedSeason === false) {
      aggregate.exerciseMatrix.auditCheckpoint = {
        status: 'exercised_partial',
        detail: 'audit-only checkpoint persisted metadata and shaped safe partial archive probes',
        archiveType: auditCheckpoint.archiveType,
        completedSeason: auditCheckpoint.completedSeason,
        realWeeksSimulated: auditCheckpoint.realWeeksSimulated,
      };
    } else {
      aggregate.passed = false;
      aggregate.exerciseMatrix.auditCheckpoint = {
        status: 'failed',
        reason: auditCheckpoint?.error || auditCheckpoint?.failures?.map((f) => f?.error || f?.system).join('; ') || 'audit checkpoint failed',
      };
      aggregate.failures.push({
        code: 'audit_checkpoint_failed',
        message: aggregate.exerciseMatrix.auditCheckpoint.reason,
      });
    }
    checkMaxRuntime(t0, maxRuntimeMs);

    const allSeasonsMsg = await timedDispatch({
      checkpoints,
      name: 'ci.GET_ALL_SEASONS',
      runnerDispatch,
      type: toWorker.GET_ALL_SEASONS,
      timeoutMs: phaseTimeoutMs,
    });
    const txMsg = await timedDispatch({
      checkpoints,
      name: 'ci.GET_TRANSACTIONS_recent',
      runnerDispatch,
      type: toWorker.GET_TRANSACTIONS,
      payload: { mode: 'recent', limit: 100 },
      timeoutMs: phaseTimeoutMs,
    });
    const recordsMsg = await timedDispatch({
      checkpoints,
      name: 'ci.GET_RECORDS',
      runnerDispatch,
      type: toWorker.GET_RECORDS,
      timeoutMs: phaseTimeoutMs,
    });
    const hofMsg = await timedDispatch({
      checkpoints,
      name: 'ci.GET_HALL_OF_FAME',
      runnerDispatch,
      type: toWorker.GET_HALL_OF_FAME,
      timeoutMs: phaseTimeoutMs,
    });
    annotateAuditCheckpointWithWorkerProbe(
      auditCheckpoint,
      'getAllSeasonsHandler',
      probeHandlerSucceeded(allSeasonsMsg),
      probeHandlerSucceeded(allSeasonsMsg)
        ? `GET_ALL_SEASONS ok (${Array.isArray(allSeasonsMsg.payload?.seasons) ? allSeasonsMsg.payload.seasons.length : 0} rows)`
        : (allSeasonsMsg.payload?.message || allSeasonsMsg.payload?.error || 'GET_ALL_SEASONS failed'),
    );
    annotateAuditCheckpointWithWorkerProbe(
      auditCheckpoint,
      'getTransactionsRecentHandler',
      probeHandlerSucceeded(txMsg),
      probeHandlerSucceeded(txMsg)
        ? `GET_TRANSACTIONS recent ok (${Array.isArray(txMsg.payload?.transactions) ? txMsg.payload.transactions.length : 0} rows)`
        : (txMsg.payload?.message || txMsg.payload?.error || 'GET_TRANSACTIONS recent failed'),
    );
    annotateAuditCheckpointWithWorkerProbe(
      auditCheckpoint,
      'getRecordsHandler',
      probeHandlerSucceeded(recordsMsg) && !!(recordsMsg.payload?.recordBook || recordsMsg.payload?.records),
      (probeHandlerSucceeded(recordsMsg) && !!(recordsMsg.payload?.recordBook || recordsMsg.payload?.records))
        ? 'GET_RECORDS handler returned record data'
        : (recordsMsg.payload?.message || recordsMsg.payload?.error || 'GET_RECORDS handler failed or returned no record data'),
    );
    annotateAuditCheckpointWithWorkerProbe(
      auditCheckpoint,
      'getHallOfFameHandler',
      probeHandlerSucceeded(hofMsg) && (!hofMsg.payload || Array.isArray(hofMsg.payload?.players)),
      (probeHandlerSucceeded(hofMsg) && (!hofMsg.payload || Array.isArray(hofMsg.payload?.players)))
        ? 'GET_HALL_OF_FAME handler returned a valid player list'
        : (hofMsg.payload?.message || hofMsg.payload?.error || 'GET_HALL_OF_FAME handler failed or returned invalid data'),
    );
    if (auditCheckpoint?.ok === false && aggregate.exerciseMatrix.auditCheckpoint?.status !== 'failed') {
      aggregate.passed = false;
      aggregate.exerciseMatrix.auditCheckpoint = {
        ...aggregate.exerciseMatrix.auditCheckpoint,
        status: 'failed',
        reason: auditCheckpoint.failures?.map((f) => f?.error || f?.system).filter(Boolean).join('; ') || 'audit checkpoint probe failed',
      };
      aggregate.failures.push({
        code: 'audit_checkpoint_probe_failed',
        message: aggregate.exerciseMatrix.auditCheckpoint.reason,
      });
    }
    aggregate.exerciseMatrix.workerProbes = { status: 'exercised_partial', detail: 'GET_ALL_SEASONS, GET_TRANSACTIONS recent, GET_RECORDS, GET_HALL_OF_FAME' };

    const skippedProbeReasons = {
      latest_season_archive: 'CI profile does not complete a season or create a completed-season archive',
      get_all_seasons_latest: 'CI profile has no completed season archive to find in GET_ALL_SEASONS',
      get_transactions_by_season: 'CI profile has no completed season archive for a season-scoped transaction query',
      player_season_stats_v1: 'CI profile does not create a completed-season player stats archive',
      transaction_timeline_v1: 'CI profile does not create a completed-season transaction timeline archive',
      get_season_history: 'CI profile has no completed season history to query',
      get_draft_classes: 'CI profile does not enter draft, so draft classes are not expected',
    };

    const audit = runDynastySoakAudit({
      viewState: view,
      seasonIndex: 0,
      expectedTeamCount: 32,
      allSeasons: allSeasonsMsg.payload?.seasons ?? null,
      seasonHistory: null,
      transactions: txMsg.payload?.transactions ?? [],
      recordsPayload: recordsMsg.payload ?? null,
      hofPayload: hofMsg.payload ?? null,
      draftClassesPayload: null,
    });
    pushCheckpoint(checkpoints, 'ci.runDynastySoakAudit', 0, null);
    lastReportSummary = audit.reportSummary ?? null;
    mergeAudit(aggregate, audit, 'CI');

    const pers = buildPersistenceAssertions({
      auditProfile: 'ci',
      viewState: view,
      allSeasons: allSeasonsMsg.payload?.seasons ?? null,
      allSeasonsProbeOk: probeHandlerSucceeded(allSeasonsMsg),
      transactionsRecent: txMsg.payload?.transactions ?? [],
      expectArchive: false,
      expectTransactions: false,
      transactionsRecentProbeOk: probeHandlerSucceeded(txMsg),
      transactionsRecentHasExpectedData: payloadArrayHasRows(txMsg.payload, 'transactions'),
      expectStatRows: false,
      expectTimelineRows: false,
      seasonTxQuerySkipped: true,
      getSeasonHistorySkipped: true,
      recordsProbeOk: probeHandlerSucceeded(recordsMsg) && !!(recordsMsg.payload?.recordBook || recordsMsg.payload?.records),
      recordsProbeSkipped: false,
      hofProbeOk: probeHandlerSucceeded(hofMsg) && (!hofMsg.payload || Array.isArray(hofMsg.payload?.players)),
      hofProbeSkipped: false,
      draftClassesProbeSkipped: true,
      expectDraftClasses: false,
      draftClassCount: 0,
      saveNowOk,
      auditCheckpoint,
      skippedProbeReasons,
    });
    aggregate.persistenceAssertions = pers.assertions;
    if (!pers.allOk) {
      aggregate.passed = false;
      aggregate.failures.push({
        code: 'persistence_probe_failed',
        message: 'One or more CI persistence/probe assertions failed; see persistenceAssertions in latest.json',
      });
    }

    return finalizeAggregate(aggregate, t0, view, lastReportSummary);
  } catch (e) {
    aggregate.passed = false;
    aggregate.failures.push({ code: e?.code || 'runner_fatal', message: e?.message || String(e) });
    return finalizeAggregate(aggregate, t0, view, lastReportSummary);
  } finally {
    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = false;
    globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = false;
    globalThis.__DYNASTY_SOAK_PROFILE__ = false;
    globalThis.__DYNASTY_SOAK_AUDIT_CHECKPOINT_ENABLED__ = false;
    globalThis.__DYNASTY_SOAK_LAST_BATCH__ = undefined;
    globalThis.__dynastySoakBroadcast = null;
  }
}

/**
 * @param {DynastySoakRunnerOptions} opts
 */
export async function runDynastySoakOnce(opts = {}) {
  const auditProfile = String(opts.runnerProfile ?? opts.auditProfile ?? (opts.ci ? 'ci' : 'full')).toLowerCase();
  if (auditProfile === 'ci') return runCiDynastySoakOnce({ ...opts, ci: true, auditProfile: 'ci' });
  return runFullDynastySoakOnce({ ...opts, ci: false, auditProfile: opts.auditProfile ?? 'full' });
}

export async function runDynastySoakMultiSeed(opts = {}) {
  const seeds = Array.isArray(opts.seeds) && opts.seeds.length ? opts.seeds : [1383, 1408, 1426];
  const t0 = Date.now();
  const seedResults = [];
  const runOne = typeof opts.runOne === 'function' ? opts.runOne : runDynastySoakOnce;
  for (const seed of seeds) {
    if (typeof opts.onSeedStart === 'function') opts.onSeedStart(seed, seedResults.length + 1, seeds.length);
    const result = await runOne({
      ...opts,
      seed,
      seeds: undefined,
      auditProfile: opts.auditProfile ?? opts.runnerProfile ?? 'ci',
      runnerProfile: opts.runnerProfile ?? 'ci',
      ci: (opts.runnerProfile ?? 'ci') === 'ci',
    });
    seedResults.push({ ...result, seed });
    if (typeof opts.onSeedComplete === 'function') opts.onSeedComplete(seedResults[seedResults.length - 1], seedResults.length, seeds.length);
  }
  return buildMultiSeedAggregate({ profileConfig: opts, seedResults, t0 });
}
