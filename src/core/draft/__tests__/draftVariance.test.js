import { describe, expect, it } from 'vitest';
import {
  getDraftVarianceRange,
  inferProspectRound,
  rollTrueOvrFromScoutedOvr,
  rollDevTrait,
  getDevTraitMultiplier,
  combineDevModifiers,
  getTrueOvrGrowthBonus,
  applyDraftHiddenVariance,
  HIDDEN_DEV_TRAITS,
} from '../draftVariance.js';
import { processPlayerProgression } from '../../progression-logic.js';
import { generateDraftClass } from '../../player.js';
import { Utils } from '../../utils.js';

// Local deterministic RNG (mulberry32) so tests never depend on global state.
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stdDev(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length);
}

// ── getDraftVarianceRange ─────────────────────────────────────────────────────

describe('getDraftVarianceRange', () => {
  it('returns the round-tiered ranges', () => {
    expect(getDraftVarianceRange(1)).toEqual({ min: -5, max: 8 });
    expect(getDraftVarianceRange(2)).toEqual({ min: -8, max: 12 });
    expect(getDraftVarianceRange(3)).toEqual({ min: -8, max: 12 });
    for (const r of [4, 5, 6, 7]) {
      expect(getDraftVarianceRange(r)).toEqual({ min: -10, max: 18 });
    }
  });

  it('falls back to round 2-3 variance for unknown rounds', () => {
    expect(getDraftVarianceRange(undefined)).toEqual({ min: -8, max: 12 });
    expect(getDraftVarianceRange(99)).toEqual({ min: -8, max: 12 });
  });
});

// ── inferProspectRound ────────────────────────────────────────────────────────

describe('inferProspectRound', () => {
  it('prefers explicit round metadata', () => {
    expect(inferProspectRound({ round: 2 })).toBe(2);
    expect(inferProspectRound({ draftRound: 6 })).toBe(6);
    expect(inferProspectRound({ projectedRound: 4 })).toBe(4);
    expect(inferProspectRound({ mockRound: 1 })).toBe(1);
  });

  it('treats a clearly late prospect (visible OVR <= 60) as a late round', () => {
    const round = inferProspectRound({ scoutedOvr: 55 });
    expect(round).toBeGreaterThanOrEqual(4);
    expect(round).toBeLessThanOrEqual(7);
  });

  it('defaults everything else to round 2-3 variance', () => {
    expect(inferProspectRound({ ovr: 78 })).toBe(3);
    expect(inferProspectRound({})).toBe(3);
  });
});

// ── getDevTraitMultiplier ─────────────────────────────────────────────────────

describe('getDevTraitMultiplier', () => {
  it('normal is always 1.0', () => {
    for (const age of [20, 24, 27, 30, 35]) {
      expect(getDevTraitMultiplier({ hiddenDevTrait: 'normal' }, age)).toBe(1.0);
    }
  });

  it('late_bloomer: 1.0 through 24, 1.3 at 25-27, 1.1 at 28+', () => {
    const p = { hiddenDevTrait: 'late_bloomer' };
    expect(getDevTraitMultiplier(p, 22)).toBe(1.0);
    expect(getDevTraitMultiplier(p, 24)).toBe(1.0);
    expect(getDevTraitMultiplier(p, 25)).toBe(1.3);
    expect(getDevTraitMultiplier(p, 27)).toBe(1.3);
    expect(getDevTraitMultiplier(p, 28)).toBe(1.1);
    expect(getDevTraitMultiplier(p, 33)).toBe(1.1);
  });

  it('superstar: 1.2 through 27, 1.5 at 28-30, 0.9 at 31+', () => {
    const p = { hiddenDevTrait: 'superstar' };
    expect(getDevTraitMultiplier(p, 21)).toBe(1.2);
    expect(getDevTraitMultiplier(p, 27)).toBe(1.2);
    expect(getDevTraitMultiplier(p, 28)).toBe(1.5);
    expect(getDevTraitMultiplier(p, 30)).toBe(1.5);
    expect(getDevTraitMultiplier(p, 31)).toBe(0.9);
  });

  it('bust: 0.9 through 23, 0.7 at 24+', () => {
    const p = { hiddenDevTrait: 'bust' };
    expect(getDevTraitMultiplier(p, 21)).toBe(0.9);
    expect(getDevTraitMultiplier(p, 23)).toBe(0.9);
    expect(getDevTraitMultiplier(p, 24)).toBe(0.7);
    expect(getDevTraitMultiplier(p, 30)).toBe(0.7);
  });

  it('missing or unknown trait is a 1.0 no-op (including legacy devTrait values)', () => {
    expect(getDevTraitMultiplier({}, 25)).toBe(1.0);
    expect(getDevTraitMultiplier(null, 25)).toBe(1.0);
    expect(getDevTraitMultiplier({ hiddenDevTrait: 'X-Factor' }, 25)).toBe(1.0);
    expect(getDevTraitMultiplier({ devTrait: 'Superstar' }, 25)).toBe(1.0);
    expect(getDevTraitMultiplier({ hiddenDevTrait: 'superstar' }, undefined)).toBe(1.0);
  });
});

// ── rollDevTrait distribution ─────────────────────────────────────────────────

describe('rollDevTrait', () => {
  it('matches the 60/20/10/10 distribution within ±5% over 1000 rolls', () => {
    const rng = mulberry32(1337);
    const counts = { normal: 0, late_bloomer: 0, superstar: 0, bust: 0 };
    for (let i = 0; i < 1000; i++) counts[rollDevTrait(rng)] += 1;

    expect(counts.normal).toBeGreaterThanOrEqual(550);
    expect(counts.normal).toBeLessThanOrEqual(650);
    expect(counts.late_bloomer).toBeGreaterThanOrEqual(150);
    expect(counts.late_bloomer).toBeLessThanOrEqual(250);
    expect(counts.superstar).toBeGreaterThanOrEqual(50);
    expect(counts.superstar).toBeLessThanOrEqual(150);
    expect(counts.bust).toBeGreaterThanOrEqual(50);
    expect(counts.bust).toBeLessThanOrEqual(150);
  });

  it('only ever returns known traits', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      expect(HIDDEN_DEV_TRAITS).toContain(rollDevTrait(rng));
    }
  });
});

// ── rollTrueOvrFromScoutedOvr ─────────────────────────────────────────────────

describe('rollTrueOvrFromScoutedOvr', () => {
  it('round 4-7 deltas have higher standard deviation than round 1 deltas', () => {
    const rng1 = mulberry32(2024);
    const rngLate = mulberry32(2024);
    const round1Deltas = [];
    const lateDeltas = [];
    for (let i = 0; i < 1000; i++) {
      round1Deltas.push(rollTrueOvrFromScoutedOvr(70, 1, rng1) - 70);
      lateDeltas.push(rollTrueOvrFromScoutedOvr(70, 6, rngLate) - 70);
    }
    expect(stdDev(lateDeltas)).toBeGreaterThan(stdDev(round1Deltas));
  });

  it('always clamps to [40, 99]', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 1000; i++) {
      const highEnd = rollTrueOvrFromScoutedOvr(95, 7, rng);
      const lowEnd = rollTrueOvrFromScoutedOvr(44, 7, rng);
      expect(highEnd).toBeGreaterThanOrEqual(40);
      expect(highEnd).toBeLessThanOrEqual(99);
      expect(lowEnd).toBeGreaterThanOrEqual(40);
      expect(lowEnd).toBeLessThanOrEqual(99);
    }
  });

  it('returns null for non-numeric scoutedOvr', () => {
    expect(rollTrueOvrFromScoutedOvr(undefined, 3, mulberry32(1))).toBeNull();
    expect(rollTrueOvrFromScoutedOvr('n/a', 3, mulberry32(1))).toBeNull();
  });
});

// ── combineDevModifiers / getTrueOvrGrowthBonus ───────────────────────────────

describe('combineDevModifiers', () => {
  it('multiplies coach and trait modifiers', () => {
    expect(combineDevModifiers(1.1, 1.2)).toBeCloseTo(1.32);
  });

  it('clamps the product to [0.4, 2.5]', () => {
    expect(combineDevModifiers(0.1, 0.5)).toBe(0.4);
    expect(combineDevModifiers(2.0, 2.0)).toBe(2.5);
  });

  it('treats non-finite inputs as 1.0', () => {
    expect(combineDevModifiers(NaN, undefined)).toBe(1.0);
    expect(combineDevModifiers(Infinity, 1.2)).toBe(1.2);
  });
});

describe('getTrueOvrGrowthBonus', () => {
  it('grants a small bonus only when below the hidden anchor with positive growth', () => {
    expect(getTrueOvrGrowthBonus({ ovr: 70, hiddenTrueOvr: 73 }, 2)).toBe(1);
    expect(getTrueOvrGrowthBonus({ ovr: 70, hiddenTrueOvr: 80 }, 2)).toBe(2);
  });

  it('never fires on zero/negative growth (no amplified regression)', () => {
    expect(getTrueOvrGrowthBonus({ ovr: 70, hiddenTrueOvr: 85 }, 0)).toBe(0);
    expect(getTrueOvrGrowthBonus({ ovr: 70, hiddenTrueOvr: 85 }, -3)).toBe(0);
  });

  it('never nerfs a player above his anchor', () => {
    expect(getTrueOvrGrowthBonus({ ovr: 82, hiddenTrueOvr: 70 }, 3)).toBe(0);
  });

  it('missing hiddenTrueOvr is a no-op', () => {
    expect(getTrueOvrGrowthBonus({ ovr: 70 }, 3)).toBe(0);
    expect(getTrueOvrGrowthBonus({}, 3)).toBe(0);
  });
});

// ── applyDraftHiddenVariance ──────────────────────────────────────────────────

describe('applyDraftHiddenVariance', () => {
  it('stamps hidden fields only when missing', () => {
    const prospect = { ovr: 72, scoutedOvr: 70, projectedRound: 3 };
    applyDraftHiddenVariance(prospect, mulberry32(5));
    expect(HIDDEN_DEV_TRAITS).toContain(prospect.hiddenDevTrait);
    expect(prospect.hiddenTrueOvr).toBeGreaterThanOrEqual(40);
    expect(prospect.hiddenTrueOvr).toBeLessThanOrEqual(99);
    expect(prospect.scoutedOvr).toBe(70);
  });

  it('never overwrites existing hidden fields', () => {
    const prospect = { ovr: 72, scoutedOvr: 70, hiddenDevTrait: 'superstar', hiddenTrueOvr: 88 };
    applyDraftHiddenVariance(prospect, mulberry32(5));
    expect(prospect.hiddenDevTrait).toBe('superstar');
    expect(prospect.hiddenTrueOvr).toBe(88);
  });

  it('backfills scoutedOvr from ovr when missing', () => {
    const prospect = { ovr: 66, projectedRound: 4 };
    applyDraftHiddenVariance(prospect, mulberry32(5));
    expect(prospect.scoutedOvr).toBe(66);
  });

  it('is deterministic: same rng seed and inputs produce the same hidden fields', () => {
    const base = { ovr: 72, scoutedOvr: 70, projectedRound: 3 };
    const a = applyDraftHiddenVariance({ ...base }, mulberry32(42));
    const b = applyDraftHiddenVariance({ ...base }, mulberry32(42));
    expect(a.hiddenTrueOvr).toBe(b.hiddenTrueOvr);
    expect(a.hiddenDevTrait).toBe(b.hiddenDevTrait);
    expect(a.scoutedOvr).toBe(b.scoutedOvr);
  });

  it('is a safe no-op on players with no usable OVR data', () => {
    const legacy = { name: 'Old Save Guy' };
    applyDraftHiddenVariance(legacy, mulberry32(5));
    expect(legacy.hiddenTrueOvr).toBeUndefined();
    expect(legacy.scoutedOvr).toBeUndefined();
  });
});

// ── generateDraftClass integration ────────────────────────────────────────────

describe('generateDraftClass hidden variance', () => {
  it('every generated prospect carries hidden variance fields', () => {
    Utils.setSeed(777);
    const draftClass = generateDraftClass(2030, { classSize: 40 });
    for (const rookie of draftClass) {
      expect(HIDDEN_DEV_TRAITS).toContain(rookie.hiddenDevTrait);
      expect(rookie.hiddenTrueOvr).toBeGreaterThanOrEqual(40);
      expect(rookie.hiddenTrueOvr).toBeLessThanOrEqual(99);
      expect(typeof rookie.scoutedOvr).toBe('number');
    }
  });

  it('same seed produces the same scoutedOvr, hiddenTrueOvr, and hiddenDevTrait', () => {
    Utils.setSeed(4242);
    const first = generateDraftClass(2030, { classSize: 24 });
    Utils.setSeed(4242);
    const second = generateDraftClass(2030, { classSize: 24 });
    expect(first.map((p) => p.scoutedOvr)).toEqual(second.map((p) => p.scoutedOvr));
    expect(first.map((p) => p.hiddenTrueOvr)).toEqual(second.map((p) => p.hiddenTrueOvr));
    expect(first.map((p) => p.hiddenDevTrait)).toEqual(second.map((p) => p.hiddenDevTrait));
  });
});

// ── Progression wiring ────────────────────────────────────────────────────────

function buildQb(overrides = {}) {
  const ratings = {
    throwPower: 75,
    throwAccuracy: 75,
    awareness: 75,
    intelligence: 75,
    speed: 75,
    agility: 75,
  };
  return {
    id: 1,
    name: 'Variance Test QB',
    teamId: 1,
    pos: 'QB',
    age: 22,
    ovr: 75,
    potential: 90,
    morale: 50,
    // Neutral profile: zeroes out the personality terms in breakout/bust math.
    personalityProfile: {
      workEthic: 55, leadership: 55, diva: 45, riskTaker: 40,
      discipline: 45, coachability: 60, holdoutRisk: 20, consistency: 65, offFieldRisk: 25,
    },
    ratings: { ...ratings },
    ...overrides,
  };
}

// Runs progression for one player under a fixed global seed and returns the
// resulting OVR delta. Identical player shapes consume the RNG stream
// identically, so runs with the same seed are directly comparable.
function progressWithSeed(seed, overrides) {
  Utils.setSeed(seed);
  const player = buildQb(overrides);
  processPlayerProgression([player], {});
  return player.progressionDelta;
}

describe('progression wiring for hidden dev traits', () => {
  it('a superstar gains at least as much as a bust in every context, and more overall', () => {
    let superstarTotal = 0;
    let bustTotal = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const superstarDelta = progressWithSeed(seed, { hiddenDevTrait: 'superstar' });
      const bustDelta = progressWithSeed(seed, { hiddenDevTrait: 'bust', age: 24 });
      superstarTotal += superstarDelta;
      bustTotal += bustDelta;
    }
    expect(superstarTotal).toBeGreaterThan(bustTotal);
  });

  it('missing hiddenDevTrait behaves exactly like normal', () => {
    for (const seed of [11, 22, 33, 44, 55]) {
      const missing = progressWithSeed(seed, {});
      const normal = progressWithSeed(seed, { hiddenDevTrait: 'normal' });
      expect(missing).toBe(normal);
    }
  });

  it('does not amplify regression: old players decline identically regardless of trait', () => {
    for (const seed of [3, 13, 23, 33, 43, 53, 63]) {
      const bust = progressWithSeed(seed, { age: 35, hiddenDevTrait: 'bust' });
      const normal = progressWithSeed(seed, { age: 35, hiddenDevTrait: 'normal' });
      expect(bust).toBe(normal);
    }
  });

  it('missing hiddenTrueOvr is a no-op relative to an anchor at current ovr', () => {
    for (const seed of [5, 15, 25, 35, 45]) {
      const withoutAnchor = progressWithSeed(seed, {});
      const anchorAtOvr = progressWithSeed(seed, { hiddenTrueOvr: 75 });
      expect(withoutAnchor).toBe(anchorAtOvr);
    }
  });

  it('a player far below his hidden anchor grows at least as fast as one without an anchor', () => {
    let anchored = 0;
    let plain = 0;
    for (let seed = 300; seed < 400; seed++) {
      anchored += progressWithSeed(seed, { hiddenTrueOvr: 90 });
      plain += progressWithSeed(seed, {});
    }
    expect(anchored).toBeGreaterThan(plain);
  });
});
