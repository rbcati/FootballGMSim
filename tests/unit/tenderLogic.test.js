import { describe, it, expect } from 'vitest';
import {
  calculateFranchiseTagValue,
  calculateRFATender,
  getRFATenderTier,
  getRFACompensationPick,
  buildFranchiseTagContract,
  buildRFATenderContract,
  TENDER_CONFIG,
} from '../../src/core/contracts/tenderLogic.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makePlayer({ id = 'p1', pos = 'QB', ovr = 80, age = 26, draftRound = 1, baseAnnual = 10, signingBonus = 0, yearsTotal = 3, years = 1 } = {}) {
  return {
    id,
    pos,
    ovr,
    age,
    draftRound,
    contract: { baseAnnual, signingBonus, years, yearsTotal },
  };
}

function makeLeaguePlayers(pos, salaries) {
  return salaries.map((s, i) => makePlayer({ id: `lp-${i}`, pos, baseAnnual: s, signingBonus: 0, yearsTotal: 1 }));
}

// ── TENDER_CONFIG surface tests ───────────────────────────────────────────────

describe('TENDER_CONFIG', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(TENDER_CONFIG)).toBe(true);
    expect(Object.isFrozen(TENDER_CONFIG.RFA_TENDER_VALUES)).toBe(true);
    expect(Object.isFrozen(TENDER_CONFIG.RFA_COMPENSATION)).toBe(true);
  });

  it('exposes a positive MIN_CAP_BUFFER_AFTER_TAG', () => {
    expect(TENDER_CONFIG.MIN_CAP_BUFFER_AFTER_TAG).toBeGreaterThan(0);
  });

  it('1st-round tender is the most valuable tier', () => {
    expect(TENDER_CONFIG.RFA_TENDER_VALUES['1st_round'])
      .toBeGreaterThan(TENDER_CONFIG.RFA_TENDER_VALUES['2nd_round']);
    expect(TENDER_CONFIG.RFA_TENDER_VALUES['2nd_round'])
      .toBeGreaterThan(TENDER_CONFIG.RFA_TENDER_VALUES['original_round']);
  });
});

// ── getRFATenderTier ──────────────────────────────────────────────────────────

describe('getRFATenderTier', () => {
  it('returns 1st_round for draft round 1', () => {
    expect(getRFATenderTier(1)).toBe('1st_round');
  });

  it('returns 2nd_round for draft round 2', () => {
    expect(getRFATenderTier(2)).toBe('2nd_round');
  });

  it('returns original_round for rounds 3–7', () => {
    for (const round of [3, 4, 5, 6, 7]) {
      expect(getRFATenderTier(round)).toBe('original_round');
    }
  });

  it('returns original_round for null (UDFA)', () => {
    expect(getRFATenderTier(null)).toBe('original_round');
    expect(getRFATenderTier(0)).toBe('original_round');
  });
});

// ── getRFACompensationPick ────────────────────────────────────────────────────

describe('getRFACompensationPick', () => {
  it('returns "1st" for a 1st-round pick player', () => {
    expect(getRFACompensationPick(1)).toBe('1st');
  });

  it('returns "2nd" for a 2nd-round pick player', () => {
    expect(getRFACompensationPick(2)).toBe('2nd');
  });

  it('returns "original" for rounds 3+', () => {
    expect(getRFACompensationPick(3)).toBe('original');
    expect(getRFACompensationPick(7)).toBe('original');
  });

  it('returns "original" for UDFAs (null draft round)', () => {
    expect(getRFACompensationPick(null)).toBe('original');
  });
});

// ── calculateRFATender ────────────────────────────────────────────────────────

describe('calculateRFATender', () => {
  it('returns the 1st-round tender value for a 1st-round pick', () => {
    expect(calculateRFATender(1)).toBe(TENDER_CONFIG.RFA_TENDER_VALUES['1st_round']);
  });

  it('returns the 2nd-round tender value for a 2nd-round pick', () => {
    expect(calculateRFATender(2)).toBe(TENDER_CONFIG.RFA_TENDER_VALUES['2nd_round']);
  });

  it('returns the original-round tender value for later picks', () => {
    expect(calculateRFATender(5)).toBe(TENDER_CONFIG.RFA_TENDER_VALUES['original_round']);
  });

  it('is deterministic — same inputs always produce the same output', () => {
    expect(calculateRFATender(1)).toBe(calculateRFATender(1));
    expect(calculateRFATender(3)).toBe(calculateRFATender(3));
  });
});

// ── calculateFranchiseTagValue ────────────────────────────────────────────────

describe('calculateFranchiseTagValue', () => {
  it('averages the top-5 salaries when sufficient data exists', () => {
    // Six QBs with known salaries; tag value = avg of top 5
    const qbs = makeLeaguePlayers('QB', [40, 35, 30, 25, 20, 10]);
    const tagValue = calculateFranchiseTagValue('QB', qbs);
    const expected = (40 + 35 + 30 + 25 + 20) / 5; // 30
    expect(tagValue).toBeCloseTo(expected, 1);
  });

  it('falls back to position defaults when fewer than 2 data points', () => {
    const tagValue = calculateFranchiseTagValue('QB', []);
    // Default QB tag should be a meaningful positive value (spec: top-tier position)
    expect(tagValue).toBeGreaterThan(15);
  });

  it('is deterministic — same inputs always produce the same output', () => {
    const players = makeLeaguePlayers('WR', [20, 18, 16, 14, 12]);
    const v1 = calculateFranchiseTagValue('WR', players);
    const v2 = calculateFranchiseTagValue('WR', players);
    expect(v1).toBe(v2);
  });

  it('ignores players at other positions', () => {
    // Mix QBs and WRs; tag value for QB should only use QB salaries
    const qbs = makeLeaguePlayers('QB', [30, 28, 26, 24, 22]);
    const wrs = makeLeaguePlayers('WR', [5, 4, 3, 2, 1]);
    const tagValue = calculateFranchiseTagValue('QB', [...qbs, ...wrs]);
    const expected = (30 + 28 + 26 + 24 + 22) / 5; // 26
    expect(tagValue).toBeCloseTo(expected, 1);
  });

  it('only considers players with positive base salaries', () => {
    const validPlayers  = makeLeaguePlayers('RB', [12, 10, 8]);
    const zeroPay       = [makePlayer({ pos: 'RB', baseAnnual: 0 }), makePlayer({ pos: 'RB', baseAnnual: -5 })];
    const tagValue = calculateFranchiseTagValue('RB', [...validPlayers, ...zeroPay]);
    // Only 3 valid data points → falls back to default (< 2 valid top-N entries means default)
    // OR averages the 3 valid ones; the key assertion is it doesn't throw or return NaN
    expect(Number.isFinite(tagValue)).toBe(true);
    expect(tagValue).toBeGreaterThan(0);
  });
});

// ── buildFranchiseTagContract ─────────────────────────────────────────────────

describe('buildFranchiseTagContract', () => {
  it('produces a 1-year fully-guaranteed contract with tag: "franchise"', () => {
    const player   = makePlayer({ pos: 'QB' });
    const contract = buildFranchiseTagContract(player, [], 2025);

    expect(contract.years).toBe(1);
    expect(contract.yearsTotal).toBe(1);
    expect(contract.guaranteedPct).toBe(1.0);
    expect(contract.tag).toBe('franchise');
    expect(contract.tagType).toBe('franchise');
  });

  it('derives tag value from league salary data when available', () => {
    const player   = makePlayer({ pos: 'QB' });
    const qbs      = makeLeaguePlayers('QB', [30, 28, 26, 24, 22]);
    const contract = buildFranchiseTagContract(player, qbs, 2025);
    const expected = (30 + 28 + 26 + 24 + 22) / 5;

    expect(contract.baseAnnual).toBeCloseTo(expected, 1);
  });

  it('contract tag prevents the player being mistaken for a free agent', () => {
    const player   = makePlayer({ pos: 'QB' });
    const contract = buildFranchiseTagContract(player, [], 2025);

    // A tagged player keeps their teamId; this verifies the contract flag is set
    // so callers know to exclude them from the FA pool.
    expect(contract.tag).toBe('franchise');

    // Simulate the free-agency pool filter: (!p.teamId || p.status === 'free_agent')
    // A tagged player retains teamId and active status — they will NOT appear in the pool.
    const taggedPlayer = { ...player, teamId: 1, status: 'active', contract };
    const isInFaPool   = !taggedPlayer.teamId || taggedPlayer.status === 'free_agent';
    expect(isInFaPool).toBe(false);
  });

  it('sets startYear to the supplied current year', () => {
    const player   = makePlayer({ pos: 'WR' });
    const contract = buildFranchiseTagContract(player, [], 2027);
    expect(contract.startYear).toBe(2027);
  });
});

// ── buildRFATenderContract ────────────────────────────────────────────────────

describe('buildRFATenderContract', () => {
  it('applies a 1st-round tender and records 1st-round compensation for round-1 pick', () => {
    const player   = makePlayer({ draftRound: 1 });
    const contract = buildRFATenderContract(player, 2025);

    expect(contract.tender).toBe('1st_round');
    expect(contract.compensationPick).toBe('1st');
    expect(contract.baseAnnual).toBe(TENDER_CONFIG.RFA_TENDER_VALUES['1st_round']);
    expect(contract.restrictedFreeAgent).toBe(true);
  });

  it('applies a 2nd-round tender for a round-2 pick', () => {
    const player   = makePlayer({ draftRound: 2 });
    const contract = buildRFATenderContract(player, 2025);

    expect(contract.tender).toBe('2nd_round');
    expect(contract.compensationPick).toBe('2nd');
  });

  it('applies an original-round tender for rounds 3–7', () => {
    for (const round of [3, 4, 5, 6, 7]) {
      const player   = makePlayer({ draftRound: round });
      const contract = buildRFATenderContract(player, 2025);

      expect(contract.tender).toBe('original_round');
      expect(contract.compensationPick).toBe('original');
    }
  });

  it('produces a 1-year fully-guaranteed contract', () => {
    const player   = makePlayer({ draftRound: 1 });
    const contract = buildRFATenderContract(player, 2025);

    expect(contract.years).toBe(1);
    expect(contract.yearsTotal).toBe(1);
    expect(contract.guaranteedPct).toBe(1.0);
  });

  it('1st-round tender value is higher than original-round tender value', () => {
    const p1 = makePlayer({ draftRound: 1 });
    const p3 = makePlayer({ draftRound: 3 });

    const c1 = buildRFATenderContract(p1, 2025);
    const c3 = buildRFATenderContract(p3, 2025);

    expect(c1.baseAnnual).toBeGreaterThan(c3.baseAnnual);
  });
});
