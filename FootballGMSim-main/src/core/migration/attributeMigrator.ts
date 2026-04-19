import type { AttributesV2 } from '../../types/player.ts';

const ATTRIBUTE_KEYS: Array<keyof AttributesV2> = [
  'release',
  'routeRunning',
  'separation',
  'catchInTraffic',
  'ballTracking',
  'throwAccuracyShort',
  'throwAccuracyDeep',
  'throwPower',
  'decisionMaking',
  'pocketPresence',
  'passBlockFootwork',
  'passBlockStrength',
  'passRush',
  'pressCoverage',
  'zoneCoverage',
];

const GAUSSIAN_OFFSETS = [
  -1.55,
  -1.2,
  -0.95,
  -0.7,
  -0.45,
  -0.2,
  0,
  0.2,
  0.45,
  0.7,
  0.95,
  1.2,
  1.55,
  -0.1,
  0.1,
];

function clampRating(value: number): number {
  return Math.max(25, Math.min(99, Math.round(value)));
}

function normalizeOverall(overall?: number): number {
  const numericOverall = Number.isFinite(overall) ? Number(overall) : 60;
  const normalized = numericOverall <= 1 ? numericOverall * 100 : numericOverall;
  return Math.max(30, Math.min(99, normalized));
}

function seededJitter(seed: string, index: number): number {
  let hash = 2166136261;
  const input = `${seed}:${index}`;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 4294967295) * 2 - 1;
}

export function mapOverallToAttributesV2(overall?: number, varianceScale = 5.5, seed = 'legacy-player'): AttributesV2 {
  const base = normalizeOverall(overall);

  const migrated = ATTRIBUTE_KEYS.reduce((acc, key, idx) => {
    const gaussian = GAUSSIAN_OFFSETS[idx % GAUSSIAN_OFFSETS.length] * varianceScale;
    const jitter = seededJitter(seed, idx) * 1.75;
    acc[key] = clampRating(base + gaussian + jitter);
    return acc;
  }, {} as Record<keyof AttributesV2, number>);

  return migrated as AttributesV2;
}

export interface LegacyPlayerLike {
  id?: number | string;
  name?: string;
  ovr?: number;
  ratings?: {
    overall?: number;
    ovr?: number;
    [key: string]: number | undefined;
  };
  attributesV2?: AttributesV2;
  [key: string]: unknown;
}

export function ensureAttributesV2<T extends LegacyPlayerLike>(player: T): T & { attributesV2: AttributesV2 } {
  if (player.attributesV2) {
    return player as T & { attributesV2: AttributesV2 };
  }

  const legacyOverall = player.ratings?.overall ?? player.ratings?.ovr ?? player.ovr;
  const seed = `${player.id ?? 'na'}:${player.name ?? 'unknown'}`;

  return {
    ...player,
    attributesV2: mapOverallToAttributesV2(legacyOverall, 5.5, seed),
  };
}

export function migratePlayersToAttributesV2<T extends LegacyPlayerLike>(players: T[]): Array<T & { attributesV2: AttributesV2 }> {
  return players.map((player) => ensureAttributesV2(player));
}
