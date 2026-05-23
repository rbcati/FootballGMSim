import { describe, it, expect } from 'vitest';
import {
  normalizeContract,
  getContractYearsRemaining,
  getAnnualBaseSalary,
  getAnnualBonusProration,
  getActiveCapHit,
  calculateReleaseDeadCap,
  calculateTeamCapObligations,
  canTeamAffordContract,
} from '../contracts/contractObligations.js';

// ── normalizeContract ─────────────────────────────────────────────────────────

describe('normalizeContract', () => {
  it('handles a nested player.contract correctly', () => {
    const player = {
      id: 1,
      baseAnnual: 99, // should be ignored — nested contract wins
      contract: { yearsTotal: 4, yearsRemaining: 3, baseAnnual: 22, signingBonus: 8 },
    };
    const c = normalizeContract(player);
    expect(c.baseAnnual).toBe(22);
    expect(c.signingBonus).toBe(8);
    expect(c.yearsTotal).toBe(4);
    expect(c.yearsRemaining).toBe(3);
  });

  it('handles a legacy flat player with no nested contract', () => {
    const player = { id: 2, baseAnnual: 14, years: 2, yearsTotal: 2 };
    const c = normalizeContract(player);
    expect(c.baseAnnual).toBe(14);
    expect(c.yearsTotal).toBe(2);
    expect(c.signingBonus).toBe(0);
  });

  it('handles a bare contract object (no player wrapper)', () => {
    const c = normalizeContract({ yearsTotal: 3, baseAnnual: 18, signingBonus: 6 });
    expect(c.baseAnnual).toBe(18);
    expect(c.signingBonus).toBe(6);
  });

  it('defaults missing fields to zero / one safely', () => {
    const c = normalizeContract({});
    expect(c.baseAnnual).toBe(0);
    expect(c.signingBonus).toBe(0);
    expect(c.yearsTotal).toBe(1);
    expect(c.yearsRemaining).toBe(1);
    expect(c.guaranteedPct).toBe(0);
  });
});

// ── getContractYearsRemaining ─────────────────────────────────────────────────

describe('getContractYearsRemaining', () => {
  it('returns yearsRemaining from nested contract', () => {
    const player = { contract: { yearsTotal: 5, yearsRemaining: 2, baseAnnual: 20 } };
    expect(getContractYearsRemaining(player)).toBe(2);
  });

  it('defaults to 1 when no years info present', () => {
    expect(getContractYearsRemaining({})).toBe(1);
  });
});

// ── getAnnualBaseSalary ───────────────────────────────────────────────────────

describe('getAnnualBaseSalary', () => {
  it('returns baseAnnual from nested contract', () => {
    const player = { contract: { yearsTotal: 3, baseAnnual: 16, signingBonus: 0 } };
    expect(getAnnualBaseSalary(player)).toBe(16);
  });

  it('returns 0 for a player with no contract info', () => {
    expect(getAnnualBaseSalary({})).toBe(0);
  });
});

// ── getAnnualBonusProration ───────────────────────────────────────────────────

describe('getAnnualBonusProration', () => {
  it('prorates signing bonus evenly across contract years', () => {
    const player = { contract: { yearsTotal: 4, baseAnnual: 20, signingBonus: 12 } };
    // 12 / 4 = 3 per year
    expect(getAnnualBonusProration(player)).toBe(3);
  });

  it('returns 0 when there is no signing bonus', () => {
    const player = { contract: { yearsTotal: 3, baseAnnual: 10, signingBonus: 0 } };
    expect(getAnnualBonusProration(player)).toBe(0);
  });

  it('returns 0 for a legacy flat-salary player with no bonus fields', () => {
    const player = { baseAnnual: 8, years: 2 };
    expect(getAnnualBonusProration(player)).toBe(0);
  });

  it('prorates correctly for a 1-year deal', () => {
    const player = { contract: { yearsTotal: 1, baseAnnual: 5, signingBonus: 2 } };
    expect(getAnnualBonusProration(player)).toBe(2);
  });
});

// ── getActiveCapHit ───────────────────────────────────────────────────────────

describe('getActiveCapHit', () => {
  it('legacy flat-salary player: cap hit equals baseAnnual (no bonus)', () => {
    const player = { contract: { yearsTotal: 3, baseAnnual: 18, signingBonus: 0 } };
    expect(getActiveCapHit(player)).toBe(18);
  });

  it('adds prorated bonus to baseAnnual', () => {
    // 24 base + 8/4 = 24 + 2 = 26
    const player = { contract: { yearsTotal: 4, baseAnnual: 24, signingBonus: 8 } };
    expect(getActiveCapHit(player)).toBe(26);
  });

  it('matches calculateContractCapHit directly for a known contract', () => {
    const player = { contract: { yearsTotal: 5, baseAnnual: 30, signingBonus: 20 } };
    // 30 + 20/5 = 30 + 4 = 34
    expect(getActiveCapHit(player)).toBe(34);
  });

  it('returns 0 for a player with no contract fields', () => {
    expect(getActiveCapHit({})).toBe(0);
  });
});

// ── calculateReleaseDeadCap ───────────────────────────────────────────────────

describe('calculateReleaseDeadCap', () => {
  it('computes remaining prorated bonus as dead cap', () => {
    // signingBonus=12, yearsTotal=4 → proration=3/yr; yearsRemaining=3 → dead=9
    const player = { contract: { yearsTotal: 4, yearsRemaining: 3, baseAnnual: 20, signingBonus: 12 } };
    const result = calculateReleaseDeadCap(player);
    expect(result.yearlyProration).toBe(3);
    expect(result.deadCapThisYear).toBe(9);
    expect(result.total).toBe(9);
    expect(result.deadCapDeferred).toBe(0);
  });

  it('returns zero dead cap for a player with no signing bonus', () => {
    const player = { contract: { yearsTotal: 3, yearsRemaining: 2, baseAnnual: 10, signingBonus: 0 } };
    const result = calculateReleaseDeadCap(player);
    expect(result.yearlyProration).toBe(0);
    expect(result.total).toBe(0);
  });

  it('equals full signing bonus when releasing in year 1 of the deal', () => {
    // All years remain → dead cap = full bonus
    const player = { contract: { yearsTotal: 3, yearsRemaining: 3, baseAnnual: 15, signingBonus: 9 } };
    const result = calculateReleaseDeadCap(player);
    expect(result.total).toBe(9);
  });

  it('equals one-year proration when one year remains', () => {
    const player = { contract: { yearsTotal: 4, yearsRemaining: 1, baseAnnual: 20, signingBonus: 8 } };
    const result = calculateReleaseDeadCap(player);
    // 8/4 = 2 proration; 1 year remains → total = 2
    expect(result.total).toBe(2);
    expect(result.yearlyProration).toBe(2);
  });

  it('handles legacy player with no contract object (no dead cap)', () => {
    const player = { baseAnnual: 8, years: 1 };
    const result = calculateReleaseDeadCap(player);
    expect(result.total).toBe(0);
  });
});

// ── calculateTeamCapObligations ───────────────────────────────────────────────

describe('calculateTeamCapObligations', () => {
  const makePlayer = (baseAnnual, signingBonus = 0, yearsTotal = 3) => ({
    contract: { yearsTotal, yearsRemaining: yearsTotal, baseAnnual, signingBonus },
  });

  it('sums player cap hits correctly', () => {
    const players = [
      makePlayer(20, 8, 4),  // cap hit = 20 + 2 = 22
      makePlayer(12, 0, 2),  // cap hit = 12
    ];
    const team = { capTotal: 200, deadCap: 0, staffPayroll: 0 };
    const result = calculateTeamCapObligations(team, players);
    expect(result.playerPayroll).toBe(34);
    expect(result.totalCapUsed).toBe(34);
    expect(result.capRoom).toBe(166);
    expect(result.overCap).toBe(false);
  });

  it('includes dead cap in totalCapUsed', () => {
    const players = [makePlayer(20, 0, 3)];
    const team = { capTotal: 200, deadCap: 10, staffPayroll: 0 };
    const result = calculateTeamCapObligations(team, players);
    expect(result.playerPayroll).toBe(20);
    expect(result.deadCap).toBe(10);
    expect(result.totalCapUsed).toBe(30);
  });

  it('uses leagueSettings.salaryCap when team.capTotal is absent', () => {
    const result = calculateTeamCapObligations({}, [], { salaryCap: 250 });
    expect(result.capTotal).toBe(250);
  });

  it('defaults capTotal to 301.2 when no settings provided', () => {
    const result = calculateTeamCapObligations({}, []);
    expect(result.capTotal).toBe(301.2);
  });

  it('flags overCap when totalCapUsed exceeds capTotal', () => {
    const players = [makePlayer(150, 0, 1), makePlayer(200, 0, 1)];
    const team = { capTotal: 300 };
    const result = calculateTeamCapObligations(team, players);
    expect(result.overCap).toBe(true);
  });

  it('returns zero payroll for an empty roster', () => {
    const team = { capTotal: 250, deadCap: 5 };
    const result = calculateTeamCapObligations(team, []);
    expect(result.playerPayroll).toBe(0);
    expect(result.deadCap).toBe(5);
    expect(result.totalCapUsed).toBe(5);
  });
});

// ── canTeamAffordContract ─────────────────────────────────────────────────────

describe('canTeamAffordContract', () => {
  const makePlayer = (baseAnnual, signingBonus = 0, yearsTotal = 3) => ({
    contract: { yearsTotal, yearsRemaining: yearsTotal, baseAnnual, signingBonus },
  });

  it('returns ok=true for an affordable deal with cap room remaining', () => {
    const team = { capTotal: 200, deadCap: 0, staffPayroll: 0 };
    const players = [makePlayer(20), makePlayer(15)];
    // current used = 35; new contract = 10 → projected = 45 < 200
    const result = canTeamAffordContract(team, players, { baseAnnual: 10, yearsTotal: 2, signingBonus: 0 });
    expect(result.ok).toBe(true);
    expect(result.capRoom).toBeGreaterThan(0);
    expect(result.projectedCap).toBe(45);
  });

  it('returns ok=false when the new contract pushes over the cap', () => {
    const team = { capTotal: 100, deadCap: 0, staffPayroll: 0 };
    const players = [makePlayer(80)];
    // current used = 80; new contract = 25 → projected = 105 > 100
    const result = canTeamAffordContract(team, players, { baseAnnual: 25, yearsTotal: 3, signingBonus: 0 });
    expect(result.ok).toBe(false);
    expect(result.capRoom).toBeLessThan(0);
    expect(result.reason).toMatch(/over cap/i);
  });

  it('accounts for prorated signing bonus in the new contract cap hit', () => {
    const team = { capTotal: 200, deadCap: 0, staffPayroll: 0 };
    const players = [makePlayer(150)];
    // current used = 150; new = 30 base + 20/4 bonus = 35 → projected = 185
    const result = canTeamAffordContract(team, players, { baseAnnual: 30, signingBonus: 20, yearsTotal: 4 });
    expect(result.ok).toBe(true);
    expect(result.projectedCap).toBe(185);
  });

  it('includes dead cap from the team in the affordability calc', () => {
    const team = { capTotal: 100, deadCap: 20, staffPayroll: 0 };
    const players = [makePlayer(60)];
    // used = 60 + 20 dead = 80; new = 25 → projected = 105 > 100
    const result = canTeamAffordContract(team, players, { baseAnnual: 25, yearsTotal: 1, signingBonus: 0 });
    expect(result.ok).toBe(false);
  });

  it('legacy flat salary player (no bonus): same affordability as before V1', () => {
    const team = { capTotal: 200 };
    const legacyPlayer = { baseAnnual: 10, years: 2, yearsTotal: 2 };
    // cap hit = 10 (no bonus); new deal = 5 → projected = 15
    const result = canTeamAffordContract(team, [legacyPlayer], { baseAnnual: 5, yearsTotal: 1 });
    expect(result.ok).toBe(true);
    expect(result.projectedCap).toBe(15);
  });

  it('reason string is informative for affordable deals', () => {
    const team = { capTotal: 200 };
    const result = canTeamAffordContract(team, [], { baseAnnual: 10, yearsTotal: 2 });
    expect(result.reason).toMatch(/fits/i);
    expect(result.reason).toMatch(/10\.0M/);
  });

  it('reason string is informative for over-cap rejections', () => {
    const team = { capTotal: 50 };
    const result = canTeamAffordContract(team, [], { baseAnnual: 60, yearsTotal: 1 });
    expect(result.reason).toMatch(/over cap/i);
  });
});
