const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function getScoutingConfidence({ staffImpact = {}, fogStrength = 50, scoutingLevel = 1, scoutProgress = 0 } = {}) {
  const fog = clamp(fogStrength, 0, 100) / 100;
  const level = Math.max(1, Math.min(5, Math.round(Number(scoutingLevel) || 1)));
  const base = 0.52 + Number(staffImpact?.scoutingAccuracy ?? 0) * 0.36 + (level - 1) * 0.04;
  const confidence = clamp(base - fog * 0.22 + (Number(scoutProgress) / 100) * 0.35, 0.28, 0.96);
  const uncertainty = Math.round(clamp((1 - confidence) * 20 + fog * 7, 2, 24));
  const label = confidence >= 0.83 ? 'High confidence' : confidence >= 0.68 ? 'Medium confidence' : 'Low confidence';
  return { confidence, uncertainty, label };
}
