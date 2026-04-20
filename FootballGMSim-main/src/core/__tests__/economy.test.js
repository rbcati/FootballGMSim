import { describe, it, expect } from 'vitest';
import { normalizeLeagueEconomy, projectNextSeasonEconomy, getSalaryInflationMultiplier, inflateContract } from '../economy.js';

describe('league economy progression', () => {
  it('grows salary cap each season with deterministic defaults', () => {
    const e1 = normalizeLeagueEconomy({ baseSalaryCap: 300, currentSalaryCap: 300, annualCapGrowthRate: 0.03 }, { year: 2026 });
    const e2 = projectNextSeasonEconomy(e1, 2027);
    expect(e2.currentSalaryCap).toBe(309);
    expect(e2.economyHistory.some((r) => r.season === 2027 && r.salaryCap === 309)).toBe(true);
  });

  it('inflates newly generated contracts using cap multiplier', () => {
    const mult = getSalaryInflationMultiplier({ baseSalaryCap: 300, currentSalaryCap: 330 });
    const contract = inflateContract({ baseAnnual: 20, signingBonus: 10 }, mult);
    expect(contract.baseAnnual).toBe(22);
    expect(contract.signingBonus).toBe(11);
  });

  it('uses tracked season inflation so long saves increase asks even with modest cap drift', () => {
    const mult = getSalaryInflationMultiplier({
      baseSalaryCap: 300,
      currentSalaryCap: 320,
      annualSalaryInflationRate: 0.03,
      economyHistory: [{ season: 2026, salaryCap: 300 }, { season: 2027, salaryCap: 309 }, { season: 2028, salaryCap: 318 }],
    });
    expect(mult).toBeCloseTo(1.0667, 4);
  });
});
