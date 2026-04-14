import { describe, it, expect } from 'vitest';
import {
  normalizeContractDetails,
  repairLegacyPlayerContract,
  calculateContractCapHit,
  estimateHoldoutRisk,
  calculateTeamPayroll,
  projectTeamFinancials,
  normalizeLoadedLeagueContracts,
} from '../contracts/realisticContracts.js';

describe('realistic contract normalization', () => {
  it('hydrates legacy/partial contracts with safe defaults', () => {
    const normalized = normalizeContractDetails({ baseAnnual: 20, incentives: [{ amount: 2 }] }, { years: 3 });
    expect(normalized.yearsTotal).toBe(3);
    expect(normalized.incentives).toHaveLength(1);
    expect(normalized.tagType).toBe('none');
  });

  it('includes likely incentives in cap hit', () => {
    const capHit = calculateContractCapHit({ yearsTotal: 4, baseAnnual: 24, signingBonus: 8, incentives: [{ amount: 2, capTreatment: 'likely' }, { amount: 3, capTreatment: 'unlikely' }] });
    expect(capHit).toBe(28);
  });

  it('repairs legacy flat-contract players without inflating annual salary', () => {
    const repaired = repairLegacyPlayerContract({
      id: 1,
      years: 4,
      yearsTotal: 4,
      salary: 88, // legacy total-deal value
      signingBonus: 8,
    });
    expect(repaired.contract.baseAnnual).toBe(22);
    expect(calculateContractCapHit(repaired.contract)).toBe(24);
  });

  it('prefers canonical nested contract and avoids double counting signing bonus', () => {
    const repaired = repairLegacyPlayerContract({
      id: 2,
      years: 4,
      yearsTotal: 4,
      baseAnnual: 18,
      signingBonus: 12,
      contract: { yearsTotal: 4, baseAnnual: 26, signingBonus: 8 },
    });
    expect(repaired.contract.baseAnnual).toBe(26);
    expect(repaired.contract.signingBonus).toBe(8);
    expect(calculateContractCapHit(repaired.contract)).toBe(28);
  });

  it('repairs corrupted contract values with conservative defaults', () => {
    const repaired = repairLegacyPlayerContract({
      id: 3,
      contract: { yearsTotal: -9, yearsRemaining: 99, baseAnnual: 'bad', signingBonus: -20 },
    });
    expect(repaired.contract.yearsTotal).toBe(1);
    expect(repaired.contract.yearsRemaining).toBe(1);
    expect(repaired.contract.baseAnnual).toBe(0);
    expect(repaired.contract.signingBonus).toBe(0);
  });

  it('normalizes a mixed league payload without double counting', () => {
    const league = normalizeLoadedLeagueContracts({
      players: [
        { id: 10, years: 3, salary: 96, signingBonus: 6 }, // legacy flat total salary
        { id: 11, contract: { yearsTotal: 2, baseAnnual: 15, signingBonus: 4 }, salary: 40, signingBonus: 10 }, // mixed
      ],
    });
    expect(league.players[0].contract.baseAnnual).toBe(32);
    expect(calculateContractCapHit(league.players[0].contract)).toBe(34);
    expect(league.players[1].contract.baseAnnual).toBe(15);
    expect(calculateContractCapHit(league.players[1].contract)).toBe(17);
  });
});

describe('holdout and payroll rules', () => {
  it('flags holdout risk for underpaid volatile stars', () => {
    const risk = estimateHoldoutRisk({
      contract: { baseAnnual: 8, years: 2 },
      extensionAsk: { baseAnnual: 18 },
      morale: 42,
      personalityProfile: { holdoutRisk: 88 },
    }, { wins: 12 });
    expect(risk.tier).toBe('high');
    expect(risk.shouldHoldout).toBe(true);
  });

  it('computes hard cap and floor status', () => {
    const payroll = calculateTeamPayroll({
      roster: [{ contract: { years: 4, baseAnnual: 30, signingBonus: 16 } }],
      staffPayroll: 24,
      deadCap: 10,
      capFloor: 60,
      capLimit: 67,
    });
    expect(payroll.overCap).toBe(true);
    expect(payroll.belowFloor).toBe(false);
  });

  it('includes staff payroll and dead cap exactly once', () => {
    const payroll = calculateTeamPayroll({
      roster: [
        { contract: { yearsTotal: 4, baseAnnual: 20, signingBonus: 8 } }, // 22
        { contract: { yearsTotal: 2, baseAnnual: 10, signingBonus: 0 } }, // 10
      ],
      staffPayroll: 15,
      deadCap: 5,
      capLimit: 80,
    });
    expect(payroll.playerPayroll).toBe(32);
    expect(payroll.totalPayroll).toBe(52);
    expect(payroll.capSpace).toBe(28);
  });
});

describe('financial projections', () => {
  it('projects positive income for winning franchises in strong markets', () => {
    const f = projectTeamFinancials({ marketSize: 1.25, wins: 13, fanApproval: 82, payroll: 220, facilityLevels: { trainingLevel: 4, medicalLevel: 4, scoutingLevel: 3 } });
    expect(f.ticketSales).toBeGreaterThan(80);
    expect(f.facilityUpgrades).toHaveLength(3);
  });
});
