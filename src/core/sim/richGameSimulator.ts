import { resolveMatchup, DEFAULT_NORMALIZATION_CONSTANT } from './matchupEngine.ts';
import type { AttributesV2 } from '../../types/player.ts';
import type { DerivedGamePlanMultipliers } from './gamePlanMultipliers.ts';

export interface SimPlayerRef {
  id: number | string;
  name: string;
  pos: string;
  ovr?: number;
}

export interface TeamStatLine {
  plays: number;
  firstDowns: number;
  passAtt: number;
  passComp: number;
  passYd: number;
  passYards: number;
  passTD: number;
  rushAtt: number;
  rushYd: number;
  rushYards: number;
  rushTD: number;
  totalYards: number;
  yardsPerPlay: number;
  turnovers: number;
  sacksAllowed: number;
  sacksMade: number;
  interceptions: number;
  redZoneTrips: number;
  redZoneScores: number;
  explosivePlays: number;
  successRate: number;
  fieldGoalsMade: number;
  fieldGoalsAttempted: number;
  extraPointsMade: number;
  extraPointsAttempted: number;
  punts: number;
  puntYards: number;
  kickReturns: number;
  kickReturnYards: number;
  puntReturns: number;
  puntReturnYards: number;
}

export interface GameEventDigestItem {
  quarter: number;
  clockSec: number;
  team: 'home' | 'away' | 'neutral';
  type: 'touchdown' | 'field_goal' | 'turnover' | 'sack' | 'explosive_play' | 'lead_change' | 'swing' | 'final_takeaway';
  text: string;
  homeScore: number;
  awayScore: number;
}

export interface AdvancedGameStats {
  targets: number;
  receptionsAllowed: number;
  coverageTargets: number;
  coverageCompletionsAllowed: number;
  drops: number;
  battedPasses: number;
  sacksAllowed: number;
  sacksMade: number;
}

export interface RichGameSummary {
  gameId: number | string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  totalPlays: number;
  homePassYards: number;
  awayPassYards: number;
  homeSuccessRate: number;
  awaySuccessRate: number;
  normalizationConstant: number;
  topReason1: string | null;
  topReason2: string | null;
  quarterScores: { home: number[]; away: number[] };
  teamStats: { home: TeamStatLine; away: TeamStatLine };
  boxScore: {
    home: Record<string, { name: string; pos: string; stats: Record<string, number> }>;
    away: Record<string, { name: string; pos: string; stats: Record<string, number> }>;
  };
  playDigest: GameEventDigestItem[];
  scoringSummary: Array<{
    id: string;
    quarter: number;
    clock: string;
    teamId: number;
    teamAbbr: string;
    type: string;
    scoreType: string;
    points: number;
    text: string;
    scoreAfter: { home: number; away: number };
  }>;
  playLogs: Array<{ quarter: number; clockSec: number; text: string; scoreHomeAfter: number; scoreAwayAfter: number }>;
  summary: {
    storyline: string;
    headlineMoments: string[];
  };
  recapText: string;
  advancedAttribution?: Record<string, AdvancedGameStats>;
  simFactors: {
    home: { qbRating: number; rushYpc: number; successRate: number; passRate: number };
    away: { qbRating: number; rushYpc: number; successRate: number; passRate: number };
  };
}

export interface RichMatchupPayload {
  gameId: number | string;
  seed?: number;
  weather?: 'clear' | 'rain' | 'snow' | 'wind';
  normalizationConstant?: number;
  homeTeamId: number;
  awayTeamId: number;
  homeOffense: AttributesV2;
  awayOffense: AttributesV2;
  homeDefense: AttributesV2;
  awayDefense: AttributesV2;
  homePlayers?: SimPlayerRef[];
  awayPlayers?: SimPlayerRef[];
  homePrepMultipliers?: DerivedGamePlanMultipliers;
  awayPrepMultipliers?: DerivedGamePlanMultipliers;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const NEUTRAL_PREP: DerivedGamePlanMultipliers = {
  passSuccessDelta: 0,
  rushSuccessDelta: 0,
  explosivePlayDelta: 0,
  turnoverAvoidanceDelta: 0,
  redZoneDelta: 0,
  fatigueDisciplineDelta: 0,
  chemistryPenalty: 0,
  score: 0,
  netImpact: 0,
  severity: 'ready',
  activeReasons: [],
};

function applyPrepToOffenseAttributes(
  offense: AttributesV2,
  prep: DerivedGamePlanMultipliers,
  playType: 'pass' | 'run',
  isRedZone: boolean,
): AttributesV2 {
  const passDelta = prep.passSuccessDelta + prep.chemistryPenalty;
  const rushDelta = prep.rushSuccessDelta + prep.chemistryPenalty;
  const explosiveDelta = prep.explosivePlayDelta;
  const disciplineDelta = prep.turnoverAvoidanceDelta + prep.fatigueDisciplineDelta;
  const redZoneDelta = isRedZone ? prep.redZoneDelta : 0;

  const passBoost = playType === 'pass' ? passDelta : 0;
  const runBoost = playType === 'run' ? rushDelta : 0;

  const point = (value: number, delta: number, scale = 42) => clamp(value + (delta * scale), 25, 99);
  return {
    ...offense,
    throwAccuracyShort: point(offense.throwAccuracyShort, passBoost + disciplineDelta * 0.35 + redZoneDelta * 0.25),
    throwAccuracyDeep: point(offense.throwAccuracyDeep, passBoost * 0.85 + explosiveDelta + redZoneDelta * 0.2),
    throwPower: point(offense.throwPower, explosiveDelta * 0.75 + passBoost * 0.3),
    release: point(offense.release, passBoost * 0.8 + disciplineDelta * 0.25),
    routeRunning: point(offense.routeRunning, passBoost * 0.75 + explosiveDelta * 0.4),
    separation: point(offense.separation, passBoost * 0.7 + explosiveDelta * 0.5),
    catchInTraffic: point(offense.catchInTraffic, disciplineDelta * 0.65 + redZoneDelta * 0.4),
    ballTracking: point(offense.ballTracking, explosiveDelta * 0.7 + passBoost * 0.25),
    decisionMaking: point(offense.decisionMaking, disciplineDelta * 0.9 + passBoost * 0.2 + runBoost * 0.2),
    pocketPresence: point(offense.pocketPresence, disciplineDelta * 0.75 + passBoost * 0.2),
    passBlockFootwork: point(offense.passBlockFootwork, passBoost * 0.3 + runBoost * 0.45 + disciplineDelta * 0.25),
    passBlockStrength: point(offense.passBlockStrength, runBoost * 0.65 + disciplineDelta * 0.4 + redZoneDelta * 0.2),
  };
}

function makeRng(seed = 1): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function getPlayType(
  state: { down: number; distance: number; quarter: number; clockSec: number; homeScore: number; awayScore: number; possession: 'home' | 'away' },
  rng: () => number,
  prep: DerivedGamePlanMultipliers,
): 'pass' | 'run' {
  const offenseLead = state.possession === 'home' ? state.homeScore - state.awayScore : state.awayScore - state.homeScore;
  let passProb = 0.49;
  if (state.down === 1) passProb -= 0.06;
  if (state.down === 2 && state.distance <= 5) passProb -= 0.05;
  if (state.down === 3 && state.distance >= 7) passProb += 0.21;
  if (state.down === 4) passProb += state.distance >= 2 ? 0.33 : 0.1;
  if (state.distance >= 10) passProb += 0.1;
  if (state.distance <= 2) passProb -= 0.07;
  if (state.quarter === 4 && state.clockSec <= 240 && offenseLead < 0) passProb += 0.2;
  if (state.quarter === 4 && state.clockSec <= 240 && offenseLead > 7) passProb -= 0.16;
  if (state.quarter >= 3 && offenseLead >= 10) passProb -= 0.08;
  if (state.quarter >= 3 && offenseLead <= -10) passProb += 0.08;

  const prepPassBias = clamp((prep.passSuccessDelta - prep.rushSuccessDelta) * 1.4, -0.05, 0.05);
  passProb = clamp(passProb + prepPassBias + (rng() - 0.5) * 0.1, 0.25, 0.82);
  return rng() <= passProb ? 'pass' : 'run';
}

function defaultPlayers(teamId: number, side: 'home' | 'away'): SimPlayerRef[] {
  const prefix = side === 'home' ? 'H' : 'A';
  return [
    { id: `${teamId}-${prefix}-QB1`, name: `${prefix} QB1`, pos: 'QB', ovr: 78 },
    { id: `${teamId}-${prefix}-RB1`, name: `${prefix} RB1`, pos: 'RB', ovr: 76 },
    { id: `${teamId}-${prefix}-RB2`, name: `${prefix} RB2`, pos: 'RB', ovr: 73 },
    { id: `${teamId}-${prefix}-WR1`, name: `${prefix} WR1`, pos: 'WR', ovr: 79 },
    { id: `${teamId}-${prefix}-WR2`, name: `${prefix} WR2`, pos: 'WR', ovr: 75 },
    { id: `${teamId}-${prefix}-TE1`, name: `${prefix} TE1`, pos: 'TE', ovr: 74 },
    { id: `${teamId}-${prefix}-EDGE1`, name: `${prefix} EDGE1`, pos: 'EDGE', ovr: 77 },
    { id: `${teamId}-${prefix}-LB1`, name: `${prefix} LB1`, pos: 'LB', ovr: 75 },
    { id: `${teamId}-${prefix}-CB1`, name: `${prefix} CB1`, pos: 'CB', ovr: 77 },
    { id: `${teamId}-${prefix}-S1`, name: `${prefix} S1`, pos: 'S', ovr: 74 },
    { id: `${teamId}-${prefix}-K1`, name: `${prefix} K1`, pos: 'K', ovr: 73 },
    { id: `${teamId}-${prefix}-P1`, name: `${prefix} P1`, pos: 'P', ovr: 72 },
  ];
}


function pickWeightedPlayer(players: SimPlayerRef[], rng: () => number, weight: (p: SimPlayerRef) => number): SimPlayerRef | null {
  if (!players.length) return null;
  const idx = chooseWeightedIndex(players.map((player) => weight(player)), rng);
  return players[idx] ?? players[0] ?? null;
}

function chooseWeightedIndex(weights: number[], rng: () => number): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return 0;
  const target = rng() * total;
  let rolling = 0;
  for (let i = 0; i < weights.length; i += 1) {
    rolling += Math.max(0, weights[i]);
    if (rolling >= target) return i;
  }
  return weights.length - 1;
}

function distributeTotal(total: number, contributors: SimPlayerRef[], rng: () => number, weightFn: (p: SimPlayerRef, idx: number) => number): number[] {
  const allocations = new Array(contributors.length).fill(0);
  if (contributors.length === 0 || total <= 0) return allocations;
  const weights = contributors.map(weightFn);
  for (let i = 0; i < total; i += 1) {
    const idx = chooseWeightedIndex(weights, rng);
    allocations[idx] += 1;
  }
  return allocations;
}

function toBoxScore(players: SimPlayerRef[], statsById: Record<string, Record<string, number>>) {
  const box: Record<string, { name: string; pos: string; stats: Record<string, number> }> = {};
  for (const player of players) {
    const key = String(player.id);
    if (!statsById[key]) continue;
    box[key] = {
      name: player.name,
      pos: player.pos,
      stats: statsById[key],
    };
  }
  return box;
}

function buildQbRating(passComp: number, passAtt: number, passYd: number, passTd: number, interceptions: number): number {
  if (passAtt <= 0) return 78;
  const completionPct = passComp / passAtt;
  const yardsPerAttempt = passYd / passAtt;
  const tdRate = passTd / passAtt;
  const intRate = interceptions / passAtt;
  const rating = (((completionPct - 0.3) * 5 + (yardsPerAttempt - 3) * 0.25 + tdRate * 20 + 2.375 - intRate * 25) / 6) * 100;
  return Math.round(clamp(rating, 20, 158.3) * 10) / 10;
}

function formatClock(clockSec: number): string {
  const safe = Math.max(0, Math.round(clockSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function addStats(target: Record<string, number>, patch: Record<string, number>) {
  for (const [key, value] of Object.entries(patch)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function pushDigest(
  digest: GameEventDigestItem[],
  entry: Omit<GameEventDigestItem, 'homeScore' | 'awayScore'>,
  score: { homeScore: number; awayScore: number },
) {
  digest.push({ ...entry, homeScore: score.homeScore, awayScore: score.awayScore });
}

export function simulateRichGame(payload: RichMatchupPayload): RichGameSummary {
  const rng = makeRng(payload.seed ?? 1);
  const homePlayers = (payload.homePlayers?.length ? payload.homePlayers : defaultPlayers(payload.homeTeamId, 'home')).map((p) => ({ ...p, id: String(p.id) }));
  const awayPlayers = (payload.awayPlayers?.length ? payload.awayPlayers : defaultPlayers(payload.awayTeamId, 'away')).map((p) => ({ ...p, id: String(p.id) }));

  const state = {
    homeScore: 0,
    awayScore: 0,
    quarter: 1,
    clockSec: 900,
    down: 1,
    distance: 10,
    yardLine: 25,
    possession: 'home' as 'home' | 'away',
    normalizationConstant: payload.normalizationConstant ?? DEFAULT_NORMALIZATION_CONSTANT,
  };

  const quarterScores = { home: [0, 0, 0, 0], away: [0, 0, 0, 0] };
  const digest: GameEventDigestItem[] = [];
  const reasonMap = new Map<string, number>();
  const homePrep = payload.homePrepMultipliers ?? NEUTRAL_PREP;
  const awayPrep = payload.awayPrepMultipliers ?? NEUTRAL_PREP;
  const advancedAttribution = new Map<string, AdvancedGameStats>();

  const stats = {
    home: { plays: 0, passAtt: 0, passComp: 0, passYd: 0, passTD: 0, rushAtt: 0, rushYd: 0, rushTD: 0, firstDowns: 0, turnovers: 0, sacksAllowed: 0, sacksMade: 0, interceptions: 0, redZoneTrips: 0, redZoneScores: 0, explosivePlays: 0, success: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, extraPointsMade: 0, extraPointsAttempted: 0, punts: 0, puntYards: 0, kickReturns: 0, kickReturnYards: 0, puntReturns: 0, puntReturnYards: 0 },
    away: { plays: 0, passAtt: 0, passComp: 0, passYd: 0, passTD: 0, rushAtt: 0, rushYd: 0, rushTD: 0, firstDowns: 0, turnovers: 0, sacksAllowed: 0, sacksMade: 0, interceptions: 0, redZoneTrips: 0, redZoneScores: 0, explosivePlays: 0, success: 0, fieldGoalsMade: 0, fieldGoalsAttempted: 0, extraPointsMade: 0, extraPointsAttempted: 0, punts: 0, puntYards: 0, kickReturns: 0, kickReturnYards: 0, puntReturns: 0, puntReturnYards: 0 },
  };

  while (state.quarter <= 4 && (stats.home.plays + stats.away.plays) < 184) {
    const offense = state.possession === 'home' ? payload.homeOffense : payload.awayOffense;
    const defense = state.possession === 'home' ? payload.awayDefense : payload.homeDefense;
    const offenseStats = state.possession === 'home' ? stats.home : stats.away;
    const defenseStats = state.possession === 'home' ? stats.away : stats.home;
    const prevLead = state.homeScore - state.awayScore;
    const wasRedZone = state.yardLine >= 80;
    const wasFourthDown = state.down === 4;

    const offensePrep = state.possession === 'home' ? homePrep : awayPrep;
    const playType = getPlayType(state, rng, offensePrep);
    const offensePlayers = state.possession === 'home' ? homePlayers : awayPlayers;
    const defensePlayers = state.possession === 'home' ? awayPlayers : homePlayers;
    const target = playType === 'pass' ? pickWeightedPlayer(offensePlayers.filter((player) => ['WR', 'TE', 'RB'].includes(player.pos)), rng, (player) => (player.ovr ?? 70) + (player.pos === 'WR' ? 12 : player.pos === 'TE' ? 8 : 5)) : null;
    const defender = playType === 'pass' ? pickWeightedPlayer(defensePlayers.filter((player) => ['CB', 'S', 'FS', 'SS', 'LB'].includes(player.pos)), rng, (player) => (player.ovr ?? 70) + (player.pos === 'CB' ? 10 : 6)) : null;
    const blocker = pickWeightedPlayer(offensePlayers.filter((player) => ['OT', 'OG', 'C', 'TE', 'RB', 'QB'].includes(player.pos)), rng, (player) => (player.ovr ?? 70) + (player.pos === 'QB' ? -10 : 0));
    const rusher = pickWeightedPlayer(defensePlayers.filter((player) => ['EDGE', 'DE', 'DT', 'LB'].includes(player.pos)), rng, (player) => (player.ovr ?? 70) + (player.pos === 'EDGE' ? 12 : 6));
    const tunedOffense = applyPrepToOffenseAttributes(offense, offensePrep, playType, state.yardLine >= 80);
    const fatigueBaseline = (stats.home.plays + stats.away.plays) / 220;
    const result = resolveMatchup(tunedOffense, defense, {
      down: state.down,
      distance: state.distance,
      yardLine: state.yardLine,
      quarter: state.quarter,
      clockSec: state.clockSec,
      weather: payload.weather,
      normalizationConstant: state.normalizationConstant,
      fatigueFactor: clamp(fatigueBaseline - offensePrep.fatigueDisciplineDelta * 0.35, 0, 0.95),
      playType,
      targetId: target?.id != null ? String(target.id) : undefined,
      defenderId: defender?.id != null ? String(defender.id) : undefined,
      blockerId: blocker?.id != null ? String(blocker.id) : undefined,
      rusherId: rusher?.id != null ? String(rusher.id) : undefined,
    }, rng);

    offenseStats.plays += 1;
    if (playType === 'pass') {
      offenseStats.passAtt += 1;
      if (result.success) offenseStats.passComp += 1;
      offenseStats.passYd += result.yardsGained;
    } else {
      offenseStats.rushAtt += 1;
      offenseStats.rushYd += result.yardsGained;
    }

    reasonMap.set(result.reason, (reasonMap.get(result.reason) ?? 0) + 1);
    if (result.success) offenseStats.success += 1;
    if (result.firstDown) offenseStats.firstDowns += 1;
    if (result.isSack) {
      offenseStats.sacksAllowed += 1;
      defenseStats.sacksMade += 1;
      pushDigest(digest, { quarter: state.quarter, clockSec: state.clockSec, team: state.possession === 'home' ? 'away' : 'home', type: 'sack', text: `${state.possession === 'home' ? 'Away' : 'Home'} defense generated a drive-killing sack.` }, state);
    }

    for (const event of result.attributionEvents ?? []) {
      if (!event.playerId) continue;
      const prev = advancedAttribution.get(event.playerId) ?? {
        targets: 0,
        receptionsAllowed: 0,
        coverageTargets: 0,
        coverageCompletionsAllowed: 0,
        drops: 0,
        battedPasses: 0,
        sacksAllowed: 0,
        sacksMade: 0,
      };
      switch (event.type) {
        case 'TARGET': prev.targets += 1; break;
        case 'RECEPTION_ALLOWED': prev.receptionsAllowed += 1; break;
        case 'COVERAGE_TARGET': prev.coverageTargets += 1; break;
        case 'COVERAGE_COMPLETION_ALLOWED': prev.coverageCompletionsAllowed += 1; break;
        case 'DROP': prev.drops += 1; break;
        case 'BATTED_PASS': prev.battedPasses += 1; break;
        case 'SACK_ALLOWED': prev.sacksAllowed += 1; break;
        case 'SACK_MADE': prev.sacksMade += 1; break;
      }
      advancedAttribution.set(event.playerId, prev);
    }

    if (Math.abs(result.yardsGained) >= 20 && result.yardsGained > 0) {
      offenseStats.explosivePlays += 1;
      pushDigest(digest, { quarter: state.quarter, clockSec: state.clockSec, team: state.possession, type: 'explosive_play', text: `${state.possession === 'home' ? 'Home' : 'Away'} offense popped an explosive ${result.playType} play.` }, state);
    }

    const priorQuarter = state.quarter;
    state.clockSec = Math.max(0, state.clockSec - result.clockElapsedSec);

    if (result.turnover) {
      offenseStats.turnovers += 1;
      if (result.turnoverType === 'interception') defenseStats.interceptions += 1;
      pushDigest(digest, { quarter: state.quarter, clockSec: state.clockSec, team: state.possession === 'home' ? 'away' : 'home', type: 'turnover', text: `${result.turnoverType === 'interception' ? 'Interception' : 'Fumble'} flips possession.` }, state);
      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.down = 1;
      state.distance = 10;
      state.yardLine = clamp(100 - result.nextYardLine, 20, 85);
    } else if (result.nextYardLine >= 100) {
      if (state.possession === 'home') {
        state.homeScore += 7;
        quarterScores.home[Math.max(0, priorQuarter - 1)] += 7;
      } else {
        state.awayScore += 7;
        quarterScores.away[Math.max(0, priorQuarter - 1)] += 7;
      }
      if (playType === 'pass') offenseStats.passTD += 1;
      else offenseStats.rushTD += 1;
      offenseStats.extraPointsMade += 1;
      offenseStats.extraPointsAttempted += 1;
      const returnStats = state.possession === 'home' ? stats.away : stats.home;
      returnStats.kickReturns += 1;
      returnStats.kickReturnYards += Math.max(12, Math.round(18 + rng() * 18));
      if (wasRedZone) offenseStats.redZoneScores += 1;
      pushDigest(digest, { quarter: state.quarter, clockSec: state.clockSec, team: state.possession, type: 'touchdown', text: `${state.possession === 'home' ? 'Home' : 'Away'} offense finished the drive with a touchdown.` }, state);
      state.possession = state.possession === 'home' ? 'away' : 'home';
      state.down = 1;
      state.distance = 10;
      state.yardLine = 25;
    } else if (wasFourthDown && !result.success) {
      const fieldGoalRange = result.nextYardLine >= 68;
      if (fieldGoalRange && rng() <= (result.nextYardLine >= 82 ? 0.92 : 0.7)) {
        offenseStats.fieldGoalsAttempted += 1;
        offenseStats.fieldGoalsMade += 1;
        if (state.possession === 'home') {
          state.homeScore += 3;
          quarterScores.home[Math.max(0, priorQuarter - 1)] += 3;
        } else {
          state.awayScore += 3;
          quarterScores.away[Math.max(0, priorQuarter - 1)] += 3;
        }
        if (wasRedZone) offenseStats.redZoneScores += 1;
        pushDigest(digest, { quarter: state.quarter, clockSec: state.clockSec, team: state.possession, type: 'field_goal', text: `${state.possession === 'home' ? 'Home' : 'Away'} cashes in a field goal.` }, state);
        state.possession = state.possession === 'home' ? 'away' : 'home';
        state.down = 1;
        state.distance = 10;
        state.yardLine = 25;
      } else {
        if (fieldGoalRange) {
          offenseStats.fieldGoalsAttempted += 1;
        } else {
          offenseStats.punts += 1;
          offenseStats.puntYards += Math.max(34, Math.round(40 + rng() * 18));
          const returnStats = state.possession === 'home' ? stats.away : stats.home;
          const puntReturned = rng() < 0.55 ? 1 : 0;
          returnStats.puntReturns += puntReturned;
          returnStats.puntReturnYards += puntReturned ? Math.max(0, Math.round(rng() * 18)) : 0;
        }
        state.possession = state.possession === 'home' ? 'away' : 'home';
        state.down = 1;
        state.distance = 10;
        state.yardLine = clamp(100 - result.nextYardLine, 20, 90);
      }
    } else {
      state.down = result.nextDown;
      state.distance = result.nextDistance;
      state.yardLine = result.nextYardLine;
    }

    if (wasRedZone && result.nextYardLine < 80) {
      offenseStats.redZoneTrips += 1;
    }

    const nextLead = state.homeScore - state.awayScore;
    if ((prevLead <= 0 && nextLead > 0) || (prevLead >= 0 && nextLead < 0)) {
      pushDigest(digest, { quarter: state.quarter, clockSec: state.clockSec, team: 'neutral', type: 'lead_change', text: 'Lead changed hands.' }, state);
    }

    if (state.quarter === 4 && state.clockSec <= 120 && Math.abs(nextLead) <= 8 && Math.abs(prevLead - nextLead) >= 3) {
      pushDigest(digest, { quarter: state.quarter, clockSec: state.clockSec, team: 'neutral', type: 'swing', text: 'Late-game swing tightened the finish.' }, state);
    }

    if (state.clockSec <= 0) {
      if (state.quarter < 4) {
        state.quarter += 1;
        state.clockSec = 900;
      } else {
        break;
      }
    }
  }

  pushDigest(digest, { quarter: 4, clockSec: 0, team: 'neutral', type: 'final_takeaway', text: `${state.homeScore === state.awayScore ? 'Game ends level' : `${state.homeScore > state.awayScore ? 'Home' : 'Away'} closes it out`} in a ${Math.abs(state.homeScore - state.awayScore)}-point game.` }, state);

  const topReasons = [...reasonMap.entries()].sort((a, b) => b[1] - a[1]).map(([reason]) => reason).slice(0, 2);

  const buildTeamLine = (s: typeof stats.home): TeamStatLine => {
    const totalYards = s.passYd + s.rushYd;
    return {
      plays: s.plays,
      firstDowns: s.firstDowns,
      passAtt: s.passAtt,
      passComp: s.passComp,
      passYd: s.passYd,
      passYards: s.passYd,
      passTD: s.passTD,
      rushAtt: s.rushAtt,
      rushYd: s.rushYd,
      rushYards: s.rushYd,
      rushTD: s.rushTD,
      totalYards,
      yardsPerPlay: Number((totalYards / Math.max(1, s.plays)).toFixed(2)),
      turnovers: s.turnovers,
      sacksAllowed: s.sacksAllowed,
      sacksMade: s.sacksMade,
      interceptions: s.interceptions,
      redZoneTrips: s.redZoneTrips,
      redZoneScores: s.redZoneScores,
      explosivePlays: s.explosivePlays,
      successRate: Number((s.success / Math.max(1, s.plays)).toFixed(3)),
      fieldGoalsMade: s.fieldGoalsMade,
      fieldGoalsAttempted: s.fieldGoalsAttempted,
      extraPointsMade: s.extraPointsMade,
      extraPointsAttempted: s.extraPointsAttempted,
      punts: s.punts,
      puntYards: s.puntYards,
      kickReturns: s.kickReturns,
      kickReturnYards: s.kickReturnYards,
      puntReturns: s.puntReturns,
      puntReturnYards: s.puntReturnYards,
    };
  };

  const homeTeamLine = buildTeamLine(stats.home);
  const awayTeamLine = buildTeamLine(stats.away);

  const allocatePlayers = (players: SimPlayerRef[], offense: TeamStatLine, defense: TeamStatLine, rngFn: () => number) => {
    const qb = players.filter((p) => p.pos === 'QB');
    const rushers = players.filter((p) => ['RB', 'QB', 'WR'].includes(p.pos));
    const targets = players.filter((p) => ['WR', 'TE', 'RB'].includes(p.pos));
    const sackers = players.filter((p) => ['EDGE', 'DE', 'DT', 'LB'].includes(p.pos));
    const ballhawks = players.filter((p) => ['CB', 'S', 'FS', 'SS', 'LB'].includes(p.pos));

    const statsById: Record<string, Record<string, number>> = {};
    const put = (id: string, patch: Record<string, number>) => {
      statsById[id] = { ...(statsById[id] ?? {}), ...patch };
    };

    const primaryQb = qb[0] ?? players[0];
    put(String(primaryQb.id), {
      passAtt: offense.passAtt,
      passComp: offense.passComp,
      passYd: offense.passYd,
      passTD: offense.passTD,
      interceptions: offense.turnovers,
      rushAtt: Math.max(0, Math.round(offense.rushAtt * 0.09)),
      rushYd: Math.max(0, Math.round(offense.rushYd * 0.07)),
      sacksTaken: offense.sacksAllowed,
      sacked: offense.sacksAllowed,
      passerRating: buildQbRating(offense.passComp, offense.passAtt, offense.passYd, offense.passTD, offense.turnovers),
    });

    const rushAttemptRemainder = Math.max(0, offense.rushAtt - Math.round(offense.rushAtt * 0.09));
    const rushYardRemainder = Math.max(0, offense.rushYd - Math.round(offense.rushYd * 0.07));
    const rushersPool = rushers.length ? rushers : [primaryQb];
    const rushAttemptParts = distributeTotal(rushAttemptRemainder, rushersPool, rngFn, (p, idx) => (p.pos === 'RB' ? 3 : (p.pos === 'WR' ? 1.2 : 0.8)) + (p.ovr ?? 70) / 60 - idx * 0.2);
    const rushYardParts = distributeTotal(rushYardRemainder, rushersPool, rngFn, (p) => (p.pos === 'RB' ? 2.8 : 1.1) + (p.ovr ?? 70) / 65);
    for (let i = 0; i < rushersPool.length; i += 1) {
      const pid = String(rushersPool[i].id);
      put(pid, {
        rushAtt: (statsById[pid]?.rushAtt ?? 0) + rushAttemptParts[i],
        rushYd: (statsById[pid]?.rushYd ?? 0) + rushYardParts[i],
        fumbles: (statsById[pid]?.fumbles ?? 0) + (rushAttemptParts[i] >= 8 && rngFn() < 0.08 ? 1 : 0),
      });
    }

    const targetPool = targets.length ? targets : players.slice(0, 3);
    const recParts = distributeTotal(offense.passComp, targetPool, rngFn, (p, idx) => (p.pos === 'WR' ? 2.5 : p.pos === 'TE' ? 1.8 : 1.3) + (p.ovr ?? 70) / 70 - idx * 0.08);
    const recYardParts = distributeTotal(Math.max(0, offense.passYd), targetPool, rngFn, (p) => (p.pos === 'WR' ? 2.6 : p.pos === 'TE' ? 1.9 : 1.2) + (p.ovr ?? 70) / 75);
    const recTdParts = distributeTotal(offense.passTD, targetPool, rngFn, (p) => (p.pos === 'TE' ? 1.4 : 1.8) + (p.ovr ?? 70) / 90);
    for (let i = 0; i < targetPool.length; i += 1) {
      const pid = String(targetPool[i].id);
      put(pid, {
        targets: (statsById[pid]?.targets ?? 0) + recParts[i] + Math.round(rngFn() * 2),
        receptions: (statsById[pid]?.receptions ?? 0) + recParts[i],
        recYd: (statsById[pid]?.recYd ?? 0) + recYardParts[i],
        recTD: (statsById[pid]?.recTD ?? 0) + recTdParts[i],
        drops: (statsById[pid]?.drops ?? 0) + Math.max(0, Math.round((recParts[i] + rngFn() * 2 - recParts[i]) * 0.35)),
      });
    }

    const sackPool = sackers.length ? sackers : players.slice(0, 4);
    const sackParts = distributeTotal(defense.sacksMade, sackPool, rngFn, (p) => (p.pos === 'EDGE' ? 2.8 : p.pos === 'DE' ? 2.3 : 1.5) + (p.ovr ?? 70) / 70);
    for (let i = 0; i < sackPool.length; i += 1) {
      const pid = String(sackPool[i].id);
      put(pid, { sacks: (statsById[pid]?.sacks ?? 0) + sackParts[i] });
    }

    const intPool = ballhawks.length ? ballhawks : players.slice(0, 4);
    const intParts = distributeTotal(defense.interceptions, intPool, rngFn, (p) => (p.pos === 'CB' || p.pos === 'S' ? 2.3 : 1.2) + (p.ovr ?? 70) / 90);
    for (let i = 0; i < intPool.length; i += 1) {
      const pid = String(intPool[i].id);
      put(pid, { interceptions: (statsById[pid]?.interceptions ?? 0) + intParts[i] });
    }

    const tacklerPool = players.filter((p) => ['LB', 'S', 'FS', 'SS', 'CB', 'EDGE', 'DE', 'DT'].includes(p.pos));
    const defensePool = tacklerPool.length ? tacklerPool : players.slice(0, 6);
    const tackleTotal = Math.max(38, Math.round(defense.plays * 0.82));
    const tackleParts = distributeTotal(tackleTotal, defensePool, rngFn, (p) => (p.pos === 'LB' ? 2.6 : p.pos === 'S' ? 2.1 : p.pos === 'CB' ? 1.5 : 1.2) + (p.ovr ?? 70) / 80);
    const tflParts = distributeTotal(Math.max(0, Math.round(defense.rushAtt * 0.09)), defensePool, rngFn, (p) => (['EDGE', 'DE', 'DT', 'LB'].includes(p.pos) ? 2.2 : 0.7) + (p.ovr ?? 70) / 90);
    const pdParts = distributeTotal(Math.max(0, Math.round(defense.passAtt * 0.16)), intPool, rngFn, (p) => (['CB', 'S', 'FS', 'SS'].includes(p.pos) ? 2.2 : 0.9) + (p.ovr ?? 70) / 90);
    const ffParts = distributeTotal(defense.turnovers, defensePool, rngFn, (p) => (['EDGE', 'DE', 'DT', 'LB'].includes(p.pos) ? 1.9 : 1.1) + (p.ovr ?? 70) / 90);
    const frParts = distributeTotal(Math.max(0, defense.turnovers - defense.interceptions), defensePool, rngFn, (p) => 1 + (p.ovr ?? 70) / 100);
    for (let i = 0; i < defensePool.length; i += 1) {
      const pid = String(defensePool[i].id);
      addStats(statsById[pid] ?? (statsById[pid] = {}), {
        tackles: tackleParts[i] ?? 0,
        tfl: tflParts[i] ?? 0,
        tacklesForLoss: tflParts[i] ?? 0,
        forcedFumbles: ffParts[i] ?? 0,
        fumbleRecoveries: frParts[i] ?? 0,
      });
    }
    for (let i = 0; i < intPool.length; i += 1) {
      const pid = String(intPool[i].id);
      addStats(statsById[pid] ?? (statsById[pid] = {}), {
        passesDefended: pdParts[i] ?? 0,
      });
    }

    const kicker = players.find((p) => p.pos === 'K');
    if (kicker) {
      const pid = String(kicker.id);
      put(pid, {
        fieldGoalsMade: offense.fieldGoalsMade,
        fieldGoalsAttempted: offense.fieldGoalsAttempted,
        extraPointsMade: offense.extraPointsMade,
        extraPointsAttempted: offense.extraPointsAttempted,
        fieldGoalPct: offense.fieldGoalsAttempted > 0 ? Number(((offense.fieldGoalsMade / offense.fieldGoalsAttempted) * 100).toFixed(1)) : 0,
        points: offense.fieldGoalsMade * 3 + offense.extraPointsMade,
      });
    }

    const punter = players.find((p) => p.pos === 'P');
    if (punter) {
      const pid = String(punter.id);
      put(pid, {
        punts: offense.punts,
        puntYards: offense.puntYards,
        puntAvg: offense.punts > 0 ? Number((offense.puntYards / offense.punts).toFixed(1)) : 0,
        puntLong: offense.punts > 0 ? Math.max(34, Math.round(offense.puntYards / Math.max(1, offense.punts) + 8)) : 0,
      });
    }

    const returnerPool = players.filter((p) => ['WR', 'RB', 'CB', 'S'].includes(p.pos));
    const returner = returnerPool[0] ?? players[0];
    if (returner) {
      const pid = String(returner.id);
      addStats(statsById[pid] ?? (statsById[pid] = {}), {
        kickReturns: offense.kickReturns,
        kickReturnYards: offense.kickReturnYards,
        puntReturns: offense.puntReturns,
        puntReturnYards: offense.puntReturnYards,
      });
    }

    return toBoxScore(players, statsById);
  };

  const homeBox = allocatePlayers(homePlayers, homeTeamLine, awayTeamLine, rng);
  const awayBox = allocatePlayers(awayPlayers, awayTeamLine, homeTeamLine, rng);

  const playLogs = digest.slice(0, 20).map((event) => ({
    quarter: event.quarter,
    clockSec: event.clockSec,
    text: event.text,
    scoreHomeAfter: event.homeScore,
    scoreAwayAfter: event.awayScore,
  }));
  const scoringSummary = digest
    .filter((event) => event.type === 'touchdown' || event.type === 'field_goal')
    .map((event, idx) => ({
      id: `score_${idx}`,
      quarter: event.quarter,
      clock: formatClock(event.clockSec),
      teamId: event.team === 'home' ? payload.homeTeamId : payload.awayTeamId,
      teamAbbr: event.team === 'home' ? 'Home' : 'Away',
      type: event.type === 'touchdown' ? 'Touchdown' : 'Field Goal',
      scoreType: event.type,
      points: event.type === 'touchdown' ? 7 : 3,
      text: event.text,
      scoreAfter: { home: event.homeScore, away: event.awayScore },
    }));

  const recapText = `${state.homeScore > state.awayScore ? 'Home' : 'Away'} wins ${Math.max(state.homeScore, state.awayScore)}-${Math.min(state.homeScore, state.awayScore)}. ${topReasons[0] ?? 'Balanced execution'} set the tone.`;

  return {
    gameId: payload.gameId,
    homeTeamId: payload.homeTeamId,
    awayTeamId: payload.awayTeamId,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    totalPlays: stats.home.plays + stats.away.plays,
    homePassYards: homeTeamLine.passYd,
    awayPassYards: awayTeamLine.passYd,
    homeSuccessRate: homeTeamLine.successRate,
    awaySuccessRate: awayTeamLine.successRate,
    normalizationConstant: state.normalizationConstant,
    topReason1: topReasons[0] ?? null,
    topReason2: topReasons[1] ?? null,
    quarterScores,
    teamStats: { home: homeTeamLine, away: awayTeamLine },
    boxScore: { home: homeBox, away: awayBox },
    playDigest: digest.slice(0, 12),
    scoringSummary,
    playLogs,
    summary: {
      storyline: recapText,
      headlineMoments: digest.slice(0, 3).map((event) => event.text),
    },
    recapText,
    advancedAttribution: Object.fromEntries(advancedAttribution),
    simFactors: {
      home: {
        qbRating: buildQbRating(homeTeamLine.passComp, homeTeamLine.passAtt, homeTeamLine.passYd, homeTeamLine.passTD, homeTeamLine.turnovers),
        rushYpc: Number((homeTeamLine.rushYd / Math.max(1, homeTeamLine.rushAtt)).toFixed(2)),
        successRate: homeTeamLine.successRate,
        passRate: Number((homeTeamLine.passAtt / Math.max(1, homeTeamLine.plays)).toFixed(3)),
      },
      away: {
        qbRating: buildQbRating(awayTeamLine.passComp, awayTeamLine.passAtt, awayTeamLine.passYd, awayTeamLine.passTD, awayTeamLine.turnovers),
        rushYpc: Number((awayTeamLine.rushYd / Math.max(1, awayTeamLine.rushAtt)).toFixed(2)),
        successRate: awayTeamLine.successRate,
        passRate: Number((awayTeamLine.passAtt / Math.max(1, awayTeamLine.plays)).toFixed(3)),
      },
    },
  };
}
