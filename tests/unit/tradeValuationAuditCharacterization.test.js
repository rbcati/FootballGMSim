import { describe, expect, it } from 'vitest';
import { calculatePlayerValue } from '../../src/core/trade-logic.js';
import { computeAIOfferValue, evaluateCounterOffer } from '../../src/core/trades/aiTradeEngine.js';
import { getAssetValue, getPlayerAssetValue, getPickAssetValue } from '../../src/core/trades/assetValuation.js';
import {
  evaluateMultiAssetPackageValue,
  getPickBaseValueFromMatrix,
} from '../../src/core/trades/tradeValuationModifiers.js';

function player(name, pos, ovr, age, extra = {}) {
  const years = extra.years ?? 2;
  return {
    id: extra.id ?? name,
    name,
    pos,
    ovr,
    potential: extra.potential ?? ovr,
    age,
    teamId: extra.teamId ?? 1,
    contract: {
      baseAnnual: extra.baseAnnual ?? 8,
      yearsRemaining: years,
      years,
      yearsTotal: years,
      signingBonus: extra.bonus ?? 0,
    },
    schemeFit: extra.schemeFit ?? 70,
    morale: extra.morale ?? 70,
    ...extra,
  };
}

const fixtures = Object.freeze({
  eliteYoungQb: player('Elite Young QB', 'QB', 94, 24, { potential: 98, baseAnnual: 12, years: 4 }),
  veteranEliteQb: player('Veteran Elite QB', 'QB', 94, 35, { baseAnnual: 35, years: 2 }),
  youngHighUpsideWr: player('Young Upside WR', 'WR', 84, 23, { potential: 91, baseAnnual: 6, years: 3 }),
  primeStarter: player('Prime Starter', 'CB', 82, 27, { baseAnnual: 9, years: 3 }),
  averageStarter: player('Average Starter', 'LB', 74, 27, { baseAnnual: 5, years: 2 }),
  replaceableVeteran: player('Replaceable Veteran', 'RB', 68, 31, { baseAnnual: 4, years: 1 }),
  lowRatedDepth: player('Low Depth', 'OL', 58, 25, { baseAnnual: 1.5, years: 1 }),
  expensiveVeteran: player('Expensive Veteran', 'S', 78, 33, { baseAnnual: 24, years: 2, bonus: 8 }),
});

const picks = Object.freeze({
  currentFirst: { id: 'pick-current-r1', assetType: 'pick', round: 1, season: 2026 },
  futureFirst: { id: 'pick-future-r1', assetType: 'pick', round: 1, season: 2028 },
  second: { id: 'pick-current-r2', assetType: 'pick', round: 2, season: 2026 },
  late: { id: 'pick-current-r6', assetType: 'pick', round: 6, season: 2026 },
  unknownSlot: { id: 'pick-current-unknown', assetType: 'pick', season: 2026 },
});

function expectUsableValue(value) {
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(0);
}

describe('trade valuation audit characterization v1', () => {
  it('characterizes the same player fixtures across live player value functions', () => {
    for (const fixture of Object.values(fixtures)) {
      const canonical = getPlayerAssetValue(fixture);
      const aggregate = getAssetValue(fixture);
      const legacyExport = calculatePlayerValue(fixture);
      const aiOffer = computeAIOfferValue(fixture, {}, { positionNeed: 0.5, aggression: 'MEDIUM' }, 42);

      [canonical, aggregate, legacyExport, aiOffer].forEach(expectUsableValue);
      expect(aggregate).toBeCloseTo(canonical, 10);
      // calculatePlayerValue is live but adds market-realism and trade-request modifiers.
      expect(legacyExport).toBeGreaterThanOrEqual(0);
      // AI offers intentionally sit below raw market at neutral need/medium aggression.
      expect(aiOffer).toBeLessThan(canonical);
    }
  });

  it('characterizes draft pick values on the shared round matrix and future-pick decay scale', () => {
    expect(getPickBaseValueFromMatrix(1)).toBe(950);
    expect(getPickAssetValue(picks.currentFirst, 2026)).toBe(950);
    expect(getAssetValue(picks.currentFirst, null, { currentSeason: 2026 })).toBe(950);
    expect(getPickAssetValue(picks.futureFirst, 2026)).toBe(760);
    expect(getPickAssetValue(picks.second, 2026)).toBe(360);
    expect(getPickAssetValue(picks.late, 2026)).toBe(12);
    expect(getPickAssetValue(picks.unknownSlot, 2026)).toBe(8);
  });

  it('documents package diminishing returns for mixed player-plus-pick packages', () => {
    const playerValue = getAssetValue(fixtures.averageStarter);
    const pickValue = getAssetValue(picks.second, null, { currentSeason: 2026 });
    const adjustedPackage = evaluateMultiAssetPackageValue([playerValue, pickValue]);

    expect(Math.round(playerValue)).toBe(788);
    expect(pickValue).toBe(360);
    expect(adjustedPackage).toBe(1112);
    expect(adjustedPackage).toBeLessThan(playerValue + pickValue);
  });

  it('characterizes difficulty thresholds without changing balance', () => {
    const receiveValue = 1000;
    const multipliers = { Easy: 0.8, Normal: 1, Hard: 1.15 };
    expect(Object.fromEntries(Object.entries(multipliers).map(([difficulty, multiplier]) => [
      difficulty,
      receiveValue * multiplier,
    ]))).toEqual({ Easy: 800, Normal: 1000, Hard: 1150 });
  });

  it('documents position-of-need, age, and contract effects', () => {
    const wrNeed = getAssetValue(fixtures.youngHighUpsideWr, null, { needPositions: ['WR'] });
    const wrNotNeed = getAssetValue(fixtures.youngHighUpsideWr, null, { needPositions: ['QB'] });
    expect(wrNeed).toBeGreaterThan(wrNotNeed);

    expect(getAssetValue(fixtures.eliteYoungQb)).toBeGreaterThan(getAssetValue(fixtures.veteranEliteQb));
    expect(getAssetValue(fixtures.averageStarter)).toBeGreaterThan(getAssetValue(fixtures.expensiveVeteran));
  });

  it('is deterministic for identical inputs and stable within each valuation function', () => {
    expect(getAssetValue(fixtures.eliteYoungQb)).toBe(getAssetValue(fixtures.eliteYoungQb));
    expect(calculatePlayerValue(fixtures.primeStarter)).toBe(calculatePlayerValue(fixtures.primeStarter));
    expect(computeAIOfferValue(fixtures.youngHighUpsideWr, {}, { positionNeed: 0.5, aggression: 'MEDIUM' }, 123))
      .toBe(computeAIOfferValue(fixtures.youngHighUpsideWr, {}, { positionNeed: 0.5, aggression: 'MEDIUM' }, 123));

    expect(getAssetValue(fixtures.eliteYoungQb)).toBeGreaterThan(getAssetValue(fixtures.lowRatedDepth));
    expect(getAssetValue(picks.currentFirst, null, { currentSeason: 2026 }))
      .toBeGreaterThan(getAssetValue(picks.late, null, { currentSeason: 2026 }));
  });

  it('characterizes counteroffer acceptance thresholds used by AI trade-block counters', () => {
    const originalOffer = { acquisitionValue: 1000 };
    expect(evaluateCounterOffer(originalOffer, { aiReceivesValue: 900, aiGivesValue: 900 }, {}, 1)).toBe('accept');
    expect(evaluateCounterOffer(originalOffer, { aiReceivesValue: 599, aiGivesValue: 900 }, {}, 1)).toBe('reject');
    expect(['counter', 'reject']).toContain(
      evaluateCounterOffer(originalOffer, { aiReceivesValue: 750, aiGivesValue: 900 }, {}, 1),
    );
  });

  it('documents UI fairness scale disagreement with engine scale as characterization', () => {
    const uiEstimate = Math.round(Math.pow(fixtures.eliteYoungQb.ovr, 1.8) * 2.0 * (1 + (26 - fixtures.eliteYoungQb.age) * 0.02));
    const engineValue = Math.round(getAssetValue(fixtures.eliteYoungQb));

    expect(uiEstimate).toBe(7408);
    expect(engineValue).toBe(2380);
    expect(uiEstimate / engineValue).toBeGreaterThan(3);
  });
});
