const clamp = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));

function scoreFromOverall(member, fallback = 50) {
  if (!member || typeof member !== 'object') return fallback;
  const overall = Number(member?.overall ?? member?.rating ?? member?.ovr);
  return Number.isFinite(overall) ? clamp(overall, 0, 100) : fallback;
}

function levelToQuality(level, fallback = 50) {
  const parsed = Number(level);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = clamp(Math.round(parsed), 1, 5);
  // 1..5 normalized to a 20..100 quality axis used by evolutionEngine.
  return normalized * 20;
}

/**
 * Deterministic mapping from canonical team/staff/investment models to
 * evolutionEngine TeamDevelopmentFocus (0-100 quality fields).
 */
export function buildTeamDevelopmentFocusMap({
  teams = [],
  year = 2025,
  ensureTeamStaff,
  computeStaffTeamBonuses,
  normalizeFranchiseInvestments,
} = {}) {
  const focusByTeamId = {};

  for (const team of teams) {
    const teamId = String(team?.id ?? '');
    const weeklyFocus = team?.weeklyDevelopmentFocus ?? {};
    const investments = normalizeFranchiseInvestments(team?.franchiseInvestments ?? {});
    const staff = ensureTeamStaff(team, { year: Number(year ?? 2025) });
    const staffBonuses = computeStaffTeamBonuses(
      { ...team, staff },
      { year: Number(year ?? 2025) },
    );

    const coachCore = [staff?.headCoach, staff?.offCoordinator, staff?.defCoordinator]
      .filter(Boolean)
      .map((member) => scoreFromOverall(member));
    const coachBase = coachCore.length
      ? coachCore.reduce((sum, value) => sum + value, 0) / coachCore.length
      : 50;
    const developmentModScore = clamp(50 + Number(staffBonuses?.developmentDelta ?? 0) * 200, 0, 100);

    const trainerBase = scoreFromOverall(staff?.headTrainer, 50);
    const recoveryScore = clamp(50 + Number(staffBonuses?.recoveryDelta ?? 0) * 200, 0, 100);
    const injuryMitigationScore = clamp(50 - Number(staffBonuses?.injuryRateDelta ?? 0) * 200, 0, 100);

    const trainingFacility = levelToQuality(investments?.trainingLevel, 50);
    const stadiumSupport = levelToQuality(investments?.stadiumLevel, 50);

    focusByTeamId[teamId] = {
      trainingFocus: investments?.trainingFocus ?? 'balanced',
      intensity: weeklyFocus?.intensity ?? 'normal',
      drillType: weeklyFocus?.drillType ?? 'technique',
      positionGroups: Array.isArray(weeklyFocus?.positionGroups) ? weeklyFocus.positionGroups : [],
      // Canonical staff/investment derived scores (legacy fallbacks remain for pre-staff saves).
      staffQuality: clamp((coachBase * 0.75) + (developmentModScore * 0.25), 0, 100),
      medicalQuality: clamp((trainerBase * 0.5) + (recoveryScore * 0.3) + (injuryMitigationScore * 0.2), 0, 100),
      facilityQuality: clamp((trainingFacility * 0.7) + (stadiumSupport * 0.3), 0, 100),
    };
  }

  return focusByTeamId;
}
