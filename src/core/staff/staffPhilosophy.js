const OFFENSIVE_PHILOSOPHY = Object.freeze({
  BALANCED: 'BALANCED',
  WEST_COAST: 'WEST_COAST',
  POWER_RUN: 'POWER_RUN',
  SPREAD: 'SPREAD',
  VERTICAL: 'VERTICAL',
});

const DEFENSIVE_PHILOSOPHY = Object.freeze({
  BALANCED: 'BALANCED',
  BLITZ_HEAVY: 'BLITZ_HEAVY',
  COVER_2: 'COVER_2',
  MAN_COVERAGE: 'MAN_COVERAGE',
  HYBRID: 'HYBRID',
});

const STAFF_TRAITS = Object.freeze({
  DEVELOPMENTAL: 'DEVELOPMENTAL',
  DISCIPLINARIAN: 'DISCIPLINARIAN',
  PLAYER_FRIENDLY: 'PLAYER_FRIENDLY',
  SCHEME_TEACHER: 'SCHEME_TEACHER',
  VETERAN_MANAGER: 'VETERAN_MANAGER',
});

const OFFENSE_LABELS = Object.freeze({
  BALANCED: 'Balanced offense',
  WEST_COAST: 'West Coast timing offense',
  POWER_RUN: 'Power run offense',
  SPREAD: 'Spread offense',
  VERTICAL: 'Vertical passing offense',
});

const DEFENSE_LABELS = Object.freeze({
  BALANCED: 'Balanced defense',
  BLITZ_HEAVY: 'Blitz-heavy defense',
  COVER_2: 'Cover 2 shell defense',
  MAN_COVERAGE: 'Man coverage defense',
  HYBRID: 'Hybrid multiple defense',
});

const TRAIT_LABELS = Object.freeze({
  DEVELOPMENTAL: 'Developmental',
  DISCIPLINARIAN: 'Disciplinarian',
  PLAYER_FRIENDLY: 'Player-friendly',
  SCHEME_TEACHER: 'Scheme teacher',
  VETERAN_MANAGER: 'Veteran manager',
});

const BASELINE_STAFF_NAME = 'Interim Staff';

function normalizeEnum(value, allowed, fallback) {
  return allowed[value] ? value : fallback;
}

function normalizeTraits(rawTraits) {
  if (!Array.isArray(rawTraits)) return [];
  return rawTraits
    .map((trait) => String(trait || '').trim().toUpperCase())
    .filter((trait, index, list) => STAFF_TRAITS[trait] && list.indexOf(trait) === index)
    .slice(0, 2);
}

function inferOffensivePhilosophy(member) {
  const raw = String(member?.offensivePhilosophy ?? member?.offensePhilosophy ?? '').toUpperCase();
  if (OFFENSIVE_PHILOSOPHY[raw]) return raw;
  const pref = String(member?.schemePreference ?? member?.offScheme ?? '').toLowerCase();
  if (pref.includes('west')) return OFFENSIVE_PHILOSOPHY.WEST_COAST;
  if (pref.includes('spread')) return OFFENSIVE_PHILOSOPHY.SPREAD;
  if (pref.includes('vertical')) return OFFENSIVE_PHILOSOPHY.VERTICAL;
  if (pref.includes('smash') || pref.includes('power') || pref.includes('run')) return OFFENSIVE_PHILOSOPHY.POWER_RUN;
  return OFFENSIVE_PHILOSOPHY.BALANCED;
}

function inferDefensivePhilosophy(member) {
  const raw = String(member?.defensivePhilosophy ?? member?.defensePhilosophy ?? '').toUpperCase();
  if (DEFENSIVE_PHILOSOPHY[raw]) return raw;
  const pref = String(member?.schemePreference ?? member?.defScheme ?? '').toLowerCase();
  if (pref.includes('blitz')) return DEFENSIVE_PHILOSOPHY.BLITZ_HEAVY;
  if (pref.includes('cover 2') || pref.includes('cover2')) return DEFENSIVE_PHILOSOPHY.COVER_2;
  if (pref.includes('man')) return DEFENSIVE_PHILOSOPHY.MAN_COVERAGE;
  if (pref.includes('3-4') || pref.includes('4-3') || pref.includes('hybrid') || pref.includes('multiple')) return DEFENSIVE_PHILOSOPHY.HYBRID;
  return DEFENSIVE_PHILOSOPHY.BALANCED;
}

export function createDefaultStaffForTeam(team = {}) {
  const city = String(team?.name ?? team?.abbr ?? 'Team');
  return {
    headCoach: {
      id: `staff-default-hc-${team?.id ?? '0'}`,
      name: `${city} ${BASELINE_STAFF_NAME}`,
      roleKey: 'headCoach',
      offensivePhilosophy: OFFENSIVE_PHILOSOPHY.BALANCED,
      defensivePhilosophy: DEFENSIVE_PHILOSOPHY.BALANCED,
      traits: [],
    },
  };
}

export function normalizeStaffMember(member = {}, fallbackRole = 'headCoach') {
  const normalized = { ...member };
  normalized.roleKey = String(member?.roleKey ?? fallbackRole);
  normalized.name = String(member?.name ?? BASELINE_STAFF_NAME);
  normalized.offensivePhilosophy = normalizeEnum(inferOffensivePhilosophy(member), OFFENSIVE_PHILOSOPHY, OFFENSIVE_PHILOSOPHY.BALANCED);
  normalized.defensivePhilosophy = normalizeEnum(inferDefensivePhilosophy(member), DEFENSIVE_PHILOSOPHY, DEFENSIVE_PHILOSOPHY.BALANCED);
  normalized.traits = normalizeTraits(member?.traits);
  return normalized;
}

export function normalizeTeamStaff(team = {}) {
  const rawStaff = team?.staff && typeof team.staff === 'object' ? team.staff : createDefaultStaffForTeam(team);
  const headCoach = normalizeStaffMember(rawStaff.headCoach ?? {}, 'headCoach');
  const offCoordinator = normalizeStaffMember(rawStaff.offCoordinator ?? rawStaff.offCoord ?? {}, 'offCoordinator');
  const defCoordinator = normalizeStaffMember(rawStaff.defCoordinator ?? rawStaff.defCoord ?? {}, 'defCoordinator');
  return { ...rawStaff, headCoach, offCoordinator, defCoordinator };
}

export function getStaffPhilosophyLabel(type, value) {
  const key = String(value ?? '').toUpperCase();
  if (type === 'offense') return OFFENSE_LABELS[key] ?? OFFENSE_LABELS.BALANCED;
  if (type === 'defense') return DEFENSE_LABELS[key] ?? DEFENSE_LABELS.BALANCED;
  return TRAIT_LABELS[key] ?? 'Balanced';
}

export function buildStaffPhilosophySummary(team = {}) {
  const staff = normalizeTeamStaff(team);
  const headCoach = staff.headCoach;
  const traits = Array.isArray(headCoach?.traits) ? headCoach.traits.slice(0, 2) : [];
  const traitLabels = traits.map((trait) => getStaffPhilosophyLabel('trait', trait));
  const offenseLabel = getStaffPhilosophyLabel('offense', headCoach.offensivePhilosophy);
  const defenseLabel = getStaffPhilosophyLabel('defense', headCoach.defensivePhilosophy);
  const flavor = `${headCoach.name} leans ${offenseLabel.toLowerCase()} with a ${defenseLabel.toLowerCase()} identity.`;
  return {
    headCoachName: headCoach.name,
    offensivePhilosophy: headCoach.offensivePhilosophy,
    defensivePhilosophy: headCoach.defensivePhilosophy,
    offensiveLabel: offenseLabel,
    defensiveLabel: defenseLabel,
    traits,
    traitLabels,
    flavor,
  };
}

export { OFFENSIVE_PHILOSOPHY, DEFENSIVE_PHILOSOPHY, STAFF_TRAITS };
