import { Utils } from '../utils.js';
import {
  HeadCoach,
  OffensiveCoordinator,
  DefensiveCoordinator,
  SpecialTeamsCoach,
  Scout,
  Physio,
  Mentor,
  AnalyticsDirector,
} from './staffModel.ts';

export const CORE_STAFF_ROLES = Object.freeze({
  headCoach: { key: 'headCoach', title: 'Head Coach', domain: 'leadership' },
  offCoordinator: { key: 'offCoordinator', title: 'Offensive Coordinator', domain: 'offense' },
  defCoordinator: { key: 'defCoordinator', title: 'Defensive Coordinator', domain: 'defense' },
  specialTeamsCoach: { key: 'specialTeamsCoach', title: 'Special Teams Coach', domain: 'specialTeams' },
  scoutDirector: { key: 'scoutDirector', title: 'Scout', domain: 'scouting' },
  headTrainer: { key: 'headTrainer', title: 'Physio', domain: 'medical' },
  mentor: { key: 'mentor', title: 'Mentor', domain: 'leadership' },
  analyticsDirector: { key: 'analyticsDirector', title: 'Analytics Director', domain: 'analytics' },
});

function buildByRole(roleKey, opts) {
  if (roleKey === 'headCoach') return new HeadCoach(opts.year, opts.teamId).toObject();
  if (roleKey === 'offCoordinator') return new OffensiveCoordinator(opts.year, opts.teamId).toObject();
  if (roleKey === 'defCoordinator') return new DefensiveCoordinator(opts.year, opts.teamId).toObject();
  if (roleKey === 'specialTeamsCoach') return new SpecialTeamsCoach(opts.year, opts.teamId).toObject();
  if (roleKey === 'scoutDirector') return new Scout(opts.year, opts.teamId).toObject();
  if (roleKey === 'headTrainer') return new Physio(opts.year, opts.teamId).toObject();
  if (roleKey === 'mentor') return new Mentor(opts.year, opts.teamId).toObject();
  return new AnalyticsDirector(opts.year, opts.teamId).toObject();
}

function legacySpecialtyRatings(roleKey, attributes = {}) {
  const a = attributes;
  if (roleKey === 'headCoach') return { leadership: a.motivation ?? 60, gameManagement: a.tacticalSkill ?? 60, culture: a.motivation ?? 60, playerDevelopment: a.playerDevelopment ?? 60 };
  if (roleKey === 'offCoordinator') return { passScheme: a.tacticalSkill ?? 60, runScheme: a.tacticalSkill ?? 60, qbDevelopment: a.playerDevelopment ?? 60, skillPlayerDevelopment: a.playerDevelopment ?? 60 };
  if (roleKey === 'defCoordinator') return { frontSeven: a.tacticalSkill ?? 60, coverage: a.tacticalSkill ?? 60, passRush: a.tacticalSkill ?? 60, defensiveDevelopment: a.playerDevelopment ?? 60 };
  if (roleKey === 'scoutDirector') return { collegeScouting: a.scoutingAccuracy ?? 60, proScouting: a.scoutingAccuracy ?? 60, potentialEvaluation: a.scoutingAccuracy ?? 60, positionalAccuracy: a.scoutingAccuracy ?? 60 };
  return { injuryPrevention: a.injuryPrevention ?? 60, recovery: a.injuryPrevention ?? 60, conditioning: a.motivation ?? 60 };
}

function buildModifiers(roleKey, a = {}) {
  if (roleKey === 'headCoach') return { dev: (a.playerDevelopment - 60) / 300, readiness: (a.tacticalSkill - 60) / 360, culture: (a.motivation - 60) / 260 };
  if (roleKey === 'offCoordinator') return { offDev: (a.playerDevelopment - 60) / 220, tactical: (a.tacticalSkill - 60) / 240 };
  if (roleKey === 'defCoordinator') return { defDev: (a.playerDevelopment - 60) / 220, tactical: (a.tacticalSkill - 60) / 240 };
  if (roleKey === 'specialTeamsCoach') return { specialTeams: (a.tacticalSkill - 60) / 220 };
  if (roleKey === 'scoutDirector') return { scout: (a.scoutingAccuracy - 60) / 220 };
  if (roleKey === 'mentor') return { mentor: (a.playerDevelopment + a.motivation - 120) / 260 };
  if (roleKey === 'analyticsDirector') return { analytics: (a.tacticalSkill + a.scoutingAccuracy - 120) / 260 };
  return { injuryPrevention: (a.injuryPrevention - 60) / 300, recovery: (a.injuryPrevention - 60) / 320 };
}

export function generateStaffCandidate(roleKey, { year = 2025, teamId = -1 } = {}) {
  const base = buildByRole(CORE_STAFF_ROLES[roleKey] ? roleKey : 'headCoach', { year, teamId });
  const specialtyRatings = legacySpecialtyRatings(base.roleKey, base.attributes);
  return {
    ...base,
    annualSalary: base.contract.annualSalary,
    contractYears: base.contract.years,
    specialtyRatings,
    modifiers: buildModifiers(base.roleKey, base.attributes),
    reputationTier: base.overall >= 89 ? 'Elite' : base.overall >= 77 ? 'National' : base.overall >= 64 ? 'Regional' : 'Local',
    styleTags: [String(base.schemePreference || 'Multiple').toLowerCase().replace(/\s+/g, '-'), base.attributes?.motivation >= 78 ? 'motivator' : 'balanced'],
  };
}

export function evaluateStaffImpact(staff = {}) {
  const hc = staff.headCoach;
  const oc = staff.offCoordinator;
  const dc = staff.defCoordinator;
  const st = staff.specialTeamsCoach;
  const scout = staff.scoutDirector;
  const trainer = staff.headTrainer;
  const mentor = staff.mentor;
  const analytics = staff.analyticsDirector;
  return {
    developmentDelta: (hc?.modifiers?.dev ?? 0) + (oc?.modifiers?.offDev ?? 0) * 0.7 + (dc?.modifiers?.defDev ?? 0) * 0.7 + (mentor?.modifiers?.mentor ?? 0) * 0.8,
    offensiveDevDelta: (hc?.modifiers?.dev ?? 0) * 0.25 + (oc?.modifiers?.offDev ?? 0),
    defensiveDevDelta: (hc?.modifiers?.dev ?? 0) * 0.25 + (dc?.modifiers?.defDev ?? 0),
    readinessDelta: (hc?.modifiers?.readiness ?? 0) + (st?.modifiers?.specialTeams ?? 0) * 0.25,
    cultureDelta: (hc?.modifiers?.culture ?? 0) + (mentor?.modifiers?.mentor ?? 0) * 0.45,
    scoutingAccuracy: 0.56 + (scout?.modifiers?.scout ?? 0) + (analytics?.modifiers?.analytics ?? 0) * 0.3,
    injuryRiskDelta: -((trainer?.modifiers?.injuryPrevention ?? 0) * 0.9),
    recoveryDelta: (trainer?.modifiers?.recovery ?? 0),
    tacticalEdge: (oc?.modifiers?.tactical ?? 0) + (dc?.modifiers?.tactical ?? 0) + (hc?.modifiers?.readiness ?? 0) * 0.6 + (analytics?.modifiers?.analytics ?? 0) * 0.55,
  };
}

export function summarizeStaffEffects(staff = {}) {
  const impact = evaluateStaffImpact(staff);
  return [
    impact.offensiveDevDelta >= 0.04 ? 'QB and skill development boosted' : 'Offensive development is average',
    impact.defensiveDevDelta >= 0.04 ? 'Defensive development strong' : 'Defensive development is steady',
    impact.scoutingAccuracy >= 0.75 ? 'Scouting confidence above average' : impact.scoutingAccuracy <= 0.62 ? 'Scouting confidence is limited' : 'Scouting confidence is balanced',
    impact.injuryRiskDelta <= -0.04 ? 'Injury prevention strong' : 'Injury prevention weak',
  ];
}

export function getStaffMarketViewModel(teams = [], { year = 2025, size = 55 } = {}) {
  const roleKeys = Object.keys(CORE_STAFF_ROLES);
  const market = [];
  for (let i = 0; i < size; i += 1) market.push(generateStaffCandidate(Utils.choice(roleKeys), { year, teamId: -1 }));
  const incumbents = teams.flatMap((team) => Object.values(team?.staff ?? {}).filter((m) => m?.roleKey));
  return [...market, ...incumbents.slice(0, 20)].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
}
