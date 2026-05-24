import { describe, it, expect } from 'vitest';
import {
  evaluateCutCandidate,
  executeAIOffseasonCuts,
  ROSTER_CUT_CONFIG,
} from '../../src/core/roster/aiRosterCuts.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

let _idSeq = 0;
function makePlayer({ ovr, age, baseAnnual, signingBonus = 0, yearsTotal = 1, yearsRemaining = 1 }) {
  _idSeq += 1;
  return {
    id: `p-${_idSeq}`,
    ovr,
    age,
    contract: {
      baseAnnual,
      signingBonus,
      yearsTotal,
      yearsRemaining,
      years: yearsRemaining,
    },
  };
}

// ── evaluateCutCandidate ──────────────────────────────────────────────────────

describe('evaluateCutCandidate — dead cap guard', () => {
  it('refuses to release a player whose dead cap exceeds their cap hit', () => {
    // $5M base + $10M proration = $15M cap hit
    // Dead cap = $10M/yr × 2 yrs remaining = $20M → Cap Savings = -$5M
    const player = makePlayer({
      ovr: 70, age: 31,
      baseAnnual: 5, signingBonus: 20, yearsTotal: 2, yearsRemaining: 2,
    });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(false);
    expect(result.reason).toBe('no_cap_savings');
    expect(result.capSavings).toBeLessThanOrEqual(0);
  });

  it('refuses to release when cap hit exactly equals dead cap (zero savings)', () => {
    // $0M base + $4M proration = $4M cap hit; dead cap = $4M × 1 yr = $4M → $0 savings
    const player = makePlayer({
      ovr: 68, age: 33,
      baseAnnual: 0, signingBonus: 4, yearsTotal: 1, yearsRemaining: 1,
    });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(false);
    expect(result.reason).toBe('no_cap_savings');
    expect(result.capSavings).toBe(0);
  });
});

describe('evaluateCutCandidate — elite starter protection', () => {
  it('refuses to release an elite starter (OVR >= 85) under normal conditions', () => {
    // Even though releasing this player generates $15M in pure cap savings,
    // the cut must be blocked because OVR 88 >= ELITE_OVR_FLOOR.
    const player = makePlayer({ ovr: 88, age: 32, baseAnnual: 15, signingBonus: 0 });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(false);
    expect(result.reason).toBe('elite_starter_protected');
    // Savings exist — the refusal is strategic, not financial.
    expect(result.capSavings).toBeGreaterThan(0);
  });

  it('refuses a player at exactly the elite floor (OVR = 85)', () => {
    const player = makePlayer({ ovr: 85, age: 34, baseAnnual: 12, signingBonus: 0 });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(false);
    expect(result.reason).toBe('elite_starter_protected');
  });
});

describe('evaluateCutCandidate — high-priority aging veteran', () => {
  it('identifies a high-priority cut for an aging, declining veteran with real savings', () => {
    // Age 33, OVR 72, $8M cap hit, no signing bonus → $8M pure savings
    const player = makePlayer({ ovr: 72, age: 33, baseAnnual: 8, signingBonus: 0 });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(true);
    expect(result.reason).toBe('aging_veteran');
    expect(result.priority).toBe('high');
    expect(result.capSavings).toBeGreaterThan(ROSTER_CUT_CONFIG.MIN_CAP_SAVINGS_M);
  });

  it('does NOT cut a 30-year-old if OVR is still above the floor (>= 75)', () => {
    // Age 30, OVR 78 — just above HIGH_PRIORITY_MAX_OVR
    const player = makePlayer({ ovr: 78, age: 30, baseAnnual: 10, signingBonus: 0 });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(false);
    expect(result.reason).toBe('below_cut_threshold');
  });

  it('does NOT cut a 29-year-old even with low OVR (age gate not met)', () => {
    const player = makePlayer({ ovr: 68, age: 29, baseAnnual: 10, signingBonus: 0 });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(false);
  });

  it('does NOT cut when savings are at or below the minimum threshold', () => {
    // $3M savings exactly equals MIN_CAP_SAVINGS_M — must be strictly greater.
    const player = makePlayer({ ovr: 70, age: 33, baseAnnual: 3, signingBonus: 0 });
    const result = evaluateCutCandidate(player);
    expect(result.shouldCut).toBe(false);
  });
});

// ── executeAIOffseasonCuts ────────────────────────────────────────────────────

describe('executeAIOffseasonCuts — cap threshold gate', () => {
  it('returns an empty array when the team has sufficient cap room', () => {
    const teamState = { capRoom: 20 };
    const roster = [makePlayer({ ovr: 70, age: 33, baseAnnual: 8 })];
    expect(executeAIOffseasonCuts(teamState, roster, 2026)).toEqual([]);
  });

  it('returns an empty array at exactly the safe threshold', () => {
    const teamState = { capRoom: ROSTER_CUT_CONFIG.SAFE_CAP_THRESHOLD_M };
    const roster = [makePlayer({ ovr: 70, age: 33, baseAnnual: 8 })];
    expect(executeAIOffseasonCuts(teamState, roster, 2026)).toEqual([]);
  });

  it('derives cap room from capTotal/capUsed/deadCap when capRoom is absent', () => {
    // capTotal 255 - capUsed 250 - deadCap 0 = $5M → below threshold
    const teamState = { capTotal: 255, capUsed: 250, deadCap: 0 };
    const veteran = makePlayer({ ovr: 70, age: 33, baseAnnual: 8 });
    const cuts = executeAIOffseasonCuts(teamState, [veteran], 2026);
    expect(cuts.length).toBeGreaterThan(0);
  });
});

describe('executeAIOffseasonCuts — releases aging veteran when cap-strapped', () => {
  it('releases an aging low-OVR veteran with positive cap savings', () => {
    const teamState = { capRoom: 5 };
    const veteran = makePlayer({ ovr: 70, age: 33, baseAnnual: 8 });
    const cuts = executeAIOffseasonCuts(teamState, [veteran], 2026);
    expect(cuts).toHaveLength(1);
    expect(cuts[0].player).toBe(veteran);
    expect(cuts[0].capSavings).toBeCloseTo(8, 1);
    expect(cuts[0].reason).toBe('aging_veteran');
  });
});

describe('executeAIOffseasonCuts — dead cap guard integration', () => {
  it('does NOT release a player whose dead cap exceeds their cap hit', () => {
    const teamState = { capRoom: 5 };
    // $4M base + $10M prorated = $14M cap hit; dead cap = $10M × 2 yrs = $20M → negative savings
    const toxicContract = makePlayer({
      ovr: 68, age: 34,
      baseAnnual: 4, signingBonus: 20, yearsTotal: 2, yearsRemaining: 2,
    });
    const cuts = executeAIOffseasonCuts(teamState, [toxicContract], 2026);
    expect(cuts).toHaveLength(0);
  });
});

describe('executeAIOffseasonCuts — elite starter protection integration', () => {
  it('does NOT release an elite starter (OVR 85+) under normal cap pressure', () => {
    // Cap room = $10M < $15M threshold, but elite starter must be protected.
    const teamState = { capRoom: 10 };
    const elite = makePlayer({ ovr: 90, age: 29, baseAnnual: 20 });
    const cuts = executeAIOffseasonCuts(teamState, [elite], 2026);
    expect(cuts).toHaveLength(0);
  });

  it('does NOT release an elite starter just to generate surplus cap when already safe-ish', () => {
    // Team at $14M — just below threshold, but elite starters are off-limits.
    const teamState = { capRoom: 14 };
    const elite = makePlayer({ ovr: 88, age: 31, baseAnnual: 18 });
    const cuts = executeAIOffseasonCuts(teamState, [elite], 2026);
    expect(cuts).toHaveLength(0);
  });
});

describe('executeAIOffseasonCuts — stops once safe threshold is reached', () => {
  it('stops releasing players once simulated cap room reaches the safe threshold', () => {
    // Starting cap room: $5M. Three veterans each generate $6M savings.
    // After cut #1: $5M + $6M = $11M (still < $15M → continue).
    // After cut #2: $11M + $6M = $17M (>= $15M → stop).
    const teamState = { capRoom: 5 };
    const roster = [
      makePlayer({ ovr: 70, age: 33, baseAnnual: 6 }),
      makePlayer({ ovr: 69, age: 34, baseAnnual: 6 }),
      makePlayer({ ovr: 71, age: 31, baseAnnual: 6 }),
    ];
    const cuts = executeAIOffseasonCuts(teamState, roster, 2026);
    expect(cuts.length).toBeLessThanOrEqual(3);
    const totalSavings = cuts.reduce((sum, c) => sum + c.capSavings, 0);
    expect(5 + totalSavings).toBeGreaterThanOrEqual(ROSTER_CUT_CONFIG.SAFE_CAP_THRESHOLD_M);
  });
});

describe('executeAIOffseasonCuts — critical insolvency unlocks elite starters', () => {
  it('allows releasing an elite starter when team is critically insolvent (< $0M)', () => {
    const teamState = { capRoom: -10 };
    // Elite starter with pure savings — normally protected but insolvency overrides.
    const elite = makePlayer({ ovr: 88, age: 30, baseAnnual: 20 });
    const cuts = executeAIOffseasonCuts(teamState, [elite], 2026);
    expect(cuts.length).toBeGreaterThan(0);
    expect(cuts[0].reason).toBe('elite_critical_insolvency');
    expect(cuts[0].capSavings).toBeGreaterThan(0);
  });

  it('still refuses to release any player with negative savings even under critical insolvency', () => {
    const teamState = { capRoom: -10 };
    // Large signing bonus makes release worse than keeping.
    const toxic = makePlayer({
      ovr: 88, age: 30,
      baseAnnual: 2, signingBonus: 40, yearsTotal: 2, yearsRemaining: 2,
    });
    const cuts = executeAIOffseasonCuts(teamState, [toxic], 2026);
    expect(cuts).toHaveLength(0);
  });
});

describe('executeAIOffseasonCuts — mixed roster scenarios', () => {
  it('prioritises the highest-savings candidate first in a mixed roster', () => {
    // Two veterans: $10M savings vs $5M savings. Both qualify; start with highest.
    const teamState = { capRoom: 5 };
    const highSavings = makePlayer({ ovr: 70, age: 33, baseAnnual: 10 });
    const lowSavings  = makePlayer({ ovr: 69, age: 32, baseAnnual: 5 });
    const cuts = executeAIOffseasonCuts(teamState, [lowSavings, highSavings], 2026);
    // highSavings: $5 + $10 = $15M (>= threshold) → only 1 cut needed
    expect(cuts).toHaveLength(1);
    expect(cuts[0].player).toBe(highSavings);
  });

  it('ignores mid-career players with savings below MIN_CAP_SAVINGS_M', () => {
    const teamState = { capRoom: 5 };
    // $2M savings < $3M minimum — not eligible for high-priority cut
    const medPlayer = makePlayer({ ovr: 72, age: 31, baseAnnual: 2 });
    const cuts = executeAIOffseasonCuts(teamState, [medPlayer], 2026);
    expect(cuts).toHaveLength(0);
  });
});
