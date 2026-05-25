import { describe, it, expect } from 'vitest';
import {
  createEmptyAdvancedStats,
  archiveGameStats,
  getCareerStats,
} from '../../src/core/playerSeasonStatsArchive.js';
import { simulateRichGame } from '../../src/core/sim/richGameSimulator.ts';
import { mapOverallToAttributesV2 } from '../../src/core/migration/attributeMigrator.ts';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAttribution(overrides = {}) {
  return { ...createEmptyAdvancedStats(), ...overrides };
}

function gameSummaryWith(attribution) {
  return { advancedAttribution: attribution };
}

// ── createEmptyAdvancedStats ──────────────────────────────────────────────────

describe('createEmptyAdvancedStats', () => {
  it('returns an object with all 8 counters set to zero', () => {
    const s = createEmptyAdvancedStats();
    expect(s.targets).toBe(0);
    expect(s.receptionsAllowed).toBe(0);
    expect(s.coverageTargets).toBe(0);
    expect(s.coverageCompletionsAllowed).toBe(0);
    expect(s.drops).toBe(0);
    expect(s.battedPasses).toBe(0);
    expect(s.sacksAllowed).toBe(0);
    expect(s.sacksMade).toBe(0);
    expect(Object.keys(s)).toHaveLength(8);
  });

  it('each call returns an independent object', () => {
    const a = createEmptyAdvancedStats();
    const b = createEmptyAdvancedStats();
    a.targets = 5;
    expect(b.targets).toBe(0);
  });
});

// ── archiveGameStats – basic accumulation ─────────────────────────────────────

describe('archiveGameStats – accumulation', () => {
  it('creates a new player entry on first call', () => {
    const store = {};
    const summary = gameSummaryWith({
      'p1': makeAttribution({ targets: 3, drops: 1 }),
    });
    archiveGameStats(store, summary, 2025);

    expect(store['p1']['2025'].targets).toBe(3);
    expect(store['p1']['2025'].drops).toBe(1);
    expect(store['p1']['2025'].sacksMade).toBe(0);
  });

  it('accumulates stats additively across multiple games in the same year', () => {
    const store = {};
    const game1 = gameSummaryWith({ 'p1': makeAttribution({ targets: 5, drops: 1, sacksMade: 2 }) });
    const game2 = gameSummaryWith({ 'p1': makeAttribution({ targets: 3, drops: 0, sacksMade: 1 }) });

    archiveGameStats(store, game1, 2025);
    archiveGameStats(store, game2, 2025);

    expect(store['p1']['2025'].targets).toBe(8);
    expect(store['p1']['2025'].drops).toBe(1);
    expect(store['p1']['2025'].sacksMade).toBe(3);
  });

  it('keeps years separate (sparse representation)', () => {
    const store = {};
    archiveGameStats(store, gameSummaryWith({ 'p1': makeAttribution({ targets: 7 }) }), 2024);
    archiveGameStats(store, gameSummaryWith({ 'p1': makeAttribution({ targets: 4 }) }), 2025);

    expect(store['p1']['2024'].targets).toBe(7);
    expect(store['p1']['2025'].targets).toBe(4);
    expect(Object.keys(store['p1'])).toHaveLength(2);
  });

  it('does not create a year entry for a player with no stats in the summary', () => {
    const store = {};
    archiveGameStats(store, gameSummaryWith({ 'p2': makeAttribution({ battedPasses: 2 }) }), 2025);
    expect(store['p1']).toBeUndefined();
  });
});

// ── archiveGameStats – serialization hardening ────────────────────────────────

describe('archiveGameStats – guard clauses', () => {
  it('returns the store unchanged when gameSummary has no advancedAttribution', () => {
    const store = { 'p1': { '2024': makeAttribution({ targets: 3 }) } };
    archiveGameStats(store, { homeScore: 17, awayScore: 14 }, 2025);
    expect(store['p1']['2025']).toBeUndefined();
    expect(store['p1']['2024'].targets).toBe(3);
  });

  it('returns the store unchanged when advancedAttribution is null', () => {
    const store = {};
    archiveGameStats(store, { advancedAttribution: null }, 2025);
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('ignores entries with falsy player IDs', () => {
    const store = {};
    archiveGameStats(store, gameSummaryWith({ '': makeAttribution({ targets: 1 }) }), 2025);
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('skips archival when year is 0 or non-finite', () => {
    const store = {};
    archiveGameStats(store, gameSummaryWith({ 'p1': makeAttribution({ targets: 5 }) }), 0);
    archiveGameStats(store, gameSummaryWith({ 'p1': makeAttribution({ targets: 5 }) }), NaN);
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('skips archival when gameSummary is null', () => {
    const store = {};
    archiveGameStats(store, null, 2025);
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('coerces numeric player IDs to strings', () => {
    const store = {};
    archiveGameStats(store, gameSummaryWith({ 42: makeAttribution({ sacksMade: 3 }) }), 2025);
    expect(store['42']['2025'].sacksMade).toBe(3);
  });

  it('guards against non-finite numeric stats in the source (no NaN bleed)', () => {
    const store = {};
    archiveGameStats(
      store,
      gameSummaryWith({ 'p1': { targets: NaN, drops: Infinity, sacksMade: 2, receptionsAllowed: undefined } }),
      2025,
    );
    expect(store['p1']['2025'].targets).toBe(0);
    expect(store['p1']['2025'].drops).toBe(0);
    expect(store['p1']['2025'].sacksMade).toBe(2);
    expect(store['p1']['2025'].receptionsAllowed).toBe(0);
  });
});

// ── archiveGameStats – determinism / order-independence ───────────────────────

describe('archiveGameStats – order-independence', () => {
  it('produces the same totals regardless of game order', () => {
    const games = [
      gameSummaryWith({ 'p1': makeAttribution({ targets: 5, drops: 1 }) }),
      gameSummaryWith({ 'p1': makeAttribution({ targets: 3, drops: 0 }) }),
      gameSummaryWith({ 'p1': makeAttribution({ targets: 7, drops: 2 }) }),
    ];

    const storeAB = {};
    archiveGameStats(storeAB, games[0], 2025);
    archiveGameStats(storeAB, games[1], 2025);
    archiveGameStats(storeAB, games[2], 2025);

    const storeBA = {};
    archiveGameStats(storeBA, games[2], 2025);
    archiveGameStats(storeBA, games[0], 2025);
    archiveGameStats(storeBA, games[1], 2025);

    expect(storeAB['p1']['2025']).toEqual(storeBA['p1']['2025']);
  });

  it('does not re-archive the same game twice in the same year', () => {
    const store = {};
    const game = { gameId: 'same-game-1', ...gameSummaryWith({ 'p1': makeAttribution({ targets: 4, sacksMade: 1 }) }) };
    archiveGameStats(store, game, 2025);
    archiveGameStats(store, game, 2025);
    expect(store['p1']['2025'].targets).toBe(4);
    expect(store['p1']['2025'].sacksMade).toBe(1);
  });
});

// ── getCareerStats ─────────────────────────────────────────────────────────────

describe('getCareerStats', () => {
  it('sums all seasons for a player into career totals', () => {
    const archive = {
      'p1': {
        '2023': makeAttribution({ targets: 60, drops: 4, sacksMade: 3 }),
        '2024': makeAttribution({ targets: 72, drops: 5, sacksMade: 5 }),
        '2025': makeAttribution({ targets: 80, drops: 3, sacksMade: 8 }),
      },
    };

    const career = getCareerStats('p1', archive);
    expect(career.targets).toBe(212);
    expect(career.drops).toBe(12);
    expect(career.sacksMade).toBe(16);
  });

  it('returns all-zero stats for a player who never appeared in any game', () => {
    const career = getCareerStats('unknown-player', {});
    expect(career).toEqual(createEmptyAdvancedStats());
  });

  it('returns all-zero stats when archive is null or undefined', () => {
    expect(getCareerStats('p1', null)).toEqual(createEmptyAdvancedStats());
    expect(getCareerStats('p1', undefined)).toEqual(createEmptyAdvancedStats());
  });

  it('does not mutate the archive', () => {
    const archive = {
      'p1': { '2025': makeAttribution({ targets: 10 }) },
    };
    const snapshot = JSON.parse(JSON.stringify(archive));
    getCareerStats('p1', archive);
    expect(archive).toEqual(snapshot);
  });

  it('handles a single-season player correctly', () => {
    const archive = {
      'rookie': { '2025': makeAttribution({ targets: 30, receptionsAllowed: 20, coverageTargets: 15 }) },
    };
    const career = getCareerStats('rookie', archive);
    expect(career.targets).toBe(30);
    expect(career.receptionsAllowed).toBe(20);
    expect(career.coverageTargets).toBe(15);
  });

  it('coerces numeric playerId to string for lookup', () => {
    const archive = { '7': { '2025': makeAttribution({ battedPasses: 6 }) } };
    expect(getCareerStats(7, archive).battedPasses).toBe(6);
  });

  it('skips malformed year entries without throwing', () => {
    const archive = {
      'p1': {
        '2024': null,
        '2025': makeAttribution({ drops: 5 }),
      },
    };
    expect(getCareerStats('p1', archive).drops).toBe(5);
  });
});

// ── Integration: simulateRichGame populates playerStatsStore when provided ────

describe('simulateRichGame – playerStatsStore integration', () => {
  const basePayload = {
    gameId: 'archive-test-1',
    homeTeamId: 10,
    awayTeamId: 20,
    seed: 7777,
    weather: 'clear',
    homeOffense: mapOverallToAttributesV2(82, 5.5, 'h-off'),
    awayOffense: mapOverallToAttributesV2(80, 5.5, 'a-off'),
    homeDefense: mapOverallToAttributesV2(78, 5.5, 'h-def'),
    awayDefense: mapOverallToAttributesV2(79, 5.5, 'a-def'),
    homePlayers: [
      { id: 'h-wr1', name: 'Home WR', pos: 'WR', ovr: 82 },
      { id: 'h-qb1', name: 'Home QB', pos: 'QB', ovr: 85 },
      { id: 'h-ot1', name: 'Home OT', pos: 'OT', ovr: 78 },
    ],
    awayPlayers: [
      { id: 'a-cb1', name: 'Away CB', pos: 'CB', ovr: 80 },
      { id: 'a-edge1', name: 'Away EDGE', pos: 'EDGE', ovr: 83 },
    ],
  };

  it('does NOT populate playerStatsStore when neither year nor store is provided', () => {
    const summary = simulateRichGame(basePayload);
    expect(summary.advancedAttribution).toBeDefined();
  });

  it('populates playerStatsStore with game attribution when year and store are provided', () => {
    const store = {};
    simulateRichGame({ ...basePayload, year: 2025, playerStatsStore: store });

    const playerIds = Object.keys(store).filter((pid) => pid !== '__meta');
    expect(playerIds.length).toBeGreaterThan(0);

    for (const pid of playerIds) {
      expect(store[pid]['2025']).toBeDefined();
      const s = store[pid]['2025'];
      expect(typeof s.targets).toBe('number');
      expect(typeof s.sacksMade).toBe('number');
      expect(Number.isFinite(s.targets)).toBe(true);
      expect(Number.isFinite(s.sacksMade)).toBe(true);
    }
  });

  it('accumulates correctly across two games in the same year', () => {
    const store = {};
    simulateRichGame({ ...basePayload, gameId: 'g1', seed: 1001, year: 2025, playerStatsStore: store });
    const afterGame1 = JSON.parse(JSON.stringify(store));

    simulateRichGame({ ...basePayload, gameId: 'g2', seed: 1002, year: 2025, playerStatsStore: store });

    for (const pid of Object.keys(store)) {
      if (!afterGame1[pid]?.['2025']) continue;
      const before = afterGame1[pid]['2025'];
      const after = store[pid]['2025'];
      expect(after.targets).toBeGreaterThanOrEqual(before.targets);
      expect(after.drops).toBeGreaterThanOrEqual(before.drops);
      expect(after.sacksMade).toBeGreaterThanOrEqual(before.sacksMade);
    }
  });

  it('is deterministic: same seeds produce identical store contents', () => {
    const store1 = {};
    const store2 = {};
    simulateRichGame({ ...basePayload, year: 2025, playerStatsStore: store1 });
    simulateRichGame({ ...basePayload, year: 2025, playerStatsStore: store2 });
    expect(store1).toEqual(store2);
  });

  it('does not mutate the returned summary when archiving into the store', () => {
    const store = {};
    const s1 = simulateRichGame({ ...basePayload, year: 2025, playerStatsStore: store });
    const s2 = simulateRichGame({ ...basePayload, year: 2025, playerStatsStore: {} });
    expect(s1.advancedAttribution).toEqual(s2.advancedAttribution);
  });

  it('skips archival when year is omitted even if store is provided', () => {
    const store = {};
    simulateRichGame({ ...basePayload, playerStatsStore: store });
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('skips archival when store is omitted even if year is provided', () => {
    const summary = simulateRichGame({ ...basePayload, year: 2025 });
    expect(summary.advancedAttribution).toBeDefined();
  });

  it('getCareerStats returns correct totals after two seasons', () => {
    const store = {};
    simulateRichGame({ ...basePayload, gameId: 'g-yr1', seed: 3001, year: 2024, playerStatsStore: store });
    simulateRichGame({ ...basePayload, gameId: 'g-yr2', seed: 3002, year: 2025, playerStatsStore: store });

    for (const pid of Object.keys(store)) {
      const career = getCareerStats(pid, store);
      const yr2024 = store[pid]?.['2024'] ?? createEmptyAdvancedStats();
      const yr2025 = store[pid]?.['2025'] ?? createEmptyAdvancedStats();
      expect(career.targets).toBe(yr2024.targets + yr2025.targets);
      expect(career.drops).toBe(yr2024.drops + yr2025.drops);
      expect(career.sacksMade).toBe(yr2024.sacksMade + yr2025.sacksMade);
    }
  });
});
