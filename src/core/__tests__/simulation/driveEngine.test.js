import { describe, it, expect } from 'vitest';
import {
  advanceDownDistance,
  buildDriveBasedSummary,
  computeTeamOffensiveRating,
  computeTeamDefensiveRating,
} from '../../simulation/driveEngine.js';

describe('driveEngine.advanceDownDistance', () => {
  it('resets to first down when the gain converts the distance', () => {
    const next = advanceDownDistance({ down: 2, distance: 7, yardLine: 40 }, 8);
    expect(next.firstDown).toBe(true);
    expect(next.down).toBe(1);
    expect(next.distance).toBe(10);
    expect(next.yardLine).toBe(48);
    expect(next.turnoverOnDowns).toBe(false);
  });

  it('flags a turnover on downs when 4th down fails to convert', () => {
    const next = advanceDownDistance({ down: 4, distance: 5, yardLine: 50 }, 2);
    expect(next.firstDown).toBe(false);
    expect(next.turnoverOnDowns).toBe(true);
    expect(next.down).toBe(5);
    expect(next.distance).toBe(3);
  });

  it('flags a touchdown when the gain reaches the end zone', () => {
    const next = advanceDownDistance({ down: 1, distance: 10, yardLine: 95 }, 9);
    expect(next.touchdown).toBe(true);
    expect(next.yardLine).toBe(99); // field position clamped to [1,99]
  });
});

describe('driveEngine.buildDriveBasedSummary', () => {
  const BASE_ARGS = {
    season: 2025, week: 3,
    home: { id: 1 }, away: { id: 2 },
    homeOff: 80, awayOff: 78, homeDef: 76, awayDef: 75,
    globalSeed: 42,
  };

  it('is deterministic for the same season/week/teams/seed', () => {
    const a = buildDriveBasedSummary(BASE_ARGS);
    const b = buildDriveBasedSummary(BASE_ARGS);
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    expect(a.seed).toBe(b.seed);
    // Pin the specific seed-42 output so regressions to the PRNG stream are caught.
    expect(a.homeScore).toBe(57);
    expect(a.awayScore).toBe(30);
  });

  it('keeps possession counts correlated (|homeDrives - awayDrives| ≤ 3) for 100 seeded runs', () => {
    // The correlated split formula guarantees max |diff| = 3 (odd totalDrives + offset +1).
    for (let seed = 1; seed <= 100; seed++) {
      const { homeDrives, awayDrives } = buildDriveBasedSummary({
        season: 2025, week: 1,
        home: { id: 10 }, away: { id: 20 },
        globalSeed: seed,
      });
      expect(Math.abs(homeDrives - awayDrives)).toBeLessThanOrEqual(3);
    }
  });
});

// ── Team attribute composites ────────────────────────────────────────────────

/** Build a roster of players at the given positions with uniform ratings. */
function makeRoster(level, ratingKeys) {
  const positions = [
    'QB', 'RB',
    'WR', 'WR', 'WR', 'TE',
    'OL', 'OL', 'OL', 'OL', 'OL',
    'DL', 'DL', 'DL', 'DL',
    'LB', 'LB', 'LB',
    'CB', 'CB', 'CB',
    'S', 'S',
  ];
  return positions.map((pos, i) => ({
    id: i,
    pos,
    ovr: level,
    ratings: Object.fromEntries(ratingKeys.map((k) => [k, level])),
  }));
}

const ALL_RATING_KEYS = [
  'throwAccuracy', 'throwPower', 'awareness', 'passBlock', 'runBlock',
  'strength', 'catching', 'catchInTraffic', 'speed', 'acceleration',
  'trucking', 'juking', 'passRushPower', 'passRushSpeed', 'tackle',
  'runStop', 'coverage',
];

describe('driveEngine.computeTeamOffensiveRating', () => {
  it('rates a strong offense above a weak one', () => {
    const strong = computeTeamOffensiveRating(makeRoster(90, ALL_RATING_KEYS));
    const weak = computeTeamOffensiveRating(makeRoster(60, ALL_RATING_KEYS));
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeCloseTo(90, 5);
    expect(weak).toBeCloseTo(60, 5);
  });

  it('clamps to [55, 95]', () => {
    expect(computeTeamOffensiveRating(makeRoster(99, ALL_RATING_KEYS))).toBe(95);
    expect(computeTeamOffensiveRating(makeRoster(30, ALL_RATING_KEYS))).toBe(55);
  });

  it('falls back to player OVR when granular ratings are missing', () => {
    const noGranular = makeRoster(85, []); // players have ovr only
    expect(computeTeamOffensiveRating(noGranular)).toBeCloseTo(85, 5);
  });

  it('is deterministic and does not mutate the roster', () => {
    const roster = makeRoster(80, ALL_RATING_KEYS);
    const snapshot = JSON.stringify(roster);
    const a = computeTeamOffensiveRating(roster);
    const b = computeTeamOffensiveRating(roster);
    expect(a).toBe(b);
    expect(JSON.stringify(roster)).toBe(snapshot);
  });

  it('returns a safe default for an empty roster', () => {
    expect(computeTeamOffensiveRating([])).toBe(70);
  });
});

describe('driveEngine.computeTeamDefensiveRating', () => {
  it('rates a strong defense above a weak one', () => {
    const strong = computeTeamDefensiveRating(makeRoster(90, ALL_RATING_KEYS));
    const weak = computeTeamDefensiveRating(makeRoster(60, ALL_RATING_KEYS));
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeCloseTo(90, 5);
    expect(weak).toBeCloseTo(60, 5);
  });

  it('clamps to [55, 95]', () => {
    expect(computeTeamDefensiveRating(makeRoster(99, ALL_RATING_KEYS))).toBe(95);
    expect(computeTeamDefensiveRating(makeRoster(30, ALL_RATING_KEYS))).toBe(55);
  });

  it('falls back to player OVR when granular ratings are missing', () => {
    const noGranular = makeRoster(85, []);
    expect(computeTeamDefensiveRating(noGranular)).toBeCloseTo(85, 5);
  });

  it('handles players with neither granular ratings nor OVR', () => {
    const roster = [
      { pos: 'QB' }, { pos: 'DL' }, { pos: 'CB' },
    ];
    expect(computeTeamOffensiveRating(roster)).toBe(70);
    expect(computeTeamDefensiveRating(roster)).toBe(70);
  });
});

describe('driveEngine.buildDriveBasedSummary with rosters', () => {
  const ROSTER_ARGS = {
    season: 2025, week: 3,
    home: { id: 1 }, away: { id: 2 },
    globalSeed: 42,
    homeRoster: makeRoster(88, ALL_RATING_KEYS),
    awayRoster: makeRoster(64, ALL_RATING_KEYS),
  };

  it('stays backward-compatible when only flat ratings are passed', () => {
    const flat = buildDriveBasedSummary({
      season: 2025, week: 3,
      home: { id: 1 }, away: { id: 2 },
      homeOff: 80, awayOff: 78, homeDef: 76, awayDef: 75,
      globalSeed: 42,
    });
    // Same pinned seed-42 output as the legacy test — flat callers are untouched.
    expect(flat.homeScore).toBe(57);
    expect(flat.awayScore).toBe(30);
  });

  it('accepts homeRoster/awayRoster and is deterministic for the same seed', () => {
    const a = buildDriveBasedSummary(ROSTER_ARGS);
    const b = buildDriveBasedSummary(ROSTER_ARGS);
    expect(a).toEqual(b);
  });

  it('keeps the same return shape with rosters provided', () => {
    const summary = buildDriveBasedSummary(ROSTER_ARGS);
    for (const key of [
      'seed', 'homeScore', 'awayScore', 'homeDrives', 'awayDrives',
      'homeTDs', 'awayTDs', 'homeFGs', 'awayFGs', 'homeXPs', 'awayXPs',
      'homeStats', 'awayStats',
    ]) {
      expect(summary).toHaveProperty(key);
    }
    expect(summary.homeScore).toBe(summary.homeTDs * 7 + summary.homeFGs * 3);
    expect(summary.awayScore).toBe(summary.awayTDs * 7 + summary.awayFGs * 3);
  });

  it('roster-derived ratings drive scoring (strong roster outscores weak over many seeds)', () => {
    let strongTotal = 0;
    let weakTotal = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const { homeScore, awayScore } = buildDriveBasedSummary({
        ...ROSTER_ARGS, globalSeed: seed,
      });
      strongTotal += homeScore;
      weakTotal += awayScore;
    }
    expect(strongTotal).toBeGreaterThan(weakTotal);
  });

  it('ignores empty rosters and keeps flat-number behavior', () => {
    const flat = buildDriveBasedSummary({
      season: 2025, week: 3,
      home: { id: 1 }, away: { id: 2 },
      homeOff: 80, awayOff: 78, homeDef: 76, awayDef: 75,
      globalSeed: 42,
      homeRoster: [], awayRoster: [],
    });
    expect(flat.homeScore).toBe(57);
    expect(flat.awayScore).toBe(30);
  });
});
