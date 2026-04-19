import { describe, expect, it } from 'vitest';
import { resolveMatchup, DEFAULT_NORMALIZATION_CONSTANT } from '../sim/matchupEngine.ts';

const eliteOffense = {
  release: 92,
  routeRunning: 90,
  separation: 91,
  catchInTraffic: 88,
  ballTracking: 90,
  throwAccuracyShort: 94,
  throwAccuracyDeep: 90,
  throwPower: 93,
  decisionMaking: 92,
  pocketPresence: 90,
  passBlockFootwork: 86,
  passBlockStrength: 84,
  passRush: 40,
  pressCoverage: 35,
  zoneCoverage: 38,
};

const strongDefense = {
  release: 40,
  routeRunning: 45,
  separation: 42,
  catchInTraffic: 44,
  ballTracking: 46,
  throwAccuracyShort: 40,
  throwAccuracyDeep: 38,
  throwPower: 42,
  decisionMaking: 45,
  pocketPresence: 42,
  passBlockFootwork: 52,
  passBlockStrength: 57,
  passRush: 90,
  pressCoverage: 87,
  zoneCoverage: 89,
};

describe('resolveMatchup', () => {
  it('keeps probability in bounds and returns deterministic state fields', () => {
    const result = resolveMatchup(eliteOffense, strongDefense, {
      down: 2,
      distance: 7,
      yardLine: 35,
      quarter: 1,
      clockSec: 625,
      normalizationConstant: DEFAULT_NORMALIZATION_CONSTANT,
      playType: 'pass',
    }, () => 0.32);

    expect(result.successProbability).toBeGreaterThanOrEqual(0.03);
    expect(result.successProbability).toBeLessThanOrEqual(0.97);
    expect(result.nextDown).toBeGreaterThanOrEqual(1);
    expect(result.nextDown).toBeLessThanOrEqual(4);
    expect(result.nextYardLine).toBeGreaterThanOrEqual(0);
    expect(result.nextYardLine).toBeLessThanOrEqual(100);
    expect(typeof result.reason).toBe('string');
  });

  it('normalization constant scales outcome probability to prevent drift', () => {
    const lowNorm = resolveMatchup(eliteOffense, strongDefense, {
      down: 1,
      distance: 10,
      yardLine: 25,
      quarter: 1,
      clockSec: 840,
      normalizationConstant: 0.4,
      playType: 'pass',
    }, () => 0.2);

    const highNorm = resolveMatchup(eliteOffense, strongDefense, {
      down: 1,
      distance: 10,
      yardLine: 25,
      quarter: 1,
      clockSec: 840,
      normalizationConstant: 1.2,
      playType: 'pass',
    }, () => 0.2);

    expect(highNorm.successProbability).toBeGreaterThan(lowNorm.successProbability);
  });
});
