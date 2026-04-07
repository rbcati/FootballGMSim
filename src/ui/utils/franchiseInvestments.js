const DEFAULT_INVESTMENTS = Object.freeze({
  stadiumLevel: 1,
  concessionsStrategy: 'balanced',
  trainingLevel: 1,
  scoutingLevel: 1,
  scoutingRegion: 'national',
  ownerCapacity: 10,
  usedCapacity: 4,
  history: [],
});

const REGION_OPTIONS = [
  { key: 'national', label: 'National balanced' },
  { key: 'southeast', label: 'Southeast' },
  { key: 'southwest', label: 'Texas / Southwest' },
  { key: 'midwest', label: 'Midwest' },
  { key: 'west', label: 'West Coast' },
];

export function normalizeFranchiseInvestments(raw = {}) {
  const merged = { ...DEFAULT_INVESTMENTS, ...(raw || {}) };
  merged.stadiumLevel = clampInt(merged.stadiumLevel, 1, 5);
  merged.trainingLevel = clampInt(merged.trainingLevel, 1, 5);
  merged.scoutingLevel = clampInt(merged.scoutingLevel, 1, 5);
  merged.ownerCapacity = clampInt(merged.ownerCapacity, 6, 14);
  merged.usedCapacity = clampInt(merged.usedCapacity, 0, merged.ownerCapacity);
  merged.concessionsStrategy = ['fan_friendly', 'balanced', 'premium'].includes(merged.concessionsStrategy) ? merged.concessionsStrategy : 'balanced';
  merged.scoutingRegion = REGION_OPTIONS.some((r) => r.key === merged.scoutingRegion) ? merged.scoutingRegion : 'national';
  merged.history = Array.isArray(merged.history) ? merged.history.slice(0, 20) : [];
  return merged;
}

function clampInt(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function concessionFanMod(strategy) {
  if (strategy === 'fan_friendly') return 7;
  if (strategy === 'premium') return -6;
  return 1;
}

function concessionOwnerMod(strategy) {
  if (strategy === 'fan_friendly') return -4;
  if (strategy === 'premium') return 5;
  return 1;
}

function concessionMediaMod(strategy) {
  if (strategy === 'fan_friendly') return 3;
  if (strategy === 'premium') return -3;
  return 0;
}

export function computeInvestmentEffects(team) {
  const inv = normalizeFranchiseInvestments(team?.franchiseInvestments);
  const stadiumLift = (inv.stadiumLevel - 1) * 2.5;
  const trainingLift = (inv.trainingLevel - 1) * 2.2;
  const scoutingLift = (inv.scoutingLevel - 1) * 2;

  return {
    profile: inv,
    fanSentimentDelta: Math.round(stadiumLift + concessionFanMod(inv.concessionsStrategy)),
    ownerBusinessDelta: Math.round((inv.stadiumLevel - 1) + concessionOwnerMod(inv.concessionsStrategy)),
    mediaNarrativeDelta: Math.round(((inv.stadiumLevel - 1) * 1.2) + concessionMediaMod(inv.concessionsStrategy)),
    prestigeDelta: Math.round(stadiumLift + trainingLift * 0.6),
    freeAgentAppealDelta: Math.round(trainingLift + (inv.stadiumLevel - 1) * 0.8),
    moraleDelta: Math.round(trainingLift * 0.7 + (inv.concessionsStrategy === 'fan_friendly' ? 1 : 0)),
    scoutingConfidenceDelta: Math.round(scoutingLift + (inv.scoutingRegion === 'national' ? 1 : 2)),
    sleeperDiscoveryDelta: Math.round((inv.scoutingLevel - 1) * 1.4 + (inv.scoutingRegion === 'national' ? 0 : 2)),
    businessEfficiencyDelta: concessionOwnerMod(inv.concessionsStrategy),
    capacityLeft: inv.ownerCapacity - inv.usedCapacity,
  };
}

export function franchiseInvestmentSummary(team) {
  const effects = computeInvestmentEffects(team);
  const inv = effects.profile;
  return {
    ...effects,
    stadiumLabel: `Fan experience ${inv.stadiumLevel}/5`,
    trainingLabel: `Training complex ${inv.trainingLevel}/5`,
    scoutingLabel: `Scouting department ${inv.scoutingLevel}/5`,
    concessionsLabel: inv.concessionsStrategy === 'fan_friendly' ? 'Fan-friendly pricing' : inv.concessionsStrategy === 'premium' ? 'Premium pricing' : 'Balanced pricing',
    scoutingRegionLabel: REGION_OPTIONS.find((r) => r.key === inv.scoutingRegion)?.label ?? 'National balanced',
  };
}

function hashCode(text) {
  let hash = 0;
  const value = String(text ?? '0');
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getProspectRegionTag(player) {
  const basis = player?.region ?? player?.hometownRegion ?? player?.collegeRegion;
  if (basis) return String(basis).toLowerCase();
  const order = ['southeast', 'southwest', 'midwest', 'west', 'national'];
  const hash = hashCode(player?.id ?? player?.name ?? player?.pos);
  return order[hash % order.length];
}

export function getRegionOptions() {
  return REGION_OPTIONS;
}

export function getScoutingAccuracy(team, player) {
  const inv = normalizeFranchiseInvestments(team?.franchiseInvestments);
  const regionTag = getProspectRegionTag(player);
  const base = 0.57 + (inv.scoutingLevel - 1) * 0.07;
  const regionalBonus = inv.scoutingRegion !== 'national' && inv.scoutingRegion === regionTag ? 0.08 : 0;
  return Math.max(0.5, Math.min(0.92, base + regionalBonus));
}
