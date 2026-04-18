import type { AttributesV2 } from '../../types/player.ts';

export interface EvolutionPlayer {
  id: string | number;
  name?: string;
  pos?: string;
  age?: number;
  teamId?: number | string | null;
  attributesV2?: AttributesV2;
  attributeXp?: Partial<Record<keyof AttributesV2, number>>;
  growthHistory?: Array<Record<string, unknown>>;
  lastEvolutionWeek?: string | null;
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
}

export interface TeamDevelopmentFocus {
  trainingFocus?: string;
  intensity?: 'light' | 'normal' | 'hard' | string;
  drillType?: 'technique' | 'conditioning' | 'teamwork' | 'film' | string;
  positionGroups?: string[];
}

interface PlayerDevelopmentAccumulator {
  xp: Partial<Record<keyof AttributesV2, number>>;
  production: number;
}

export interface WeeklyEvolutionInput {
  players: EvolutionPlayer[];
  results: EvolutionGameResult[];
  week: number;
  seasonId: number;
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
    deltas: Partial<Record<keyof AttributesV2, number>>;
    totalDelta: number;
    notes: string[];
  };
  notableNote?: string;
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

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function makeStamp(seasonId: number, week: number) {
  return `${seasonId}:${week}`;
}

function emptyXp(): Partial<Record<keyof AttributesV2, number>> {
  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as Partial<Record<keyof AttributesV2, number>>);
}

function getAgeCurve(ageRaw: unknown) {
  const age = Math.round(num(ageRaw) || 25);
  if (age <= 23) return { growth: 1.3, maintenancePressure: 0.02 };
  if (age <= 25) return { growth: 1.15, maintenancePressure: 0.05 };
  if (age <= 28) return { growth: 0.95, maintenancePressure: 0.11 };
  if (age <= 30) return { growth: 0.82, maintenancePressure: 0.19 };
  if (age <= 33) return { growth: 0.68, maintenancePressure: 0.3 };
  return { growth: 0.55, maintenancePressure: 0.4 };
}

function addXp(acc: PlayerDevelopmentAccumulator, attribute: keyof AttributesV2, value: number) {
  if (!Number.isFinite(value) || value === 0) return;
  const current = num(acc.xp[attribute]);
  acc.xp[attribute] = current + value;
}

function deriveFocusMultiplier(playerPos: string, teamFocus?: TeamDevelopmentFocus) {
  if (!teamFocus) return 1;
  const trainingFocus = String(teamFocus.trainingFocus ?? 'balanced');
  const intensity = String(teamFocus.intensity ?? 'normal');
  const drillType = String(teamFocus.drillType ?? 'technique');
  const focusGroups = new Set((teamFocus.positionGroups ?? []).map((g) => String(g).toLowerCase()));

  let multiplier = 1;
  if (intensity === 'light') multiplier *= 0.94;
  if (intensity === 'hard') multiplier *= 1.06;

  if (drillType === 'film' && ['QB', 'WR', 'TE', 'CB', 'S', 'LB'].includes(playerPos)) multiplier *= 1.06;
  if (drillType === 'conditioning' && ['RB', 'WR', 'CB', 'S', 'DL', 'LB'].includes(playerPos)) multiplier *= 1.05;

  if (trainingFocus === 'youth_development') multiplier *= 1.08;
  if (trainingFocus === 'win_now' && ['QB', 'OL', 'DL', 'LB'].includes(playerPos)) multiplier *= 1.04;
  if (trainingFocus === 'strength_conditioning' && ['OL', 'DL', 'LB', 'TE'].includes(playerPos)) multiplier *= 1.07;

  if (focusGroups.size > 0) {
    const focused = Object.entries(POSITION_GROUPS).some(([group, positions]) => focusGroups.has(group) && positions.includes(playerPos));
    if (focused) multiplier *= 1.08;
  }

  return clamp(multiplier, 0.86, 1.2);
}

function summarizeNotableNote(pos: string, deltas: Partial<Record<keyof AttributesV2, number>>) {
  const ranked = Object.entries(deltas)
    .map(([attr, delta]) => ({ attr, delta: num(delta) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (!ranked.length || Math.abs(ranked[0].delta) < 1) return null;

  const top = ranked[0];
  if (pos === 'QB' && top.attr === 'pocketPresence' && top.delta > 0) {
    return 'Pocket presence gained from sustained clean-dropback volume.';
  }
  if (['WR', 'TE'].includes(pos) && top.attr === 'routeRunning' && top.delta > 0) {
    return 'Route running trend improved after high-volume usage.';
  }
  return null;
}

function applyPositionXp(
  acc: PlayerDevelopmentAccumulator,
  pos: string,
  stats: Record<string, number>,
  teamStats: Record<string, number>,
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

  if (pos === 'QB') {
    const usage = clamp((passAtt + sacks) / 34, 0, 1.4);
    const efficiency = passAtt > 0 ? (passComp / passAtt) * 0.8 + (passYd / passAtt) * 0.08 : 0;
    const production = efficiency + passTd * 0.25 - interceptions * 0.35 - sacks * 0.05;
    addXp(acc, 'throwAccuracyShort', usage * 4.2 + production * 2.2);
    addXp(acc, 'throwAccuracyDeep', usage * 3.3 + production * 2.6 + num(teamStats.explosivePlays) * 0.12);
    addXp(acc, 'decisionMaking', usage * 2.8 + production * 2.5);
    addXp(acc, 'pocketPresence', usage * 2.1 + (1 - clamp(sacks / Math.max(1, passAtt), 0, 1)) * 2.1);
    addXp(acc, 'throwPower', (passYd / Math.max(1, passAtt)) * 0.9 + passTd * 0.15);
    acc.production += production;
    return;
  }

  if (pos === 'RB' || pos === 'FB') {
    const touches = rushAtt + receptions;
    const usage = clamp(touches / 20, 0, 1.35);
    const ypc = rushAtt > 0 ? rushYd / rushAtt : 0;
    const production = ypc * 0.35 + rushTd * 0.25 + recYd * 0.012;
    addXp(acc, 'decisionMaking', usage * 2.1 + production * 0.9);
    addXp(acc, 'separation', receptions * 0.32 + production * 0.3);
    addXp(acc, 'catchInTraffic', receptions * 0.24 + targets * 0.1);
    addXp(acc, 'throwPower', rushAtt * 0.04 + rushYd * 0.012);
    acc.production += production;
    return;
  }

  if (pos === 'WR' || pos === 'TE') {
    const usage = clamp(targets / 10, 0, 1.45);
    const catchRate = targets > 0 ? receptions / targets : 0;
    const production = catchRate * 0.8 + recYd * 0.015 + recTd * 0.5;
    addXp(acc, 'release', usage * 1.8 + receptions * 0.38);
    addXp(acc, 'routeRunning', usage * 3.2 + production * 1.7);
    addXp(acc, 'separation', usage * 2.8 + production * 1.5 + num(teamStats.explosivePlays) * 0.1);
    addXp(acc, 'catchInTraffic', receptions * 0.25 + targets * 0.18 + recTd * 0.35);
    addXp(acc, 'ballTracking', recYd * 0.02 + recTd * 0.45);
    acc.production += production;
    return;
  }

  if (['OL', 'C', 'G', 'T'].includes(pos)) {
    const plays = num(teamStats.plays);
    const sackPenalty = num(teamStats.sacksAllowed) * 0.35;
    const runSupport = num(teamStats.rushYd) / Math.max(1, num(teamStats.rushAtt));
    const production = clamp((plays / 65) + runSupport * 0.5 - sackPenalty, -1.5, 2.5);
    addXp(acc, 'passBlockFootwork', plays * 0.06 + production * 2.1);
    addXp(acc, 'passBlockStrength', runSupport * 1.2 + production * 2.3);
    addXp(acc, 'decisionMaking', production * 0.6);
    acc.production += production;
    return;
  }

  if (['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB'].includes(pos)) {
    const pressures = num(stats.pressures);
    const sacksMade = num(stats.sacks);
    const tackles = num(stats.tackles);
    const production = sacksMade * 0.8 + pressures * 0.28 + tackles * 0.06;
    addXp(acc, 'passRush', production * 2.7 + num(teamStats.sacksMade) * 0.2);
    addXp(acc, 'decisionMaking', tackles * 0.08 + production * 0.45);
    addXp(acc, 'zoneCoverage', tackles * 0.04);
    acc.production += production;
    return;
  }

  if (['CB', 'S', 'FS', 'SS'].includes(pos)) {
    const ints = num(stats.interceptions);
    const tackles = num(stats.tackles);
    const production = passesDefended * 0.55 + ints * 1.2 + tackles * 0.05;
    addXp(acc, 'pressCoverage', production * 1.7 + passesDefended * 0.65);
    addXp(acc, 'zoneCoverage', production * 1.75 + ints * 0.4);
    addXp(acc, 'ballTracking', ints * 0.9 + passesDefended * 0.28);
    acc.production += production;
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

export function processWeeklyEvolution(input: WeeklyEvolutionInput): WeeklyEvolutionResult {
  const stamp = makeStamp(input.seasonId, input.week);
  const playersById = new Map<string, EvolutionPlayer>();
  for (const player of input.players) playersById.set(String(player.id), player);

  const accumulators = new Map<string, PlayerDevelopmentAccumulator>();
  const ensureAccumulator = (playerId: string) => {
    if (!accumulators.has(playerId)) accumulators.set(playerId, { xp: emptyXp(), production: 0 });
    return accumulators.get(playerId)!;
  };

  for (const game of input.results) {
    const sideEntries: Array<{ box: Record<string, { pos?: string; stats?: Record<string, number> }>; teamStats: Record<string, number>; teamId: number | string | undefined }> = [
      { box: game.boxScore?.home ?? {}, teamStats: game.teamDriveStats?.home ?? {}, teamId: game.home },
      { box: game.boxScore?.away ?? {}, teamStats: game.teamDriveStats?.away ?? {}, teamId: game.away },
    ];

    for (const side of sideEntries) {
      for (const [rawPlayerId, row] of Object.entries(side.box)) {
        const playerId = String(rawPlayerId);
        const player = playersById.get(playerId);
        if (!player?.attributesV2) continue;
        const stats = row?.stats ?? {};
        const pos = String(player.pos ?? row?.pos ?? '').toUpperCase();
        if (!pos) continue;
        const acc = ensureAccumulator(playerId);
        applyPositionXp(acc, pos, stats, side.teamStats);

        const focusKey = String(player.teamId ?? side.teamId ?? '');
        const focusMultiplier = deriveFocusMultiplier(pos, input.teamFocusByTeamId?.[focusKey]);
        for (const key of ATTRIBUTE_KEYS) {
          acc.xp[key] = num(acc.xp[key]) * focusMultiplier;
        }
      }
    }
  }

  const deltaRows: Array<{ playerId: string; attr: keyof AttributesV2; delta: number }> = [];
  for (const [playerId, acc] of accumulators.entries()) {
    const player = playersById.get(playerId);
    if (!player?.attributesV2) continue;
    const ageCurve = getAgeCurve(player.age);
    const productionSoftener = clamp(acc.production * 0.03, 0, 0.55);
    const veteranPenalty = Number(player.age ?? 0) >= 34 ? 5 : Number(player.age ?? 0) >= 31 ? 2 : 0;

    for (const attr of ATTRIBUTE_KEYS) {
      const agePressureXp = -(ageCurve.maintenancePressure * 12 * (1 - productionSoftener) + veteranPenalty);
      const xp = num(player.attributeXp?.[attr]) + num(acc.xp[attr]) * ageCurve.growth + agePressureXp;
      const boundedXp = clamp(xp, -140, 140);
      let delta = clamp(Math.trunc(boundedXp / 12), -2, 2);
      if (Number(player.age ?? 0) >= 34 && ['throwPower', 'separation', 'passRush', 'pressCoverage'].includes(attr)) {
        delta = Math.min(delta, -1);
      }
      deltaRows.push({ playerId, attr, delta });
    }
  }

  applyParityGuardrail(deltaRows, input.players.length);

  const deltasByPlayer = new Map<string, Partial<Record<keyof AttributesV2, number>>>();
  for (const row of deltaRows) {
    const existing = deltasByPlayer.get(row.playerId) ?? {};
    existing[row.attr] = row.delta;
    deltasByPlayer.set(row.playerId, existing);
  }

  const updates: PlayerEvolutionUpdate[] = [];
  const developmentEvents: WeeklyEvolutionResult['developmentEvents'] = [];

  for (const [playerId, deltas] of deltasByPlayer.entries()) {
    const player = playersById.get(playerId);
    if (!player?.attributesV2) continue;

    const nextAttributes = { ...player.attributesV2 };
    let totalDelta = 0;
    for (const key of ATTRIBUTE_KEYS) {
      const delta = num(deltas[key]);
      if (delta === 0) continue;
      totalDelta += delta;
      nextAttributes[key] = clamp(num(nextAttributes[key]) + delta, 25, 99);
    }

    const acc = accumulators.get(playerId);
    const nextXp: Partial<Record<keyof AttributesV2, number>> = { ...(player.attributeXp ?? {}) };
    const ageCurve = getAgeCurve(player.age);
    for (const key of ATTRIBUTE_KEYS) {
      const raw = num(player.attributeXp?.[key]) + num(acc?.xp[key]) * ageCurve.growth;
      const consumed = num(deltas[key]) * 12;
      nextXp[key] = clamp(raw - consumed, -140, 140);
    }

    const notes: string[] = [];
    if (Math.abs(totalDelta) >= 2 && (player.pos === 'QB' || player.pos === 'WR' || player.pos === 'TE')) {
      const note = summarizeNotableNote(String(player.pos ?? ''), deltas);
      if (note) notes.push(note);
    }

    const growthHistoryEntry = {
      seasonId: input.seasonId,
      week: input.week,
      deltas,
      totalDelta,
      notes,
    };

    updates.push({
      playerId,
      attributesV2: nextAttributes,
      attributeXp: nextXp,
      growthHistoryEntry,
      notableNote: notes[0],
    });

    if (notes[0]) {
      developmentEvents.push({
        playerId,
        teamId: player.teamId ?? null,
        week: input.week,
        seasonId: input.seasonId,
        note: notes[0],
      });
    }
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
