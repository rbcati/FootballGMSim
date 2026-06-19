/**
 * historyEngine.unit.test.js
 * Pure-function tests for the League History Ledger & Record Book Engine.
 */

import { describe, it, expect } from 'vitest';
import {
  createDefaultRecordBook,
  buildLeagueYearSummary,
  maybeUpdateSingleGameRecord,
  updateSingleGameRecordsFromBatch,
  maybeUpdateSingleSeasonRecord,
  updateSingleSeasonRecords,
  appendHistoryLedger,
  shouldRetainRetiredPlayerHistory,
  compactRetiredPlayerHistory,
} from './historyEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeStatLine(overrides = {}) {
  return {
    playerId: 'p1',
    playerName: 'Test Player',
    position: 'QB',
    teamId: 1,
    stats: { passYd: 0, passTD: 0, rushYd: 0, sacks: 0 },
    ...overrides,
  };
}

function makeContext(overrides = {}) {
  return { season: 2025, teamName: 'Test Team', ...overrides };
}

// ── createDefaultRecordBook ───────────────────────────────────────────────────

describe('createDefaultRecordBook', () => {
  it('returns singleGame with null holders for all 4 metrics', () => {
    const rb = createDefaultRecordBook();
    expect(rb.singleGame.passingYards).toBeNull();
    expect(rb.singleGame.passingTds).toBeNull();
    expect(rb.singleGame.rushingYards).toBeNull();
    expect(rb.singleGame.sacks).toBeNull();
  });

  it('returns singleSeasonBests with null holders for all 4 metrics', () => {
    const rb = createDefaultRecordBook();
    expect(rb.singleSeasonBests.passingYards).toBeNull();
    expect(rb.singleSeasonBests.passingTds).toBeNull();
    expect(rb.singleSeasonBests.rushingYards).toBeNull();
    expect(rb.singleSeasonBests.sacks).toBeNull();
  });

  it('returns safe structure even when called multiple times (immutable)', () => {
    const rb1 = createDefaultRecordBook();
    const rb2 = createDefaultRecordBook();
    rb1.singleGame.passingYards = 'mutated';
    expect(rb2.singleGame.passingYards).toBeNull();
  });
});

// ── buildLeagueYearSummary ────────────────────────────────────────────────────

describe('buildLeagueYearSummary', () => {
  it('builds expected payload from champion + awards', () => {
    const summary = buildLeagueYearSummary({
      season: 2025,
      championshipResult: {
        championTeamId: 5,
        championName: 'Eagles',
        runnerUpName: 'Chiefs',
        homeScore: 31,
        awayScore: 17,
      },
      awards: {
        mvpName: 'Top QB',
        opoyName: 'Best RB',
        dpoyName: 'Elite CB',
      },
    });

    expect(summary.year).toBe(2025);
    expect(summary.championTeamId).toBe(5);
    expect(summary.championName).toBe('Eagles');
    expect(summary.runnerUpName).toBe('Chiefs');
    expect(summary.superBowlScore).toBe('31-17');
    expect(summary.mvpName).toBe('Top QB');
    expect(summary.opoyName).toBe('Best RB');
    expect(summary.dpoyName).toBe('Elite CB');
  });

  it('handles missing data with safe fallbacks', () => {
    const summary = buildLeagueYearSummary({});
    expect(summary.year).toBe(0);
    expect(summary.championName).toBe('Unknown');
    expect(summary.runnerUpName).toBe('Unknown');
    expect(summary.superBowlScore).toBe('—');
    expect(summary.mvpName).toBe('Unknown');
    expect(summary.opoyName).toBe('Unknown');
    expect(summary.dpoyName).toBe('Unknown');
  });

  it('handles missing score gracefully', () => {
    const summary = buildLeagueYearSummary({
      season: 2026,
      championshipResult: { championName: 'Bears' },
    });
    expect(summary.superBowlScore).toBe('—');
    expect(summary.championName).toBe('Bears');
  });

  it('normalises score so higher value is always first', () => {
    const summary = buildLeagueYearSummary({
      season: 2025,
      championshipResult: { homeScore: 14, awayScore: 28 },
    });
    expect(summary.superBowlScore).toBe('28-14');
  });
});

// ── maybeUpdateSingleGameRecord ───────────────────────────────────────────────

describe('maybeUpdateSingleGameRecord', () => {
  it('updates passingYards when value exceeds existing record', () => {
    const rb = createDefaultRecordBook();
    const line = makeStatLine({ stats: { passYd: 450, passTD: 0, rushYd: 0, sacks: 0 } });
    const updated = maybeUpdateSingleGameRecord(rb, line, makeContext());

    expect(updated.singleGame.passingYards).not.toBeNull();
    expect(updated.singleGame.passingYards.metricValue).toBe(450);
    expect(updated.singleGame.passingYards.playerName).toBe('Test Player');
    expect(updated.singleGame.passingYards.yearAchieved).toBe(2025);
  });

  it('does not update when value is lower than existing record', () => {
    const rb = createDefaultRecordBook();
    // First set a high record
    const line1 = makeStatLine({ stats: { passYd: 500 } });
    const afterFirst = maybeUpdateSingleGameRecord(rb, line1, makeContext({ season: 2024 }));

    // Then try to set a lower value
    const line2 = makeStatLine({ playerId: 'p2', stats: { passYd: 300 } });
    const afterSecond = maybeUpdateSingleGameRecord(afterFirst, line2, makeContext({ season: 2025 }));

    expect(afterSecond.singleGame.passingYards.metricValue).toBe(500);
    expect(afterSecond.singleGame.passingYards.yearAchieved).toBe(2024);
    expect(afterSecond === afterFirst).toBe(true); // same reference — no allocation
  });

  it('does not update on zero value', () => {
    const rb = createDefaultRecordBook();
    const line = makeStatLine({ stats: { passYd: 0, passTD: 0, rushYd: 0, sacks: 0 } });
    const updated = maybeUpdateSingleGameRecord(rb, line, makeContext());
    expect(updated === rb).toBe(true);
  });

  it('updates sacks metric correctly', () => {
    const rb = createDefaultRecordBook();
    const line = makeStatLine({ position: 'DE', stats: { sacks: 4 } });
    const updated = maybeUpdateSingleGameRecord(rb, line, makeContext());
    expect(updated.singleGame.sacks.metricValue).toBe(4);
    expect(updated.singleGame.sacks.position).toBe('DE');
  });

  it('does not mutate the input recordBook', () => {
    const rb = createDefaultRecordBook();
    const frozen = Object.freeze(rb);
    const line = makeStatLine({ stats: { passYd: 300 } });
    expect(() => maybeUpdateSingleGameRecord(frozen, line, makeContext())).not.toThrow();
  });
});

// ── updateSingleGameRecordsFromBatch ─────────────────────────────────────────

describe('updateSingleGameRecordsFromBatch', () => {
  it('updates records from multiple stat lines deterministically', () => {
    const rb = createDefaultRecordBook();
    const lines = [
      makeStatLine({ playerId: 'a', playerName: 'A', stats: { passYd: 300 } }),
      makeStatLine({ playerId: 'b', playerName: 'B', stats: { passYd: 450 } }),
      makeStatLine({ playerId: 'c', playerName: 'C', stats: { passYd: 200 } }),
    ];
    const ctx = (l) => ({ season: 2025, teamName: 'T' });
    const updated = updateSingleGameRecordsFromBatch(rb, lines, ctx);

    expect(updated.singleGame.passingYards.playerName).toBe('B');
    expect(updated.singleGame.passingYards.metricValue).toBe(450);
  });

  it('handles empty batch without error', () => {
    const rb = createDefaultRecordBook();
    const updated = updateSingleGameRecordsFromBatch(rb, [], null);
    expect(updated === rb).toBe(true);
  });

  it('handles null batch gracefully', () => {
    const rb = createDefaultRecordBook();
    const updated = updateSingleGameRecordsFromBatch(rb, null, null);
    expect(updated === rb).toBe(true);
  });
});

// ── maybeUpdateSingleSeasonRecord ────────────────────────────────────────────

describe('maybeUpdateSingleSeasonRecord', () => {
  it('updates correct metric when season total is exceeded', () => {
    const rb = createDefaultRecordBook();
    const totals = makeStatLine({ stats: { rushYd: 1800 } });
    const updated = maybeUpdateSingleSeasonRecord(rb, totals, makeContext());

    expect(updated.singleSeasonBests.rushingYards.metricValue).toBe(1800);
  });

  it('does not update when season total is lower than existing best', () => {
    const rb = createDefaultRecordBook();
    const first = makeStatLine({ stats: { rushYd: 2000 } });
    const rb2 = maybeUpdateSingleSeasonRecord(rb, first, makeContext({ season: 2024 }));

    const second = makeStatLine({ playerId: 'p2', stats: { rushYd: 1500 } });
    const rb3 = maybeUpdateSingleSeasonRecord(rb2, second, makeContext({ season: 2025 }));

    expect(rb3.singleSeasonBests.rushingYards.metricValue).toBe(2000);
    expect(rb3 === rb2).toBe(true);
  });
});

// ── updateSingleSeasonRecords ────────────────────────────────────────────────

describe('updateSingleSeasonRecords', () => {
  it('scans all players and updates correct record holders', () => {
    const rb = createDefaultRecordBook();
    const players = [
      { id: 'p1', name: 'QB Star', pos: 'QB', teamId: 1, stats: { season: { passYd: 5000, passTD: 40 } } },
      { id: 'p2', name: 'RB Beast', pos: 'RB', teamId: 2, stats: { season: { rushYd: 1900 } } },
      { id: 'p3', name: 'Edge Rusher', pos: 'DE', teamId: 1, stats: { season: { sacks: 18 } } },
    ];
    const teamNameResolver = (tid) => (tid === 1 ? 'Lions' : 'Bears');
    const updated = updateSingleSeasonRecords(rb, players, 2025, teamNameResolver);

    expect(updated.singleSeasonBests.passingYards.metricValue).toBe(5000);
    expect(updated.singleSeasonBests.passingYards.playerName).toBe('QB Star');
    expect(updated.singleSeasonBests.passingTds.metricValue).toBe(40);
    expect(updated.singleSeasonBests.rushingYards.metricValue).toBe(1900);
    expect(updated.singleSeasonBests.rushingYards.teamNameAtTime).toBe('Bears');
    expect(updated.singleSeasonBests.sacks.metricValue).toBe(18);
    expect(updated.singleSeasonBests.sacks.teamNameAtTime).toBe('Lions');
  });

  it('handles empty player list gracefully', () => {
    const rb = createDefaultRecordBook();
    const updated = updateSingleSeasonRecords(rb, [], 2025, null);
    expect(updated === rb).toBe(true);
  });
});

// ── appendHistoryLedger ───────────────────────────────────────────────────────

describe('appendHistoryLedger', () => {
  it('appends a new year entry in chronological order', () => {
    const existing = [{ year: 2024, championName: 'Old' }];
    const newEntry = { year: 2025, championName: 'New' };
    const result = appendHistoryLedger(existing, newEntry);

    expect(result.length).toBe(2);
    expect(result[0].year).toBe(2024);
    expect(result[1].year).toBe(2025);
  });

  it('replaces a duplicate year entry rather than duplicating', () => {
    const existing = [
      { year: 2024, championName: 'OldChamp' },
      { year: 2025, championName: 'OldWinner' },
    ];
    const newEntry = { year: 2025, championName: 'RerunWinner' };
    const result = appendHistoryLedger(existing, newEntry);

    expect(result.length).toBe(2);
    const entry25 = result.find(r => r.year === 2025);
    expect(entry25.championName).toBe('RerunWinner');
  });

  it('handles empty ledger', () => {
    const result = appendHistoryLedger([], { year: 2025, championName: 'First' });
    expect(result.length).toBe(1);
    expect(result[0].year).toBe(2025);
  });

  it('does not mutate the input array', () => {
    const original = [{ year: 2024 }];
    appendHistoryLedger(original, { year: 2025 });
    expect(original.length).toBe(1);
  });
});

// ── shouldRetainRetiredPlayerHistory ─────────────────────────────────────────

describe('shouldRetainRetiredPlayerHistory', () => {
  it('returns true for an award winner', () => {
    const player = { id: 'p1', awards: [{ type: 'MVP', season: 2024 }] };
    expect(shouldRetainRetiredPlayerHistory(player, createDefaultRecordBook())).toBe(true);
  });

  it('returns true for a HOF player', () => {
    const player = { id: 'p2', hof: true, awards: [] };
    expect(shouldRetainRetiredPlayerHistory(player, createDefaultRecordBook())).toBe(true);
  });

  it('returns true for a record holder', () => {
    const rb = createDefaultRecordBook();
    const line = makeStatLine({ playerId: 'record-holder', playerName: 'Record Guy', stats: { passYd: 600 } });
    const updatedRb = maybeUpdateSingleGameRecord(rb, line, makeContext());
    const player = { id: 'record-holder', awards: [] };
    expect(shouldRetainRetiredPlayerHistory(player, updatedRb)).toBe(true);
  });

  it('returns false for a low-impact retired player', () => {
    const player = { id: 'p3', ovr: 65, awards: [], accolades: [] };
    expect(shouldRetainRetiredPlayerHistory(player, createDefaultRecordBook())).toBe(false);
  });

  it('returns false for null player', () => {
    expect(shouldRetainRetiredPlayerHistory(null, createDefaultRecordBook())).toBe(false);
  });
});

// ── compactRetiredPlayerHistory ───────────────────────────────────────────────

describe('compactRetiredPlayerHistory', () => {
  it('does not mutate the input array', () => {
    const players = [
      { id: 'p1', ovr: 60, awards: [], gameLogs: [1, 2, 3] },
    ];
    const original = [...players];
    compactRetiredPlayerHistory(players, createDefaultRecordBook());
    expect(players[0]).toBe(original[0]);
  });

  it('removes gameLogs from low-impact low-OVR retired players', () => {
    const player = { id: 'p1', ovr: 65, awards: [], accolades: [], gameLogs: [1, 2, 3] };
    const result = compactRetiredPlayerHistory([player], createDefaultRecordBook());
    expect(result[0].gameLogs).toBeUndefined();
  });

  it('does not strip gameLogs from honored players (award winner)', () => {
    const player = { id: 'p2', ovr: 65, awards: [{ type: 'MVP' }], gameLogs: [1, 2, 3] };
    const result = compactRetiredPlayerHistory([player], createDefaultRecordBook());
    expect(result[0].gameLogs).toBeDefined();
  });

  it('does not strip gameLogs from high-OVR players (ovr >= 78)', () => {
    const player = { id: 'p3', ovr: 82, awards: [], accolades: [], gameLogs: [1, 2] };
    const result = compactRetiredPlayerHistory([player], createDefaultRecordBook());
    expect(result[0].gameLogs).toBeDefined();
  });

  it('handles players with no bulky fields safely (no-op)', () => {
    const player = { id: 'p4', ovr: 60, awards: [], accolades: [] };
    const result = compactRetiredPlayerHistory([player], createDefaultRecordBook());
    expect(result[0]).toEqual(player);
  });

  it('handles non-array input without throwing', () => {
    expect(() => compactRetiredPlayerHistory(null, createDefaultRecordBook())).not.toThrow();
  });
});

// ── Guardrail: no Math.random ────────────────────────────────────────────────

describe('module guardrail', () => {
  it('historyEngine module source does not use Math.random', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const filePath = path.resolve('src/core/history/historyEngine.js');
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).not.toContain('Math.random');
  });
});
