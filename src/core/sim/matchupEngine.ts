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
  rng,
}: {
  successProb: number;
  offenseScore: number;
  defenseScore: number;
  rng: () => number;
}): number {
  const delta = (offenseScore - defenseScore) / 100;
  const base = 4.2 + delta * 2.4;
  const volatility = 6 * successProb;
  const sampled = base + (rng() - 0.5) * volatility;
  return Math.round(clamp(sampled, -8, 45));
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
  const normalization = clamp(ctx.normalizationConstant ?? DEFAULT_NORMALIZATION_CONSTANT, 0.35, 1.35);
  const offenseScore = weightedScore(offense, OFFENSE_WEIGHTS);
  const defenseScore = weightedScore(defense, DEFENSE_WEIGHTS);

  const matchupDelta = (offenseScore - defenseScore) / 100;
  const pressurePenalty = (defense.passRush - offense.passBlockFootwork) / 400;
  const fatiguePenalty = clamp((ctx.fatigueFactor ?? 0) * 0.12, 0, 0.12);
  const downDistancePenalty = ctx.down >= 3 ? Math.min(0.06, Math.max(0, (ctx.distance - 5) * 0.006)) : 0;

  const base = (ctx.playType ?? 'pass') === 'pass' ? -0.22 : -0.08;
  const input = base + (matchupDelta * 2.25 * normalization) - pressurePenalty - fatiguePenalty - downDistancePenalty + weatherAdjustment(ctx.weather);
  const successProbability = clamp(sigmoid(input), 0.03, 0.97);

  const success = rng() <= successProbability;
  const yardsGained = success
    ? estimateYards({ successProb: successProbability, offenseScore, defenseScore, rng })
    : -Math.round(clamp((defense.passRush - offense.pocketPresence) / 24, -1, 8));

  const clockElapsedSec = Math.round(clamp(23 + rng() * 17 + (success ? 2 : 0), 18, 42));

  return {
    success,
    successProbability,
    yardsGained,
    clockElapsedSec,
    reason: explainWinningVector(offense, defense),
    ...nextDownState(ctx, yardsGained),
  };
}
