import type { AttributesV2 } from '../../types/player.ts';
import { buildDeterministicSeed } from '../sim/weekSimulationBridge.ts';

export interface EvolutionPlayer {
  id: string | number;
  name?: string;
  pos?: string;
  age?: number;
  teamId?: number | string | null;
  ovr?: number;
  potential?: number;
  schemeFit?: number;
  status?: string;
  attributesV2?: AttributesV2;
  attributeXp?: Partial<Record<keyof AttributesV2, number>>;
  growthHistory?: Array<Record<string, unknown>>;
  lastEvolutionWeek?: string | null;
  wearAndTear?: number;
  injuryHistory?: Array<Record<string, unknown>>;
  developmentContext?: Record<string, unknown> | null;
}

export interface EvolutionGameResult {
  home?: number | string;
  away?: number | string;
  boxScore?: {
    home?: Record<string, { pos?: string; stats?: Record<string, number> }>;
    away?: Record<string, { pos?: string; stats?: Record<string, number> }>;
  };
  teamDriveStats?: {
    home?: Record<string, number>;
    away?: Record<string, number>;
  };
  teamStats?: {
    home?: Record<string, number>;
    away?: Record<string, number>;
  };
  playDigest?: Array<{ team?: 'home' | 'away' | 'neutral' | string; type?: string; text?: string }>;
  eventDigest?: Array<{ team?: 'home' | 'away' | 'neutral' | string; type?: string; text?: string }>;
  summary?: {
    storyline?: string;
    headlineMoments?: string[];
    topReason1?: string | null;
    topReason2?: string | null;
  };
  simFactors?: {
    home?: { qbRating?: number; rushYpc?: number; successRate?: number; passRate?: number };
    away?: { qbRating?: number; rushYpc?: number; successRate?: number; passRate?: number };
  };
}

export interface TeamDevelopmentFocus {
  trainingFocus?: string;
  intensity?: 'light' | 'normal' | 'hard' | string;
  drillType?: 'technique' | 'conditioning' | 'teamwork' | 'film' | string;
  positionGroups?: string[];
  trainingLevel?: number;
  scoutingLevel?: number;
  medicalSupport?: number;
  continuityScore?: number;
  developmentPrecision?: number;
  staffBonuses?: Partial<{
    developmentDelta: number;
    offensiveDevelopmentDelta: number;
    defensiveDevelopmentDelta: number;
    mentorDelta: number;
    rookieAdaptationDelta: number;
    readinessDelta: number;
    injuryRateDelta: number;
    recoveryDelta: number;
  }>;
}

interface PlayerDevelopmentAccumulator {
  xp: Partial<Record<keyof AttributesV2, number>>;
  production: number;
  usage: number;
  wear: number;
}

export interface WeeklyEvolutionInput {
  players: EvolutionPlayer[];
  results: EvolutionGameResult[];
  week: number;
  seasonId: number;
  seed: number;
  teamFocusByTeamId?: Record<string, TeamDevelopmentFocus>;
}

export interface OffseasonEvolutionInput {
  players: EvolutionPlayer[];
  seasonId: number;
  year: number;
  seed: number;
  teamFocusByTeamId?: Record<string, TeamDevelopmentFocus>;
}

export interface PlayerEvolutionUpdate {
  playerId: string;
  attributesV2: AttributesV2;
  attributeXp: Partial<Record<keyof AttributesV2, number>>;
  growthHistoryEntry: {
    seasonId: number;
    week: number;
    stage?: 'weekly' | 'offseason';
    stamp?: string;
    deltas: Partial<Record<keyof AttributesV2, number>>;
    totalDelta: number;
    notes: string[];
    usage?: number;
    production?: number;
    wearDelta?: number;
    trend?: string;
  };
  notableNote?: string;
  wearAndTear?: number;
  developmentContext?: Record<string, unknown>;
}

export interface WeeklyEvolutionResult {
  updates: PlayerEvolutionUpdate[];
  developmentEvents: Array<{
    playerId: string;
    teamId: number | string | null;
    week: number;
    seasonId: number;
    note: string;
  }>;
  stamp: string;
  summary: {
    processedPlayers: number;
    totalPositiveDelta: number;
    totalNegativeDelta: number;
    netDelta: number;
  };
}

export interface OffseasonEvolutionUpdate extends PlayerEvolutionUpdate {
  ovr: number;
  potential: number;
  progressionDelta: number;
}

export interface OffseasonEvolutionResult {
  updates: OffseasonEvolutionUpdate[];
  stamp: string;
  summary: {
    processedPlayers: number;
    totalPositiveDelta: number;
    totalNegativeDelta: number;
    netDelta: number;
  };
  gainers: Array<{ playerId: string; name: string; pos: string; delta: number; tag: string }>;
  regressors: Array<{ playerId: string; name: string; pos: string; delta: number; tag: string }>;
}

const ATTRIBUTE_KEYS: Array<keyof AttributesV2> = [
  'release', 'routeRunning', 'separation', 'catchInTraffic', 'ballTracking',
  'throwAccuracyShort', 'throwAccuracyDeep', 'throwPower', 'decisionMaking',
  'pocketPresence', 'passBlockFootwork', 'passBlockStrength', 'passRush',
  'pressCoverage', 'zoneCoverage',
];

const POSITION_GROUPS: Record<string, string[]> = {
  qb: ['QB'],
  rb: ['RB', 'FB'],
  wr: ['WR'],
  te: ['TE'],
  ol: ['OL', 'C', 'G', 'T'],
  dl: ['DL', 'DE', 'DT', 'NT', 'EDGE'],
  lb: ['LB', 'MLB', 'OLB'],
  db: ['CB', 'S', 'FS', 'SS'],
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function num(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function makeStamp(seasonId: number, week: number, stage: 'weekly' | 'offseason' = 'weekly') {
  return stage === 'offseason' ? `${seasonId}:offseason` : `${seasonId}:${week}`;
}

function emptyXp(): Partial<Record<keyof AttributesV2, number>> {
  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Partial<Record<keyof AttributesV2, number>>);
}

function deterministicUnit(seed: number, ...parts: Array<string | number>) {
  return buildDeterministicSeed([seed, ...parts].join('|')) / 4294967295;
}

function deterministicCentered(seed: number, ...parts: Array<string | number>) {
  return deterministicUnit(seed, ...parts) * 2 - 1;
}

function getTeamStats(game: EvolutionGameResult, side: 'home' | 'away') {
  return game?.teamStats?.[side] ?? game?.teamDriveStats?.[side] ?? {};
}

function getDigest(game: EvolutionGameResult) {
  if (Array.isArray(game?.playDigest)) return game.playDigest;
  if (Array.isArray(game?.eventDigest)) return game.eventDigest;
  return [];
}

function summarizeDigest(game: EvolutionGameResult) {
  const base = { explosivePlays: 0, sacks: 0, takeaways: 0, leverageSwings: 0 };
  const counts = { home: { ...base }, away: { ...base } };
  for (const event of getDigest(game)) {
    if (event?.team !== 'home' && event?.team !== 'away') continue;
    const row = counts[event.team];
    const type = String(event?.type ?? '');
    if (type === 'explosive_play') row.explosivePlays += 1;
    if (type === 'sack') row.sacks += 1;
    if (type === 'turnover' || type === 'final_takeaway') row.takeaways += 1;
    if (type === 'lead_change' || type === 'swing') row.leverageSwings += 1;
  }
  return counts;
}

function normalizeTeamContext(teamFocus?: TeamDevelopmentFocus) {
  return {
    trainingFocus: String(teamFocus?.trainingFocus ?? 'balanced'),
    intensity: String(teamFocus?.intensity ?? 'normal'),
    drillType: String(teamFocus?.drillType ?? 'technique'),
    positionGroups: Array.isArray(teamFocus?.positionGroups) ? teamFocus.positionGroups.map((g) => String(g).toLowerCase()) : [],
    trainingLevel: clamp(Math.round(num(teamFocus?.trainingLevel) || 1), 1, 5),
    scoutingLevel: clamp(Math.round(num(teamFocus?.scoutingLevel) || 1), 1, 5),
    medicalSupport: clamp(num(teamFocus?.medicalSupport), 0, 0.35),
    continuityScore: clamp(num(teamFocus?.continuityScore), -0.2, 0.2),
    developmentPrecision: clamp(num(teamFocus?.developmentPrecision), -0.1, 0.25),
    staffBonuses: {
      developmentDelta: num(teamFocus?.staffBonuses?.developmentDelta),
      offensiveDevelopmentDelta: num(teamFocus?.staffBonuses?.offensiveDevelopmentDelta),
      defensiveDevelopmentDelta: num(teamFocus?.staffBonuses?.defensiveDevelopmentDelta),
      mentorDelta: num(teamFocus?.staffBonuses?.mentorDelta),
      rookieAdaptationDelta: num(teamFocus?.staffBonuses?.rookieAdaptationDelta),
      readinessDelta: num(teamFocus?.staffBonuses?.readinessDelta),
      injuryRateDelta: num(teamFocus?.staffBonuses?.injuryRateDelta),
      recoveryDelta: num(teamFocus?.staffBonuses?.recoveryDelta),
    },
  };
}

function getAttributeWeightMap(pos: string) {
  const upper = String(pos ?? '').toUpperCase();
  if (upper === 'QB') {
    return { throwAccuracyShort: 0.24, throwAccuracyDeep: 0.22, decisionMaking: 0.22, pocketPresence: 0.18, throwPower: 0.14 };
  }
  if (upper === 'RB' || upper === 'FB') {
    return { decisionMaking: 0.34, separation: 0.22, catchInTraffic: 0.18, ballTracking: 0.16, throwPower: 0.1 };
  }
  if (upper === 'WR') {
    return { release: 0.18, routeRunning: 0.26, separation: 0.24, catchInTraffic: 0.16, ballTracking: 0.16 };
  }
  if (upper === 'TE') {
    return { routeRunning: 0.22, separation: 0.2, catchInTraffic: 0.22, ballTracking: 0.16, passBlockStrength: 0.2 };
  }
  if (['OL', 'C', 'G', 'T'].includes(upper)) {
    return { passBlockFootwork: 0.45, passBlockStrength: 0.45, decisionMaking: 0.1 };
  }
  if (['DL', 'DE', 'DT', 'NT', 'EDGE'].includes(upper)) {
    return { passRush: 0.64, decisionMaking: 0.16, zoneCoverage: 0.2 };
  }
  if (['LB', 'MLB', 'OLB'].includes(upper)) {
    return { passRush: 0.42, decisionMaking: 0.3, zoneCoverage: 0.28 };
  }
  return { pressCoverage: 0.36, zoneCoverage: 0.4, ballTracking: 0.24 };
}

function weightedOvrDelta(pos: string, deltas: Partial<Record<keyof AttributesV2, number>>) {
  const weights = getAttributeWeightMap(pos);
  let totalWeight = 0;
  let weighted = 0;
  for (const [attr, weight] of Object.entries(weights)) {
    weighted += num(deltas[attr as keyof AttributesV2]) * num(weight);
    totalWeight += num(weight);
  }
  if (totalWeight <= 0) return 0;
  return clamp(Math.round((weighted / totalWeight) * 1.35), -4, 4);
}

function normalizeAttributes(attrs: AttributesV2 | undefined, fallback = 68): AttributesV2 {
  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    acc[key] = clamp(num(attrs?.[key], fallback), 25, 99);
    return acc;
  }, {} as AttributesV2);
}

function getAgeCurve(ageRaw: unknown) {
  const age = Math.round(num(ageRaw) || 25);
  if (age <= 24) return { growth: 1.26, maintenancePressure: 0.03, offseasonGrowth: 1.32, offseasonPressure: 0.1 };
  if (age <= 28) return { growth: 1.02, maintenancePressure: 0.09, offseasonGrowth: 1.04, offseasonPressure: 0.18 };
  if (age <= 31) return { growth: 0.84, maintenancePressure: 0.18, offseasonGrowth: 0.78, offseasonPressure: 0.34 };
  return { growth: 0.64, maintenancePressure: 0.32, offseasonGrowth: 0.52, offseasonPressure: 0.58 };
}

function addXp(acc: PlayerDevelopmentAccumulator, attribute: keyof AttributesV2, value: number) {
  if (!Number.isFinite(value) || value === 0) return;
  const current = num(acc.xp[attribute]);
  acc.xp[attribute] = current + value;
}

function deriveFocusMultiplier(playerPos: string, teamFocus?: TeamDevelopmentFocus) {
  const context = normalizeTeamContext(teamFocus);
  const trainingFocus = context.trainingFocus;
  const intensity = context.intensity;
  const drillType = context.drillType;
  const focusGroups = new Set(context.positionGroups);
  const offensive = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'C', 'G', 'T'].includes(playerPos);

  let multiplier = 1 + (context.trainingLevel - 3) * 0.03 + context.developmentPrecision * 0.35;
  if (intensity === 'light') multiplier *= 0.94;
  if (intensity === 'hard') multiplier *= 1.08;

  if (drillType === 'film' && ['QB', 'WR', 'TE', 'CB', 'S', 'LB'].includes(playerPos)) multiplier *= 1.06;
  if (drillType === 'conditioning' && ['RB', 'WR', 'CB', 'S', 'DL', 'LB', 'EDGE'].includes(playerPos)) multiplier *= 1.05;
  if (drillType === 'technique' && ['OL', 'C', 'G', 'T', 'DL', 'DE', 'DT', 'NT'].includes(playerPos)) multiplier *= 1.05;

  if (trainingFocus === 'youth_development') multiplier *= 1.08;
  if (trainingFocus === 'win_now' && ['QB', 'OL', 'DL', 'LB'].includes(playerPos)) multiplier *= 1.03;
  if (trainingFocus === 'rehab_recovery') multiplier *= 0.98;
  if (trainingFocus === 'strength_conditioning' && ['OL', 'DL', 'LB', 'TE'].includes(playerPos)) multiplier *= 1.07;
  if (offensive) multiplier *= 1 + context.staffBonuses.offensiveDevelopmentDelta * 0.35;
  else multiplier *= 1 + context.staffBonuses.defensiveDevelopmentDelta * 0.35;
  multiplier *= 1 + (context.staffBonuses.developmentDelta + context.staffBonuses.mentorDelta + context.continuityScore) * 0.35;

  if (focusGroups.size > 0) {
    const focused = Object.entries(POSITION_GROUPS).some(([group, positions]) => focusGroups.has(group) && positions.includes(playerPos));
    if (focused) multiplier *= 1.08;
  }

  return clamp(multiplier, 0.84, 1.28);
}

function summarizeNotableNote(pos: string, deltas: Partial<Record<keyof AttributesV2, number>>) {
  const ranked = Object.entries(deltas)
    .map(([attr, delta]) => ({ attr, delta: num(delta) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (!ranked.length || Math.abs(ranked[0].delta) < 1) return null;

  const top = ranked[0];
  if (pos === 'QB' && top.attr === 'pocketPresence' && top.delta > 0) {
    return 'Pocket-presence trend improved under clean-dropback volume.';
  }
  if (pos === 'QB' && top.attr === 'decisionMaking' && top.delta > 0) {
    return 'Decision-making trend sharpened after efficient high-volume usage.';
  }
  if (['WR', 'TE'].includes(pos) && top.attr === 'routeRunning' && top.delta > 0) {
    return 'Route-running trend improved after sustained target volume.';
  }
  if (['WR', 'TE'].includes(pos) && top.attr === 'separation' && top.delta > 0) {
    return 'Separation trend improved after repeated explosive-route reps.';
  }
  if (['OL', 'C', 'G', 'T'].includes(pos) && top.attr === 'passBlockFootwork' && top.delta > 0) {
    return 'Pass-protection footwork stabilized through high-rep clean pockets.';
  }
  if (['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'MLB', 'OLB'].includes(pos) && top.attr === 'passRush' && top.delta > 0) {
    return 'Pass-rush trend improved after sustained disruption volume.';
  }
  if (['CB', 'S', 'FS', 'SS'].includes(pos) && ['pressCoverage', 'zoneCoverage', 'ballTracking'].includes(top.attr) && top.delta > 0) {
    return 'Coverage reaction improved after repeated contested-target production.';
  }
  return null;
}

function applyPositionXp(
  acc: PlayerDevelopmentAccumulator,
  pos: string,
  stats: Record<string, number>,
  teamStats: Record<string, number>,
  simFactors: Record<string, number> = {},
  digestSummary: Record<string, number> = {},
) {
  const passAtt = num(stats.passAtt);
  const passComp = num(stats.passComp);
  const passYd = num(stats.passYd);
  const passTd = num(stats.passTD);
  const interceptions = num(stats.interceptions);
  const sacks = num(stats.sacks);
  const rushAtt = num(stats.rushAtt);
  const rushYd = num(stats.rushYd);
  const rushTd = num(stats.rushTD);
  const targets = num(stats.targets);
  const receptions = num(stats.receptions);
  const recYd = num(stats.recYd);
  const recTd = num(stats.recTD);
  const passesDefended = num(stats.passesDefended);
  const pressures = num(stats.pressures);
  const tackles = num(stats.tackles);

  if (pos === 'QB') {
    const usage = clamp((passAtt + sacks) / 34, 0, 1.5);
    const cleanPocket = clamp(1 - sacks / Math.max(1, passAtt + sacks), 0, 1);
    const efficiency = passAtt > 0 ? (passComp / passAtt) * 0.95 + (passYd / passAtt) * 0.12 : 0;
    const production = efficiency + passTd * 0.28 - interceptions * 0.4 - sacks * 0.05 + num(simFactors.qbRating) * 0.004;
    addXp(acc, 'throwAccuracyShort', usage * 3.8 + production * 2.1 + num(simFactors.successRate) * 1.8);
    addXp(acc, 'throwAccuracyDeep', usage * 3 + production * 2.5 + (num(teamStats.explosivePlays) + num(digestSummary.explosivePlays)) * 0.18);
    addXp(acc, 'decisionMaking', usage * 2.7 + production * 2.1 + cleanPocket * 1.4);
    addXp(acc, 'pocketPresence', cleanPocket * 4.1 + usage * 1.1);
    addXp(acc, 'throwPower', (passYd / Math.max(1, passAtt)) * 1.1 + passTd * 0.18 + num(digestSummary.leverageSwings) * 0.1);
    acc.usage += usage;
    acc.production += production;
    acc.wear += clamp((passAtt + sacks) / 18, 0, 2.8);
    return;
  }

  if (pos === 'RB' || pos === 'FB') {
    const touches = rushAtt + receptions;
    const usage = clamp(touches / 18, 0, 1.45);
    const ypc = rushAtt > 0 ? rushYd / rushAtt : 0;
    const production = ypc * 0.42 + rushTd * 0.28 + recYd * 0.016 + num(simFactors.rushYpc) * 0.5;
    addXp(acc, 'decisionMaking', usage * 2.2 + production * 1.1);
    addXp(acc, 'separation', receptions * 0.36 + production * 0.32 + num(digestSummary.explosivePlays) * 0.08);
    addXp(acc, 'catchInTraffic', receptions * 0.28 + targets * 0.12 + recTd * 0.3);
    addXp(acc, 'ballTracking', recYd * 0.026 + recTd * 0.38);
    acc.usage += usage;
    acc.production += production;
    acc.wear += clamp(touches / 10, 0, 3.2);
    return;
  }

  if (pos === 'WR' || pos === 'TE') {
    const usage = clamp(targets / 9, 0, 1.5);
    const catchRate = targets > 0 ? receptions / targets : 0;
    const yardsPerTarget = targets > 0 ? recYd / targets : 0;
    const production = catchRate * 0.86 + yardsPerTarget * 0.14 + recTd * 0.52;
    addXp(acc, 'release', usage * 1.8 + receptions * 0.38);
    addXp(acc, 'routeRunning', usage * 3.1 + production * 1.8 + num(simFactors.successRate) * 1.2);
    addXp(acc, 'separation', usage * 2.8 + production * 1.6 + (num(teamStats.explosivePlays) + num(digestSummary.explosivePlays)) * 0.12);
    addXp(acc, 'catchInTraffic', receptions * 0.25 + targets * 0.18 + recTd * 0.35);
    addXp(acc, 'ballTracking', recYd * 0.022 + recTd * 0.45 + num(digestSummary.leverageSwings) * 0.08);
    acc.usage += usage;
    acc.production += production;
    acc.wear += clamp(targets / 14, 0, 1.8);
    return;
  }

  if (['OL', 'C', 'G', 'T'].includes(pos)) {
    const plays = num(teamStats.plays);
    const protection = clamp(1 - num(teamStats.sacksAllowed) / Math.max(1, num(teamStats.passAtt) + num(teamStats.sacksAllowed)), 0, 1);
    const runSupport = num(teamStats.rushYd) / Math.max(1, num(teamStats.rushAtt));
    const production = clamp(protection * 1.15 + runSupport * 0.42 - num(digestSummary.sacks) * 0.08, -1.2, 2.8);
    addXp(acc, 'passBlockFootwork', protection * 4 + plays * 0.04);
    addXp(acc, 'passBlockStrength', runSupport * 1.5 + production * 2.1);
    addXp(acc, 'decisionMaking', production * 0.8);
    acc.usage += clamp(plays / 64, 0.4, 1.5);
    acc.production += production;
    acc.wear += clamp(plays / 20, 0, 2.2);
    return;
  }

  if (['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'MLB', 'OLB'].includes(pos)) {
    const sacksMade = num(stats.sacks);
    const production = sacksMade * 0.84 + pressures * 0.32 + tackles * 0.05 + num(digestSummary.takeaways) * 0.14;
    addXp(acc, 'passRush', sacksMade * 2.5 + pressures * 1.15 + num(teamStats.sacksMade) * 0.18);
    addXp(acc, 'decisionMaking', tackles * 0.1 + production * 0.48);
    addXp(acc, 'zoneCoverage', tackles * 0.05 + passesDefended * 0.24);
    acc.usage += clamp((pressures + tackles + sacksMade * 1.8) / 7, 0, 1.5);
    acc.production += production;
    acc.wear += clamp((tackles + pressures) / 10, 0, 2.6);
    return;
  }

  if (['CB', 'S', 'FS', 'SS'].includes(pos)) {
    const ints = num(stats.interceptions);
    const production = passesDefended * 0.55 + ints * 1.2 + tackles * 0.05;
    addXp(acc, 'pressCoverage', production * 1.7 + passesDefended * 0.65);
    addXp(acc, 'zoneCoverage', production * 1.75 + ints * 0.4 + num(simFactors.successRate) * 0.4);
    addXp(acc, 'ballTracking', ints * 0.9 + passesDefended * 0.28);
    acc.usage += clamp((passesDefended * 1.2 + tackles * 0.2 + ints * 2) / 5, 0, 1.5);
    acc.production += production;
    acc.wear += clamp((tackles + passesDefended) / 12, 0, 1.9);
  }
}

function applyParityGuardrail(entries: Array<{ playerId: string; attr: keyof AttributesV2; delta: number }>, playerCount: number) {
  const positive = entries.reduce((sum, row) => sum + Math.max(0, row.delta), 0);
  const negative = Math.abs(entries.reduce((sum, row) => sum + Math.min(0, row.delta), 0));
  const maxNetPositive = Math.max(5, Math.floor(playerCount * 0.12));
  let net = positive - negative;
  if (net <= maxNetPositive) return entries;

  const sortedPositives = entries
    .filter((row) => row.delta > 0)
    .sort((a, b) => a.delta - b.delta || a.playerId.localeCompare(b.playerId) || a.attr.localeCompare(b.attr));

  for (const row of sortedPositives) {
    while (row.delta > 0 && net > maxNetPositive) {
      row.delta -= 1;
      net -= 1;
    }
    if (net <= maxNetPositive) break;
  }
  return entries;
}

function buildTrendLabel(age: number, usage: number, totalDelta: number, wearAndTear: number) {
  if (age <= 24 && usage >= 0.8 && totalDelta >= 2) return 'breakout_pressure';
  if (age <= 25 && usage < 0.35) return 'stalled_by_usage';
  if (age >= 31 && (totalDelta < 0 || wearAndTear >= 28)) return 'maintenance_pressure';
  if (totalDelta > 0) return 'rising';
  if (totalDelta < 0) return 'slipping';
  return 'holding';
}

export function buildDevelopmentFlash({
  player,
  deltas,
  usage,
}: {
  player: EvolutionPlayer;
  deltas: Partial<Record<keyof AttributesV2, number>>;
  usage: number;
}) {
  if (usage < 0.55) return null;
  return summarizeNotableNote(String(player?.pos ?? '').toUpperCase(), deltas);
}

export function applyPlayerAttributeXp(
  player: EvolutionPlayer,
  xpSource: Partial<Record<keyof AttributesV2, number>>,
  {
    stage = 'weekly',
    usage = 0,
    production = 0,
    wearDelta = 0,
    teamFocus,
    seed = 0,
    stamp = 'evolution',
  }: {
    stage?: 'weekly' | 'offseason';
    usage?: number;
    production?: number;
    wearDelta?: number;
    teamFocus?: TeamDevelopmentFocus;
    seed?: number;
    stamp?: string;
  } = {},
) {
  const ageCurve = getAgeCurve(player.age);
  const context = normalizeTeamContext(teamFocus);
  const nextAttributes = normalizeAttributes(player.attributesV2, clamp(num(player?.ovr) || 68, 55, 85));
  const nextXp: Partial<Record<keyof AttributesV2, number>> = { ...(player.attributeXp ?? {}) };
  const deltas: Partial<Record<keyof AttributesV2, number>> = {};
  const threshold = stage === 'offseason' ? 14 : 12;
  const physicalAttrs = new Set(['throwPower', 'separation', 'passRush', 'pressCoverage', 'passBlockStrength']);
  const wearAndTear = clamp(num(player?.wearAndTear) + wearDelta * (stage === 'offseason' ? 2.2 : 1), 0, 100);
  const usageBonus = usage >= 0.85 ? 1.4 : usage >= 0.5 ? 0.35 : usage >= 0.28 ? -0.8 : -3.6;
  const schemeFitBonus = (num(player?.schemeFit, 50) - 50) / 100;
  const growthMultiplier = stage === 'offseason' ? ageCurve.offseasonGrowth : ageCurve.growth;
  const agePressureBase = stage === 'offseason' ? ageCurve.offseasonPressure * 16 : ageCurve.maintenancePressure * 12;

  for (const attr of ATTRIBUTE_KEYS) {
    const jitter = deterministicCentered(seed, stamp, player.id, attr, stage) * (stage === 'offseason' ? 1.6 : 0.8);
    const developmentalBoost = (context.staffBonuses.developmentDelta + context.staffBonuses.mentorDelta + context.developmentPrecision) * 4;
    const recoveryCredit = (context.medicalSupport + context.staffBonuses.recoveryDelta) * 8;
    const wearPenalty = wearAndTear * (physicalAttrs.has(attr) ? 0.08 : 0.035);
    const rookieBonus = num(player?.age) <= 24 ? context.staffBonuses.rookieAdaptationDelta * 6 : 0;
    const sourceXp = num(xpSource[attr]);
    const rawXp = num(player.attributeXp?.[attr]) + sourceXp * growthMultiplier + usageBonus + production * (stage === 'offseason' ? 1.1 : 0.5) + developmentalBoost + rookieBonus + schemeFitBonus + jitter - Math.max(0, wearPenalty - recoveryCredit) - agePressureBase;
    const boundedXp = clamp(rawXp, -180, 180);
    const scaledXp = boundedXp / threshold;
    let delta = clamp(
      stage === 'offseason' ? Math.round(scaledXp) : Math.trunc(scaledXp),
      stage === 'offseason' ? -3 : -2,
      stage === 'offseason' ? 3 : 2,
    );
    if (stage === 'weekly' && usage < 0.2 && delta > 0) delta = 0;
    if (num(player?.age) >= 32 && physicalAttrs.has(attr)) delta = Math.min(delta, 0);
    if (num(player?.age) >= 35 && ['throwPower', 'separation', 'passRush', 'pressCoverage'].includes(attr)) delta = Math.min(delta, -1);
    deltas[attr] = delta;
    nextAttributes[attr] = clamp(num(nextAttributes[attr]) + delta, 25, 99);
    nextXp[attr] = clamp(boundedXp - delta * threshold, -180, 180);
  }

  return {
    attributesV2: nextAttributes,
    attributeXp: nextXp,
    deltas,
    totalDelta: Object.values(deltas).reduce((sum, delta) => sum + num(delta), 0),
    wearAndTear,
  };
}

export function processWeeklyEvolution(input: WeeklyEvolutionInput): WeeklyEvolutionResult {
  const stamp = makeStamp(input.seasonId, input.week);
  const playersById = new Map<string, EvolutionPlayer>();
  for (const player of input.players) playersById.set(String(player.id), player);

  const accumulators = new Map<string, PlayerDevelopmentAccumulator>();
  const ensureAccumulator = (playerId: string) => {
    if (!accumulators.has(playerId)) accumulators.set(playerId, { xp: emptyXp(), production: 0, usage: 0, wear: 0 });
    return accumulators.get(playerId)!;
  };

  for (const game of input.results) {
    const digestSummary = summarizeDigest(game);
    const sideEntries: Array<{ box: Record<string, { pos?: string; stats?: Record<string, number> }>; teamStats: Record<string, number>; teamId: number | string | undefined }> = [
      { box: game.boxScore?.home ?? {}, teamStats: getTeamStats(game, 'home'), teamId: game.home },
      { box: game.boxScore?.away ?? {}, teamStats: getTeamStats(game, 'away'), teamId: game.away },
    ];

    sideEntries.forEach((side, sideIndex) => {
      const sideKey = sideIndex === 0 ? 'home' : 'away';
      const simFactors = game?.simFactors?.[sideKey] ?? {};
      for (const [rawPlayerId, row] of Object.entries(side.box)) {
        const playerId = String(rawPlayerId);
        const player = playersById.get(playerId);
        if (!player?.attributesV2) continue;
        const stats = row?.stats ?? {};
        const pos = String(player.pos ?? row?.pos ?? '').toUpperCase();
        if (!pos) continue;
        const acc = ensureAccumulator(playerId);
        applyPositionXp(acc, pos, stats, side.teamStats, simFactors, digestSummary[sideKey]);

        const focusKey = String(player.teamId ?? side.teamId ?? '');
        const focusMultiplier = deriveFocusMultiplier(pos, input.teamFocusByTeamId?.[focusKey]);
        for (const key of ATTRIBUTE_KEYS) {
          acc.xp[key] = num(acc.xp[key]) * focusMultiplier;
        }
        acc.wear += clamp((focusMultiplier - 1) * 1.5, 0, 1.2);
      }
    });
  }

  const updates: PlayerEvolutionUpdate[] = [];
  const developmentEvents: WeeklyEvolutionResult['developmentEvents'] = [];

  for (const [playerId, acc] of accumulators.entries()) {
    const player = playersById.get(playerId);
    if (!player?.attributesV2) continue;
    const focusKey = String(player.teamId ?? '');
    const applied = applyPlayerAttributeXp(player, acc.xp, {
      stage: 'weekly',
      usage: acc.usage,
      production: acc.production,
      wearDelta: acc.wear,
      teamFocus: input.teamFocusByTeamId?.[focusKey],
      seed: input.seed,
      stamp,
    });
    const note = buildDevelopmentFlash({ player, deltas: applied.deltas, usage: acc.usage });
    const trend = buildTrendLabel(num(player?.age, 25), acc.usage, applied.totalDelta, applied.wearAndTear);

    const growthHistoryEntry = {
      seasonId: input.seasonId,
      week: input.week,
      stage: 'weekly' as const,
      stamp,
      deltas: applied.deltas,
      totalDelta: applied.totalDelta,
      notes: note ? [note] : [],
      usage: Number(acc.usage.toFixed(3)),
      production: Number(acc.production.toFixed(3)),
      wearDelta: Number(acc.wear.toFixed(3)),
      trend,
    };

    updates.push({
      playerId,
      attributesV2: applied.attributesV2,
      attributeXp: applied.attributeXp,
      growthHistoryEntry,
      notableNote: note ?? undefined,
      wearAndTear: applied.wearAndTear,
      developmentContext: {
        trend,
        recentUsage: Number(acc.usage.toFixed(3)),
        wearAndTear: Math.round(applied.wearAndTear),
        breakoutCandidate: num(player?.age) <= 24 && acc.usage >= 0.8 && applied.totalDelta >= 2,
        stalledProspect: num(player?.age) <= 25 && acc.usage < 0.35,
        veteranDeclineRisk: num(player?.age) >= 31 && applied.totalDelta < 0,
      },
    });

    if (note) {
      developmentEvents.push({
        playerId,
        teamId: player.teamId ?? null,
        week: input.week,
        seasonId: input.seasonId,
        note,
      });
    }
  }

  const deltaRows = updates.flatMap((update) =>
    ATTRIBUTE_KEYS.map((attr) => ({ playerId: update.playerId, attr, delta: num(update.growthHistoryEntry.deltas[attr]) })),
  );
  applyParityGuardrail(deltaRows, input.players.length);
  const adjustedByPlayer = new Map<string, Partial<Record<keyof AttributesV2, number>>>();
  for (const row of deltaRows) {
    const existing = adjustedByPlayer.get(row.playerId) ?? {};
    existing[row.attr] = row.delta;
    adjustedByPlayer.set(row.playerId, existing);
  }
  for (const update of updates) {
    const adjusted = adjustedByPlayer.get(update.playerId) ?? {};
    let totalDelta = 0;
    for (const key of ATTRIBUTE_KEYS) {
      const priorDelta = num(update.growthHistoryEntry.deltas[key]);
      const nextDelta = num(adjusted[key]);
      const deltaDiff = nextDelta - priorDelta;
      if (deltaDiff !== 0) {
        update.attributesV2[key] = clamp(num(update.attributesV2[key]) + deltaDiff, 25, 99);
        update.attributeXp[key] = clamp(num(update.attributeXp[key]) - deltaDiff * 12, -180, 180);
      }
      update.growthHistoryEntry.deltas[key] = nextDelta;
      totalDelta += nextDelta;
    }
    update.growthHistoryEntry.totalDelta = totalDelta;
    update.notableNote = buildDevelopmentFlash({
      player: playersById.get(update.playerId) ?? { id: update.playerId },
      deltas: update.growthHistoryEntry.deltas,
      usage: num(update.growthHistoryEntry.usage),
    }) ?? undefined;
    update.growthHistoryEntry.notes = update.notableNote ? [update.notableNote] : [];
    update.developmentContext = {
      ...(update.developmentContext ?? {}),
      trend: buildTrendLabel(num(playersById.get(update.playerId)?.age, 25), num(update.growthHistoryEntry.usage), totalDelta, num(update.wearAndTear)),
    };
  }

  const totalPositiveDelta = updates.reduce((sum, update) => sum + Object.values(update.growthHistoryEntry.deltas).reduce((inner, delta) => inner + Math.max(0, num(delta)), 0), 0);
  const totalNegativeDelta = updates.reduce((sum, update) => sum + Object.values(update.growthHistoryEntry.deltas).reduce((inner, delta) => inner + Math.abs(Math.min(0, num(delta))), 0), 0);

  return {
    updates,
    developmentEvents,
    stamp,
    summary: {
      processedPlayers: updates.length,
      totalPositiveDelta,
      totalNegativeDelta,
      netDelta: totalPositiveDelta - totalNegativeDelta,
    },
  };
}

export function processOffseasonEvolution(input: OffseasonEvolutionInput): OffseasonEvolutionResult {
  const stamp = makeStamp(input.seasonId, 0, 'offseason');
  const updates: OffseasonEvolutionUpdate[] = [];

  for (const player of input.players) {
    if (!player?.attributesV2) continue;
    if (player?.status === 'draft_eligible' || player?.status === 'retired') continue;

    const history = (Array.isArray(player?.growthHistory) ? player.growthHistory : [])
      .filter((entry) => num(entry?.seasonId) === input.seasonId);
    const usage = history.length ? history.reduce((sum, entry) => sum + num(entry?.usage), 0) / history.length : 0;
    const production = history.length ? history.reduce((sum, entry) => sum + num(entry?.production), 0) / history.length : 0;
    const wear = history.length ? history.reduce((sum, entry) => sum + num(entry?.wearDelta), 0) / history.length : 0;
    const totalWeeklyDelta = history.reduce((sum, entry) => sum + num(entry?.totalDelta), 0);
    const upsideGap = Math.max(0, num(player?.potential, num(player?.ovr, 70) + 3) - num(player?.ovr, 70));
    const age = num(player?.age, 25);
    const schemeFit = (num(player?.schemeFit, 50) - 50) / 100;
    const weights = getAttributeWeightMap(String(player?.pos ?? 'QB'));
    const xpSource = emptyXp();

    for (const [attr, weight] of Object.entries(weights)) {
      const youthWindow = age <= 24 ? 1.3 : age <= 28 ? 1 : age <= 31 ? 0.7 : 0.4;
      const usageSignal = usage >= 0.8 ? 4.5 : usage >= 0.5 ? 1.8 : usage >= 0.3 ? -0.4 : -3.8;
      const growthSignal = upsideGap * 0.18 + totalWeeklyDelta * 0.35 + production * 1.1 + schemeFit + deterministicCentered(input.seed, stamp, player.id, attr) * 0.8;
      const offseasonSignal = growthSignal * youthWindow + usageSignal - wear * (age >= 32 ? 1.6 : 0.8);
      xpSource[attr as keyof AttributesV2] = num(weight) * 3.25 * offseasonSignal;
    }

    const applied = applyPlayerAttributeXp(player, xpSource, {
      stage: 'offseason',
      usage,
      production,
      wearDelta: wear + num(player?.wearAndTear) * 0.05,
      teamFocus: input.teamFocusByTeamId?.[String(player.teamId ?? '')],
      seed: input.seed,
      stamp,
    });
    const progressionDelta = weightedOvrDelta(String(player?.pos ?? ''), applied.deltas);
    const boundedProgression = clamp(progressionDelta, age >= 32 ? -4 : -2, age <= 24 ? 4 : age <= 28 ? 3 : 2);
    const ovr = clamp(num(player?.ovr, 70) + boundedProgression, 45, 99);
    const potential = clamp(Math.max(ovr + 1, num(player?.potential, ovr + 3) + (age <= 24 && boundedProgression > 0 ? 1 : age >= 31 ? -1 : 0)), 48, 99);
    const note = buildDevelopmentFlash({ player, deltas: applied.deltas, usage: Math.max(usage, 0.55) });
    const trend = buildTrendLabel(age, usage, applied.totalDelta, applied.wearAndTear);

    updates.push({
      playerId: String(player.id),
      attributesV2: applied.attributesV2,
      attributeXp: applied.attributeXp,
      growthHistoryEntry: {
        seasonId: input.seasonId,
        week: 0,
        stage: 'offseason',
        stamp,
        deltas: applied.deltas,
        totalDelta: applied.totalDelta,
        notes: note ? [note] : [],
        usage: Number(usage.toFixed(3)),
        production: Number(production.toFixed(3)),
        wearDelta: Number(wear.toFixed(3)),
        trend,
      },
      notableNote: note ?? undefined,
      wearAndTear: applied.wearAndTear,
      developmentContext: {
        trend,
        recentUsage: Number(usage.toFixed(3)),
        wearAndTear: Math.round(applied.wearAndTear),
        breakoutCandidate: age <= 24 && usage >= 0.75 && boundedProgression >= 2,
        stalledProspect: age <= 25 && usage < 0.35 && upsideGap >= 6,
        veteranDeclineRisk: age >= 31 && boundedProgression < 0,
      },
      ovr,
      potential,
      progressionDelta: boundedProgression,
    });
  }

  const totalPositiveDelta = updates.reduce((sum, update) => sum + Object.values(update.growthHistoryEntry.deltas).reduce((inner, delta) => inner + Math.max(0, num(delta)), 0), 0);
  const totalNegativeDelta = updates.reduce((sum, update) => sum + Object.values(update.growthHistoryEntry.deltas).reduce((inner, delta) => inner + Math.abs(Math.min(0, num(delta))), 0), 0);

  return {
    updates,
    stamp,
    summary: {
      processedPlayers: updates.length,
      totalPositiveDelta,
      totalNegativeDelta,
      netDelta: totalPositiveDelta - totalNegativeDelta,
    },
    gainers: updates
      .filter((update) => update.progressionDelta > 0)
      .sort((a, b) => b.progressionDelta - a.progressionDelta)
      .slice(0, 8)
      .map((update) => ({ playerId: update.playerId, name: String(input.players.find((player) => String(player.id) === update.playerId)?.name ?? 'Player'), pos: String(input.players.find((player) => String(player.id) === update.playerId)?.pos ?? 'UNK'), delta: update.progressionDelta, tag: update.developmentContext?.breakoutCandidate ? 'breakout' : 'riser' })),
    regressors: updates
      .filter((update) => update.progressionDelta < 0)
      .sort((a, b) => a.progressionDelta - b.progressionDelta)
      .slice(0, 8)
      .map((update) => ({ playerId: update.playerId, name: String(input.players.find((player) => String(player.id) === update.playerId)?.name ?? 'Player'), pos: String(input.players.find((player) => String(player.id) === update.playerId)?.pos ?? 'UNK'), delta: update.progressionDelta, tag: update.developmentContext?.veteranDeclineRisk ? 'decline' : 'regression' })),
  };
}
