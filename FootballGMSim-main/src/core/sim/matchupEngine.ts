import type { AttributesV2 } from '../../types/player.ts';

export interface PlayContext {
  down: number;
  distance: number;
  yardLine: number;
  quarter: number;
  clockSec: number;
  weather?: 'clear' | 'rain' | 'snow' | 'wind';
  fatigueFactor?: number;
  normalizationConstant?: number;
  playType?: 'pass' | 'run';
}

export interface PlayResult {
  success: boolean;
  successProbability: number;
  yardsGained: number;
  clockElapsedSec: number;
  nextDown: number;
  nextDistance: number;
  nextYardLine: number;
  reason: string;
  playType: 'pass' | 'run';
  turnover: boolean;
  turnoverType: 'interception' | 'fumble' | null;
  isSack: boolean;
  firstDown: boolean;
}

const OFFENSE_WEIGHTS: ReadonlyArray<[keyof AttributesV2, number]> = Object.freeze([
  ['throwAccuracyShort', 0.14],
  ['throwAccuracyDeep', 0.07],
  ['throwPower', 0.07],
  ['release', 0.1],
  ['routeRunning', 0.12],
  ['separation', 0.12],
  ['catchInTraffic', 0.09],
  ['ballTracking', 0.08],
  ['decisionMaking', 0.09],
  ['pocketPresence', 0.07],
  ['passBlockFootwork', 0.03],
  ['passBlockStrength', 0.02],
]);

const DEFENSE_WEIGHTS: ReadonlyArray<[keyof AttributesV2, number]> = Object.freeze([
  ['passRush', 0.3],
  ['pressCoverage', 0.36],
  ['zoneCoverage', 0.34],
]);

const RUN_OFFENSE_WEIGHTS: ReadonlyArray<[keyof AttributesV2, number]> = Object.freeze([
  ['decisionMaking', 0.18],
  ['pocketPresence', 0.08],
  ['passBlockStrength', 0.28],
  ['passBlockFootwork', 0.16],
  ['release', 0.04],
  ['routeRunning', 0.08],
  ['separation', 0.05],
  ['catchInTraffic', 0.06],
  ['ballTracking', 0.03],
  ['throwAccuracyShort', 0.02],
  ['throwAccuracyDeep', 0.01],
  ['throwPower', 0.01],
]);

const RUN_DEFENSE_WEIGHTS: ReadonlyArray<[keyof AttributesV2, number]> = Object.freeze([
  ['passRush', 0.58],
  ['pressCoverage', 0.17],
  ['zoneCoverage', 0.25],
]);

export const DEFAULT_NORMALIZATION_CONSTANT = 0.74;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sigmoid(input: number): number {
  if (input <= -35) return 0;
  if (input >= 35) return 1;
  return 1 / (1 + Math.exp(-input));
}

function weightedScore(attributes: AttributesV2, weights: ReadonlyArray<[keyof AttributesV2, number]>): number {
  let total = 0;
  for (let i = 0; i < weights.length; i += 1) {
    const [key, weight] = weights[i];
    total += (attributes[key] ?? 50) * weight;
  }
  return total;
}

function weatherAdjustment(weather: PlayContext['weather']): number {
  switch (weather) {
    case 'rain':
      return -0.06;
    case 'snow':
      return -0.09;
    case 'wind':
      return -0.04;
    default:
      return 0;
  }
}

function explainWinningVector(offense: AttributesV2, defense: AttributesV2): string {
  const signals = [
    { label: 'Win on the Release', value: offense.release - defense.pressCoverage },
    { label: 'Route leverage over zone', value: offense.routeRunning - defense.zoneCoverage },
    { label: 'Pocket survived pressure', value: offense.passBlockFootwork - defense.passRush },
    { label: 'Ball tracked through contact', value: offense.ballTracking - defense.pressCoverage },
    { label: 'Decision beat disguise', value: offense.decisionMaking - defense.zoneCoverage },
  ];

  signals.sort((a, b) => b.value - a.value);
  return signals[0].label;
}

function estimateYards({
  successProb,
  offenseScore,
  defenseScore,
  playType,
  rng,
}: {
  successProb: number;
  offenseScore: number;
  defenseScore: number;
  playType: 'pass' | 'run';
  rng: () => number;
}): number {
  const delta = (offenseScore - defenseScore) / 100;
  const base = playType === 'pass'
    ? 4.2 + delta * 2.4
    : 3.6 + delta * 1.6;
  const volatility = (playType === 'pass' ? 6 : 4.6) * successProb;
  const sampled = base + (rng() - 0.5) * volatility;
  return Math.round(clamp(sampled, playType === 'pass' ? -8 : -4, playType === 'pass' ? 45 : 32));
}

function nextDownState(ctx: PlayContext, yardsGained: number): Pick<PlayResult, 'nextDown' | 'nextDistance' | 'nextYardLine'> {
  const nextYardLine = clamp(ctx.yardLine + yardsGained, 0, 100);
  const earnedFirstDown = yardsGained >= ctx.distance;

  if (nextYardLine >= 100) {
    return { nextDown: 1, nextDistance: 10, nextYardLine: 75 };
  }

  if (earnedFirstDown) {
    return { nextDown: 1, nextDistance: 10, nextYardLine };
  }

  return {
    nextDown: clamp(ctx.down + 1, 1, 4),
    nextDistance: clamp(ctx.distance - yardsGained, 1, 20),
    nextYardLine,
  };
}

export function resolveMatchup(
  offense: AttributesV2,
  defense: AttributesV2,
  ctx: PlayContext,
  rng: () => number = Math.random,
): PlayResult {
  const playType = ctx.playType ?? 'pass';
  const normalization = clamp(ctx.normalizationConstant ?? DEFAULT_NORMALIZATION_CONSTANT, 0.35, 1.35);
  const offenseScore = weightedScore(offense, playType === 'pass' ? OFFENSE_WEIGHTS : RUN_OFFENSE_WEIGHTS);
  const defenseScore = weightedScore(defense, playType === 'pass' ? DEFENSE_WEIGHTS : RUN_DEFENSE_WEIGHTS);

  const matchupDelta = (offenseScore - defenseScore) / 100;
  const pressurePenalty = playType === 'pass'
    ? (defense.passRush - offense.passBlockFootwork) / 400
    : (defense.passRush - offense.passBlockStrength) / 520;
  const fatiguePenalty = clamp((ctx.fatigueFactor ?? 0) * 0.12, 0, 0.12);
  const downDistancePenalty = ctx.down >= 3
    ? Math.min(playType === 'pass' ? 0.06 : 0.08, Math.max(0, (ctx.distance - (playType === 'pass' ? 5 : 3)) * (playType === 'pass' ? 0.006 : 0.009)))
    : 0;

  const base = playType === 'pass' ? -0.22 : -0.1;
  const input = base + (matchupDelta * 2.25 * normalization) - pressurePenalty - fatiguePenalty - downDistancePenalty + weatherAdjustment(ctx.weather);
  const successProbability = clamp(sigmoid(input), 0.03, 0.97);

  const success = rng() <= successProbability;
  const sackProbability = playType === 'pass'
    ? clamp(0.03 + (defense.passRush - offense.passBlockFootwork) / 230 + (ctx.down >= 3 ? 0.02 : 0), 0.01, 0.2)
    : clamp(0.005 + (defense.passRush - offense.passBlockStrength) / 450, 0.002, 0.06);
  const isSack = !success && rng() <= sackProbability;
  const yardsGained = success
    ? estimateYards({ successProb: successProbability, offenseScore, defenseScore, playType, rng })
    : (isSack
      ? -Math.round(clamp((defense.passRush - offense.pocketPresence) / 24, 1, 10))
      : -Math.round(clamp((defense.passRush - offense.passBlockStrength) / 36, 0, playType === 'pass' ? 4 : 3)));

  const turnoverProbability = playType === 'pass'
    ? clamp(0.01 + (defense.zoneCoverage - offense.decisionMaking) / 350 + (ctx.down >= 3 ? 0.01 : 0), 0.004, 0.09)
    : clamp(0.008 + (defense.passRush - offense.passBlockStrength) / 520, 0.003, 0.045);
  const turnover = rng() <= turnoverProbability;
  const turnoverType = turnover ? (playType === 'pass' && rng() <= 0.72 ? 'interception' : 'fumble') : null;

  const clockElapsedSec = Math.round(clamp(22 + rng() * (playType === 'run' ? 20 : 16) + (success ? 2 : 0), 18, 45));
  const next = nextDownState(ctx, yardsGained);

  return {
    success,
    successProbability,
    yardsGained,
    clockElapsedSec,
    reason: explainWinningVector(offense, defense),
    playType,
    turnover,
    turnoverType,
    isSack,
    firstDown: next.nextDown === 1 && next.nextDistance === 10 && next.nextYardLine < 100 && yardsGained >= ctx.distance,
    ...next,
  };
}
