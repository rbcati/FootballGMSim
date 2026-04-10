export const TRAINING_FOCUS_OPTIONS = ['balanced', 'youth_development', 'win_now', 'rehab_recovery', 'strength_conditioning'];

export function computePlayerDevelopmentDelta({ player, focus = 'balanced', staffImpact = {}, trainingLevel = 1, playingTimeFactor = 0, variance = 0 } = {}) {
  const age = Number(player?.age ?? 24);
  const baseAgeCurve = age <= 23 ? 0.9 : age <= 26 ? 0.45 : age <= 29 ? 0.1 : -0.55;
  const focusMod = focus === 'youth_development' ? (age <= 24 ? 0.35 : -0.1) : focus === 'win_now' ? (age <= 24 ? -0.15 : 0.12) : focus === 'rehab_recovery' ? 0.02 : focus === 'strength_conditioning' ? 0.08 : 0;
  const levelMod = (Math.max(1, Math.min(5, Number(trainingLevel) || 1)) - 1) * 0.05;
  const coachBonus = (Number(staffImpact?.developmentDelta ?? 0) * 2.8) + (age <= 24 ? Number(staffImpact?.offensiveDevDelta ?? 0) * 0.8 + Number(staffImpact?.defensiveDevDelta ?? 0) * 0.8 : 0);
  const delta = baseAgeCurve + focusMod + levelMod + coachBonus + Number(playingTimeFactor || 0) + Number(variance || 0);
  return {
    developmentDelta: delta,
    explanation: { baseAgeCurve, trainingFocusModifier: focusMod + levelMod, staffDevelopmentModifier: coachBonus, playingTimeModifier: Number(playingTimeFactor || 0), variance: Number(variance || 0) },
  };
}
