const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const POSITION_ATTRIBUTE_WEIGHTS = {
  QB: [
    ['throwAccuracyShort', 0.24],
    ['throwAccuracyDeep', 0.22],
    ['throwPower', 0.2],
    ['decisionMaking', 0.2],
    ['pocketPresence', 0.14],
  ],
  RB: [
    ['decisionMaking', 0.28],
    ['separation', 0.2],
    ['catchInTraffic', 0.2],
    ['ballTracking', 0.16],
    ['passBlockStrength', 0.16],
  ],
  FB: [
    ['passBlockStrength', 0.28],
    ['passBlockFootwork', 0.24],
    ['decisionMaking', 0.2],
    ['catchInTraffic', 0.14],
    ['separation', 0.14],
  ],
  WR: [
    ['release', 0.22],
    ['routeRunning', 0.24],
    ['separation', 0.24],
    ['catchInTraffic', 0.15],
    ['ballTracking', 0.15],
  ],
  TE: [
    ['routeRunning', 0.18],
    ['catchInTraffic', 0.22],
    ['ballTracking', 0.16],
    ['passBlockFootwork', 0.18],
    ['passBlockStrength', 0.26],
  ],
  OL: [
    ['passBlockFootwork', 0.48],
    ['passBlockStrength', 0.37],
    ['decisionMaking', 0.15],
  ],
  C: [
    ['passBlockFootwork', 0.48],
    ['passBlockStrength', 0.37],
    ['decisionMaking', 0.15],
  ],
  G: [
    ['passBlockFootwork', 0.48],
    ['passBlockStrength', 0.37],
    ['decisionMaking', 0.15],
  ],
  T: [
    ['passBlockFootwork', 0.48],
    ['passBlockStrength', 0.37],
    ['decisionMaking', 0.15],
  ],
  DL: [
    ['passRush', 0.45],
    ['passBlockStrength', 0.2],
    ['decisionMaking', 0.2],
    ['pressCoverage', 0.15],
  ],
  DE: [
    ['passRush', 0.45],
    ['passBlockStrength', 0.2],
    ['decisionMaking', 0.2],
    ['pressCoverage', 0.15],
  ],
  DT: [
    ['passRush', 0.45],
    ['passBlockStrength', 0.2],
    ['decisionMaking', 0.2],
    ['pressCoverage', 0.15],
  ],
  NT: [
    ['passRush', 0.45],
    ['passBlockStrength', 0.2],
    ['decisionMaking', 0.2],
    ['pressCoverage', 0.15],
  ],
  EDGE: [
    ['passRush', 0.45],
    ['passBlockStrength', 0.2],
    ['decisionMaking', 0.2],
    ['pressCoverage', 0.15],
  ],
  LB: [
    ['passRush', 0.27],
    ['zoneCoverage', 0.24],
    ['pressCoverage', 0.2],
    ['decisionMaking', 0.29],
  ],
  MLB: [
    ['passRush', 0.27],
    ['zoneCoverage', 0.24],
    ['pressCoverage', 0.2],
    ['decisionMaking', 0.29],
  ],
  OLB: [
    ['passRush', 0.27],
    ['zoneCoverage', 0.24],
    ['pressCoverage', 0.2],
    ['decisionMaking', 0.29],
  ],
  CB: [
    ['pressCoverage', 0.34],
    ['zoneCoverage', 0.32],
    ['ballTracking', 0.18],
    ['release', 0.16],
  ],
  S: [
    ['zoneCoverage', 0.32],
    ['pressCoverage', 0.26],
    ['ballTracking', 0.2],
    ['decisionMaking', 0.22],
  ],
  FS: [
    ['zoneCoverage', 0.32],
    ['pressCoverage', 0.26],
    ['ballTracking', 0.2],
    ['decisionMaking', 0.22],
  ],
  SS: [
    ['zoneCoverage', 0.32],
    ['pressCoverage', 0.26],
    ['ballTracking', 0.2],
    ['decisionMaking', 0.22],
  ],
};

function numeric(value, fallback = 50) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePosition(pos) {
  const value = String(pos ?? '').toUpperCase();
  if (['LT', 'RT', 'LG', 'RG', 'OT', 'OG'].includes(value)) return 'T';
  if (['HB'].includes(value)) return 'RB';
  if (['DB'].includes(value)) return 'CB';
  if (['ILB'].includes(value)) return 'LB';
  return value;
}

function fallbackOverall(attributesV2) {
  const values = Object.values(attributesV2 ?? {})
    .map((value) => numeric(value, NaN))
    .filter((value) => Number.isFinite(value));
  if (!values.length) return 50;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateOverallFromAttributesV2(player, attributesV2 = player?.attributesV2) {
  if (!attributesV2 || typeof attributesV2 !== 'object') return null;
  const position = normalizePosition(player?.pos);
  const weights = POSITION_ATTRIBUTE_WEIGHTS[position] ?? [];

  if (!weights.length) {
    return clamp(Math.round(fallbackOverall(attributesV2)), 25, 99);
  }

  const weighted = weights.reduce((sum, [key, weight]) => sum + (numeric(attributesV2[key], 50) * weight), 0);
  return clamp(Math.round(weighted), 25, 99);
}

export function derivePlayerVisibleRatingsPatch(player, attributesV2 = player?.attributesV2) {
  const nextOverall = calculateOverallFromAttributesV2(player, attributesV2);
  if (!Number.isFinite(nextOverall)) return null;
  const ratings = {
    ...(player?.ratings ?? {}),
    overall: nextOverall,
    ovr: nextOverall,
  };
  return {
    ovr: nextOverall,
    ratings,
  };
}
