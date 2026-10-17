import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import {
  generateNflSchedule,
  validateNflSchedule,
} from '../src/core/nflSchedule.js';
import { DEFAULT_TEAMS } from '../src/data/default-teams.js';

const times = [],
  initialTimes = [],
  rolloverTimes = [],
  validationTimes = [],
  attempts = [],
  nodes = [],
  streaks = [],
  gaps = [];
const fingerprint = (x) =>
  createHash('sha256').update(JSON.stringify(x)).digest('hex');
let count = 0,
  deterministicPairs = 0;
const started = performance.now();
for (let i = 0; i < 320; i++) {
  const year = 2026 + (i % 24);
  const options = {
    year,
    seasonId: `audit-season-${year}`,
    seed: i,
    priorRanks: Object.fromEntries(
      DEFAULT_TEAMS.map((t) => [
        t.id,
        ((t.id + Math.floor(i / 24) * (t.div + 1)) % 4) + 1,
      ])
    ),
  };
  let t = performance.now();
  const schedule = generateNflSchedule(DEFAULT_TEAMS, options);
  const generationMs = performance.now() - t;
  times.push(generationMs);
  (year === 2026 ? initialTimes : rolloverTimes).push(generationMs);
  t = performance.now();
  const result = validateNflSchedule(schedule, DEFAULT_TEAMS, options);
  validationTimes.push(performance.now() - t);
  if (!result.valid) throw new Error(result.errors.join('\n'));
  count++;
  if (i % 20 === 0) {
    const repeated = generateNflSchedule(
      [...DEFAULT_TEAMS].reverse(),
      JSON.parse(JSON.stringify(options))
    );
    if (fingerprint(schedule) !== fingerprint(repeated))
      throw new Error('Schedule determinism failure');
    if (!validateNflSchedule(repeated, DEFAULT_TEAMS, options).valid)
      throw new Error('Repeated schedule invalid');
    deterministicPairs++;
    count++;
  }
  const p = schedule.metadata.placement;
  attempts.push(p.attempts);
  nodes.push(p.totalNodes);
  streaks.push(p.maxHomeAwayStreak);
  gaps.push(p.minDivisionGap);
}
const summary = (a) => ({
  mean: +(a.reduce((a, b) => a + b, 0) / a.length).toFixed(3),
  max: +Math.max(...a).toFixed(3),
});
const report = {
  node: process.version,
  instances: count,
  passing: count,
  seasons: 24,
  seeds: 320,
  deterministicPairs,
  generationMs: summary(times),
  initialGenerationMs: summary(initialTimes),
  rolloverGenerationMs: summary(rolloverTimes),
  validationMs: summary(validationTimes),
  placementAttempts: summary(attempts),
  exactCoverNodes: summary(nodes),
  maxHomeAwayStreak: Math.max(...streaks),
  minDivisionMeetingGap: Math.min(...gaps),
  totalMs: +(performance.now() - started).toFixed(1),
  heapUsedBytes: process.memoryUsage().heapUsed,
};
if (process.argv[2])
  writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
