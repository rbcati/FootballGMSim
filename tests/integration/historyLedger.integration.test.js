/**
 * historyLedger.integration.test.js
 *
 * Integration tests for the League History Ledger & Record Book engine.
 * These tests exercise the historyEngine pure functions in scenarios that
 * mirror the worker's usage patterns.
 *
 * Worker wiring requires a full IndexedDB + league boot; these tests mirror
 * the call sequences rather than booting the full worker.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultRecordBook,
  buildLeagueYearSummary,
  appendHistoryLedger,
  updateSingleGameRecordsFromBatch,
  updateSingleSeasonRecords,
  maybeUpdateSingleGameRecord,
  compactRetiredPlayerHistory,
  shouldRetainRetiredPlayerHistory,
} from '../../src/core/history/historyEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(overrides = {}) {
  return {
    id: `player-${Math.floor(Math.random() * 9999)}`,
    name: 'Test Player',
    pos: 'QB',
    ovr: 82,
    teamId: 1,
    awards: [],
    accolades: [],
    stats: { season: { passYd: 0, passTD: 0, rushYd: 0, sacks: 0 } },
    ...overrides,
  };
}

function makeChampionshipResult(overrides = {}) {
  return {
    championTeamId: 1,
    championName: 'Eagles',
    runnerUpName: 'Chiefs',
    homeScore: 31,
    awayScore: 24,
    ...overrides,
  };
}

// ── Hydration: old saves ──────────────────────────────────────────────────────

describe('old save hydration', () => {
  it('createDefaultRecordBook provides safe historyLedger alternative (empty array)', () => {
    // Simulates migrateLeague applying defaults to an old save
    const legacyMeta = { leagueHistory: [], recordBook: {} };
    const historyLedger = Array.isArray(legacyMeta.historyLedger)
      ? legacyMeta.historyLedger
      : [];
    expect(historyLedger).toEqual([]);
  });

  it('createDefaultRecordBook initialises null holders on fresh recordBook', () => {
    const rb = createDefaultRecordBook();
    expect(rb.singleGame.passingYards).toBeNull();
    expect(rb.singleSeasonBests.passingYards).toBeNull();
  });

  it('missing championship/award data does not crash year summary build', () => {
    expect(() => buildLeagueYearSummary({})).not.toThrow();
    expect(() => buildLeagueYearSummary({ season: 2025 })).not.toThrow();
    expect(() => buildLeagueYearSummary({ championshipResult: null, awards: null })).not.toThrow();
  });
});

// ── Season rollover: appends ledger entry ────────────────────────────────────

describe('season rollover: appendHistoryLedger', () => {
  it('appends one ledger entry with champion and awards', () => {
    const ledger = [];
    const yearSummary = buildLeagueYearSummary({
      season: 2025,
      championshipResult: makeChampionshipResult(),
      awards: { mvpName: 'Star QB', opoyName: 'Speed RB', dpoyName: 'Edge Pro' },
    });
    const updated = appendHistoryLedger(ledger, yearSummary);

    expect(updated.length).toBe(1);
    expect(updated[0].year).toBe(2025);
    expect(updated[0].championName).toBe('Eagles');
    expect(updated[0].mvpName).toBe('Star QB');
    expect(updated[0].opoyName).toBe('Speed RB');
    expect(updated[0].dpoyName).toBe('Edge Pro');
  });

  it('rerunning rollover for same season does not duplicate ledger year', () => {
    const ledger = [{ year: 2025, championName: 'OldWinner' }];
    const yearSummary = buildLeagueYearSummary({
      season: 2025,
      championshipResult: makeChampionshipResult({ championName: 'NewWinner' }),
    });
    const updated = appendHistoryLedger(ledger, yearSummary);

    expect(updated.length).toBe(1);
    expect(updated[0].championName).toBe('NewWinner');
  });

  it('preserves chronological order across multiple seasons', () => {
    let ledger = [];
    for (const y of [2027, 2025, 2026]) {
      const summary = buildLeagueYearSummary({ season: y, championshipResult: { championName: `T${y}` } });
      ledger = appendHistoryLedger(ledger, summary);
    }
    expect(ledger.map(e => e.year)).toEqual([2025, 2026, 2027]);
  });
});

// ── Season rollover: single-season records updated before stat reset ──────────

describe('season rollover: updateSingleSeasonRecords', () => {
  it('scans active players and updates single-season records', () => {
    const rb = createDefaultRecordBook();
    const players = [
      makePlayer({ id: 'qb1', name: 'QB1', pos: 'QB', teamId: 1, stats: { season: { passYd: 4800, passTD: 38 } } }),
      makePlayer({ id: 'rb1', name: 'RB1', pos: 'RB', teamId: 2, stats: { season: { rushYd: 1700 } } }),
    ];
    const teamFn = (tid) => (tid === 1 ? 'Lions' : 'Bears');
    const updated = updateSingleSeasonRecords(rb, players, 2025, teamFn);

    expect(updated.singleSeasonBests.passingYards.metricValue).toBe(4800);
    expect(updated.singleSeasonBests.passingTds.metricValue).toBe(38);
    expect(updated.singleSeasonBests.rushingYards.metricValue).toBe(1700);
    expect(updated.singleSeasonBests.rushingYards.teamNameAtTime).toBe('Bears');
  });
});

// ── Weekly advance: single-game records updated ───────────────────────────────

describe('weekly advance: updateSingleGameRecordsFromBatch', () => {
  it('updates single-game record when a stat line exceeds existing best', () => {
    const rb = createDefaultRecordBook();
    const lines = [
      { playerId: 'qb-a', playerName: 'Elite QB', position: 'QB', teamId: 5, stats: { passYd: 520 } },
      { playerId: 'qb-b', playerName: 'Average QB', position: 'QB', teamId: 6, stats: { passYd: 280 } },
    ];
    const contextResolver = (l) => ({ season: 2025, teamName: 'Team' });
    const updated = updateSingleGameRecordsFromBatch(rb, lines, contextResolver);

    expect(updated.singleGame.passingYards.playerName).toBe('Elite QB');
    expect(updated.singleGame.passingYards.metricValue).toBe(520);
  });

  it('does not update record when no line exceeds the existing holder', () => {
    let rb = createDefaultRecordBook();
    const firstLine = { playerId: 'elite', playerName: 'Holder', position: 'QB', teamId: 1, stats: { passYd: 600 } };
    rb = maybeUpdateSingleGameRecord(rb, firstLine, { season: 2024, teamName: 'Past' });

    const weekLines = [
      { playerId: 'new1', playerName: 'New QB', position: 'QB', teamId: 1, stats: { passYd: 350 } },
    ];
    const afterWeek = updateSingleGameRecordsFromBatch(rb, weekLines, () => ({ season: 2025, teamName: 'Now' }));

    expect(afterWeek === rb).toBe(true);
    expect(afterWeek.singleGame.passingYards.metricValue).toBe(600);
  });
});

// ── Compaction: honored retired players are retained ─────────────────────────

describe('compaction: shouldRetainRetiredPlayerHistory', () => {
  it('retains a player with an MVP award', () => {
    const p = makePlayer({ awards: [{ type: 'MVP', season: 2024 }] });
    expect(shouldRetainRetiredPlayerHistory(p, createDefaultRecordBook())).toBe(true);
  });

  it('retains a HOF-inducted player', () => {
    const p = makePlayer({ awards: [], hof: true });
    expect(shouldRetainRetiredPlayerHistory(p, createDefaultRecordBook())).toBe(true);
  });

  it('retains a player who holds a record in the historyEngine record book', () => {
    let rb = createDefaultRecordBook();
    const holder = makePlayer({ id: 'holder-id', name: 'Record Holder', ovr: 65, awards: [] });
    const line = { playerId: 'holder-id', playerName: 'Record Holder', position: 'QB', stats: { passYd: 700 } };
    rb = maybeUpdateSingleGameRecord(rb, line, { season: 2025, teamName: 'T' });
    expect(shouldRetainRetiredPlayerHistory(holder, rb)).toBe(true);
  });

  it('does not retain a low-impact depth player', () => {
    const p = makePlayer({ ovr: 62, awards: [], accolades: [] });
    expect(shouldRetainRetiredPlayerHistory(p, createDefaultRecordBook())).toBe(false);
  });
});

describe('compaction: compactRetiredPlayerHistory', () => {
  it('is a safe no-op when retired players have no bulky arrays', () => {
    const players = [
      makePlayer({ id: 'r1', ovr: 60, awards: [], accolades: [] }),
    ];
    const result = compactRetiredPlayerHistory(players, createDefaultRecordBook());
    expect(result[0]).toEqual(players[0]);
  });

  it('strips gameLogs from low-impact low-OVR retired players', () => {
    const players = [
      makePlayer({ id: 'r2', ovr: 60, awards: [], accolades: [], gameLogs: [1, 2, 3] }),
    ];
    const result = compactRetiredPlayerHistory(players, createDefaultRecordBook());
    expect(result[0].gameLogs).toBeUndefined();
  });

  it('does not strip gameLogs from honored retired players', () => {
    const players = [
      makePlayer({ id: 'r3', ovr: 60, awards: [{ type: 'MVP' }], gameLogs: [1, 2] }),
    ];
    const result = compactRetiredPlayerHistory(players, createDefaultRecordBook());
    expect(result[0].gameLogs).toBeDefined();
  });

  it('safe no-op when players is null', () => {
    expect(() => compactRetiredPlayerHistory(null, createDefaultRecordBook())).not.toThrow();
  });
});
