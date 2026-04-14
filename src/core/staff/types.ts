export type StaffRoleKey =
  | 'headCoach'
  | 'offCoordinator'
  | 'defCoordinator'
  | 'specialTeamsCoach'
  | 'scoutDirector'
  | 'headTrainer'
  | 'mentor'
  | 'analyticsDirector';

export interface StaffAttributes {
  tacticalSkill: number;
  playerDevelopment: number;
  injuryPrevention: number;
  scoutingAccuracy: number;
  motivation: number;
}

export interface StaffContract {
  years: number;
  annualSalary: number;
  signedYear: number;
}

export interface StaffMember {
  id: number;
  name: string;
  age: number;
  role: string;
  roleKey: StaffRoleKey;
  overall: number;
  attributes: StaffAttributes;
  schemePreference: string;
  contract: StaffContract;
  styleTags: string[];
  face?: unknown;
  continuity?: {
    teamId: number;
    sinceYear: number;
    tenureYears: number;
  };
}

export interface StaffNegotiationResult {
  accepted: boolean;
  reason: string;
  counter?: StaffContract;
}
