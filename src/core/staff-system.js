import { CORE_STAFF_ROLES, evaluateStaffImpact, generateStaffCandidate, getStaffMarketViewModel, summarizeStaffEffects } from './staff/staffFoundation.js';
import { ensureFaceConfig } from './face.js';
import { getScoutingConfidence } from './scouting/scoutingSystem.js';

const LEGACY_ROLE_ALIASES = Object.freeze({
  offCoord: 'offCoordinator',
  defCoord: 'defCoordinator',
  leadScout: 'scoutDirector',
  proScout: 'scoutDirector',
  capAdvisor: 'headTrainer',
});

export const STAFF_ROLE_DEFS = CORE_STAFF_ROLES;

export function createStaffMember(roleKey, options = {}) {
  const normalized = LEGACY_ROLE_ALIASES[roleKey] ?? roleKey;
  return generateStaffCandidate(normalized, options);
}

export function ensureTeamStaff(team, { year = 2025 } = {}) {
  const existing = { ...(team?.staff ?? {}) };
  for (const [legacyKey, mapped] of Object.entries(LEGACY_ROLE_ALIASES)) {
    if (!existing[mapped] && existing[legacyKey]) existing[mapped] = { ...existing[legacyKey], roleKey: mapped };
  }
  for (const key of Object.keys(CORE_STAFF_ROLES)) {
    if (!existing[key]) existing[key] = createStaffMember(key, { year, teamId: team?.id ?? 0 });
    existing[key] = ensureFaceConfig(existing[key], 'staff');
  }

  // Backward-compatible mirror keys for older systems/tests.
  existing.leadScout = existing.scoutDirector;
  existing.proScout = existing.scoutDirector;
  existing.capAdvisor = existing.headTrainer;
  if (!Array.isArray(existing.marketHistory)) existing.marketHistory = [];
  return existing;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function computeStaffTeamBonuses(team, leagueSettings = {}) {
  const staff = ensureTeamStaff(team, { year: leagueSettings?.year ?? 2025 });
  const impactStrength = clamp(leagueSettings?.staffImpactStrength ?? 50, 0, 100) / 100;
  const impact = evaluateStaffImpact(staff);
  const scale = 0.65 + impactStrength * 0.7;
  return {
    developmentDelta: clamp((impact.developmentDelta || 0) * scale, -0.2, 0.24),
    offensiveDevelopmentDelta: clamp((impact.offensiveDevDelta || 0) * scale, -0.18, 0.24),
    defensiveDevelopmentDelta: clamp((impact.defensiveDevDelta || 0) * scale, -0.18, 0.24),
    rookieAdaptationDelta: clamp(((impact.cultureDelta || 0) + (impact.readinessDelta || 0)) * scale * 0.75, -0.15, 0.15),
    readinessDelta: clamp((impact.readinessDelta || 0) * scale, -0.12, 0.16),
    injuryRateDelta: clamp((impact.injuryRiskDelta || 0) * scale, -0.16, 0.1),
    recoveryDelta: clamp((impact.recoveryDelta || 0) * scale, -0.12, 0.14),
    collegeScoutAccuracy: clamp(0.5 + ((impact.scoutingAccuracy || 0.6) - 0.56) * 0.95, 0.45, 0.93),
    proScoutAccuracy: clamp(0.5 + ((impact.scoutingAccuracy || 0.6) - 0.56) * 1.02, 0.45, 0.94),
    moraleStabilityDelta: clamp((impact.cultureDelta || 0) * scale * 0.7, -0.1, 0.12),
    summary: summarizeStaffEffects(staff),
  };
}

export function buildStaffMarket(teams = [], { year = 2025, size = 40 } = {}) {
  return getStaffMarketViewModel(teams, { year, size });
}

export function buildScoutingSnapshot(player, team, { fogStrength = 50, commissionerMode = false } = {}) {
  if (!player) return null;
  if (commissionerMode) {
    return { estimatedOvr: Number(player.ovr ?? 50), estimatedPotential: Number(player.potential ?? player.pot ?? 50), confidence: 1, uncertainty: 0, confidenceLabel: 'High confidence', hidden: false };
  }
  const staff = ensureTeamStaff(team, { year: Number(team?.year ?? 2025) });
  const bonuses = computeStaffTeamBonuses({ ...team, staff }, { staffImpactStrength: team?.staffImpactStrength ?? 50 });
  const scoutingLevel = Number(team?.franchiseInvestments?.scoutingLevel ?? 1);
  const confidenceProfile = getScoutingConfidence({ staffImpact: { scoutingAccuracy: (bonuses.collegeScoutAccuracy + bonuses.proScoutAccuracy) / 2 }, fogStrength, scoutingLevel, scoutProgress: Number(player?.scoutProgress ?? 0) });
  const band = confidenceProfile.uncertainty;
  const noise = Math.round((Math.random() * 2 - 1) * band);
  const trueOvr = Number(player.ovr ?? 50);
  const truePot = Number(player.potential ?? player.pot ?? trueOvr + 4);
  return {
    estimatedOvr: clamp(Math.round(trueOvr + noise), 35, 99),
    estimatedPotential: clamp(Math.round(truePot + noise * 0.7), 35, 99),
    confidence: confidenceProfile.confidence,
    uncertainty: band,
    confidenceLabel: confidenceProfile.label,
    hidden: true,
  };
}
