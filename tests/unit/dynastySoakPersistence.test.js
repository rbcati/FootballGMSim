import { describe, expect, it } from 'vitest';
import {
  buildPersistenceAssertions,
  validateTransactionTimelineV1Shape,
} from '../../src/core/dynastySoakAudit.js';
import {
  createEmptyDirtySnapshot,
  hasDirtySnapshot,
  mergeDirtySnapshots,
  queueDirtySnapshot,
} from '../../src/worker/dirtyFlushAccumulator.js';

describe('dynasty soak batch dirty accumulator', () => {
  it('keeps dirty IDs drained during batch and merges them into final flush', () => {
    const drainedDuringBatch = {
      meta: true,
      teams: [1],
      players: ['p1'],
      games: [{ id: 'g1' }],
      seasonStats: ['s1_p1'],
      draftPicks: ['2028_1_1'],
    };
    const dirtyAtForcedFlush = {
      meta: false,
      teams: [2],
      players: ['p1', 'p2'],
      games: [{ id: 'g2' }],
      seasonStats: ['s1_p2'],
      draftPicks: ['2028_1_2'],
    };

    const pending = queueDirtySnapshot(createEmptyDirtySnapshot(), drainedDuringBatch);
    const finalDirty = mergeDirtySnapshots(pending, dirtyAtForcedFlush);

    expect(hasDirtySnapshot(finalDirty)).toBe(true);
    expect(finalDirty.meta).toBe(true);
    expect(finalDirty.teams).toEqual([1, 2]);
    expect(finalDirty.players).toEqual(['p1', 'p2']);
    expect(finalDirty.games.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(finalDirty.seasonStats).toEqual(['s1_p1', 's1_p2']);
    expect(finalDirty.draftPicks).toEqual(['2028_1_1', '2028_1_2']);
  });
});

describe('buildPersistenceAssertions', () => {
  it('fails when leagueHistory has no latest season', () => {
    const r = buildPersistenceAssertions({
      viewState: { leagueHistory: [] },
      transactionsRecent: [{ type: 'X' }],
      expectTransactions: false,
      getSeasonHistoryOk: true,
      getSeasonHistorySkipped: false,
      recordsProbeOk: true,
      hofProbeOk: true,
      draftClassesProbeOk: true,
      draftClassCount: 0,
    });
    expect(r.allOk).toBe(false);
    expect(r.assertions.find((a) => a.id === 'latest_season_archive')?.ok).toBe(false);
  });

  it('fails transaction timeline when rows are malformed type', () => {
    expect(validateTransactionTimelineV1Shape({ schemaVersion: 1, rows: {} }).ok).toBe(false);
  });

  it('fails when latest completed season is missing from DB-backed archive probes', () => {
    const r = buildPersistenceAssertions({
      viewState: {
        leagueHistory: [
          {
            id: 's2',
            playerSeasonStatsV1: { schemaVersion: 1, rows: [{ playerId: 1, pos: 'QB' }] },
            transactionTimelineV1: { schemaVersion: 1, rows: [{ rawId: 1, type: 'draft' }] },
          },
        ],
      },
      allSeasons: [{ id: 's2' }],
      seasonHistory: { id: 's2' },
      transactionsRecent: [{ type: 'DRAFT' }, { type: 'SIGN' }],
      transactionsSeason: [{ type: 'SIGN' }],
      dbLatestSeasonFound: false,
      dbAllSeasons: [],
      dbTransactions: [{ type: 'DRAFT' }],
      expectedTransactionTypes: ['draft', 'signing'],
      expectTransactions: true,
      expectStatRows: true,
      expectTimelineRows: true,
      seasonTxQueryOk: true,
      getSeasonHistoryOk: true,
      getSeasonHistorySkipped: false,
      recordsProbeOk: true,
      hofProbeOk: true,
      draftClassesProbeOk: true,
      draftClassCount: 1,
    });
    expect(r.allOk).toBe(false);
    expect(r.assertions.find((a) => a.id === 'db_latest_season_archive')?.ok).toBe(false);
    expect(r.assertions.find((a) => a.id === 'db_all_seasons_latest')?.ok).toBe(false);
  });

  it('passes minimal healthy snapshot', () => {
    const r = buildPersistenceAssertions({
      viewState: {
        leagueHistory: [
          {
            id: 's1',
            playerSeasonStatsV1: { schemaVersion: 1, rows: [{ playerId: 1, pos: 'QB' }] },
            transactionTimelineV1: { schemaVersion: 1, rows: [{ rawId: 1, type: 'draft' }] },
          },
        ],
      },
      transactionsRecent: [{ type: 'DRAFT' }],
      expectTransactions: true,
      expectStatRows: true,
      expectTimelineRows: true,
      seasonTxQueryOk: true,
      getSeasonHistoryOk: true,
      getSeasonHistorySkipped: false,
      recordsProbeOk: true,
      hofProbeOk: true,
      draftClassesProbeOk: true,
      draftClassCount: 1,
    });
    expect(r.allOk).toBe(true);
  });

  it('fails clearly when GET_TRANSACTIONS returns an ok:false empty payload', () => {
    const txMsg = { type: 'TRANSACTIONS', payload: { ok: false, error: 'indexeddb read failed', transactions: [] } };
    const r = buildPersistenceAssertions({
      viewState: {
        leagueHistory: [
          {
            id: 's1',
            playerSeasonStatsV1: { schemaVersion: 1, rows: [] },
            transactionTimelineV1: { schemaVersion: 1, rows: [] },
          },
        ],
      },
      transactionsRecent: txMsg.payload.transactions,
      expectTransactions: true,
      transactionsRecentProbeOk: probeHandlerSucceeded(txMsg),
      transactionsRecentHasExpectedData: payloadArrayHasRows(txMsg.payload, 'transactions'),
      expectStatRows: false,
      expectTimelineRows: false,
      seasonTxQueryOk: true,
      getSeasonHistoryOk: true,
      recordsProbeOk: true,
      hofProbeOk: true,
      draftClassesProbeOk: true,
      draftClassesHasExpectedData: false,
      expectDraftClasses: false,
      draftClassCount: 0,
    });

    expect(r.allOk).toBe(false);
    expect(r.assertions.find((a) => a.code === 'get_transactions_failed')?.ok).toBe(false);
  });

  it('fails clearly when GET_DRAFT_CLASSES returns an ok:false empty payload', () => {
    const draftMsg = { type: 'DRAFT_CLASSES', payload: { ok: false, error: 'transaction read failed', classes: [] } };
    const r = buildPersistenceAssertions({
      viewState: {
        leagueHistory: [
          {
            id: 's1',
            playerSeasonStatsV1: { schemaVersion: 1, rows: [] },
            transactionTimelineV1: { schemaVersion: 1, rows: [] },
          },
        ],
      },
      transactionsRecent: [{ type: 'DRAFT' }],
      expectTransactions: true,
      transactionsRecentProbeOk: true,
      transactionsRecentHasExpectedData: true,
      expectStatRows: false,
      expectTimelineRows: false,
      seasonTxQueryOk: true,
      getSeasonHistoryOk: true,
      recordsProbeOk: true,
      hofProbeOk: true,
      draftClassesProbeOk: probeHandlerSucceeded(draftMsg),
      draftClassesHasExpectedData: payloadArrayHasRows(draftMsg.payload, 'classes'),
      expectDraftClasses: true,
      draftClassCount: 0,
    });

    expect(r.allOk).toBe(false);
    expect(r.assertions.find((a) => a.code === 'get_draft_classes_failed')?.ok).toBe(false);
  });

});
