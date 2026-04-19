import { describe, it, expect } from 'vitest';
import { computeRestructureOutcome, isContractRestructureEligible, shouldPreserveChemistryOnReturn } from '../contracts/restructure.js';

describe('contract restructure baseline', () => {
  it('reduces current cap hit and increases future prorated burden', () => {
    const out = computeRestructureOutcome({ years: 3, yearsTotal: 3, baseAnnual: 18, signingBonus: 6 }, 0.5);
    expect(out.oldCapHit).toBe(20);
    expect(out.newCapHit).toBe(14);
    expect(out.capSavingsThisYear).toBe(6);
    expect(out.futureAnnualBonusDelta).toBe(3);
  });
});

describe('offseason chemistry continuity', () => {
  it('preserves continuity only for same team and same offseason season', () => {
    const releaseRecord = { teamId: 4, season: 2028 };
    expect(shouldPreserveChemistryOnReturn({ releaseRecord, signingTeamId: 4, currentSeason: 2028 })).toBe(true);
    expect(shouldPreserveChemistryOnReturn({ releaseRecord, signingTeamId: 5, currentSeason: 2028 })).toBe(false);
    expect(shouldPreserveChemistryOnReturn({ releaseRecord, signingTeamId: 4, currentSeason: 2029 })).toBe(false);
  });
});

describe('restructure eligibility guardrails', () => {
  it('requires veteran profile and available restructure slots', () => {
    const vet = { age: 30, contract: { years: 3, baseAnnual: 16, restructureCount: 1 } };
    expect(isContractRestructureEligible(vet, { currentSeason: 2028 })).toBe(true);
    const nonVet = { age: 24, accruedSeasons: 2, contract: { years: 3, baseAnnual: 16 } };
    expect(isContractRestructureEligible(nonVet, { currentSeason: 2028 })).toBe(false);
    const exhausted = { age: 31, contract: { years: 3, baseAnnual: 16, restructureCount: 2 } };
    expect(isContractRestructureEligible(exhausted, { currentSeason: 2028 })).toBe(false);
  });
});
