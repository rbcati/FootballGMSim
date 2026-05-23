const POSITION_ALIASES = Object.freeze({
  HB: 'RB', FB: 'RB', FL: 'WR', SE: 'WR',
  LT: 'OT', RT: 'OT', LG: 'OG', RG: 'OG',
  DE: 'EDGE', OLB: 'LB', MLB: 'LB', ILB: 'LB',
  DT: 'IDL', NT: 'IDL', DL: 'IDL', DB: 'CB', NCB: 'CB',
  SS: 'S', FS: 'S', PK: 'K',
});

const DEPTH_SLOT_POSITION_MAP = Object.freeze({
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  OL: 'OL',
  LT: 'OT',
  LG: 'OG',
  C: 'C',
  RG: 'OG',
  RT: 'OT',
  EDGE: 'EDGE',
  IDL: 'IDL',
  DL: 'IDL',
  LB: 'LB',
  CB: 'CB',
  S: 'S',
  FS: 'S',
  SS: 'S',
  DB: 'CB',
  K: 'K',
  P: 'P',
  RS: 'RS',
});

const POSITION_GROUPS = Object.freeze({
  QB: 'QB', RB: 'RB_FB', WR: 'WR', TE: 'TE',
  OT: 'OL', OG: 'OL', C: 'OL', OL: 'OL',
  EDGE: 'DL_EDGE', IDL: 'DL_EDGE',
  LB: 'LB', CB: 'CB_S', S: 'CB_S',
  K: 'K_P', P: 'K_P', RS: 'SKILL',
});

const TECHNICAL_KEYS = Object.freeze([
  'pass', 'passing', 'throwAccuracyShort', 'throwAccuracyDeep', 'throwPower', 'release', 'decisionMaking',
  'routeRunning', 'separation', 'catch', 'hands', 'catchInTraffic', 'ballTracking',
  'block', 'passBlockFootwork', 'passBlockStrength', 'runBlock', 'passRush', 'tackle', 'coverage', 'zoneCoverage', 'pressCoverage',
]);

const PHYSICAL_KEYS = Object.freeze(['speed', 'acceleration', 'agility', 'strength', 'stamina', 'durability', 'injury']);

export function normalizePosition(pos) {
  const raw = String(pos ?? '').trim().toUpperCase();
  if (!raw) return null;
  return POSITION_ALIASES[raw] ?? raw;
}

export function getPositionGroup(pos) {
  const normalized = normalizePosition(pos);
  if (!normalized) return 'UNKNOWN';
  return POSITION_GROUPS[normalized] ?? 'UNKNOWN';
}

export function getPositionCompatibility(naturalPosition, assignedPosition) {
  const natural = normalizePosition(naturalPosition);
  const assigned = normalizePosition(assignedPosition);
  if (!natural || !assigned) return 'unknown';
  if (natural === assigned) return 'same';

  const ng = getPositionGroup(natural);
  const ag = getPositionGroup(assigned);
  if (ng === 'UNKNOWN' || ag === 'UNKNOWN') return 'unknown';
  if (ng === ag) return 'family';

  const nearPairs = new Set(['WR|TE', 'TE|WR', 'CB|S', 'S|CB', 'EDGE|LB', 'LB|EDGE', 'RB|WR', 'WR|RB']);
  if (nearPairs.has(`${natural}|${assigned}`)) return 'minor';

  return 'cross';
}

export function getPositionalPenaltyProfile(naturalPosition, assignedPosition) {
  const compatibility = getPositionCompatibility(naturalPosition, assignedPosition);
  if (compatibility === 'same' || compatibility === 'unknown') {
    return { compatibility, technicalMultiplier: 1, physicalMultiplier: 1, awarenessMultiplier: 1, ovrMultiplier: 1 };
  }
  if (compatibility === 'family' || compatibility === 'minor') {
    return { compatibility, technicalMultiplier: 0.88, physicalMultiplier: 0.96, awarenessMultiplier: 0.9, ovrMultiplier: 0.92 };
  }
  return { compatibility, technicalMultiplier: 0.58, physicalMultiplier: 0.84, awarenessMultiplier: 0.72, ovrMultiplier: 0.7 };
}

function scaledValue(value, multiplier) {
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return Math.max(0, Math.min(99, Math.round(num * multiplier)));
}

function mapRecord(record, profile) {
  const out = { ...record };
  for (const [key, value] of Object.entries(record ?? {})) {
    const keyLower = String(key).toLowerCase();
    const technical = TECHNICAL_KEYS.some((k) => k.toLowerCase() === keyLower);
    const physical = PHYSICAL_KEYS.some((k) => k.toLowerCase() === keyLower);
    const isAware = keyLower === 'awareness' || keyLower === 'iq';
    const isOvr = keyLower === 'ovr';

    const multiplier = isOvr
      ? profile.ovrMultiplier
      : isAware
        ? profile.awarenessMultiplier
        : technical
          ? profile.technicalMultiplier
          : physical
            ? profile.physicalMultiplier
            : 1;
    out[key] = scaledValue(value, multiplier);
  }
  return out;
}

export function calculateEffectiveAttributes(player = {}, assignedPosition, options = {}) {
  const naturalPosition = options.naturalPosition ?? player?.primaryPosition ?? player?.position ?? player?.pos;
  const profile = getPositionalPenaltyProfile(naturalPosition, assignedPosition);
  const clone = { ...player };

  if (clone.ratings && typeof clone.ratings === 'object') clone.ratings = mapRecord(clone.ratings, profile);
  if (clone.attributes && typeof clone.attributes === 'object') clone.attributes = mapRecord(clone.attributes, profile);

  clone.effectiveProfile = profile;
  clone.effectivePosition = normalizePosition(assignedPosition) ?? normalizePosition(naturalPosition);
  return mapRecord(clone, profile);
}

export function inferAssignedPositionFromDepthSlot(slotName) {
  const normalizedSlot = normalizePosition(slotName);
  if (!normalizedSlot) return null;
  return DEPTH_SLOT_POSITION_MAP[normalizedSlot] ?? normalizedSlot;
}

export function normalizeAssignedRole(roleOrSlot) {
  return inferAssignedPositionFromDepthSlot(roleOrSlot);
}

export function getEffectivePlayerForRole(player = {}, roleOrPosition, options = {}) {
  const assignedPosition = normalizeAssignedRole(roleOrPosition);
  if (!assignedPosition) return { ...player };
  return calculateEffectiveAttributes(player, assignedPosition, options);
}
