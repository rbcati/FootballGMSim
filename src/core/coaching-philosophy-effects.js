/**
 * coaching-philosophy-effects.js
 * Single source of truth for coaching philosophy → simulation modifier math.
 * All functions are pure (no side effects, no imports from game-simulator).
 *
 * AUDIT FINDINGS (feat/coaching-philosophy-effects)
 *
 * Fields defined but not consumed in simulateMatchup:
 *   staff.headCoach.offensivePhilosophy — normalized in staffPhilosophy.js
 *     (values: BALANCED/WEST_COAST/POWER_RUN/SPREAD/VERTICAL), never read
 *     in simGameStats or any downstream stat-generation function.
 *   staff.headCoach.defensivePhilosophy — normalized in staffPhilosophy.js
 *     (values: BALANCED/BLITZ_HEAVY/COVER_2/MAN_COVERAGE/HYBRID), never read
 *     in simGameStats.
 *   staff.headCoach.traits — DEVELOPMENTAL/DISCIPLINARIAN/PLAYER_FRIENDLY/
 *     SCHEME_TEACHER/VETERAN_MANAGER from staffPhilosophy.js. Normalized but
 *     never consumed in simGameStats (distinct from HC archetype/perk field
 *     used by COACH_SKILL_TREES in coach-system.js).
 *   staff.offCoordinator.offensivePhilosophy — OC philosophy is normalized by
 *     staffPhilosophy.js but sim uses OC archetype (COACH_SKILL_TREES), not this.
 *   staff.defCoordinator.defensivePhilosophy — same as above for DC.
 *   coach.offScheme / coach.defScheme — set by makeCoach() in coach-system.js.
 *     applyStaffTacticalEdge reads schemePreference (not these fields), so this
 *     block is a no-op for all AI teams.
 *   CoachPersonality.philosophy — array of narrative strings (e.g. ["Aggressive
 *     play-calling"]), shown in UI renderAdvancedCoachRow(), never in sim math.
 *   CoachDevelopment.specialties — earned specialty array tracked in
 *     CoachDevelopment.addSpecialty() but never read during simulation.
 *
 * Fields consumed but with no measurable sim effect:
 *   team.staff.headCoach.schemePreference — read by applyStaffTacticalEdge in
 *     simGameStats but never SET by any coach-generation path (makeCoach() sets
 *     offScheme/defScheme instead), so the blended-scheme branch is always empty
 *     and produces no mod for AI teams.
 *
 * Integration point: simGameStats() in game-simulator.js builds homeMods/awayMods
 * via getCoachingMods(team.staff). applyCoachingModifiers() layers philosophy mods
 * on top of those mods before stat generation runs. Single callsite per team.
 */

// ── Philosophy enum mirrors (kept local; no runtime dependency on staffPhilosophy.js) ─
const OFF = Object.freeze({
  BALANCED: 'BALANCED',
  WEST_COAST: 'WEST_COAST',
  POWER_RUN: 'POWER_RUN',
  SPREAD: 'SPREAD',
  VERTICAL: 'VERTICAL',
});

const DEF = Object.freeze({
  BALANCED: 'BALANCED',
  BLITZ_HEAVY: 'BLITZ_HEAVY',
  COVER_2: 'COVER_2',
  MAN_COVERAGE: 'MAN_COVERAGE',
  HYBRID: 'HYBRID',
});

const TRAIT = Object.freeze({
  DEVELOPMENTAL: 'DEVELOPMENTAL',
  DISCIPLINARIAN: 'DISCIPLINARIAN',
  PLAYER_FRIENDLY: 'PLAYER_FRIENDLY',
  SCHEME_TEACHER: 'SCHEME_TEACHER',
  VETERAN_MANAGER: 'VETERAN_MANAGER',
});

const CLAMP_LO = 0.85;
const CLAMP_HI = 1.15;

function clamp(v) {
  return Math.max(CLAMP_LO, Math.min(CLAMP_HI, v));
}

/**
 * Read offensivePhilosophy from a staff member, trying several field names
 * in priority order (staffPhilosophy.js normalized field first, then legacy).
 */
function readOffPhil(member) {
  if (!member) return OFF.BALANCED;
  // Prefer explicit normalized field (staffPhilosophy.js output)
  const raw = String(
    member.offensivePhilosophy ?? member.offensePhilosophy ?? ''
  ).toUpperCase();
  if (OFF[raw]) return raw;
  // Fall back to schemePreference (staffFoundation.js) and offScheme (makeCoach)
  const pref = String(member.schemePreference ?? member.offScheme ?? '').toLowerCase();
  if (pref.includes('west'))                                    return OFF.WEST_COAST;
  if (pref.includes('spread'))                                  return OFF.SPREAD;
  if (pref.includes('vertical'))                                return OFF.VERTICAL;
  if (pref.includes('smash') || pref.includes('power') || pref.includes('run')) return OFF.POWER_RUN;
  return OFF.BALANCED;
}

function readDefPhil(member) {
  if (!member) return DEF.BALANCED;
  const raw = String(
    member.defensivePhilosophy ?? member.defensePhilosophy ?? ''
  ).toUpperCase();
  if (DEF[raw]) return raw;
  const pref = String(member.schemePreference ?? member.defScheme ?? '').toLowerCase();
  if (pref.includes('blitz'))                                    return DEF.BLITZ_HEAVY;
  if (pref.includes('cover 2') || pref.includes('cover2'))      return DEF.COVER_2;
  if (pref.includes('man'))                                      return DEF.MAN_COVERAGE;
  if (pref.includes('3-4') || pref.includes('4-3') ||
      pref.includes('hybrid') || pref.includes('multiple'))      return DEF.HYBRID;
  return DEF.BALANCED;
}

function readTraits(member) {
  if (!member) return [];
  return Array.isArray(member.traits) ? member.traits.map(String) : [];
}

function extractHeadCoach(coach, staff) {
  // coach param may be the HC directly, or staff.headCoach
  if (coach) return coach;
  if (staff && !Array.isArray(staff) && staff.headCoach) return staff.headCoach;
  return null;
}

function extractOC(staff) {
  if (!staff || Array.isArray(staff)) return null;
  return staff.offCoordinator ?? staff.offCoord ?? null;
}

function extractDC(staff) {
  if (!staff || Array.isArray(staff)) return null;
  return staff.defCoordinator ?? staff.defCoord ?? null;
}

// ── Offensive philosophy magnitude tables ──────────────────────────────────────
// HC alone contributes at most ±5% to any single modifier.
// Values are additive deltas relative to 1.0.
const HC_OFF_MODS = Object.freeze({
  [OFF.POWER_RUN]:  { rushingMod: +0.05, passingMod: -0.03, redZoneMod: +0.02, tempoMod:  0.00 },
  [OFF.SPREAD]:     { rushingMod: -0.02, passingMod: +0.05, redZoneMod:  0.00, tempoMod: +0.02 },
  [OFF.WEST_COAST]: { rushingMod:  0.00, passingMod: +0.04, redZoneMod: +0.01, tempoMod: +0.03 },
  [OFF.VERTICAL]:   { rushingMod: -0.03, passingMod: +0.04, redZoneMod: +0.03, tempoMod:  0.00 },
  [OFF.BALANCED]:   { rushingMod:  0.00, passingMod:  0.00, redZoneMod:  0.00, tempoMod:  0.00 },
});

// OC philosophy contributes at most ±3% (half of HC magnitude on same stat).
const OC_OFF_MODS = Object.freeze({
  [OFF.POWER_RUN]:  { rushingMod: +0.03, passingMod: -0.01, redZoneMod: +0.01, tempoMod:  0.00 },
  [OFF.SPREAD]:     { rushingMod: -0.01, passingMod: +0.03, redZoneMod:  0.00, tempoMod: +0.01 },
  [OFF.WEST_COAST]: { rushingMod:  0.00, passingMod: +0.02, redZoneMod:  0.00, tempoMod: +0.02 },
  [OFF.VERTICAL]:   { rushingMod: -0.01, passingMod: +0.02, redZoneMod: +0.02, tempoMod:  0.00 },
  [OFF.BALANCED]:   { rushingMod:  0.00, passingMod:  0.00, redZoneMod:  0.00, tempoMod:  0.00 },
});

// HC trait contributions to offensive modifiers (max ±2% per trait).
function traitOffMods(traits) {
  const d = { rushingMod: 0, passingMod: 0, redZoneMod: 0, tempoMod: 0 };
  if (traits.includes(TRAIT.SCHEME_TEACHER))   d.tempoMod    += 0.02; // better scheme execution
  if (traits.includes(TRAIT.DISCIPLINARIAN))   d.redZoneMod  += 0.02; // disciplined red-zone execution
  if (traits.includes(TRAIT.PLAYER_FRIENDLY))  d.passingMod  += 0.01; // better QB/skill-player relationship
  if (traits.includes(TRAIT.VETERAN_MANAGER))  d.tempoMod    += 0.01; // game-flow management
  // DEVELOPMENTAL has no direct in-game offensive effect; it boosts development rates instead.
  return d;
}

// ── Defensive philosophy magnitude tables ──────────────────────────────────────
const HC_DEF_MODS = Object.freeze({
  [DEF.BLITZ_HEAVY]:    { pressureMod: +0.05, coverageMod: -0.03, runStopMod:  0.00 },
  [DEF.COVER_2]:        { pressureMod: -0.02, coverageMod: +0.04, runStopMod: +0.02 },
  [DEF.MAN_COVERAGE]:   { pressureMod: -0.02, coverageMod: +0.05, runStopMod:  0.00 },
  [DEF.HYBRID]:         { pressureMod: +0.02, coverageMod: +0.02, runStopMod: +0.02 },
  [DEF.BALANCED]:       { pressureMod:  0.00, coverageMod:  0.00, runStopMod:  0.00 },
});

const DC_DEF_MODS = Object.freeze({
  [DEF.BLITZ_HEAVY]:    { pressureMod: +0.03, coverageMod: -0.01, runStopMod:  0.00 },
  [DEF.COVER_2]:        { pressureMod: -0.01, coverageMod: +0.03, runStopMod: +0.01 },
  [DEF.MAN_COVERAGE]:   { pressureMod: -0.01, coverageMod: +0.03, runStopMod:  0.00 },
  [DEF.HYBRID]:         { pressureMod: +0.01, coverageMod: +0.01, runStopMod: +0.01 },
  [DEF.BALANCED]:       { pressureMod:  0.00, coverageMod:  0.00, runStopMod:  0.00 },
});

function traitDefMods(traits) {
  const d = { pressureMod: 0, coverageMod: 0, runStopMod: 0 };
  if (traits.includes(TRAIT.DISCIPLINARIAN)) d.coverageMod += 0.02; // assignment discipline
  if (traits.includes(TRAIT.SCHEME_TEACHER)) d.runStopMod  += 0.01; // scheme clarity
  return d;
}

// ── Position → philosophy dev bonus lookup ─────────────────────────────────────
function positionDevBonus(position, offPhil, defPhil) {
  const pos = String(position ?? '').toUpperCase();

  // Offensive positions
  if (pos === 'QB') {
    if (offPhil === OFF.SPREAD)     return 0.04;
    if (offPhil === OFF.WEST_COAST) return 0.03;
    if (offPhil === OFF.VERTICAL)   return 0.02;
  }
  if (pos === 'WR' || pos === 'TE') {
    if (offPhil === OFF.SPREAD)     return 0.04;
    if (offPhil === OFF.WEST_COAST) return 0.03;
    if (offPhil === OFF.VERTICAL)   return 0.03;
  }
  if (pos === 'RB' || pos === 'FB' || pos === 'HB') {
    if (offPhil === OFF.POWER_RUN)  return 0.04;
  }
  if (['OL', 'C', 'G', 'T', 'LT', 'RT', 'LG', 'RG', 'OT', 'OG'].includes(pos)) {
    if (offPhil === OFF.POWER_RUN)  return 0.04;
  }

  // Defensive positions
  if (['DL', 'DT', 'NT', 'DE'].includes(pos)) {
    if (defPhil === DEF.BLITZ_HEAVY) return 0.04;
  }
  if (['LB', 'ILB', 'OLB', 'MLB'].includes(pos)) {
    if (defPhil === DEF.BLITZ_HEAVY) return 0.04;
    if (defPhil === DEF.COVER_2)     return 0.02;
  }
  if (pos === 'CB' || pos === 'DB') {
    if (defPhil === DEF.COVER_2 || defPhil === DEF.MAN_COVERAGE) return 0.04;
  }
  if (pos === 'S' || pos === 'FS' || pos === 'SS') {
    if (defPhil === DEF.COVER_2)     return 0.04;
    if (defPhil === DEF.MAN_COVERAGE) return 0.02;
  }

  return 0;
}

// ── Exported functions ─────────────────────────────────────────────────────────

/**
 * Returns a modifier object for a team's offensive ratings based on
 * HC philosophy, OC specialty, and relevant staff traits.
 *
 * @param {object} coach - team.headCoach or team.coach (the HC object)
 * @param {object[]} staff - team.staff object or array
 * @returns {{ rushingMod: number, passingMod: number, redZoneMod: number, tempoMod: number }}
 *   All values are multipliers: 1.0 = no effect, 1.05 = +5%, 0.97 = -3%
 */
export function getOffensivePhilosophyModifiers(coach, staff) {
  const hc     = extractHeadCoach(coach, staff);
  const oc     = extractOC(staff);
  const hcOff  = readOffPhil(hc);
  const ocOff  = readOffPhil(oc);
  const traits = readTraits(hc);

  const hc_m  = HC_OFF_MODS[hcOff];
  const oc_m  = OC_OFF_MODS[ocOff];
  const tr_m  = traitOffMods(traits);

  return {
    rushingMod: clamp(1.0 + hc_m.rushingMod + oc_m.rushingMod + tr_m.rushingMod),
    passingMod: clamp(1.0 + hc_m.passingMod + oc_m.passingMod + tr_m.passingMod),
    redZoneMod: clamp(1.0 + hc_m.redZoneMod + oc_m.redZoneMod + tr_m.redZoneMod),
    tempoMod:   clamp(1.0 + hc_m.tempoMod   + oc_m.tempoMod   + tr_m.tempoMod),
  };
}

/**
 * Returns a modifier object for a team's defensive ratings based on
 * HC philosophy, DC specialty, and relevant staff traits.
 *
 * @param {object} coach - HC object
 * @param {object[]} staff - team.staff object or array
 * @returns {{ pressureMod: number, coverageMod: number, runStopMod: number }}
 */
export function getDefensivePhilosophyModifiers(coach, staff) {
  const hc     = extractHeadCoach(coach, staff);
  const dc     = extractDC(staff);
  const hcDef  = readDefPhil(hc);
  const dcDef  = readDefPhil(dc);
  const traits = readTraits(hc);

  const hc_m  = HC_DEF_MODS[hcDef];
  const dc_m  = DC_DEF_MODS[dcDef];
  const tr_m  = traitDefMods(traits);

  return {
    pressureMod: clamp(1.0 + hc_m.pressureMod + dc_m.pressureMod + tr_m.pressureMod),
    coverageMod: clamp(1.0 + hc_m.coverageMod + dc_m.coverageMod + tr_m.coverageMod),
    runStopMod:  clamp(1.0 + hc_m.runStopMod  + dc_m.runStopMod  + tr_m.runStopMod),
  };
}

/**
 * Returns a player development rate modifier based on HC philosophy,
 * OC/DC specialty, and DEVELOPMENTAL HC trait.
 * Multiplies the development delta (not base rating) in progression-logic.js.
 *
 * @param {string} position - e.g. 'QB', 'WR', 'LB'
 * @param {object} coach - HC object
 * @param {object} staff - team.staff object
 * @returns {number} multiplier, e.g. 1.08 for +8% development rate
 */
export function getDevelopmentRateModifier(position, coach, staff) {
  const hc    = extractHeadCoach(coach, staff);
  if (!hc && !staff) return 1.0;

  const oc    = extractOC(staff);
  const dc    = extractDC(staff);
  const hcOff = readOffPhil(hc);
  const hcDef = readDefPhil(hc);
  const traits = readTraits(hc);

  let delta = 0;

  // DEVELOPMENTAL trait gives a flat +5% to all positions
  if (traits.includes(TRAIT.DEVELOPMENTAL)) delta += 0.05;

  // HC philosophy bonus for matching positions
  delta += positionDevBonus(position, hcOff, hcDef);

  // OC philosophy contributes 50% weight for pass-skill positions
  if (oc) {
    const ocOff = readOffPhil(oc);
    delta += positionDevBonus(position, ocOff, DEF.BALANCED) * 0.5;
  }

  // DC philosophy contributes 50% weight for defensive positions
  if (dc) {
    const dcDef = readDefPhil(dc);
    delta += positionDevBonus(position, OFF.BALANCED, dcDef) * 0.5;
  }

  return Math.max(CLAMP_LO, Math.min(CLAMP_HI, 1.0 + delta));
}

/**
 * Applies offensive and defensive philosophy modifiers to the team's effective
 * ratings/mods snapshot (the object passed into simGameStats as homeMods/awayMods).
 * Does not mutate the original — returns a new object.
 *
 * Modifier key mapping:
 *   rushingMod  → mods.runVolume  (consumed by generateRBStats)
 *   passingMod  → mods.passVolume (consumed by generateQBStats)
 *   tempoMod    → mods.passAccuracy (WEST_COAST / SCHEME_TEACHER tempo lift)
 *   pressureMod → mods.sackChance  (consumed by generateDLStats)
 *   coverageMod → mods.intChance   (consumed by generateDBStats)
 *   runStopMod  → mods.runStop     (stored for future DL run-stop math)
 *
 * @param {object} teamRatings - the mods snapshot built by getCoachingMods()
 * @param {object} coach - HC object (team.staff.headCoach or team.coach)
 * @param {object} staff - team.staff object
 * @returns {object} modified ratings snapshot (new object, input unchanged)
 */
export function applyCoachingModifiers(teamRatings, coach, staff) {
  // Null-guard: missing coach AND missing staff → return unchanged copy
  const hc = extractHeadCoach(coach, staff);
  if (!hc && !staff) {
    return teamRatings ? { ...teamRatings } : {};
  }

  const offMods = getOffensivePhilosophyModifiers(coach, staff);
  const defMods = getDefensivePhilosophyModifiers(coach, staff);

  const base = teamRatings ?? {};
  return {
    ...base,
    passVolume:   (base.passVolume   ?? 1) * offMods.passingMod,
    runVolume:    (base.runVolume    ?? 1) * offMods.rushingMod,
    passAccuracy: (base.passAccuracy ?? 1) * offMods.tempoMod,
    redZoneMod:   (base.redZoneMod   ?? 1) * offMods.redZoneMod,
    sackChance:   (base.sackChance   ?? 1) * defMods.pressureMod,
    intChance:    (base.intChance    ?? 1) * defMods.coverageMod,
    runStop:      (base.runStop      ?? 1) * defMods.runStopMod,
  };
}
