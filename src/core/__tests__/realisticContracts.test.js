import { describe, it, expect } from 'vitest';
import {
  normalizeContractDetails,
  calculateContractCapHit,
  estimateHoldoutRisk,
  calculateTeamPayroll,
  projectTeamFinancials,
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
});

describe('financial projections', () => {
  it('projects positive income for winning franchises in strong markets', () => {
    const f = projectTeamFinancials({ marketSize: 1.25, wins: 13, fanApproval: 82, payroll: 220, facilityLevels: { trainingLevel: 4, medicalLevel: 4, scoutingLevel: 3 } });
    expect(f.ticketSales).toBeGreaterThan(80);
    expect(f.facilityUpgrades).toHaveLength(3);
  });
});
