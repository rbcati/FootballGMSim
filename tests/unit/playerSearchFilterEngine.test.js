import { describe, it, expect } from 'vitest';
import { filterPlayerPool, CRITERIA_KEYS } from '../../src/ui/utils/playerSearchFilterEngine.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function player(id, overrides = {}) {
  return { id, name: `Player ${id}`, pos: 'WR', ovr: 75, ...overrides };
}

const ZERO_STATS = {
  targets: 0, drops: 0, battedPasses: 0,
  coverageTargets: 0, coverageCompletionsAllowed: 0,
  receptionsAllowed: 0, sacksAllowed: 0, sacksMade: 0,
};

function stats(overrides) {
  return { ...ZERO_STATS, ...overrides };
}

/** Build a sparse archive from a flat list of { playerId, year, stats } entries. */
function makeArchive(entries) {
  const arc = {};
  for (const { playerId, year, ...s } of entries) {
    const pid = String(playerId);
    if (!arc[pid]) arc[pid] = {};
    arc[pid][String(year)] = s.stats ?? s;
  }
  return arc;
}

// ─── fixture data ────────────────────────────────────────────────────────────

const P1 = player(1);
const P2 = player(2);
const P3 = player(3);
const PLAYERS = [P1, P2, P3];

const ARCHIVE = makeArchive([
  { playerId: 1, year: 2024, stats: stats({ targets: 100, drops: 5, sacksAllowed: 2 }) },
  { playerId: 2, year: 2024, stats: stats({ targets: 50,  drops: 2, sacksAllowed: 8 }) },
  { playerId: 3, year: 2024, stats: stats({ targets: 0,   sacksMade: 5, battedPasses: 3, coverageTargets: 40, receptionsAllowed: 30, coverageCompletionsAllowed: 25 }) },
]);

// ─── basic behaviour ─────────────────────────────────────────────────────────

describe('filterPlayerPool – basic', () => {
  it('returns empty array for null players', () => {
    expect(filterPlayerPool(null, ARCHIVE)).toEqual([]);
  });

  it('returns empty array for undefined players', () => {
    expect(filterPlayerPool(undefined, ARCHIVE)).toEqual([]);
  });

  it('returns original array reference when no criteria are provided', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, {});
    expect(result).toBe(PLAYERS);
  });

  it('returns original array reference when all criteria values are empty strings', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { minTargets: '', maxDrops: '' });
    expect(result).toBe(PLAYERS);
  });

  it('skips null entries inside the players array', () => {
    const result = filterPlayerPool([null, P1, null], ARCHIVE, { minTargets: 1 });
    expect(result).toEqual([P1]);
  });
});

// ─── single-threshold filtering ──────────────────────────────────────────────

describe('filterPlayerPool – single threshold', () => {
  it('minTargets keeps only players meeting the floor', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { minTargets: 60 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P1);
  });

  it('maxTargets keeps only players at or below the ceiling', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { maxTargets: 50 });
    expect(result).toHaveLength(2); // P2 (50) and P3 (0)
    expect(result.map((p) => p.id)).toContain(2);
    expect(result.map((p) => p.id)).toContain(3);
  });

  it('maxSacksAllowed keeps players at or below the ceiling', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { maxSacksAllowed: 3 });
    expect(result).toHaveLength(2); // P1 (2) and P3 (0)
    expect(result.map((p) => p.id)).toContain(1);
    expect(result.map((p) => p.id)).toContain(3);
  });

  it('minSacksMade keeps only defenders with enough sacks', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { minSacksMade: 4 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P3);
  });

  it('minBattedPasses keeps only players meeting the floor', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { minBattedPasses: 2 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P3);
  });

  it('minCoverageTargets keeps only corners/safeties with enough coverage snaps', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { minCoverageTargets: 20 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P3);
  });
});

// ─── compound queries ─────────────────────────────────────────────────────────

describe('filterPlayerPool – compound criteria', () => {
  it('minTargets AND maxDrops narrows to the correct subset', () => {
    // P1: targets=100, drops=5  → fails maxDrops=3
    // P2: targets=50,  drops=2  → passes both
    // P3: targets=0,   drops=0  → fails minTargets=30
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { minTargets: 30, maxDrops: 3 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P2);
  });

  it('maxSacksAllowed AND minTargets produce an empty set when no player qualifies', () => {
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { maxSacksAllowed: 1, minTargets: 40 });
    expect(result).toHaveLength(0);
  });

  it('all thresholds satisfied returns the matching player', () => {
    // P3: sacksMade=5, battedPasses=3, coverageTargets=40
    const result = filterPlayerPool(PLAYERS, ARCHIVE, {
      minSacksMade: 3,
      minBattedPasses: 2,
      minCoverageTargets: 30,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P3);
  });

  it('min AND max on same stat works as a range gate', () => {
    // targets: P1=100, P2=50, P3=0 → only P2 lands in [40, 60]
    const result = filterPlayerPool(PLAYERS, ARCHIVE, { minTargets: 40, maxTargets: 60 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P2);
  });
});

// ─── sparse archive fallback ─────────────────────────────────────────────────

describe('filterPlayerPool – sparse archive handling', () => {
  it('players absent from the archive default to 0 for every stat', () => {
    const rookie = player(99);
    // With minTargets=1, rookie (no archive entry) should be excluded
    const result = filterPlayerPool([P1, rookie], ARCHIVE, { minTargets: 1 });
    expect(result.map((p) => p.id)).not.toContain(99);
  });

  it('null archive is treated as an empty store', () => {
    const result = filterPlayerPool(PLAYERS, null, { minTargets: 1 });
    expect(result).toHaveLength(0);
  });

  it('undefined archive is treated as an empty store', () => {
    const result = filterPlayerPool(PLAYERS, undefined, { maxSacksAllowed: 0 });
    // all players have 0 sacks allowed, so all pass the ≤0 threshold
    expect(result).toHaveLength(3);
  });

  it('players with partially missing season keys default missing stats to 0', () => {
    const sparseArchive = makeArchive([
      { playerId: 1, year: 2024, stats: { targets: 80 } }, // drops missing from raw
    ]);
    const result = filterPlayerPool([P1], sparseArchive, { maxDrops: 0 });
    expect(result).toHaveLength(1); // drops should default to 0, passing ≤0
  });
});

// ─── season mode ─────────────────────────────────────────────────────────────

describe('filterPlayerPool – season mode', () => {
  const MULTI = makeArchive([
    { playerId: 1, year: 2022, stats: stats({ targets: 30 }) },
    { playerId: 1, year: 2023, stats: stats({ targets: 120 }) },
    { playerId: 1, year: 2024, stats: stats({ targets: 80 }) },
    { playerId: 2, year: 2023, stats: stats({ targets: 60 }) },
    { playerId: 2, year: 2024, stats: stats({ targets: 30 }) },
  ]);

  it('filters against the specified season only', () => {
    const result = filterPlayerPool([P1, P2], MULTI, {
      seasonMode: 'season',
      season: '2023',
      minTargets: 100,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P1);
  });

  it('different season produces a different result set', () => {
    const result2024 = filterPlayerPool([P1, P2], MULTI, {
      seasonMode: 'season',
      season: '2024',
      minTargets: 50,
    });
    expect(result2024).toHaveLength(1);
    expect(result2024[0]).toBe(P1);
  });

  it('season with no data for a player excludes them', () => {
    // P2 has no 2022 entry
    const result = filterPlayerPool([P1, P2], MULTI, {
      seasonMode: 'season',
      season: '2022',
      minTargets: 1,
    });
    expect(result.map((p) => p.id)).not.toContain(2);
  });

  it('omitting season while in season mode behaves like career mode', () => {
    // season='', so falls back to career aggregation
    const result = filterPlayerPool([P1, P2], MULTI, {
      seasonMode: 'season',
      season: '',
      minTargets: 200, // P1 career = 230, P2 career = 90
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P1);
  });
});

// ─── career aggregation ──────────────────────────────────────────────────────

describe('filterPlayerPool – career aggregation', () => {
  const MULTI = makeArchive([
    { playerId: 1, year: 2022, stats: stats({ targets: 30 }) },
    { playerId: 1, year: 2023, stats: stats({ targets: 40 }) },
    { playerId: 1, year: 2024, stats: stats({ targets: 35 }) },
    { playerId: 2, year: 2024, stats: stats({ targets: 90 }) },
  ]);

  it('sums all seasons into career totals', () => {
    // P1 career targets: 30+40+35 = 105, P2: 90 → only P1 ≥ 100
    const result = filterPlayerPool([P1, P2], MULTI, { minTargets: 100 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P1);
  });

  it('defaults to career mode when seasonMode is absent', () => {
    const result = filterPlayerPool([P1, P2], MULTI, { minTargets: 100 });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(P1);
  });
});

// ─── immutability ────────────────────────────────────────────────────────────

describe('filterPlayerPool – immutability', () => {
  it('does not mutate the archive', () => {
    const arc = makeArchive([
      { playerId: 1, year: 2024, stats: stats({ targets: 100 }) },
    ]);
    const snapshot = JSON.parse(JSON.stringify(arc));
    filterPlayerPool([P1], arc, { minTargets: 50 });
    expect(arc).toEqual(snapshot);
  });

  it('does not add keys to the archive', () => {
    const arc = makeArchive([
      { playerId: 1, year: 2024, stats: stats({ targets: 100 }) },
    ]);
    const keysBefore = Object.keys(arc);
    filterPlayerPool([P1, player(99)], arc, { minTargets: 1 });
    expect(Object.keys(arc)).toEqual(keysBefore);
  });

  it('does not mutate the players array', () => {
    const arr = [P1, P2, P3];
    const snapshot = [...arr];
    filterPlayerPool(arr, ARCHIVE, { minTargets: 60 });
    expect(arr).toEqual(snapshot);
  });
});

// ─── CRITERIA_KEYS export ────────────────────────────────────────────────────

describe('CRITERIA_KEYS', () => {
  it('is an array', () => {
    expect(Array.isArray(CRITERIA_KEYS)).toBe(true);
  });

  it('contains all expected threshold keys', () => {
    const expected = [
      'minTargets', 'maxTargets',
      'minDrops', 'maxDrops',
      'minBattedPasses', 'maxBattedPasses',
      'minSacksAllowed', 'maxSacksAllowed',
      'minSacksMade', 'maxSacksMade',
      'minCoverageTargets', 'maxCoverageTargets',
      'minReceptionsAllowed', 'maxReceptionsAllowed',
      'minCoverageCompletionsAllowed', 'maxCoverageCompletionsAllowed',
    ];
    for (const key of expected) {
      expect(CRITERIA_KEYS).toContain(key);
    }
  });
});

// ─── performance ─────────────────────────────────────────────────────────────

describe('filterPlayerPool – performance', () => {
  it('processes 2048 players with 2 seasons each: median run under 15 ms (warmed-up)', () => {
    const COUNT = 2048;
    const bigPlayers = Array.from({ length: COUNT }, (_, i) => player(1000 + i));

    // Deterministic values via linear congruential sequence to avoid flakiness
    let seed = 0xdeadbeef;
    const rng = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };

    const bigArchive = {};
    for (const p of bigPlayers) {
      const pid = String(p.id);
      bigArchive[pid] = {
        '2023': stats({
          targets:             Math.floor(rng() * 150),
          drops:               Math.floor(rng() * 10),
          sacksAllowed:        Math.floor(rng() * 15),
          sacksMade:           Math.floor(rng() * 8),
          battedPasses:        Math.floor(rng() * 6),
          coverageTargets:     Math.floor(rng() * 60),
          receptionsAllowed:   Math.floor(rng() * 40),
          coverageCompletionsAllowed: Math.floor(rng() * 35),
        }),
        '2024': stats({
          targets:             Math.floor(rng() * 150),
          drops:               Math.floor(rng() * 10),
          sacksAllowed:        Math.floor(rng() * 15),
          sacksMade:           Math.floor(rng() * 8),
          battedPasses:        Math.floor(rng() * 6),
          coverageTargets:     Math.floor(rng() * 60),
          receptionsAllowed:   Math.floor(rng() * 40),
          coverageCompletionsAllowed: Math.floor(rng() * 35),
        }),
      };
    }

    // ── Warmup phase ──────────────────────────────────────────────────────────
    // Allow V8 to JIT-compile the hot path before we record any timing.
    // Without warmup a single cold invocation can exceed the budget due to
    // interpreter overhead, making the assertion environment-dependent.
    const WARMUP_RUNS = 8;
    for (let w = 0; w < WARMUP_RUNS; w++) {
      filterPlayerPool(bigPlayers, bigArchive, { minTargets: 50, maxDrops: 8 });
    }

    // ── Measurement phase ─────────────────────────────────────────────────────
    // Collect multiple samples and use the median to guard against GC pauses,
    // CPU throttle spikes, or other transient environmental noise.
    const MEASURE_RUNS = 10;
    let result;
    const times = [];
    for (let m = 0; m < MEASURE_RUNS; m++) {
      const t0 = performance.now();
      result = filterPlayerPool(bigPlayers, bigArchive, { minTargets: 50, maxDrops: 8 });
      times.push(performance.now() - t0);
    }

    // Median of collected samples (robust against single outlier spikes).
    const sorted = [...times].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMs = sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

    // Rigid but achievable budget: 2 048 players must resolve well within a
    // single 16.7 ms frame even on warmed-up JIT paths.
    expect(medianMs).toBeLessThan(15);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThan(COUNT);
  });
});
