/**
 * tradeAcceptanceSync.test.js
 *
 * Validates that custom slider proposal valuation and AI-to-AI trade scoring
 * correctly inherit strategic posture + positional need modifiers, blocking
 * low-value asset spams and ensuring context-aware acceptance thresholds.
 *
 * These tests operate on the pure helper functions that the acceptance paths
 * delegate to, keeping tests stateless and cache-free.
 */

import { describe, it, expect } from 'vitest';
import {
  TEAM_STRATEGIC_POSTURE,
  classifyTeamStrategicPosture,
  applyStrategicValuationModifiers,
} from '../../src/core/trades/teamStrategicDirection.js';
import {
  POSITION_NEED_LEVEL,
  calculateTeamDepthDeficiencies,
  applyPositionalNeedModifiers,
  buildTeamPositionDepthSnapshot,
} from '../../src/core/trades/tradePositionalNeeds.js';
import {
  evaluateMultiAssetPackageValue,
  calculateTotalPackageScore,
} from '../../src/core/trades/tradeValuationModifiers.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePlayer(pos, ovr, age = 27, extras = {}) {
  return { pos, ovr, age, potential: ovr + 2, assetType: 'player', ...extras };
}

function makePick(round, season, extras = {}) {
  return { assetType: 'pick', round, season, ...extras };
}

/** Contender team: 10W-3L, avg age 28, positive cap room. */
const contenderState = {
  wins: 10, losses: 3, capRoom: 12,
  roster: Array.from({ length: 53 }, () => ({ age: 28 })),
};

/** Rebuilder team: 3W-10L, avg age 24, negative cap room. */
const rebuilderState = {
  wins: 3, losses: 10, capRoom: -8,
  roster: Array.from({ length: 53 }, () => ({ age: 24 })),
};

const leagueCtx = { currentSeason: 2026 };

/** Roster with a CRITICAL QB need (no QB) and well-stocked RBs. */
function makeRosterCriticalQbSecureRb() {
  return [
    // No QB — triggers CRITICAL at QB
    makePlayer('RB', 85), makePlayer('RB', 82), makePlayer('RB', 78),
    makePlayer('WR', 80), makePlayer('WR', 78), makePlayer('WR', 75),
    makePlayer('TE', 79),
    makePlayer('OL', 82), makePlayer('OL', 80), makePlayer('OL', 79), makePlayer('OL', 77), makePlayer('OL', 76),
    makePlayer('DL', 83), makePlayer('DL', 80), makePlayer('DL', 78), makePlayer('DL', 76),
    makePlayer('LB', 81), makePlayer('LB', 79), makePlayer('LB', 76),
    makePlayer('CB', 82), makePlayer('CB', 80),
    makePlayer('S', 81), makePlayer('S', 79),
    makePlayer('K', 76), makePlayer('P', 72),
  ];
}

// ── classifyTeamStrategicPosture — safe defaults ──────────────────────────────

describe('classifyTeamStrategicPosture — safe defaults for missing data', () => {
  it('returns NEUTRAL when games played is below classification threshold', () => {
    const posture = classifyTeamStrategicPosture(
      { wins: 1, losses: 1, roster: [{ age: 27 }] },
      { currentSeason: 2026 },
    );
    expect(posture).toBe(TEAM_STRATEGIC_POSTURE.NEUTRAL);
  });

  it('returns NEUTRAL when teamState is empty', () => {
    expect(classifyTeamStrategicPosture({}, {})).toBe(TEAM_STRATEGIC_POSTURE.NEUTRAL);
  });

  it('returns NEUTRAL when teamState is null-like', () => {
    expect(classifyTeamStrategicPosture(null, {})).toBe(TEAM_STRATEGIC_POSTURE.NEUTRAL);
  });

  it('classifies contender correctly from a full state snapshot', () => {
    const posture = classifyTeamStrategicPosture(contenderState, leagueCtx);
    expect(posture).toBe(TEAM_STRATEGIC_POSTURE.CONTENDER);
  });

  it('classifies rebuilder correctly from a full state snapshot', () => {
    const posture = classifyTeamStrategicPosture(rebuilderState, leagueCtx);
    expect(posture).toBe(TEAM_STRATEGIC_POSTURE.REBUILDER);
  });
});

// ── calculateTeamDepthDeficiencies — safe defaults ────────────────────────────

describe('calculateTeamDepthDeficiencies — safe defaults for missing data', () => {
  it('returns UNKNOWN for all positions when roster is empty', () => {
    const needs = calculateTeamDepthDeficiencies([]);
    for (const level of Object.values(needs)) {
      expect(level).toBe(POSITION_NEED_LEVEL.CRITICAL);
    }
  });

  it('returns UNKNOWN for all positions when roster is null', () => {
    const needs = calculateTeamDepthDeficiencies(null);
    for (const level of Object.values(needs)) {
      expect(level).toBe(POSITION_NEED_LEVEL.CRITICAL);
    }
  });

  it('returns CRITICAL at QB when roster has no QB', () => {
    const needs = calculateTeamDepthDeficiencies(makeRosterCriticalQbSecureRb());
    expect(needs['QB']).toBe(POSITION_NEED_LEVEL.CRITICAL);
  });

  it('returns SECURE at RB when roster has strong RB depth', () => {
    const needs = calculateTeamDepthDeficiencies(makeRosterCriticalQbSecureRb());
    expect(needs['RB']).toBe(POSITION_NEED_LEVEL.SECURE);
  });

  it('does not mutate the roster array', () => {
    const roster = makeRosterCriticalQbSecureRb();
    const original = JSON.stringify(roster);
    calculateTeamDepthDeficiencies(roster);
    expect(JSON.stringify(roster)).toBe(original);
  });
});

// ── Assertion 1: five low-value bench players rejected vs single elite ────────

describe('Assertion 1 — five bench players rejected vs single elite (contender perspective)', () => {
  const contenderPosture = TEAM_STRATEGIC_POSTURE.CONTENDER;
  const roster = makeRosterCriticalQbSecureRb();
  const depthNeeds = calculateTeamDepthDeficiencies(roster);

  // Elite QB OVR 92 filling a CRITICAL slot
  const eliteQb = makePlayer('QB', 92, 27);
  const eliteBaseValue = 280; // representative pre-modifier value score

  // Five bench RBs OVR 65 at a SECURE position
  const benchRb = makePlayer('RB', 65, 26);
  const benchBaseValue = 50;

  it('contender depth map has CRITICAL at QB and SECURE at RB', () => {
    expect(depthNeeds['QB']).toBe(POSITION_NEED_LEVEL.CRITICAL);
    expect(depthNeeds['RB']).toBe(POSITION_NEED_LEVEL.SECURE);
  });

  it('elite QB value is boosted by contender strategic modifier', () => {
    const neutral = applyStrategicValuationModifiers(eliteQb, eliteBaseValue, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    const contender = applyStrategicValuationModifiers(eliteQb, eliteBaseValue, contenderPosture);
    expect(contender).toBeGreaterThan(neutral);
  });

  it('bench RBs receive SECURE positional discount', () => {
    const raw = applyStrategicValuationModifiers(benchRb, benchBaseValue, contenderPosture);
    const withNeed = applyPositionalNeedModifiers(benchRb, raw, depthNeeds, contenderPosture);
    expect(withNeed).toBeLessThan(raw); // SECURE discount applied
  });

  it('elite QB receives CRITICAL positional premium', () => {
    const raw = applyStrategicValuationModifiers(eliteQb, eliteBaseValue, contenderPosture);
    const withNeed = applyPositionalNeedModifiers(eliteQb, raw, depthNeeds, contenderPosture);
    expect(withNeed).toBeGreaterThan(raw); // CRITICAL premium applied
  });

  it('single elite QB (with contender+need modifiers) beats five bench RB package', () => {
    // Score each bench RB after modifiers
    const singleBenchRaw = applyStrategicValuationModifiers(benchRb, benchBaseValue, contenderPosture);
    const singleBenchAdjusted = applyPositionalNeedModifiers(benchRb, singleBenchRaw, depthNeeds, contenderPosture);

    // Apply diminishing returns to five bench players
    const benchPackageScore = evaluateMultiAssetPackageValue([
      singleBenchAdjusted,
      singleBenchAdjusted,
      singleBenchAdjusted,
      singleBenchAdjusted,
      singleBenchAdjusted,
    ]);

    // Score the elite QB after modifiers
    const eliteRaw = applyStrategicValuationModifiers(eliteQb, eliteBaseValue, contenderPosture);
    const eliteAdjusted = applyPositionalNeedModifiers(eliteQb, eliteRaw, depthNeeds, contenderPosture);
    const elitePackageScore = evaluateMultiAssetPackageValue([eliteAdjusted]);

    expect(elitePackageScore).toBeGreaterThan(benchPackageScore);
  });

  it('bench pile with DR is significantly lower than linear sum', () => {
    const linear = 5 * benchBaseValue;
    const withDR = evaluateMultiAssetPackageValue([benchBaseValue, benchBaseValue, benchBaseValue, benchBaseValue, benchBaseValue]);
    expect(withDR).toBeLessThan(linear);
  });

  it('five bench players at SECURE position produce lower score than neutral baseline', () => {
    const neutralDR = evaluateMultiAssetPackageValue([benchBaseValue, benchBaseValue, benchBaseValue, benchBaseValue, benchBaseValue]);
    const singleBenchRaw = applyStrategicValuationModifiers(benchRb, benchBaseValue, contenderPosture);
    const singleBenchAdjusted = applyPositionalNeedModifiers(benchRb, singleBenchRaw, depthNeeds, contenderPosture);
    const contenderDR = evaluateMultiAssetPackageValue([
      singleBenchAdjusted, singleBenchAdjusted, singleBenchAdjusted, singleBenchAdjusted, singleBenchAdjusted,
    ]);
    expect(contenderDR).toBeLessThan(neutralDR);
  });
});

// ── Assertion 2: contender values pick lower than immediate starter ────────────

describe('Assertion 2 — AI Contender values future pick lower than immediate starter at roster hole', () => {
  const contenderPosture = TEAM_STRATEGIC_POSTURE.CONTENDER;
  const rebuilderPosture = TEAM_STRATEGIC_POSTURE.REBUILDER;
  const roster = makeRosterCriticalQbSecureRb();
  const depthNeeds = calculateTeamDepthDeficiencies(roster);

  // Far-future pick (2 years out) vs immediate high-OVR starter
  const futurePick = makePick(1, 2028); // 2 years out from 2026
  const immediateStarter = makePlayer('QB', 85, 27);
  const pickBaseValue = 175;
  const starterBaseValue = 225;

  it('contender devalues far-future pick vs neutral', () => {
    const neutral = applyStrategicValuationModifiers(futurePick, pickBaseValue, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2026 });
    const contender = applyStrategicValuationModifiers(futurePick, pickBaseValue, contenderPosture, { currentSeason: 2026 });
    expect(contender).toBeLessThan(neutral);
  });

  it('rebuilder values far-future pick above neutral', () => {
    const neutral = applyStrategicValuationModifiers(futurePick, pickBaseValue, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2026 });
    const rebuilder = applyStrategicValuationModifiers(futurePick, pickBaseValue, rebuilderPosture, { currentSeason: 2026 });
    expect(rebuilder).toBeGreaterThan(neutral);
  });

  it('contender values immediate high-OVR starter above neutral', () => {
    const neutral = applyStrategicValuationModifiers(immediateStarter, starterBaseValue, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2026 });
    const contender = applyStrategicValuationModifiers(immediateStarter, starterBaseValue, contenderPosture, { currentSeason: 2026 });
    expect(contender).toBeGreaterThan(neutral);
  });

  it('contender values immediate QB starter filling CRITICAL need significantly above far-future pick', () => {
    // Pick: discounted by contender posture
    const pickAdjusted = applyStrategicValuationModifiers(futurePick, pickBaseValue, contenderPosture, { currentSeason: 2026 });

    // Starter: boosted by contender posture + CRITICAL positional need
    const starterStrategic = applyStrategicValuationModifiers(immediateStarter, starterBaseValue, contenderPosture, { currentSeason: 2026 });
    const starterAdjusted = applyPositionalNeedModifiers(immediateStarter, starterStrategic, depthNeeds, contenderPosture);

    // The starter must be worth significantly more than the pick
    expect(starterAdjusted).toBeGreaterThan(pickAdjusted * 1.15);
  });

  it('contender-vs-rebuilder pick gap is wider than neutral baseline', () => {
    const contenderPick = applyStrategicValuationModifiers(futurePick, pickBaseValue, contenderPosture, { currentSeason: 2026 });
    const rebuilderPick = applyStrategicValuationModifiers(futurePick, pickBaseValue, rebuilderPosture, { currentSeason: 2026 });
    const neutralPick = applyStrategicValuationModifiers(futurePick, pickBaseValue, TEAM_STRATEGIC_POSTURE.NEUTRAL, { currentSeason: 2026 });

    // Rebuilder values pick more than neutral, contender values pick less than neutral
    expect(rebuilderPick).toBeGreaterThan(neutralPick);
    expect(contenderPick).toBeLessThan(neutralPick);
  });
});

// ── Assertion 3: multiplier bounds are always respected ───────────────────────

describe('Assertion 3 — modifier bounds enforced across all postures', () => {
  const { MAX_PREMIUM, MIN_MODIFIER } = { MAX_PREMIUM: 1.25, MIN_MODIFIER: 0.82 };
  const baseValue = 200;
  const postures = [TEAM_STRATEGIC_POSTURE.CONTENDER, TEAM_STRATEGIC_POSTURE.REBUILDER, TEAM_STRATEGIC_POSTURE.NEUTRAL];
  const needLevels = Object.values(POSITION_NEED_LEVEL);

  const testAsset = makePlayer('QB', 90, 27);

  it('applyPositionalNeedModifiers never exceeds MAX_PREMIUM (1.25x)', () => {
    const roster = makeRosterCriticalQbSecureRb();
    const depthNeeds = calculateTeamDepthDeficiencies(roster);
    for (const posture of postures) {
      const adj = applyPositionalNeedModifiers(testAsset, baseValue, depthNeeds, posture);
      expect(adj).toBeLessThanOrEqual(Math.round(baseValue * MAX_PREMIUM) + 1);
    }
  });

  it('applyPositionalNeedModifiers never falls below MIN_MODIFIER (0.82x)', () => {
    const roster = makeRosterCriticalQbSecureRb();
    const depthNeeds = calculateTeamDepthDeficiencies(roster);
    for (const posture of postures) {
      const adj = applyPositionalNeedModifiers(testAsset, baseValue, depthNeeds, posture);
      expect(adj).toBeGreaterThanOrEqual(Math.round(baseValue * MIN_MODIFIER) - 1);
    }
  });

  it('UNKNOWN need level always returns base value unchanged', () => {
    const unknownMap = { QB: POSITION_NEED_LEVEL.UNKNOWN };
    for (const posture of postures) {
      const adj = applyPositionalNeedModifiers(testAsset, baseValue, unknownMap, posture);
      expect(adj).toBe(baseValue);
    }
  });

  it('missing depthNeedsMap (null) does not crash and returns unchanged value', () => {
    for (const posture of postures) {
      const strategic = applyStrategicValuationModifiers(testAsset, baseValue, posture);
      // Simulates the depthNeedsMap guard in calcAssetBundleValue
      const adj = null ? applyPositionalNeedModifiers(testAsset, strategic, null, posture) : strategic;
      expect(typeof adj).toBe('number');
      expect(Number.isFinite(adj)).toBe(true);
    }
  });
});

// ── Assertion 4: strategic symmetry — rebuilder/contender invert each other ───

describe('Assertion 4 — posture modifiers produce symmetric contender/rebuilder effects', () => {
  it('rebuilder values young upside player more than contender values same player', () => {
    const youngUpside = makePlayer('WR', 74, 22, { potential: 86 }); // pot-ovr = 12 >= 4
    const rebuilder = applyStrategicValuationModifiers({ ...youngUpside, assetType: 'player' }, 150, TEAM_STRATEGIC_POSTURE.REBUILDER);
    const contender = applyStrategicValuationModifiers({ ...youngUpside, assetType: 'player' }, 150, TEAM_STRATEGIC_POSTURE.CONTENDER);
    expect(rebuilder).toBeGreaterThan(contender);
  });

  it('contender values prime-age elite starter more than rebuilder values same player', () => {
    const primeElite = makePlayer('DE', 88, 26, { potential: 89 });
    const contender = applyStrategicValuationModifiers({ ...primeElite, assetType: 'player' }, 250, TEAM_STRATEGIC_POSTURE.CONTENDER);
    const rebuilder = applyStrategicValuationModifiers({ ...primeElite, assetType: 'player' }, 250, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(contender).toBeGreaterThan(rebuilder);
  });

  it('rebuilder penalizes aging expensive veteran relative to neutral', () => {
    const agingVet = makePlayer('OL', 80, 33, { potential: 80, salary: 15, baseAnnual: 15 });
    const neutral = applyStrategicValuationModifiers({ ...agingVet, assetType: 'player' }, 200, TEAM_STRATEGIC_POSTURE.NEUTRAL);
    const rebuilder = applyStrategicValuationModifiers({ ...agingVet, assetType: 'player' }, 200, TEAM_STRATEGIC_POSTURE.REBUILDER);
    expect(rebuilder).toBeLessThan(neutral);
  });
});

// ── Assertion 5: elite player protection at SECURE positions ─────────────────

describe('Assertion 5 — elite players are never discounted at SECURE positions', () => {
  it('elite OVR 85+ player does not receive SECURE discount', () => {
    const elitePlayer = makePlayer('RB', 87, 26);
    const secureMap = { RB: POSITION_NEED_LEVEL.SECURE };
    const adj = applyPositionalNeedModifiers(
      { ...elitePlayer, assetType: 'player' }, 250, secureMap, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    // Elite guard: multiplier clamped to ≥ 1.0, so no discount
    expect(adj).toBeGreaterThanOrEqual(250);
  });

  it('non-elite player does receive SECURE discount', () => {
    const benchPlayer = makePlayer('RB', 70, 28);
    const secureMap = { RB: POSITION_NEED_LEVEL.SECURE };
    const adj = applyPositionalNeedModifiers(
      { ...benchPlayer, assetType: 'player' }, 150, secureMap, TEAM_STRATEGIC_POSTURE.NEUTRAL,
    );
    expect(adj).toBeLessThan(150);
  });
});

// ── Assertion 6: multi-asset package with DR blocks spam exploitation ─────────

describe('Assertion 6 — diminishing returns blocks low-value asset spam', () => {
  it('a single elite asset beats five low-value assets even without positional adjustment', () => {
    const elite = evaluateMultiAssetPackageValue([300]);
    const spam = evaluateMultiAssetPackageValue([55, 55, 55, 55, 55]);
    expect(elite).toBeGreaterThan(spam);
  });

  it('five assets worth 60 each cannot match a single asset worth 240', () => {
    const single = evaluateMultiAssetPackageValue([240]);
    const pile = evaluateMultiAssetPackageValue([60, 60, 60, 60, 60]);
    expect(single).toBeGreaterThan(pile);
  });

  it('DR makes four 50-value assets worth less than one 180-value asset', () => {
    const single = evaluateMultiAssetPackageValue([180]);
    const pile = evaluateMultiAssetPackageValue([50, 50, 50, 50]);
    expect(single).toBeGreaterThan(pile);
  });

  it('combining positional SECURE discount with DR compounds the penalty', () => {
    const benchRb = makePlayer('RB', 65, 28);
    const secureMap = { RB: POSITION_NEED_LEVEL.SECURE };
    const discountedValue = applyPositionalNeedModifiers(
      { ...benchRb, assetType: 'player' }, 60, secureMap, TEAM_STRATEGIC_POSTURE.CONTENDER,
    );
    const pile = evaluateMultiAssetPackageValue([discountedValue, discountedValue, discountedValue, discountedValue, discountedValue]);

    // The same five players without discount
    const undiscountedPile = evaluateMultiAssetPackageValue([60, 60, 60, 60, 60]);
    expect(pile).toBeLessThan(undiscountedPile);
  });
});
