import { describe, expect, it } from 'vitest';
import {
  POSITION_NEED_LEVEL,
  POSITIONAL_NEED_DEFAULTS,
  POSITIONAL_NEED_MODIFIER_BOUNDS,
  applyPositionalNeedModifiers,
  buildTeamPositionDepthSnapshot,
  calculateTeamDepthDeficiencies,
  getNeedLevelForPlayer,
} from '../tradePositionalNeeds.js';
import { TEAM_STRATEGIC_POSTURE } from '../teamStrategicDirection.js';
import { buildTradeFinderAnalysis } from '../tradeFinderAnalysis.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const p = (pos, ovr, age = 26, extras = {}) => ({
  pos, ovr, age, potential: ovr + 2, ...extras,
});

/** A well-stocked roster covering all core positions with OVR ≥ 80 starters. */
const fullStrongRoster = [
  p('QB', 85), p('QB', 77),
  p('RB', 82), p('RB', 76), p('RB', 72),
  p('WR', 84), p('WR', 81), p('WR', 78), p('WR', 75), p('WR', 72),
  p('TE', 80), p('TE', 74),
  p('OL', 83), p('OL', 81), p('OL', 80), p('OL', 79), p('OL', 78), p('OL', 75),
  p('DL', 84), p('DL', 82), p('DL', 80), p('DL', 78), p('DL', 76),
  p('LB', 82), p('LB', 80), p('LB', 78), p('LB', 75),
  p('CB', 84), p('CB', 82), p('CB', 80), p('CB', 76), p('CB', 74),
  p('S',  82), p('S',  80), p('S',  76), p('S',  73),
  p('K',  78), p('P',  72),
];

// ── POSITION_NEED_LEVEL ───────────────────────────────────────────────────────

describe('POSITION_NEED_LEVEL enum', () => {
  it('exports all four levels as strings', () => {
    expect(POSITION_NEED_LEVEL.CRITICAL).toBe('CRITICAL');
    expect(POSITION_NEED_LEVEL.MODERATE).toBe('MODERATE');
    expect(POSITION_NEED_LEVEL.SECURE).toBe('SECURE');
    expect(POSITION_NEED_LEVEL.UNKNOWN).toBe('UNKNOWN');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(POSITION_NEED_LEVEL)).toBe(true);
  });
});

// ── buildTeamPositionDepthSnapshot ───────────────────────────────────────────

describe('buildTeamPositionDepthSnapshot', () => {
  it('returns a frozen map with a key for every position group', () => {
    const snap = buildTeamPositionDepthSnapshot(fullStrongRoster);
    expect(Object.isFrozen(snap)).toBe(true);
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P']) {
      expect(snap).toHaveProperty(pos);
      expect(Object.isFrozen(snap[pos])).toBe(true);
    }
  });

  it('each entry has the expected shape', () => {
    const snap = buildTeamPositionDepthSnapshot(fullStrongRoster);
    const qb = snap.QB;
    expect(typeof qb.starterCount).toBe('number');
    expect(typeof qb.playersCount).toBe('number');
    expect(typeof qb.startersCount).toBe('number');
    expect(typeof qb.depthCount).toBe('number');
    expect(typeof qb.avgStarterOvr).toBe('number');
    expect(typeof qb.bestStarterOvr).toBe('number');
  });

  it('counts starter and depth correctly for QB (1 starter expected)', () => {
    const snap = buildTeamPositionDepthSnapshot(fullStrongRoster);
    expect(snap.QB.starterCount).toBe(1);
    expect(snap.QB.startersCount).toBe(1);
    expect(snap.QB.bestStarterOvr).toBe(85);
    expect(snap.QB.avgStarterOvr).toBe(85);
    expect(snap.QB.depthCount).toBe(1); // second QB is depth
  });

  it('counts starter and depth correctly for WR (3 starters expected)', () => {
    const snap = buildTeamPositionDepthSnapshot(fullStrongRoster);
    expect(snap.WR.starterCount).toBe(3);
    expect(snap.WR.startersCount).toBe(3);
    expect(snap.WR.avgStarterOvr).toBeCloseTo((84 + 81 + 78) / 3, 1);
    expect(snap.WR.depthCount).toBe(2);
  });

  it('reports 0 avgStarterOvr and 0 playersCount for empty position', () => {
    const snap = buildTeamPositionDepthSnapshot([]);
    expect(snap.QB.avgStarterOvr).toBe(0);
    expect(snap.QB.playersCount).toBe(0);
    expect(snap.QB.startersCount).toBe(0);
  });

  it('normalizes position variants before bucketing', () => {
    const roster = [
      { pos: 'DE', ovr: 82, age: 27 }, { pos: 'DT', ovr: 78, age: 25 },
      { pos: 'NT', ovr: 76, age: 26 }, { pos: 'DE', ovr: 74, age: 28 },
      { pos: 'OT', ovr: 80, age: 27 }, { pos: 'LG', ovr: 78, age: 26 },
      { pos: 'RG', ovr: 77, age: 25 }, { pos: 'C',  ovr: 76, age: 28 },
      { pos: 'LT', ovr: 79, age: 27 },
    ];
    const snap = buildTeamPositionDepthSnapshot(roster);
    expect(snap.DL.playersCount).toBe(4);  // DE, DT, NT, DE
    expect(snap.OL.playersCount).toBe(5);  // OT, LG, RG, C, LT
  });

  it('does not mutate the input roster array', () => {
    const roster = [
      { pos: 'QB', ovr: 82, age: 27 },
      { pos: 'RB', ovr: 76, age: 24 },
    ];
    const before = JSON.stringify(roster);
    buildTeamPositionDepthSnapshot(roster);
    expect(JSON.stringify(roster)).toBe(before);
  });

  it('handles null/undefined/empty-object roster gracefully', () => {
    expect(() => buildTeamPositionDepthSnapshot(null)).not.toThrow();
    expect(() => buildTeamPositionDepthSnapshot(undefined)).not.toThrow();
    expect(() => buildTeamPositionDepthSnapshot({})).not.toThrow();
    const snap = buildTeamPositionDepthSnapshot(null);
    expect(snap.QB.playersCount).toBe(0);
  });
});

// ── calculateTeamDepthDeficiencies ───────────────────────────────────────────

describe('calculateTeamDepthDeficiencies', () => {
  it('returns a frozen map', () => {
    const needs = calculateTeamDepthDeficiencies(fullStrongRoster);
    expect(Object.isFrozen(needs)).toBe(true);
  });

  it('classifies well-stocked positions as SECURE', () => {
    const needs = calculateTeamDepthDeficiencies(fullStrongRoster);
    expect(needs.QB).toBe(POSITION_NEED_LEVEL.SECURE);
    expect(needs.WR).toBe(POSITION_NEED_LEVEL.SECURE);
    expect(needs.OL).toBe(POSITION_NEED_LEVEL.SECURE);
    expect(needs.CB).toBe(POSITION_NEED_LEVEL.SECURE);
  });

  it('classifies empty positions as CRITICAL', () => {
    const needs = calculateTeamDepthDeficiencies([]);
    expect(needs.QB).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(needs.OL).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(needs.WR).toBe(POSITION_NEED_LEVEL.CRITICAL);
  });

  it('classifies missing starter slot as CRITICAL', () => {
    // WR needs 3 starters; only 2 provided
    const roster = [p('QB', 82), p('WR', 80), p('WR', 78)];
    const needs = calculateTeamDepthDeficiencies(roster);
    expect(needs.WR).toBe(POSITION_NEED_LEVEL.CRITICAL);
  });

  it('classifies weak starter (OVR < criticalOvrThreshold) as CRITICAL', () => {
    const roster = [p('QB', 70)];  // 70 < 73
    const needs = calculateTeamDepthDeficiencies(roster);
    expect(needs.QB).toBe(POSITION_NEED_LEVEL.CRITICAL);
  });

  it('classifies moderate-quality starter (73–79) as MODERATE', () => {
    const roster = [p('QB', 76)];  // 73 ≤ 76 < 80
    const needs = calculateTeamDepthDeficiencies(roster);
    expect(needs.QB).toBe(POSITION_NEED_LEVEL.MODERATE);
  });

  it('classifies starter OVR ≥ 80 as SECURE when starter slot is filled', () => {
    const roster = [p('QB', 81)];
    const needs = calculateTeamDepthDeficiencies(roster);
    expect(needs.QB).toBe(POSITION_NEED_LEVEL.SECURE);
  });

  it('respects the OVR boundary exactly', () => {
    const atCritBoundary    = calculateTeamDepthDeficiencies([p('QB', 72)]);
    const aboveCritBoundary = calculateTeamDepthDeficiencies([p('QB', 73)]);
    const atModBoundary     = calculateTeamDepthDeficiencies([p('QB', 79)]);
    const aboveModBoundary  = calculateTeamDepthDeficiencies([p('QB', 80)]);
    expect(atCritBoundary.QB).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(aboveCritBoundary.QB).toBe(POSITION_NEED_LEVEL.MODERATE);
    expect(atModBoundary.QB).toBe(POSITION_NEED_LEVEL.MODERATE);
    expect(aboveModBoundary.QB).toBe(POSITION_NEED_LEVEL.SECURE);
  });

  it('weak CB group (OVR < 73) is CRITICAL', () => {
    const roster = [p('CB', 70), p('CB', 68), p('CB', 66)];
    const needs = calculateTeamDepthDeficiencies(roster);
    expect(needs.CB).toBe(POSITION_NEED_LEVEL.CRITICAL);
  });

  it('weak OL (avg < 73 across 5 expected starters) is CRITICAL', () => {
    const roster = [
      p('OL', 72), p('OL', 70), p('OL', 68), p('OL', 66), p('OL', 65),
    ];
    const needs = calculateTeamDepthDeficiencies(roster);
    expect(needs.OL).toBe(POSITION_NEED_LEVEL.CRITICAL);
  });

  it('does not mutate the input roster', () => {
    const roster = [{ pos: 'QB', ovr: 85, age: 26 }];
    const before = JSON.stringify(roster);
    calculateTeamDepthDeficiencies(roster);
    expect(JSON.stringify(roster)).toBe(before);
  });

  it('handles null/undefined inputs without throwing', () => {
    expect(() => calculateTeamDepthDeficiencies(null)).not.toThrow();
    expect(() => calculateTeamDepthDeficiencies(undefined)).not.toThrow();
  });
});

// ── getNeedLevelForPlayer ─────────────────────────────────────────────────────

describe('getNeedLevelForPlayer', () => {
  it('returns UNKNOWN when playerAsset is null or undefined', () => {
    expect(getNeedLevelForPlayer(null, {})).toBe(POSITION_NEED_LEVEL.UNKNOWN);
    expect(getNeedLevelForPlayer(undefined, {})).toBe(POSITION_NEED_LEVEL.UNKNOWN);
  });

  it('returns UNKNOWN when depthNeedsMap is null, undefined, or not an object', () => {
    expect(getNeedLevelForPlayer({ pos: 'QB' }, null)).toBe(POSITION_NEED_LEVEL.UNKNOWN);
    expect(getNeedLevelForPlayer({ pos: 'QB' }, undefined)).toBe(POSITION_NEED_LEVEL.UNKNOWN);
  });

  it('returns UNKNOWN when position is absent from the map', () => {
    const map = { QB: POSITION_NEED_LEVEL.SECURE };
    expect(getNeedLevelForPlayer({ pos: 'WR' }, map)).toBe(POSITION_NEED_LEVEL.UNKNOWN);
  });

  it('returns UNKNOWN when player has no pos field', () => {
    const map = { QB: POSITION_NEED_LEVEL.CRITICAL };
    expect(getNeedLevelForPlayer({}, map)).toBe(POSITION_NEED_LEVEL.UNKNOWN);
    expect(getNeedLevelForPlayer({ pos: null }, map)).toBe(POSITION_NEED_LEVEL.UNKNOWN);
  });

  it('returns the correct need level when position is in the map', () => {
    const map = {
      QB: POSITION_NEED_LEVEL.CRITICAL,
      WR: POSITION_NEED_LEVEL.MODERATE,
      OL: POSITION_NEED_LEVEL.SECURE,
    };
    expect(getNeedLevelForPlayer({ pos: 'QB' }, map)).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(getNeedLevelForPlayer({ pos: 'WR' }, map)).toBe(POSITION_NEED_LEVEL.MODERATE);
    expect(getNeedLevelForPlayer({ pos: 'OL' }, map)).toBe(POSITION_NEED_LEVEL.SECURE);
  });

  it('normalizes position variants before lookup', () => {
    const map = { DL: POSITION_NEED_LEVEL.CRITICAL, OL: POSITION_NEED_LEVEL.SECURE };
    expect(getNeedLevelForPlayer({ pos: 'DE' }, map)).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(getNeedLevelForPlayer({ pos: 'DT' }, map)).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(getNeedLevelForPlayer({ pos: 'NT' }, map)).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(getNeedLevelForPlayer({ pos: 'OT' }, map)).toBe(POSITION_NEED_LEVEL.SECURE);
    expect(getNeedLevelForPlayer({ pos: 'LT' }, map)).toBe(POSITION_NEED_LEVEL.SECURE);
    expect(getNeedLevelForPlayer({ pos: 'ILB' }, { LB: POSITION_NEED_LEVEL.MODERATE })).toBe(POSITION_NEED_LEVEL.MODERATE);
  });
});

// ── applyPositionalNeedModifiers ──────────────────────────────────────────────

describe('applyPositionalNeedModifiers', () => {
  const { MAX_PREMIUM, MIN_MODIFIER } = POSITIONAL_NEED_MODIFIER_BOUNDS;

  it('returns base value unchanged (1.00×) when need level is UNKNOWN', () => {
    // No pos in map → UNKNOWN
    expect(applyPositionalNeedModifiers({ pos: 'QB', ovr: 80 }, 200, {})).toBe(200);
    // Null map → UNKNOWN
    expect(applyPositionalNeedModifiers({ pos: 'QB', ovr: 80 }, 200, null)).toBe(200);
  });

  it('returns 0 for zero, null, or negative base values', () => {
    const map = { QB: POSITION_NEED_LEVEL.CRITICAL };
    expect(applyPositionalNeedModifiers({ pos: 'QB' }, 0,   map)).toBe(0);
    expect(applyPositionalNeedModifiers({ pos: 'QB' }, null, map)).toBe(0);
    expect(applyPositionalNeedModifiers({ pos: 'QB' }, -50, map)).toBe(0);
  });

  it('CRITICAL need applies a premium (result > base)', () => {
    const map = { QB: POSITION_NEED_LEVEL.CRITICAL };
    const result = applyPositionalNeedModifiers({ pos: 'QB', ovr: 78 }, 200, map);
    expect(result).toBeGreaterThan(200);
  });

  it('MODERATE need applies a smaller premium than CRITICAL', () => {
    const critMap = { QB: POSITION_NEED_LEVEL.CRITICAL };
    const modMap  = { QB: POSITION_NEED_LEVEL.MODERATE };
    const player  = { pos: 'QB', ovr: 76 };
    const critVal = applyPositionalNeedModifiers(player, 200, critMap);
    const modVal  = applyPositionalNeedModifiers(player, 200, modMap);
    expect(critVal).toBeGreaterThan(modVal);
    expect(modVal).toBeGreaterThan(200);
  });

  it('SECURE need applies a mild discount for ordinary players', () => {
    const map    = { WR: POSITION_NEED_LEVEL.SECURE };
    const player = { pos: 'WR', ovr: 74, age: 29, potential: 74 };
    const result = applyPositionalNeedModifiers(player, 200, map);
    expect(result).toBeLessThan(200);
  });

  it('critical need multiplier is strictly greater than secure multiplier (same player)', () => {
    const critMap = { CB: POSITION_NEED_LEVEL.CRITICAL };
    const secMap  = { CB: POSITION_NEED_LEVEL.SECURE };
    const player  = { pos: 'CB', ovr: 75, age: 27 };
    expect(applyPositionalNeedModifiers(player, 200, critMap))
      .toBeGreaterThan(applyPositionalNeedModifiers(player, 200, secMap));
  });

  it('modifier never exceeds MAX_PREMIUM ceiling', () => {
    const critMap = { QB: POSITION_NEED_LEVEL.CRITICAL };
    const player  = { pos: 'QB', ovr: 80 };
    const result  = applyPositionalNeedModifiers(player, 200, critMap, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(result).toBeLessThanOrEqual(Math.round(200 * MAX_PREMIUM));
  });

  it('modifier never goes below MIN_MODIFIER floor', () => {
    const secMap = { QB: POSITION_NEED_LEVEL.SECURE };
    const player = { pos: 'QB', ovr: 60, age: 32, potential: 60 };
    const result = applyPositionalNeedModifiers(player, 200, secMap, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    expect(result).toBeGreaterThanOrEqual(Math.round(200 * MIN_MODIFIER));
  });

  // ── Elite player guard ─────────────────────────────────────────────────────

  it('elite player (OVR ≥ eliteOvrFloor) receives no discount at SECURE positions', () => {
    const { eliteOvrFloor } = POSITIONAL_NEED_DEFAULTS;
    const secMap  = { WR: POSITION_NEED_LEVEL.SECURE };
    const elite   = { pos: 'WR', ovr: eliteOvrFloor, age: 28, potential: eliteOvrFloor };
    const result  = applyPositionalNeedModifiers(elite, 300, secMap);
    expect(result).toBeGreaterThanOrEqual(300);
  });

  it('elite player at SECURE position for a rebuilder is also not discounted', () => {
    const secMap = { QB: POSITION_NEED_LEVEL.SECURE };
    const elite  = { pos: 'QB', ovr: 84, age: 30, potential: 84 };
    const result = applyPositionalNeedModifiers(elite, 300, secMap, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(result).toBeGreaterThanOrEqual(300);
  });

  // ── Rebuilder posture ─────────────────────────────────────────────────────

  it('rebuilder: young high-upside player at SECURE position receives no discount (1.00×)', () => {
    const secMap     = { WR: POSITION_NEED_LEVEL.SECURE };
    const youngUpside = { pos: 'WR', ovr: 72, age: 22, potential: 84 };  // pot − ovr = 12
    const result     = applyPositionalNeedModifiers(youngUpside, 200, secMap, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(result).toBe(200);  // exactly 1.00× — discount removed
  });

  it('rebuilder: non-upside veteran at SECURE position still gets mild discount', () => {
    const secMap = { WR: POSITION_NEED_LEVEL.SECURE };
    const vet    = { pos: 'WR', ovr: 76, age: 32, potential: 76 };  // pot − ovr = 0
    const result = applyPositionalNeedModifiers(vet, 200, secMap, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(result).toBeLessThan(200);
  });

  it('rebuilder: young upside discount guard is not triggered without sufficient potential delta', () => {
    const secMap        = { WR: POSITION_NEED_LEVEL.SECURE };
    const youngLowUpside = { pos: 'WR', ovr: 72, age: 22, potential: 73 };  // pot − ovr = 1 < 4
    const result        = applyPositionalNeedModifiers(youngLowUpside, 200, secMap, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(result).toBeLessThan(200);  // discount still applies
  });

  // ── Contender posture ─────────────────────────────────────────────────────

  it('contender: CRITICAL need premium is higher than NEUTRAL baseline', () => {
    const critMap = { QB: POSITION_NEED_LEVEL.CRITICAL };
    const player  = { pos: 'QB', ovr: 78 };
    const neutral  = applyPositionalNeedModifiers(player, 200, critMap, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    const contender = applyPositionalNeedModifiers(player, 200, critMap, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(contender).toBeGreaterThan(neutral);
  });

  it('contender: MODERATE need premium is higher than NEUTRAL baseline', () => {
    const modMap  = { CB: POSITION_NEED_LEVEL.MODERATE };
    const player  = { pos: 'CB', ovr: 77 };
    const neutral  = applyPositionalNeedModifiers(player, 250, modMap, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    const contender = applyPositionalNeedModifiers(player, 250, modMap, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(contender).toBeGreaterThan(neutral);
  });

  it('contender: SECURE position discount is unchanged from NEUTRAL (no additional boost)', () => {
    const secMap  = { RB: POSITION_NEED_LEVEL.SECURE };
    const player  = { pos: 'RB', ovr: 75, age: 28, potential: 75 };
    const neutral  = applyPositionalNeedModifiers(player, 200, secMap, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    const contender = applyPositionalNeedModifiers(player, 200, secMap, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(contender).toBe(neutral);  // contender posture adds no SECURE-position adjustment
  });

  // ── No mutation ───────────────────────────────────────────────────────────

  it('does not mutate the player asset object', () => {
    const map    = { QB: POSITION_NEED_LEVEL.CRITICAL };
    const player = { pos: 'QB', ovr: 80, age: 26, potential: 84 };
    const before = JSON.stringify(player);
    applyPositionalNeedModifiers(player, 200, map);
    expect(JSON.stringify(player)).toBe(before);
  });

  it('does not mutate the depth needs map', () => {
    const map    = { QB: POSITION_NEED_LEVEL.CRITICAL };
    const before = JSON.stringify(map);
    applyPositionalNeedModifiers({ pos: 'QB', ovr: 80 }, 200, map);
    expect(JSON.stringify(map)).toBe(before);
  });

  // ── Edge cases / safety ───────────────────────────────────────────────────

  it('unknown data does not crash and returns base (1.00×)', () => {
    expect(() => applyPositionalNeedModifiers({},     200, {})).not.toThrow();
    expect(() => applyPositionalNeedModifiers(null,   200, {})).not.toThrow();
    expect(() => applyPositionalNeedModifiers(undefined, 200, {})).not.toThrow();
    expect(applyPositionalNeedModifiers({},     200, {})).toBe(200);
    expect(applyPositionalNeedModifiers(null,   200, {})).toBe(200);
  });

  it('returns a rounded integer result', () => {
    const map    = { QB: POSITION_NEED_LEVEL.CRITICAL };
    const result = applyPositionalNeedModifiers({ pos: 'QB', ovr: 78 }, 197, map);
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ── calculateTeamDepthDeficiencies + applyPositionalNeedModifiers round-trip ──

describe('need classification → modifier round-trip', () => {
  it('player filling a CRITICAL need always receives a higher modifier than SECURE', () => {
    const critRoster = [];   // no players → every position CRITICAL
    const secRoster  = fullStrongRoster;

    const critNeeds = calculateTeamDepthDeficiencies(critRoster);
    const secNeeds  = calculateTeamDepthDeficiencies(secRoster);

    const player = { pos: 'QB', ovr: 78, age: 26 };
    const critVal = applyPositionalNeedModifiers(player, 200, critNeeds);
    const secVal  = applyPositionalNeedModifiers(player, 200, secNeeds);

    expect(critVal).toBeGreaterThan(secVal);
  });

  it('a well-stocked position returns SECURE and applies at most a mild discount', () => {
    const needs  = calculateTeamDepthDeficiencies(fullStrongRoster);
    expect(needs.QB).toBe(POSITION_NEED_LEVEL.SECURE);

    const player = { pos: 'QB', ovr: 76, age: 28, potential: 76 };
    const result = applyPositionalNeedModifiers(player, 200, needs);
    // Discount must be mild (above MIN_MODIFIER) and not zero-out the value
    expect(result).toBeGreaterThan(Math.round(200 * POSITIONAL_NEED_MODIFIER_BOUNDS.MIN_MODIFIER));
    expect(result).toBeLessThanOrEqual(200);
  });
});

// ── Integration: tradeFinderAnalysis wiring ──────────────────────────────────

describe('tradePositionalNeeds integration (receiving-team perspective)', () => {
  const mkP = (id, teamId, pos, ovr, extras = {}) => ({
    id, teamId, pos, ovr, potential: ovr + 2, age: 26, name: `P${id}`,
    contract: { baseAnnual: 6, yearsRemaining: 2 }, ...extras,
  });

  const makeBase = () => {
    const userRoster = [
      mkP(1,  1, 'QB', 82), mkP(2,  1, 'RB', 80), mkP(3,  1, 'RB', 75),
      mkP(4,  1, 'WR', 70), mkP(5,  1, 'WR', 68), mkP(6,  1, 'TE', 74),
      ...Array.from({ length: 5 }, (_, i) => mkP(10 + i, 1, 'OL', 75 - i)),
      ...Array.from({ length: 4 }, (_, i) => mkP(20 + i, 1, 'DL', 74 - i)),
      ...Array.from({ length: 3 }, (_, i) => mkP(30 + i, 1, 'LB', 73 - i)),
      ...Array.from({ length: 3 }, (_, i) => mkP(40 + i, 1, 'CB', 73 - i)),
      mkP(50, 1, 'S', 74), mkP(51, 1, 'S', 73),
      mkP(60, 1, 'K', 70), mkP(61, 1, 'P', 70),
    ];
    const teams = [{ id: 1, abbr: 'USR' }, { id: 2, abbr: 'AI1' }, { id: 3, abbr: 'AI2' }];
    const leaguePlayers = [
      ...userRoster,
      mkP(101, 2, 'WR', 89, { potential: 92, age: 23, contract: { baseAnnual: 12, yearsRemaining: 3 } }),
      mkP(102, 2, 'WR', 84),
      mkP(103, 3, 'WR', 79, { age: 32, contract: { baseAnnual: 18, yearsRemaining: 2 } }),
    ];
    return { userTeam: { id: 1 }, teams, userRoster, leaguePlayers, league: { year: 2027 }, cap: { capRoom: 5 } };
  };

  it('trade ideas are still generated after positional need wiring', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.length).toBeGreaterThan(0);
  });

  it('trade ideas remain sorted by fitScore (ordering invariant holds)', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((v, idx, arr) => idx === 0 || arr[idx - 1].fitScore >= v.fitScore)).toBe(true);
  });

  it('output shape is stable — all required fields present on every idea', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(Array.isArray(out.tradeIdeas)).toBe(true);
    for (const idea of out.tradeIdeas) {
      expect(Array.isArray(idea.confidenceReasons)).toBe(true);
      expect(Array.isArray(idea.warnings)).toBe(true);
      expect(Array.isArray(idea.outgoingAssets)).toBe(true);
      expect(typeof idea.fitScore).toBe('number');
      expect(typeof idea.valueDelta).toBe('number');
    }
  });

  it('ideas list is capped at 15', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.length).toBeLessThanOrEqual(15);
  });

  it('all ideas target non-user teams', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i) => Number(i.targetTeamId) !== 1)).toBe(true);
  });

  it('empty input does not throw and returns stable shape', () => {
    expect(() => buildTradeFinderAnalysis({ userTeam: { id: 1 } })).not.toThrow();
    const out = buildTradeFinderAnalysis({ userTeam: { id: 1 } });
    expect(Array.isArray(out.tradeIdeas)).toBe(true);
    expect(out.tradeIdeas.length).toBe(0);
  });
});
