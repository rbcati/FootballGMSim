// Shared semantics for the simulation's player mirrors and persisted season ledger.
const DERIVED = new Set([
  'completionPct', 'yardsPerCarry', 'yardsPerReception', 'avgPuntYards',
  'avgKickYards', 'successPct', 'passerRating', 'sackPct', 'ypc', 'ypr',
  'dropRate', 'separationRate', 'pressureRate', 'coverageRating', 'pressureRating',
  'protectionGrade', 'ratingWhenTargeted', 'fieldGoalPct', 'puntAvg',
]);
const MAXIMUM = new Set(['longestPass', 'longestRun', 'longestCatch', 'longestFG', 'longestPunt', 'rushLong', 'recLong', 'puntLong']);

export function accumulateStatLine(source, target) {
  const prior = { ...target };
  const volume = { longestPass: 'passComp', longestRun: 'rushAtt', rushLong: 'rushAtt', longestCatch: 'receptions', recLong: 'receptions' };
  for (const [key, value] of Object.entries(source || {})) {
    if (typeof value !== 'number' || !Number.isFinite(value) || DERIVED.has(key)) continue;
    target[key] = MAXIMUM.has(key)
      ? (target[key] == null || (volume[key] && !prior[volume[key]]) ? value : Math.max(target[key], value))
      : (target[key] ?? 0) + value;
  }
}
