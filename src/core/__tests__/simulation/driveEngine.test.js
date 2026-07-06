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
    // Fourth-down + special-teams V1 added new rng() draws (drive start field
    // position, FG/punt decisions, 2-pt tries), so the pinned values changed
    // from the pre-special-teams 57/30 to the new deterministic output.
    expect(a.homeScore).toBe(43);
    expect(a.awayScore).toBe(45);
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
    // (Values updated for fourth-down + special-teams V1; see comment above.)
    expect(flat.homeScore).toBe(43);
    expect(flat.awayScore).toBe(45);
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
    // Score identity with PATs modeled explicitly: a TD is 6 + made XP (+1)
    // or made 2-pt (+2); a failed 2-pt adds nothing.
    expect(summary.homeScore).toBe(
      summary.homeTDs * 6 + summary.homeXPs + summary.homeStats.twoPointMade * 2 + summary.homeFGs * 3,
    );
    expect(summary.awayScore).toBe(
      summary.awayTDs * 6 + summary.awayXPs + summary.awayStats.twoPointMade * 2 + summary.awayFGs * 3,
    );
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

  it('exposes special-teams counters on homeStats/awayStats', () => {
    const summary = buildDriveBasedSummary(ROSTER_ARGS);
    for (const side of [summary.homeStats, summary.awayStats]) {
      for (const key of ['punts', 'fgAttempts', 'fgMade', 'twoPointAttempts', 'twoPointMade']) {
        expect(side).toHaveProperty(key);
        expect(side[key]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('ignores empty rosters and keeps flat-number behavior', () => {
    const flat = buildDriveBasedSummary({
      season: 2025, week: 3,
      home: { id: 1 }, away: { id: 2 },
      homeOff: 80, awayOff: 78, homeDef: 76, awayDef: 75,
      globalSeed: 42,
      homeRoster: [], awayRoster: [],
    });
    // Same pinned seed-42 output as above (fourth-down + special-teams V1).
    expect(flat.homeScore).toBe(43);
    expect(flat.awayScore).toBe(45);
  });
});

// ── Fourth down + special teams V1 ───────────────────────────────────────────

describe('driveEngine.buildDriveBasedSummary fourth-down/special-teams model', () => {
  const gameForSeed = (seed) => buildDriveBasedSummary({
    season: 2025, week: 5,
    home: { id: 3 }, away: { id: 4 },
    homeOff: 79, awayOff: 77, homeDef: 74, awayDef: 76,
    globalSeed: seed,
  });

  it('produces FG makes, punts, and 2-pt attempts in aggregate over 200 seeded games', () => {
    const baseSeed = 1000;
    let fgMade = 0;
    let punts = 0;
    let twoPointAttempts = 0;
    let twoPointMade = 0;
    for (let i = 0; i < 200; i++) {
      const g = gameForSeed(baseSeed + i);
      for (const side of [g.homeStats, g.awayStats]) {
        fgMade += side.fgMade;
        punts += side.punts;
        twoPointAttempts += side.twoPointAttempts;
        twoPointMade += side.twoPointMade;
        // Per-team sanity: makes can never exceed attempts.
        expect(side.twoPointMade).toBeLessThanOrEqual(side.twoPointAttempts);
        expect(side.fgMade).toBeLessThanOrEqual(side.fgAttempts);
      }
    }
    expect(fgMade).toBeGreaterThan(0);
    expect(punts).toBeGreaterThan(0);
    expect(twoPointAttempts).toBeGreaterThan(0);
    expect(twoPointMade).toBeLessThanOrEqual(twoPointAttempts);
  });

  it('holds the exact score identity for every team in 200 seeded games', () => {
    // A failed 2-pt try must add 0 PAT points — these identities catch any
    // accidental "+1 on failed 2-pt" regression cleanly.
    const baseSeed = 5000;
    for (let i = 0; i < 200; i++) {
      const g = gameForSeed(baseSeed + i);
      // Every TD gets exactly one PAT try: an XP kick or a 2-pt attempt.
      expect(g.homeXPs + g.homeStats.twoPointAttempts).toBe(g.homeTDs);
      expect(g.awayXPs + g.awayStats.twoPointAttempts).toBe(g.awayTDs);
      // Scoreboard reconciles exactly with the scoring-play breakdown.
      expect(g.homeScore).toBe(
        g.homeTDs * 6 + g.homeXPs + g.homeStats.twoPointMade * 2 + g.homeFGs * 3,
      );
      expect(g.awayScore).toBe(
        g.awayTDs * 6 + g.awayXPs + g.awayStats.twoPointMade * 2 + g.awayFGs * 3,
      );
    }
  });
});
