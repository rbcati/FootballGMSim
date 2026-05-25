import { describe, it, expect } from 'vitest';
import { generateSlottedRookieContract } from '../../src/core/contracts/rookieWageScale.js';
import {
  normalizeContractDetails,
  calculateContractCapHit,
} from '../../src/core/contracts/realisticContracts.js';

// ── Round 1 slotting hierarchy ────────────────────────────────────────────────

describe('generateSlottedRookieContract — round 1 slotting', () => {
  it('Pick #1 has a significantly higher baseAnnual than Pick #32', () => {
    const pick1 = generateSlottedRookieContract(1, 2025);
    const pick32 = generateSlottedRookieContract(32, 2025);
    expect(pick1.baseAnnual).toBeGreaterThan(pick32.baseAnnual);
    // $35M vs $8M — at least 3× difference
    expect(pick1.baseAnnual).toBeGreaterThanOrEqual(pick32.baseAnnual * 3);
  });

  it('Pick #1 has a higher cap hit than Pick #32', () => {
    const capHit1 = calculateContractCapHit(generateSlottedRookieContract(1, 2025));
    const capHit32 = calculateContractCapHit(generateSlottedRookieContract(32, 2025));
    expect(capHit1).toBeGreaterThan(capHit32);
  });

  it('Pick #1 total contract value is significantly higher than Pick #32', () => {
    const c1 = generateSlottedRookieContract(1, 2025);
    const c32 = generateSlottedRookieContract(32, 2025);
    const totalValue1 = c1.baseAnnual * c1.yearsTotal + c1.signingBonus;
    const totalValue32 = c32.baseAnnual * c32.yearsTotal + c32.signingBonus;
    // Pick #1 should be at least 2× the total value of Pick #32
    expect(totalValue1).toBeGreaterThan(totalValue32 * 2);
  });

  it('Pick #1 is fully guaranteed (guaranteedPct = 1.0)', () => {
    expect(generateSlottedRookieContract(1, 2025).guaranteedPct).toBe(1.0);
  });

  it('Pick #10 is still fully guaranteed', () => {
    expect(generateSlottedRookieContract(10, 2025).guaranteedPct).toBe(1.0);
  });

  it('Pick #32 has a lower guaranteedPct than Pick #1', () => {
    const c1 = generateSlottedRookieContract(1, 2025);
    const c32 = generateSlottedRookieContract(32, 2025);
    expect(c32.guaranteedPct).toBeLessThan(c1.guaranteedPct);
  });

  it('1st round picks are fifthYearOptionEligible', () => {
    [1, 16, 32].forEach((p) => {
      expect(generateSlottedRookieContract(p, 2025).fifthYearOptionEligible).toBe(true);
    });
  });
});

// ── Late-round slotting near league minimum ───────────────────────────────────

describe('generateSlottedRookieContract — late-round minimum slot', () => {
  it('Pick #200 generates a 4-year deal', () => {
    const c = generateSlottedRookieContract(200, 2025);
    expect(c.yearsTotal).toBe(4);
    expect(c.years).toBe(4);
    expect(c.yearsRemaining).toBe(4);
  });

  it('Pick #200 baseAnnual is near the league minimum ($0.75M–$1.5M)', () => {
    const c = generateSlottedRookieContract(200, 2025);
    expect(c.baseAnnual).toBeGreaterThanOrEqual(0.75);
    expect(c.baseAnnual).toBeLessThanOrEqual(1.5);
  });

  it('Pick #200 has a minimal signing bonus (< $0.50M)', () => {
    const c = generateSlottedRookieContract(200, 2025);
    expect(c.signingBonus).toBeLessThan(0.5);
  });

  it('2nd round+ picks are NOT fifthYearOptionEligible', () => {
    [33, 64, 100, 200, 224].forEach((p) => {
      expect(generateSlottedRookieContract(p, 2025).fifthYearOptionEligible).toBe(false);
    });
  });
});

// ── ContractDetails schema compliance ────────────────────────────────────────

describe('generateSlottedRookieContract — schema compliance', () => {
  it('returns every field required by the ContractDetails schema', () => {
    const c = generateSlottedRookieContract(1, 2025);

    expect(typeof c.years).toBe('number');
    expect(typeof c.yearsTotal).toBe('number');
    expect(typeof c.yearsRemaining).toBe('number');
    expect(typeof c.baseAnnual).toBe('number');
    expect(typeof c.signingBonus).toBe('number');
    expect(typeof c.guaranteedPct).toBe('number');
    expect(typeof c.guaranteedMoney).toBe('number');
    expect(typeof c.optionBonus).toBe('number');
    expect(typeof c.optionYear).toBe('number');
    expect(typeof c.hasNoTradeClause).toBe('boolean');
    expect(typeof c.tagType).toBe('string');
    expect(typeof c.rookieScale).toBe('boolean');
    expect(typeof c.fifthYearOptionEligible).toBe('boolean');
    expect(typeof c.fifthYearOptionExercised).toBe('boolean');
    expect(typeof c.restrictedFreeAgent).toBe('boolean');
    expect(Array.isArray(c.incentives)).toBe(true);
  });

  it('rookieScale flag is true for all picks', () => {
    [1, 32, 33, 100, 200].forEach((p) => {
      expect(generateSlottedRookieContract(p, 2025).rookieScale).toBe(true);
    });
  });

  it('is idempotent through normalizeContractDetails (schema round-trip)', () => {
    const c = generateSlottedRookieContract(16, 2025);
    const normalized = normalizeContractDetails(c);
    expect(normalized.baseAnnual).toBe(c.baseAnnual);
    expect(normalized.signingBonus).toBe(c.signingBonus);
    expect(normalized.yearsTotal).toBe(c.yearsTotal);
    expect(normalized.yearsRemaining).toBe(c.yearsRemaining);
    expect(normalized.guaranteedPct).toBe(c.guaranteedPct);
    expect(normalized.rookieScale).toBe(true);
  });

  it('fifthYearOptionExercised is always false on draft day', () => {
    [1, 16, 32, 33, 100].forEach((p) => {
      expect(generateSlottedRookieContract(p, 2025).fifthYearOptionExercised).toBe(false);
    });
  });

  it('tagType is "none" (rookies cannot be tagged at draft time)', () => {
    expect(generateSlottedRookieContract(1, 2025).tagType).toBe('none');
  });

  it('incentives array is empty (no performance clauses at draft time)', () => {
    expect(generateSlottedRookieContract(1, 2025).incentives).toHaveLength(0);
  });

  it('guaranteedMoney is consistent with guaranteedPct × total value', () => {
    const c = generateSlottedRookieContract(1, 2025);
    const expectedGM = (c.baseAnnual * c.yearsTotal + c.signingBonus) * c.guaranteedPct;
    expect(c.guaranteedMoney).toBeCloseTo(expectedGM, 1);
  });
});

// ── Scale invariants ──────────────────────────────────────────────────────────

describe('generateSlottedRookieContract — scale invariants', () => {
  it('produces monotonically non-increasing baseAnnual from pick 1 to 224', () => {
    let prev = Infinity;
    for (let pick = 1; pick <= 224; pick++) {
      const c = generateSlottedRookieContract(pick, 2025);
      expect(c.baseAnnual).toBeLessThanOrEqual(prev);
      prev = c.baseAnnual;
    }
  });

  it('all picks produce exactly 4-year contracts', () => {
    [1, 32, 33, 64, 65, 96, 100, 128, 160, 192, 200, 224].forEach((pick) => {
      const c = generateSlottedRookieContract(pick, 2025);
      expect(c.yearsTotal).toBe(4);
      expect(c.years).toBe(4);
      expect(c.yearsRemaining).toBe(4);
    });
  });

  it('compensatory picks beyond #224 receive the same slot as #224', () => {
    const c224 = generateSlottedRookieContract(224, 2025);
    const c250 = generateSlottedRookieContract(250, 2025);
    const c300 = generateSlottedRookieContract(300, 2025);
    expect(c250.baseAnnual).toBe(c224.baseAnnual);
    expect(c300.baseAnnual).toBe(c224.baseAnnual);
  });

  it('baseAnnual never increases at round boundaries (non-increasing across all transitions)', () => {
    // The ROOKIE_SCALE round maxes form a decreasing sequence, so transitioning
    // from the last pick of round N to the first pick of round N+1 never jumps up.
    const roundLastPicks = [32, 64, 96, 128, 160, 192];
    roundLastPicks.forEach((lastPick) => {
      const end = generateSlottedRookieContract(lastPick, 2025);
      const next = generateSlottedRookieContract(lastPick + 1, 2025);
      expect(end.baseAnnual).toBeGreaterThanOrEqual(next.baseAnnual);
    });
  });

  it('future draft year inflates all contract values (4% annual growth)', () => {
    const c2025 = generateSlottedRookieContract(1, 2025);
    const c2030 = generateSlottedRookieContract(1, 2030);
    expect(c2030.baseAnnual).toBeGreaterThan(c2025.baseAnnual);
    expect(c2030.baseAnnual).toBeCloseTo(c2025.baseAnnual * Math.pow(1.04, 5), 1);
  });

  it('guaranteedPct is always within [0, 1] for all picks', () => {
    [1, 10, 11, 32, 33, 64, 100, 200, 224].forEach((pick) => {
      const c = generateSlottedRookieContract(pick, 2025);
      expect(c.guaranteedPct).toBeGreaterThanOrEqual(0);
      expect(c.guaranteedPct).toBeLessThanOrEqual(1);
    });
  });

  it('all numeric fields are finite numbers (no NaN or Infinity)', () => {
    [1, 32, 64, 100, 224].forEach((pick) => {
      const c = generateSlottedRookieContract(pick, 2025);
      ['baseAnnual', 'signingBonus', 'guaranteedPct', 'guaranteedMoney'].forEach((field) => {
        expect(Number.isFinite(c[field])).toBe(true);
      });
    });
  });
});

// ── Edge case safety ──────────────────────────────────────────────────────────

describe('generateSlottedRookieContract — edge case safety', () => {
  it('handles pick 0 without throwing (defaults to pick 1)', () => {
    expect(() => generateSlottedRookieContract(0, 2025)).not.toThrow();
    const c = generateSlottedRookieContract(0, 2025);
    expect(c.baseAnnual).toBe(generateSlottedRookieContract(1, 2025).baseAnnual);
  });

  it('handles negative pick numbers without throwing', () => {
    expect(() => generateSlottedRookieContract(-5, 2025)).not.toThrow();
  });

  it('handles null pick without throwing', () => {
    expect(() => generateSlottedRookieContract(null, 2025)).not.toThrow();
  });

  it('handles undefined pick without throwing', () => {
    expect(() => generateSlottedRookieContract(undefined, 2025)).not.toThrow();
  });

  it('handles null draftYear without throwing (falls back to 2025 baseline)', () => {
    expect(() => generateSlottedRookieContract(1, null)).not.toThrow();
    const c = generateSlottedRookieContract(1, null);
    expect(c.baseAnnual).toBe(generateSlottedRookieContract(1, 2025).baseAnnual);
  });

  it('handles past draftYear without deflating below baseline', () => {
    const past = generateSlottedRookieContract(1, 2020);
    const baseline = generateSlottedRookieContract(1, 2025);
    // yearFactor never goes below 1.0 — past years clamp to baseline
    expect(past.baseAnnual).toBe(baseline.baseAnnual);
  });
});
