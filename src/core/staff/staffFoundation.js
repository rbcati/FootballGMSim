import { Utils } from '../utils.js';
import { generateFaceConfig } from '../face.js';

export const CORE_STAFF_ROLES = Object.freeze({
  headCoach: { key: 'headCoach', title: 'Head Coach', domain: 'leadership' },
  offCoordinator: { key: 'offCoordinator', title: 'Offensive Coordinator', domain: 'offense' },
  defCoordinator: { key: 'defCoordinator', title: 'Defensive Coordinator', domain: 'defense' },
  scoutDirector: { key: 'scoutDirector', title: 'Scout Director', domain: 'scouting' },
  headTrainer: { key: 'headTrainer', title: 'Head Trainer', domain: 'medical' },
});
const TIERS = ['Local', 'Regional', 'National', 'Elite'];
const FIRST = ['Alex', 'Jordan', 'Taylor', 'Riley', 'Sam', 'Morgan', 'Casey', 'Drew', 'Avery', 'Parker'];
const LAST = ['Reed', 'Mason', 'Shaw', 'Harper', 'Quinn', 'Pryor', 'Bennett', 'Hayes', 'Vaughn', 'Collins'];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

function buildSpecialties(roleKey, base) {
  if (roleKey === 'headCoach') return { leadership: clamp(base + Utils.rand(-8, 10), 25, 99), gameManagement: clamp(base + Utils.rand(-10, 8), 25, 99), culture: clamp(base + Utils.rand(-12, 10), 25, 99), playerDevelopment: clamp(base + Utils.rand(-10, 12), 25, 99) };
  if (roleKey === 'offCoordinator') return { passScheme: clamp(base + Utils.rand(-10, 12), 25, 99), runScheme: clamp(base + Utils.rand(-10, 12), 25, 99), qbDevelopment: clamp(base + Utils.rand(-8, 12), 25, 99), skillPlayerDevelopment: clamp(base + Utils.rand(-8, 12), 25, 99) };
  if (roleKey === 'defCoordinator') return { frontSeven: clamp(base + Utils.rand(-10, 12), 25, 99), coverage: clamp(base + Utils.rand(-10, 12), 25, 99), passRush: clamp(base + Utils.rand(-10, 12), 25, 99), defensiveDevelopment: clamp(base + Utils.rand(-8, 12), 25, 99) };
  if (roleKey === 'scoutDirector') return { collegeScouting: clamp(base + Utils.rand(-8, 14), 25, 99), proScouting: clamp(base + Utils.rand(-8, 14), 25, 99), potentialEvaluation: clamp(base + Utils.rand(-10, 12), 25, 99), positionalAccuracy: clamp(base + Utils.rand(-10, 12), 25, 99) };
  return { injuryPrevention: clamp(base + Utils.rand(-8, 12), 25, 99), recovery: clamp(base + Utils.rand(-8, 12), 25, 99), conditioning: clamp(base + Utils.rand(-8, 12), 25, 99) };
}

function buildStyleTags(roleKey, sp) {
  if (roleKey === 'offCoordinator') return [sp.passScheme >= sp.runScheme ? 'pass-first' : 'run-first', sp.qbDevelopment >= 75 ? 'qb-whisperer' : 'balanced-dev'];
  if (roleKey === 'defCoordinator') return [sp.coverage >= sp.frontSeven ? 'coverage-shell' : 'front-pressure', sp.passRush >= 75 ? 'pressure-heavy' : 'contain-first'];
  if (roleKey === 'headCoach') return [sp.culture >= 75 ? 'culture-builder' : 'results-first'];
  if (roleKey === 'scoutDirector') return [sp.collegeScouting >= sp.proScouting ? 'college-focus' : 'pro-focus'];
  return [sp.conditioning >= 75 ? 'conditioning-first' : 'recovery-first'];
}

function buildModifiers(roleKey, sp) {
  if (roleKey === 'headCoach') return { dev: (sp.playerDevelopment - 60) / 300, readiness: (sp.gameManagement - 60) / 360, culture: (sp.culture - 60) / 260 };
  if (roleKey === 'offCoordinator') return { offDev: (sp.qbDevelopment + sp.skillPlayerDevelopment - 120) / 420 };
  if (roleKey === 'defCoordinator') return { defDev: (sp.defensiveDevelopment + sp.frontSeven - 120) / 420 };
  if (roleKey === 'scoutDirector') return { scout: (sp.collegeScouting + sp.proScouting + sp.potentialEvaluation - 180) / 420 };
  return { injuryPrevention: (sp.injuryPrevention - 60) / 360, recovery: (sp.recovery - 60) / 320 };
}

export function generateStaffCandidate(roleKey, { year = 2025, teamId = -1 } = {}) {
  const role = CORE_STAFF_ROLES[roleKey] ?? CORE_STAFF_ROLES.headCoach;
  const overall = clamp(48 + Utils.rand(0, 45), 35, 97);
  const specialties = buildSpecialties(role.key, overall);
  const repIndex = overall >= 89 ? 3 : overall >= 77 ? 2 : overall >= 64 ? 1 : 0;
  const id = Utils.id();
  const name = `${Utils.choice(FIRST)} ${Utils.choice(LAST)}`;
  return { id, name, age: Utils.rand(34, 67), role: role.title, roleKey: role.key, overall, specialtyRatings: specialties, contractYears: overall >= 85 ? Utils.rand(3, 5) : Utils.rand(2, 4), annualSalary: Math.round((1.1 + (overall - 50) * 0.08 + (roleKey === 'headCoach' ? 1.5 : 0)) * 10) / 10, reputationTier: TIERS[repIndex], styleTags: buildStyleTags(role.key, specialties), modifiers: buildModifiers(role.key, specialties), continuity: { teamId, sinceYear: year, tenureYears: 0 }, face: generateFaceConfig(`staff-${id}-${name}`, 'staff') };
}

export function evaluateStaffImpact(staff = {}) {
  const hc = staff.headCoach;
  const oc = staff.offCoordinator;
  const dc = staff.defCoordinator;
  const scout = staff.scoutDirector;
  const trainer = staff.headTrainer;
  return {
    developmentDelta: (hc?.modifiers?.dev ?? 0) + (oc?.modifiers?.offDev ?? 0) * 0.7 + (dc?.modifiers?.defDev ?? 0) * 0.7,
    offensiveDevDelta: (hc?.modifiers?.dev ?? 0) * 0.35 + (oc?.modifiers?.offDev ?? 0),
    defensiveDevDelta: (hc?.modifiers?.dev ?? 0) * 0.35 + (dc?.modifiers?.defDev ?? 0),
    readinessDelta: hc?.modifiers?.readiness ?? 0,
    cultureDelta: hc?.modifiers?.culture ?? 0,
    scoutingAccuracy: 0.56 + (scout?.modifiers?.scout ?? 0),
    injuryRiskDelta: -((trainer?.modifiers?.injuryPrevention ?? 0) * 0.85),
    recoveryDelta: trainer?.modifiers?.recovery ?? 0,
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
  const market = [];
  for (let i = 0; i < size; i += 1) market.push(generateStaffCandidate(Utils.choice(Object.keys(CORE_STAFF_ROLES)), { year, teamId: -1 }));
  const incumbents = teams.flatMap((team) => Object.values(team?.staff ?? {}).filter((m) => m?.roleKey));
  return [...market, ...incumbents.slice(0, 20)].sort((a, b) => (b.overall ?? 0) - (a.overall ?? 0));
}
