import { Utils } from '../utils.js';
import { generateFaceConfig } from '../face.js';
import type { StaffAttributes, StaffContract, StaffMember, StaffRoleKey, StaffNegotiationResult } from './types';

const clamp = (v: number, lo = 1, hi = 99) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

const SCHEMES = ['West Coast', 'Spread', 'Vertical', 'Smashmouth', 'Multiple', '4-3', '3-4', 'Nickel'];
const FIRST = ['Alex', 'Jordan', 'Taylor', 'Riley', 'Sam', 'Morgan', 'Casey', 'Drew', 'Avery', 'Parker'];
const LAST = ['Reed', 'Mason', 'Shaw', 'Harper', 'Quinn', 'Pryor', 'Bennett', 'Hayes', 'Vaughn', 'Collins'];

const ROLE_META: Record<StaffRoleKey, { title: string; salaryMult: number }> = {
  headCoach: { title: 'Head Coach', salaryMult: 1.5 },
  offCoordinator: { title: 'Offensive Coordinator', salaryMult: 1.2 },
  defCoordinator: { title: 'Defensive Coordinator', salaryMult: 1.2 },
  specialTeamsCoach: { title: 'Special Teams Coach', salaryMult: 0.9 },
  scoutDirector: { title: 'Scout', salaryMult: 1.0 },
  headTrainer: { title: 'Physio', salaryMult: 1.0 },
  mentor: { title: 'Mentor', salaryMult: 0.9 },
  analyticsDirector: { title: 'Analytics Director', salaryMult: 1.0 },
};

export class Staff {
  member: StaffMember;

  constructor(roleKey: StaffRoleKey, year = 2025, teamId = -1, overrides: Partial<StaffMember> = {}) {
    const roleMeta = ROLE_META[roleKey];
    const overall = clamp(48 + Utils.rand(0, 45), 35, 97);
    const attributes: StaffAttributes = {
      tacticalSkill: clamp(overall + Utils.rand(-12, 10), 25, 99),
      playerDevelopment: clamp(overall + Utils.rand(-10, 12), 25, 99),
      injuryPrevention: clamp(overall + Utils.rand(-10, 12), 25, 99),
      scoutingAccuracy: clamp(overall + Utils.rand(-10, 12), 25, 99),
      motivation: clamp(overall + Utils.rand(-12, 10), 25, 99),
    };
    const contract: StaffContract = {
      years: overall >= 85 ? Utils.rand(3, 5) : Utils.rand(2, 4),
      annualSalary: Math.round((0.9 + (overall - 50) * 0.045 + roleMeta.salaryMult) * 10) / 10,
      signedYear: year,
    };
    this.member = {
      id: Utils.id(),
      name: `${Utils.choice(FIRST)} ${Utils.choice(LAST)}`,
      age: Utils.rand(34, 67),
      role: roleMeta.title,
      roleKey,
      overall,
      attributes,
      schemePreference: Utils.choice(SCHEMES),
      contract,
      styleTags: [],
      continuity: { teamId, sinceYear: year, tenureYears: 0 },
      face: generateFaceConfig(`staff-${roleKey}-${year}-${overall}`, 'staff'),
      ...overrides,
    };
  }

  toObject(): StaffMember {
    return this.member;
  }
}

export class HeadCoach extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('headCoach', year, teamId, o); } }
export class OffensiveCoordinator extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('offCoordinator', year, teamId, o); } }
export class DefensiveCoordinator extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('defCoordinator', year, teamId, o); } }
export class SpecialTeamsCoach extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('specialTeamsCoach', year, teamId, o); } }
export class Scout extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('scoutDirector', year, teamId, o); } }
export class Physio extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('headTrainer', year, teamId, o); } }
export class Mentor extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('mentor', year, teamId, o); } }
export class AnalyticsDirector extends Staff { constructor(year = 2025, teamId = -1, o: Partial<StaffMember> = {}) { super('analyticsDirector', year, teamId, o); } }

export function negotiateStaffContract({ member, ask, teamCapRoom, hardCap }: { member: StaffMember; ask: Partial<StaffContract>; teamCapRoom: number; hardCap: number; }): StaffNegotiationResult {
  const current = member?.contract ?? { years: 2, annualSalary: 1, signedYear: 2025 };
  const requestedSalary = Math.max(0.4, Number(ask?.annualSalary ?? current.annualSalary));
  const requestedYears = Math.max(1, Math.min(6, Math.round(Number(ask?.years ?? current.years))));
  if (requestedSalary > Math.max(0, Number(teamCapRoom || 0))) {
    return { accepted: false, reason: 'Insufficient cap room for requested staff salary.' };
  }
  if (requestedSalary > Number(hardCap || 300)) {
    return { accepted: false, reason: 'Requested salary exceeds league cap boundaries.' };
  }
  const leverage = (member.attributes.motivation + member.attributes.tacticalSkill + member.overall) / 3;
  const floor = current.annualSalary * (leverage >= 85 ? 1.08 : leverage >= 75 ? 1.03 : 0.98);
  if (requestedSalary >= floor) {
    return { accepted: true, reason: 'Accepted', counter: { years: requestedYears, annualSalary: Math.round(requestedSalary * 10) / 10, signedYear: current.signedYear } };
  }
  const counterSalary = Math.round(Math.max(floor, requestedSalary + 0.2) * 10) / 10;
  return {
    accepted: false,
    reason: 'Counter offer proposed.',
    counter: { years: Math.max(current.years, requestedYears), annualSalary: counterSalary, signedYear: current.signedYear },
  };
}
