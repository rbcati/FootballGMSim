import { describe, it, expect } from 'vitest';
import { derivePlayerContractFinancials } from './contractFormatting.js';

describe('derivePlayerContractFinancials', () => {
  it('normalizes salary from canonical and legacy fields', () => {
    const fromCanonical = derivePlayerContractFinancials({ contract: { baseAnnual: 12.5, yearsTotal: 3, signingBonus: 3 } });
    expect(fromCanonical.annualSalary).toBe(12.5);
    expect(fromCanonical.capHit).toBeCloseTo(13.5, 4);

    const fromLegacy = derivePlayerContractFinancials({ contract: { salary: 8400000, yearsRemaining: 2 } });
    expect(fromLegacy.annualSalary).toBeCloseTo(8.4, 3);
    expect(fromLegacy.yearsRemaining).toBe(2);
  });

  it('does not silently coerce missing salary into zero', () => {
    const missing = derivePlayerContractFinancials({ contract: { yearsTotal: 4 } });
    expect(missing.annualSalary).toBeNull();
    expect(missing.totalValue).toBeNull();
  });
});
