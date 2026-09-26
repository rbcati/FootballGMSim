import { describe, expect, it } from 'vitest';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import { deriveGamePlanMultipliers } from '../sim/gamePlanMultipliers.ts';
import { simulateRichGame } from '../sim/richGameSimulator.ts';

function payload(seed: number, homeBlitz?: number, homeDefenseOvr = 78) {
  const homePrep = deriveGamePlanMultipliers({
    gamePlan: homeBlitz === undefined ? {} : { blitzFrequency: homeBlitz },
  });
  const awayPrep = deriveGamePlanMultipliers({ gamePlan: { blitzFrequency: 30 } });
  return {
    gameId: `blitz-${seed}`,
    seed,
    homeTeamId: 1,
    awayTeamId: 2,
    homeOffense: mapOverallToAttributesV2(78, 5.5, 'home-offense'),
    awayOffense: mapOverallToAttributesV2(78, 5.5, 'away-offense'),
    homeDefense: mapOverallToAttributesV2(homeDefenseOvr, 5.5, 'home-defense'),
    awayDefense: mapOverallToAttributesV2(78, 5.5, 'away-defense'),
    homePrepMultipliers: homePrep,
    awayPrepMultipliers: awayPrep,
  };
}

describe('defensive blitz authority in the canonical rich simulator', () => {
  it('carries isolated home and away strategy factors into canonical diagnostics', () => {
    const aggressive = simulateRichGame(payload(4101, 100));
    const conservative = simulateRichGame(payload(4101, 0));

    expect(aggressive.simFactors.home.defensiveBlitzFrequency).toBe(100);
    expect(conservative.simFactors.home.defensiveBlitzFrequency).toBe(0);
    expect(aggressive.simFactors.away.defensiveBlitzFrequency).toBe(30);
    expect(aggressive.simFactors.home.defensivePressureDelta)
      .toBeGreaterThan(conservative.simFactors.home.defensivePressureDelta);
    expect(aggressive.simFactors.home.defensiveCoverageExposureDelta).toBeGreaterThan(0);
    expect(aggressive.simFactors.home.defensiveExplosiveRiskDelta).toBeGreaterThan(0);
    expect(aggressive).not.toEqual(conservative);
  });

  it('makes legacy missing state neutral and deeply reproducible', () => {
    const legacy = simulateRichGame(payload(4102, undefined));
    const explicitNeutral = simulateRichGame(payload(4102, 30));
    expect(legacy).toEqual(explicitNeutral);
    expect(simulateRichGame(payload(4102, undefined))).toEqual(legacy);
  });

  it('keeps pass-rush talent materially relevant under maximum blitzing', () => {
    const seeds = Array.from({ length: 120 }, (_, index) => 5000 + index);
    const sacks = (defenseOvr: number) => seeds.reduce((sum, seed) => (
      sum + simulateRichGame(payload(seed, 100, defenseOvr)).teamStats.home.sacksMade
    ), 0);
    expect(sacks(90)).toBeGreaterThan(sacks(58));
  });
});
