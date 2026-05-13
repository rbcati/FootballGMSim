import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toUI, toWorker } from '../../src/worker/protocol.js';

const okSummary = {
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

vi.mock('../../src/core/dynastySoakAudit.js', () => ({
  runDynastySoakAudit: vi.fn(() => ({
    passed: true,
    severity: 'ok',
    seasonsSimmed: 1,
    checks: [],
    warnings: [],
    failures: [],
    summary: okSummary,
    reportSummary: { teamCount: 32 },
  })),
  buildPersistenceAssertions: vi.fn(() => ({
    allOk: true,
    assertions: [],
  })),
}));


function makeAuditCheckpoint(realWeeksSimulated = 2) {
  return {
    ok: true,
    auditOnly: true,
    archiveType: 'audit_checkpoint',
    completedSeason: false,
    sourcePhase: 'regular',
    sourceYear: 2026,
    realWeeksSimulated,
    exercised: {
      forcedDirtyFlush: { status: 'exercised', detail: 'ok' },
      dbAuditCheckpointWriteRead: { status: 'exercised', detail: 'ok' },
    },
    skipped: [
      { system: 'completedSeasonArchive', reason: 'archiveSeason is not called for partial CI runs' },
    ],
  };
}

function makeState({ phase, year }) {
  return {
    phase,
    year,
    userTeamId: 0,
    seasonId: `s${year}`,
    leagueHistory: [{ id: `s${year - 1}`, year: year - 1 }],
    teams: [],
    standings: [],
    schedule: { weeks: [] },
  };
}

describe('runDynastySoakOnce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs CI profile as a short real-worker path without SIM_TO_PHASE', async () => {
    const calls = [];
    const bootState = makeState({ phase: 'preseason', year: 2026 });
    const regularState = { ...makeState({ phase: 'regular', year: 2026 }), currentWeek: 1 };
    const week2State = { ...makeState({ phase: 'regular', year: 2026 }), currentWeek: 2 };
    const week3State = { ...makeState({ phase: 'regular', year: 2026 }), currentWeek: 3 };

    const dispatchWorker = vi.fn(async (type, payload = {}) => {
      calls.push({ type, payload });
      switch (type) {
        case toWorker.INIT:
          return { type: toUI.READY, payload: {} };
        case toWorker.USE_SAFE_STARTER_LEAGUE:
          return { type: toUI.FULL_STATE, payload: bootState };
        case toWorker.ADVANCE_WEEK: {
          const advanceCount = calls.filter((c) => c.type === toWorker.ADVANCE_WEEK).length;
          return {
            type: toUI.WEEK_COMPLETE,
            payload: advanceCount === 1 ? regularState : advanceCount === 2 ? week2State : week3State,
          };
        }
        case toWorker.SAVE_NOW:
          return { type: toUI.SAVED, payload: {} };
        case toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT:
          return { type: toUI.DYNASTY_AUDIT_CHECKPOINT, payload: makeAuditCheckpoint(payload.realWeeksSimulated) };
        case toWorker.GET_ALL_SEASONS:
          return { type: toUI.ALL_SEASONS, payload: { seasons: [] } };
        case toWorker.GET_TRANSACTIONS:
          return { type: toUI.TRANSACTIONS, payload: { transactions: [] } };
        case toWorker.GET_RECORDS:
          return { type: toUI.RECORDS, payload: { recordBook: {} } };
        case toWorker.GET_HALL_OF_FAME:
          return { type: toUI.HALL_OF_FAME, payload: { players: [] } };
        case toWorker.SIM_TO_PHASE:
          throw new Error('CI profile must not call SIM_TO_PHASE');
        default:
          throw new Error(`Unexpected worker call: ${type}`);
      }
    });

    const loadWorkerModule = vi.fn(async () => {});
    const { runDynastySoakOnce } = await import('../../src/testSupport/dynastySoakRunner.js');
    const result = await runDynastySoakOnce({
      seasons: 9,
      seed: 123,
      ci: true,
      auditProfile: 'ci',
      dispatchWorker,
      loadWorkerModule,
    });

    expect(loadWorkerModule).toHaveBeenCalledTimes(1);
    expect(calls.map((c) => c.type)).toContain(toWorker.INIT);
    expect(calls.map((c) => c.type)).toContain(toWorker.USE_SAFE_STARTER_LEAGUE);
    expect(calls.filter((c) => c.type === toWorker.ADVANCE_WEEK)).toHaveLength(3);
    expect(calls.some((c) => c.type === toWorker.SIM_TO_PHASE)).toBe(false);
    expect(calls.some((c) => c.type === toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT)).toBe(true);
    expect(result.auditProfile).toBe('ci');
    expect(result.phasePath).toBe('short');
    expect(result.seasonsSimmed).toBe(1); // mocked pure audit return; report still labels CI as short path
    expect(result.finalPhase).toBe('regular');
    expect(result.exerciseMatrix.regularWeeks).toMatchObject({ status: 'exercised', count: 2 });
    expect(result.exerciseMatrix.playoffs.status).toBe('skipped');
    expect(result.exerciseMatrix.offseason.status).toBe('skipped');
    expect(result.exerciseMatrix.draft.status).toBe('skipped');
    expect(result.exerciseMatrix.fullSeasonArchive.status).toBe('skipped');
    expect(result.exerciseMatrix.auditCheckpoint.status).toBe('exercised_partial');
    expect(result.auditCheckpoint).toMatchObject({ auditOnly: true, completedSeason: false, archiveType: 'audit_checkpoint' });
    expect(result.auditCheckpoint.exercised.getAllSeasonsHandler.status).toBe('exercised');
    expect(result.auditCheckpoint.exercised.getRecordsHandler.status).toBe('exercised');
  });


  it('fails CI profile when an exercised worker probe reports an error', async () => {
    const auditModule = await import('../../src/core/dynastySoakAudit.js');
    auditModule.buildPersistenceAssertions.mockReturnValueOnce({
      allOk: false,
      assertions: [
        {
          id: 'get_records',
          ok: false,
          code: 'get_records_failed',
          detail: 'GET_RECORDS failed: indexeddb read failed',
        },
        {
          id: 'get_draft_classes',
          ok: true,
          status: 'skipped',
          skipped: true,
          detail: 'skipped: CI profile does not enter draft, so draft classes are not expected',
        },
      ],
    });

    const bootState = makeState({ phase: 'regular', year: 2026 });
    const week2State = { ...makeState({ phase: 'regular', year: 2026 }), currentWeek: 2 };
    const week3State = { ...makeState({ phase: 'regular', year: 2026 }), currentWeek: 3 };
    let advanceCount = 0;
    const dispatchWorker = vi.fn(async (type, payload = {}) => {
      switch (type) {
        case toWorker.INIT:
          return { type: toUI.READY, payload: {} };
        case toWorker.USE_SAFE_STARTER_LEAGUE:
          return { type: toUI.FULL_STATE, payload: bootState };
        case toWorker.ADVANCE_WEEK:
          advanceCount += 1;
          return { type: toUI.WEEK_COMPLETE, payload: advanceCount === 1 ? week2State : week3State };
        case toWorker.SAVE_NOW:
          return { type: toUI.SAVED, payload: {} };
        case toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT:
          return { type: toUI.DYNASTY_AUDIT_CHECKPOINT, payload: makeAuditCheckpoint(payload.realWeeksSimulated) };
        case toWorker.GET_ALL_SEASONS:
          return { type: toUI.ALL_SEASONS, payload: { seasons: [] } };
        case toWorker.GET_TRANSACTIONS:
          return { type: toUI.TRANSACTIONS, payload: { transactions: [] } };
        case toWorker.GET_RECORDS:
          return { type: toUI.ERROR, payload: { message: 'indexeddb read failed' } };
        case toWorker.GET_HALL_OF_FAME:
          return { type: toUI.HALL_OF_FAME, payload: { players: [] } };
        case toWorker.SIM_TO_PHASE:
          throw new Error('CI profile must not call SIM_TO_PHASE');
        default:
          throw new Error(`Unexpected worker call: ${type}`);
      }
    });

    const { runDynastySoakOnce } = await import('../../src/testSupport/dynastySoakRunner.js');
    const result = await runDynastySoakOnce({
      auditProfile: 'ci',
      ci: true,
      dispatchWorker,
      loadWorkerModule: vi.fn(async () => {}),
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContainEqual({
      code: 'persistence_probe_failed',
      message: 'One or more CI persistence/probe assertions failed; see persistenceAssertions in latest.json',
    });
    expect(result.persistenceAssertions.find((a) => a.id === 'get_records').ok).toBe(false);
    expect(result.persistenceAssertions.find((a) => a.id === 'get_draft_classes').status).toBe('skipped');
  });

  it('uses injected worker hooks for deep final probes without deepEachSeason', async () => {
    const calls = [];
    const bootState = makeState({ phase: 'regular', year: 2026 });
    const finalState = {
      ...makeState({ phase: 'preseason', year: 2027 }),
      seasonId: 's2027',
      leagueHistory: [
        { id: 's2023', year: 2023 },
        { id: 's2024', year: 2024 },
        { id: 's2025', year: 2025 },
        { id: 's2026', year: 2026 },
      ],
    };
    const draftClasses = [
      { seasonId: 's2026', year: 2026 },
      { seasonId: 's2025', year: 2025 },
    ];

    const dispatchWorker = vi.fn(async (type, payload = {}) => {
      calls.push({ type, payload });
      switch (type) {
        case toWorker.INIT:
          return { type: toUI.READY, payload: {} };
        case toWorker.USE_SAFE_STARTER_LEAGUE:
          return { type: toUI.FULL_STATE, payload: bootState };
        case toWorker.SIM_TO_PHASE:
          expect(payload).toEqual({ targetPhase: 'preseason' });
          return { type: toUI.FULL_STATE, payload: finalState };
        case toWorker.GET_ALL_SEASONS:
          return { type: toUI.ALL_SEASONS, payload: { seasons: finalState.leagueHistory } };
        case toWorker.GET_TRANSACTIONS:
          return { type: toUI.TRANSACTIONS, payload: { transactions: [] } };
        case toWorker.GET_RECORDS:
          return { type: toUI.RECORDS, payload: { recordBook: {} } };
        case toWorker.GET_HALL_OF_FAME:
          return { type: toUI.HALL_OF_FAME, payload: { players: [] } };
        case toWorker.GET_DRAFT_CLASSES:
          return { type: toUI.DRAFT_CLASSES, payload: { classes: draftClasses } };
        case toWorker.GET_SEASON_HISTORY:
          return {
            type: toUI.SEASON_HISTORY,
            payload: { seasonId: payload.seasonId, data: { id: payload.seasonId } },
          };
        case toWorker.GET_DRAFT_CLASS:
          return {
            type: toUI.DRAFT_CLASS,
            payload: { seasonId: payload.seasonId, model: { seasonId: payload.seasonId } },
          };
        case toWorker.ADVANCE_WEEK:
          return { type: toUI.WEEK_COMPLETE, payload: finalState };
        default:
          throw new Error(`Unexpected worker call: ${type}`);
      }
    });
    const loadWorkerModule = vi.fn(async () => {});

    const { runDynastySoakOnce } = await import('../../src/testSupport/dynastySoakRunner.js');
    const result = await runDynastySoakOnce({
      seasons: 1,
      seed: 123,
      deep: true,
      deepEachSeason: false,
      dispatchWorker,
      loadWorkerModule,
    });

    expect(loadWorkerModule).toHaveBeenCalledTimes(1);
    expect(result.auditProfile).toBe('full');
    expect(result.harnessConfig.deep).toBe(true);
    expect(result.harnessConfig.deepEachSeason).toBe(false);

    expect(calls.some((c) => c.type === toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT)).toBe(false);

    expect(calls).toContainEqual({
      type: toWorker.GET_TRANSACTIONS,
      payload: { mode: 'recent', limit: 1000 },
    });
    expect(calls).toContainEqual({
      type: toWorker.GET_TRANSACTIONS,
      payload: { seasonId: 's2026', limit: 1000 },
    });

    const seasonHistoryCalls = calls.filter((c) => c.type === toWorker.GET_SEASON_HISTORY);
    for (const seasonId of ['s2023', 's2024', 's2025', 's2026']) {
      expect(seasonHistoryCalls).toContainEqual({
        type: toWorker.GET_SEASON_HISTORY,
        payload: { seasonId },
      });
    }

    const draftClassCalls = calls.filter((c) => c.type === toWorker.GET_DRAFT_CLASS);
    expect(draftClassCalls).toEqual([
      { type: toWorker.GET_DRAFT_CLASS, payload: { seasonId: 's2026' } },
      { type: toWorker.GET_DRAFT_CLASS, payload: { seasonId: 's2025' } },
    ]);

    expect(result.persistenceAssertions.map((assertion) => assertion.id)).toEqual(expect.arrayContaining([
      'deep_archive_history_sample',
      'deep_draft_class_model_sample',
    ]));
  });


  it('fails CI profile when the audit checkpoint returns ok false', async () => {
    const bootState = makeState({ phase: 'regular', year: 2026 });
    const week2State = { ...makeState({ phase: 'regular', year: 2026 }), currentWeek: 2 };
    let advanceCount = 0;
    const dispatchWorker = vi.fn(async (type) => {
      switch (type) {
        case toWorker.INIT:
          return { type: toUI.READY, payload: {} };
        case toWorker.USE_SAFE_STARTER_LEAGUE:
          return { type: toUI.FULL_STATE, payload: bootState };
        case toWorker.ADVANCE_WEEK:
          advanceCount += 1;
          return { type: toUI.WEEK_COMPLETE, payload: week2State };
        case toWorker.SAVE_NOW:
          return { type: toUI.SAVED, payload: {} };
        case toWorker.RUN_DYNASTY_AUDIT_CHECKPOINT:
          return { type: toUI.DYNASTY_AUDIT_CHECKPOINT, payload: { ok: false, error: 'guard failed' } };
        case toWorker.GET_ALL_SEASONS:
          return { type: toUI.ALL_SEASONS, payload: { seasons: [] } };
        case toWorker.GET_TRANSACTIONS:
          return { type: toUI.TRANSACTIONS, payload: { transactions: [] } };
        case toWorker.GET_RECORDS:
          return { type: toUI.RECORDS, payload: { recordBook: {} } };
        case toWorker.GET_HALL_OF_FAME:
          return { type: toUI.HALL_OF_FAME, payload: { players: [] } };
        default:
          throw new Error(`Unexpected worker call: ${type}`);
      }
    });

    const { runDynastySoakOnce } = await import('../../src/testSupport/dynastySoakRunner.js');
    const result = await runDynastySoakOnce({ auditProfile: 'ci', ci: true, dispatchWorker, loadWorkerModule: vi.fn(async () => {}) });

    expect(result.passed).toBe(false);
    expect(result.exerciseMatrix.auditCheckpoint.status).toBe('failed');
    expect(result.failures.some((f) => f.code === 'audit_checkpoint_failed')).toBe(true);
  });


  it('aggregates multi-seed pass/fail results and groups warnings by seed', async () => {
    const { runDynastySoakMultiSeed } = await import('../../src/testSupport/dynastySoakRunner.js');
    const result = await runDynastySoakMultiSeed({
      auditProfile: 'multi-seed-ci',
      runnerProfile: 'ci',
      seeds: [1383, 1408, 1426],
      seasons: 1,
      phaseTimeoutMs: 10000,
      runOne: vi.fn(async ({ seed }) => ({
        seed,
        passed: seed !== 1408,
        severity: seed === 1408 ? 'error' : seed === 1426 ? 'warn' : 'ok',
        runtimeMs: seed - 1300,
        seasonsSimmed: 0,
        finalPhase: 'regular',
        finalYear: 2026,
        failures: seed === 1408 ? [{ code: 'runner_fatal', message: 'boom' }] : [],
        warnings: seed === 1426 ? [{ code: 'hof_empty_young', message: 'young league warning' }] : [],
        persistenceAssertions: seed === 1408 ? [{ id: 'get_records', ok: false, detail: 'failed' }] : [],
        reportSummary: {
          economyRegressionSnapshot: seed === 1383
            ? { teamsOverCap: 1, teamsWithPendingOfferOvercommit: 0, pendingOfferOvercommitCount: 0, duplicateExpensiveSameGroupOffers: 0, oldVeteranOffersByRebuildTeams: 0, contenderVeteranOfferCount: 0, severeQbNeedOfferCount: 0, premiumYoungPlayerTradeDiscountFlags: 0, expensiveVeteranSwapFlags: 0, cpuOfferCount: 3, unknownOfferValueCount: 0, skippedReasons: [], warnings: [] }
            : null,
        },
      })),
    });

    expect(result.multiSeed).toBe(true);
    expect(result.passed).toBe(false);
    expect(result.seedCount).toBe(3);
    expect(result.passCount).toBe(2);
    expect(result.failCount).toBe(1);
    expect(result.failuresBySeed).toHaveLength(1);
    expect(result.failuresBySeed[0].seed).toBe(1408);
    expect(result.warningsBySeed).toHaveLength(1);
    expect(result.warningsBySeed[0].warningsByCode.hof_empty_young).toBe(1);
    expect(result.economyAggregate.snapshotsPresent).toBe(1);
    expect(result.economyAggregate.totals.teamsOverCap).toBe(1);
    expect(result.economyAggregate.skippedReasonsBySeed.some((row) => row.code === 'economy_snapshot_missing')).toBe(true);
    expect(result.persistenceWarningsBySeed[0].seed).toBe(1408);
  });

  it('can fail multi-seed on warnings only when strict mode is requested', async () => {
    const { runDynastySoakMultiSeed } = await import('../../src/testSupport/dynastySoakRunner.js');
    const base = {
      auditProfile: 'multi-seed-ci',
      runnerProfile: 'ci',
      seeds: [1383],
      runOne: vi.fn(async ({ seed }) => ({
        seed,
        passed: true,
        severity: 'warn',
        runtimeMs: 1,
        failures: [],
        warnings: [{ code: 'hof_empty_young', message: 'young league warning' }],
        persistenceAssertions: [],
        reportSummary: { economyRegressionSnapshot: null },
      })),
    };
    expect((await runDynastySoakMultiSeed(base)).passed).toBe(true);
    expect((await runDynastySoakMultiSeed({ ...base, failOnWarnings: true })).passed).toBe(false);
  });


  it('keeps stability-v1 aggregation on the full-season runner profile', async () => {
    const { runDynastySoakMultiSeed } = await import('../../src/testSupport/dynastySoakRunner.js');
    const runOne = vi.fn(async ({ seed, auditProfile, runnerProfile, ci, seasons }) => ({
      seed,
      auditProfile,
      runnerProfile,
      passed: true,
      severity: 'ok',
      runtimeMs: 5,
      seasonsSimmed: seasons,
      finalPhase: 'preseason',
      finalYear: 2031,
      failures: [],
      warnings: [],
      persistenceAssertions: [{ id: 'reload_same_persistence_path', ok: true, detail: 'ok' }],
      reloadSummary: { ok: true, before: { year: 2031 }, after: { year: 2031, phase: 'preseason', teamCount: 32, currentSeasonId: 's2031', completedSeasonCount: 5, transactionCountSample: 20, userTeamId: 0 }, mismatches: [] },
      reportSummary: { economyRegressionSnapshot: { teamsOverCap: 0, teamsWithPendingOfferOvercommit: 0, pendingOfferOvercommitCount: 0, duplicateExpensiveSameGroupOffers: 0, oldVeteranOffersByRebuildTeams: 0, contenderVeteranOfferCount: 0, severeQbNeedOfferCount: 0, premiumYoungPlayerTradeDiscountFlags: 0, expensiveVeteranSwapFlags: 0, cpuOfferCount: 0, unknownOfferValueCount: 0, skippedReasons: [], warnings: [] } },
      finalView: { seasonId: 's2031', userTeamId: 0, leagueHistory: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }] },
      harnessConfig: { ci },
    }));

    const result = await runDynastySoakMultiSeed({
      auditProfile: 'stability-v1',
      runnerProfile: 'full',
      phasePath: 'full-season',
      seeds: [1383, 1408],
      seasons: 5,
      runOne,
    });

    expect(runOne).toHaveBeenCalledWith(expect.objectContaining({ auditProfile: 'stability-v1', runnerProfile: 'full', ci: false, seasons: 5 }));
    expect(result.auditProfile).toBe('stability-v1');
    expect(result.runnerProfile).toBe('full');
    expect(result.seedSummaries[0].completedSeasonCount).toBe(5);
    expect(result.persistenceReloadSummary[0].ok).toBe(true);
  });

});
