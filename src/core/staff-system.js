import { Utils } from './utils.js';

export const STAFF_ROLE_DEFS = Object.freeze({
  headCoach: { key: 'headCoach', title: 'Head Coach', roleType: 'coach' },
  offCoordinator: { key: 'offCoordinator', title: 'Offensive Coordinator', roleType: 'coach' },
  defCoordinator: { key: 'defCoordinator', title: 'Defensive Coordinator', roleType: 'coach' },
  leadScout: { key: 'leadScout', title: 'College Scouting Director', roleType: 'scout_college' },
  proScout: { key: 'proScout', title: 'Pro Personnel Director', roleType: 'scout_pro' },
  headTrainer: { key: 'headTrainer', title: 'Head Trainer', roleType: 'medical' },
  capAdvisor: { key: 'capAdvisor', title: 'Cap & Contracts Advisor', roleType: 'contracts' },
});

const ARCHETYPES = {
  coach: ['Strategist', 'Developer', 'Culture Builder', 'Aggressive Playcaller'],
  scout_college: ['Traits Evaluator', 'Projection Specialist', 'Regional Networker'],
  scout_pro: ['Veteran Evaluator', 'Scheme Matcher', 'Trade Intelligence'],
  medical: ['Prevention Focused', 'Recovery Focused', 'Sports Science'],
  contracts: ['Value Hunter', 'Retention Focused', 'Hardline Negotiator'],
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function createStaffMember(roleKey, { year = 2025, teamId = 0 } = {}) {
  const def = STAFF_ROLE_DEFS[roleKey] ?? STAFF_ROLE_DEFS.headCoach;
  const roleType = def.roleType;
  const level = Utils.weightedChoice ? Utils.weightedChoice([1, 2, 3, 4, 5], [12, 28, 34, 18, 8]) : Utils.rand(1, 5);
  const base = 38 + level * 11;
  const attrs = {
    development: clamp(base + Utils.rand(-8, 10), 25, 95),
    schemeFlex: clamp(base + Utils.rand(-10, 8), 25, 95),
    collegeScouting: clamp(base + Utils.rand(-12, 12), 20, 98),
    proScouting: clamp(base + Utils.rand(-12, 12), 20, 98),
    injuryPrevention: clamp(base + Utils.rand(-12, 10), 20, 98),
    recovery: clamp(base + Utils.rand(-12, 10), 20, 98),
    morale: clamp(base + Utils.rand(-10, 10), 20, 98),
    contractLeverage: clamp(base + Utils.rand(-12, 12), 20, 98),
    aggression: clamp(base + Utils.rand(-15, 15), 15, 95),
  };
  if (roleType === 'scout_college') attrs.collegeScouting = clamp(attrs.collegeScouting + 10, 20, 99);
  if (roleType === 'scout_pro') attrs.proScouting = clamp(attrs.proScouting + 10, 20, 99);
  if (roleType === 'medical') {
    attrs.injuryPrevention = clamp(attrs.injuryPrevention + 10, 25, 99);
    attrs.recovery = clamp(attrs.recovery + 10, 25, 99);
  }
  if (roleType === 'contracts') attrs.contractLeverage = clamp(attrs.contractLeverage + 12, 20, 99);
  if (roleType === 'coach') attrs.development = clamp(attrs.development + 6, 25, 99);

  const archetypePool = ARCHETYPES[roleType] ?? ['Generalist'];
  return {
    id: Utils.id(),
    role: def.title,
    roleKey,
    roleType,
    name: `${Utils.choice(['Alex', 'Jordan', 'Casey', 'Taylor', 'Drew', 'Riley', 'Sam'])} ${Utils.choice(['Harper', 'Mason', 'Reed', 'Quinn', 'Parker', 'Shaw'])}`,
    age: Utils.rand(33, 66),
    years: Utils.rand(1, 4),
    salary: Math.round((0.5 + level * 0.45 + (roleKey === 'headCoach' ? 2 : 0)) * 10) / 10,
    level,
    rating: clamp(Math.round(base + Utils.rand(-5, 7)), 35, 98),
    archetype: Utils.choice(archetypePool),
    attrs,
    continuity: { teamId, sinceYear: year, tenureYears: 0 },
  };
}

export function ensureTeamStaff(team, { year = 2025 } = {}) {
  const existing = team?.staff ?? {};
  const next = { ...existing };
  for (const key of Object.keys(STAFF_ROLE_DEFS)) {
    if (!next[key]) next[key] = createStaffMember(key, { year, teamId: team?.id ?? 0 });
  }
  if (!Array.isArray(next.marketHistory)) next.marketHistory = [];
  return next;
}

export function computeStaffTeamBonuses(team, leagueSettings = {}) {
  const staff = ensureTeamStaff(team, { year: leagueSettings?.year ?? 2025 });
  const impactStrength = clamp(leagueSettings?.staffImpactStrength ?? 50, 0, 100) / 100;
  const wt = 0.55 + impactStrength * 0.9;
  const avg = (vals) => vals.reduce((s, v) => s + (Number(v) || 0), 0) / Math.max(1, vals.length);

  const coachCore = [staff.headCoach, staff.offCoordinator, staff.defCoordinator].filter(Boolean);
  const dev = avg(coachCore.map((s) => s.attrs?.development));
  const scheme = avg(coachCore.map((s) => s.attrs?.schemeFlex));
  const morale = avg(coachCore.map((s) => s.attrs?.morale));
  const injury = avg([staff.headTrainer?.attrs?.injuryPrevention, staff.headTrainer?.attrs?.recovery]);
  const college = avg([staff.leadScout?.attrs?.collegeScouting, staff.leadScout?.attrs?.development]);
  const pro = avg([staff.proScout?.attrs?.proScouting, staff.proScout?.attrs?.schemeFlex]);
  const cap = avg([staff.capAdvisor?.attrs?.contractLeverage, staff.capAdvisor?.attrs?.morale]);

  return {
    developmentDelta: clamp(((dev - 55) / 240) * wt, -0.16, 0.18),
    rookieAdaptationDelta: clamp(((dev + morale - 110) / 340) * wt, -0.15, 0.15),
    injuryRateDelta: clamp(((injury - 55) / 280) * wt, -0.18, 0.12),
    recoveryDelta: clamp(((injury - 55) / 220) * wt, -0.14, 0.14),
    collegeScoutAccuracy: clamp(0.52 + (college / 180) * wt, 0.45, 0.93),
    proScoutAccuracy: clamp(0.52 + (pro / 180) * wt, 0.45, 0.93),
    moraleStabilityDelta: clamp(((morale - 55) / 280) * wt, -0.12, 0.12),
    contractSupportDelta: clamp(((cap - 55) / 260) * wt, -0.1, 0.12),
    schemeFlexDelta: clamp(((scheme - 55) / 260) * wt, -0.1, 0.12),
  };
}

export function buildStaffMarket(teams = [], { year = 2025, size = 40 } = {}) {
  const market = [];
  for (let i = 0; i < size; i++) {
    const roleKey = Utils.choice(Object.keys(STAFF_ROLE_DEFS));
    market.push(createStaffMember(roleKey, { year, teamId: -1 }));
  }
  const incumbents = teams.flatMap((t) => Object.values(t?.staff ?? {}).filter((s) => s && s.roleKey));
  return [...market, ...incumbents.slice(0, 20)].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

export function buildScoutingSnapshot(player, team, { fogStrength = 50, commissionerMode = false } = {}) {
  if (!player) return null;
  const bonuses = computeStaffTeamBonuses(team, { staffImpactStrength: team?.staffImpactStrength ?? 50 });
  const trueOvr = Number(player.ovr ?? 50);
  const truePot = Number(player.potential ?? player.pot ?? trueOvr + 4);
  if (commissionerMode) {
    return { estimatedOvr: trueOvr, estimatedPotential: truePot, confidence: 1, uncertainty: 0, hidden: false };
  }
  const fog = clamp(fogStrength, 0, 100) / 100;
  const accuracy = clamp((bonuses.collegeScoutAccuracy + bonuses.proScoutAccuracy) / 2, 0.45, 0.95);
  const confidence = clamp(accuracy - fog * 0.35 + ((player.scoutProgress ?? 0) / 100) * 0.5, 0.25, 0.95);
  const band = Math.round(clamp((1 - confidence) * 18 + fog * 8, 2, 22));
  const noise = Math.round((Math.random() * 2 - 1) * band);
  return {
    estimatedOvr: clamp(Math.round(trueOvr + noise), 35, 99),
    estimatedPotential: clamp(Math.round(truePot + noise * 0.75), 35, 99),
    confidence,
    uncertainty: band,
    hidden: true,
  };
}
