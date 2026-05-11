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

  it('advances out of boot preseason before simming to the next preseason in CI mode', async () => {
    const calls = [];
    const bootState = makeState({ phase: 'preseason', year: 2026 });
    const regularState = makeState({ phase: 'regular', year: 2026 });
    const nextPreseasonState = makeState({ phase: 'preseason', year: 2027 });

    const dispatchWorker = vi.fn(async (type, payload = {}) => {
      calls.push({ type, payload });
      switch (type) {
        case toWorker.INIT:
          return { type: toUI.READY, payload: {} };
        case toWorker.USE_SAFE_STARTER_LEAGUE:
          return { type: toUI.FULL_STATE, payload: bootState };
        case toWorker.ADVANCE_WEEK:
          return {
            type: toUI.WEEK_COMPLETE,
            payload: calls.filter((c) => c.type === toWorker.ADVANCE_WEEK).length === 1
              ? regularState
              : makeState({ phase: 'regular', year: 2027 }),
          };
        case toWorker.SIM_TO_PHASE:
          expect(payload).toEqual({ targetPhase: 'preseason' });
          return { type: toUI.FULL_STATE, payload: nextPreseasonState };
        case toWorker.GET_ALL_SEASONS:
          return { type: toUI.ALL_SEASONS, payload: { seasons: [{ id: 's2026', year: 2026 }] } };
        case toWorker.GET_TRANSACTIONS:
          return { type: toUI.TRANSACTIONS, payload: { transactions: [] } };
        case toWorker.GET_RECORDS:
          return { type: toUI.RECORDS, payload: { recordBook: {} } };
        case toWorker.GET_HALL_OF_FAME:
          return { type: toUI.HALL_OF_FAME, payload: { players: [] } };
        case toWorker.GET_DRAFT_CLASSES:
          return { type: toUI.DRAFT_CLASSES, payload: { classes: [] } };
        case toWorker.GET_SEASON_HISTORY:
          return { type: toUI.SEASON_HISTORY, payload: { data: {} } };
        default:
          throw new Error(`Unexpected worker call: ${type}`);
      }
    });

    const { runDynastySoakOnce } = await import('../../src/testSupport/dynastySoakRunner.js');
    const result = await runDynastySoakOnce({
      seasons: 1,
      seed: 123,
      ci: true,
      dispatchWorker,
      loadWorkerModule: vi.fn(async () => {}),
    });

    const advanceIndex = calls.findIndex((c) => c.type === toWorker.ADVANCE_WEEK);
    const simIndex = calls.findIndex((c) => c.type === toWorker.SIM_TO_PHASE);
    expect(advanceIndex).toBeGreaterThan(-1);
    expect(simIndex).toBeGreaterThan(advanceIndex);
    expect(result.finalPhase).toBe('preseason');
    expect(result.finalYear).toBe(2027);
    expect(result.failures).toEqual([]);

    const checkpoint = result.checkpoints.find((c) => c.name === 'S1.advance_out_of_preseason');
    expect(checkpoint?.meta).toMatchObject({
      phaseBefore: 'preseason',
      phaseAfter: 'regular',
      yearBefore: 2026,
      yearAfter: 2026,
      advances: 1,
    });

    const simAttempt = result.simAttemptsPerSeason[0].attempts[0];
    expect(simAttempt).toMatchObject({ phaseAfter: 'preseason', yearAfter: 2027 });
    expect(simAttempt.yearAfter).toBeGreaterThan(checkpoint.meta.yearBefore);
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
    expect(result.harnessConfig.deep).toBe(true);
    expect(result.harnessConfig.deepEachSeason).toBe(false);

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

    expect(result.persistenceAssertions.map((assertion) => assertion.id)).toEqual([
      'deep_archive_history_sample',
      'deep_draft_class_model_sample',
    ]);
  });

});
