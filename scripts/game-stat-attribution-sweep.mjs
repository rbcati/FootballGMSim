// Reproduce the fixed-state before/after audit without persisting a full play log.
// node --import tsx scripts/game-stat-attribution-sweep.mjs --baseline=/tmp/football-before --baseline-ref=0185cd0b1182fda4d6f76fb4517298b83e13c93d --output=docs/audits/pr-1804-stat-comparison.json
import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { simulateRichGame } from '../src/core/sim/richGameSimulator.ts';
import { mapOverallToAttributesV2 } from '../src/core/migration/attributeMigrator.ts';
import { validateOffensiveStatIntegrity } from '../src/core/simulation/gameStatReconciliation.js';

const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const baseline = option('baseline');
const original = baseline ? (await import(pathToFileURL(join(resolve(baseline), 'src/core/sim/richGameSimulator.ts')).href)).simulateRichGame : null;
const report = {
  base: baseline ? option('baseline-ref') ?? null : null,
  seeds: '1–256', games: 256, scoreChanged: 0, oldInvariantFailures: 0, newInvariantFailures: 0, example: null,
};
for (let seed = 1; seed <= 256; seed++) {
  const a = mapOverallToAttributesV2(75, 5, 'audit');
  const payload = { gameId: `audit-${seed}`, seed, homeTeamId: 1, awayTeamId: 2, homeOffense: a, awayOffense: a, homeDefense: a, awayDefense: a };
  const game = simulateRichGame(payload);
  const before = original?.(payload);
  if (before && (before.homeScore !== game.homeScore || before.awayScore !== game.awayScore)) report.scoreChanged++;
  for (const side of ['home', 'away']) {
    report.newInvariantFailures += validateOffensiveStatIntegrity(game.boxScore[side]).errors.length;
    if (!before) continue;
    report.oldInvariantFailures += validateOffensiveStatIntegrity(before.boxScore[side]).errors.length;
    for (const [id, row] of Object.entries(before.boxScore[side])) {
      if (!report.example && (row.stats.recYd || row.stats.recTD) && !row.stats.receptions) {
        report.example = { seed, side, id, before: row.stats, after: game.boxScore[side][id]?.stats, score: [game.homeScore, game.awayScore] };
      }
    }
  }
}
const output = JSON.stringify(report, null, 2) + '\n';
if (option('output')) writeFileSync(option('output'), output);
console.log(output);
if (report.newInvariantFailures || report.scoreChanged) process.exitCode = 1;
