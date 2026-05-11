import { describe, expect, it } from 'vitest';
import {
  buildPersistenceAssertions,
  validateTransactionTimelineV1Shape,
} from '../../src/core/dynastySoakAudit.js';
import { probeHandlerSucceeded, payloadArrayHasRows } from '../../src/testSupport/dynastySoakRunner.js';

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
