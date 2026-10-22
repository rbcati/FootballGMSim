// Paired audit: node --import tsx scripts/game-stat-final-review-audit.mjs /path/to/65bc42b7
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { simulateRichGame } from '../src/core/sim/richGameSimulator.ts';
import { mapOverallToAttributesV2 } from '../src/core/migration/attributeMigrator.ts';
import { normalizeArchivedGamePayload } from '../src/core/gameArchive.js';
const baseline = process.argv[2];
if (!baseline) throw new Error('Supply the reviewed-head worktree path');
const beforeSim = (await import(pathToFileURL(`${baseline}/src/core/sim/richGameSimulator.ts`).href)).simulateRichGame;
const report = { baselineRef: '65bc42b79589fd1264e64596d304843cb5e7909b', seeds: '1–256', games: 256,
  scoreChanges: 0, playerLineChanges: 0, driveTransitionChanges: 0, netYardFailures: 0, touchdownExample: null, netYardExample: null };
for (let seed = 1; seed <= 256; seed++) {
  const a = mapOverallToAttributesV2(75, 5, 'audit');
  const payload = { gameId: `s1_w1_1_2`, seed, homeTeamId: 1, awayTeamId: 2, homeOffense: a, awayOffense: a, homeDefense: a, awayDefense: a };
  const before = beforeSim(structuredClone(payload)), after = simulateRichGame(structuredClone(payload));
  if (before.homeScore !== after.homeScore || before.awayScore !== after.awayScore || JSON.stringify(before.quarterScores) !== JSON.stringify(after.quarterScores)) report.scoreChanges++;
  if (JSON.stringify(before.boxScore) !== JSON.stringify(after.boxScore)) report.playerLineChanges++;
  const transitions = game => game.driveSummary.map(({ yards, ...rest }) => rest);
  if (JSON.stringify(transitions(before)) !== JSON.stringify(transitions(after))) report.driveTransitionChanges++;
  for (const side of ['home', 'away']) {
    const team = after.teamStats[side];
    const losses = Object.values(after.boxScore[side]).reduce((sum, p) => sum + (p.stats.sackYards ?? 0), 0);
    if (team.totalYards !== team.passYd + team.rushYd - losses || before.teamStats[side].totalYards - team.totalYards !== losses) report.netYardFailures++;
    if (!report.netYardExample && losses > 0) report.netYardExample = { seed, side, grossPassing: team.passYd, rushing: team.rushYd, sacks: team.sacksAllowed, sackYards: losses, beforeTotal: before.teamStats[side].totalYards, afterNetTotal: team.totalYards };
  }
  const first = after.driveSummary[0], oldFirst = before.driveSummary[0];
  if (!report.touchdownExample && first?.result === 'TD' && oldFirst.yards > 75) {
    const archived = normalizeArchivedGamePayload({ ...after, id: after.gameId, seasonId: 's1', week: 1, homeId: 1, awayId: 2, playerStats: after.boxScore });
    report.touchdownExample = { seed, drive: 1, plays: first.plays, startYardLine: 25, endYardLine: 100, beforeSampledDriveYards: oldFirst.yards, afterFieldMovement: first.yards, archivedDriveYards: archived.driveSummary[0].yards, score: [after.homeScore, after.awayScore] };
  }
}
if (!report.touchdownExample || report.scoreChanges || report.playerLineChanges || report.driveTransitionChanges || report.netYardFailures) throw new Error(JSON.stringify(report));
const json = `${JSON.stringify(report, null, 2)}\n`;
if (process.argv[3]) writeFileSync(process.argv[3], json);
console.log(json);
