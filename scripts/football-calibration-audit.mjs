// Run with Node 22: node --import tsx scripts/football-calibration-audit.mjs ROOT OUTPUT [SEEDS]
// ROOT may be a main or integrity worktree. Uses its unchanged gate and actual games.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const [root = '.', output, seedList = '20260605,4242,8675309,314159'] = process.argv.slice(2);
const { runEngineSoak } = await import(pathToFileURL(resolve(root, 'scripts/engineSoak.js')));
const distribution = values => {
  const sorted = values.slice().sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const q = fraction => sorted[Math.floor((sorted.length - 1) * fraction)];
  return { n: sorted.length, min: q(0), p10: q(.1), p25: q(.25), median: q(.5), p75: q(.75), p90: q(.9), max: q(1), mean,
    sd: Math.sqrt(sorted.reduce((sum, x) => sum + (x - mean) ** 2, 0) / sorted.length) };
};

const reports = [];
for (const seed of seedList.split(',').map(Number)) {
  const teams = [], drives = [], playerGames = [], gameScores = [];
  let invariantTeamGames = 0;
  const correctedLedger = process.env.CORRECTED_LEDGER === '1';
  const soak = runEngineSoak({ seasons: 4, seed, onMatchupGame: game => {
    gameScores.push({ id: game.gameId, home: game.homeScore, away: game.awayScore });
    drives.push(...game.driveSummary);
    for (const side of ['home', 'away']) {
      const t = game.teamStats[side], rows = Object.values(game.boxScore[side]);
      const sum = key => rows.reduce((n, p) => n + (p.stats[key] ?? 0), 0);
      if (correctedLedger) {
        for (const [player, team] of [['passAtt', 'passAtt'], ['passComp', 'passComp'], ['passYd', 'passYd'], ['passTD', 'passTD'],
          ['receptions', 'passComp'], ['recYd', 'passYd'], ['recTD', 'passTD'], ['rushAtt', 'rushAtt'], ['rushYd', 'rushYd'], ['rushTD', 'rushTD'], ['sackYards', 'sackYards']]) {
          assert.equal(sum(player), t[team], `${game.gameId}/${side}/${player}`);
        }
        assert.equal(t.netPassYards, t.passYd - t.sackYards);
        assert.equal(t.totalYards, t.passYd + t.rushYd - t.sackYards);
        assert.equal(t.plays, t.passAtt + t.sacksAllowed + t.rushAtt);
        for (const { stats: s } of rows) {
          assert.ok((s.passComp ?? 0) <= (s.passAtt ?? 0));
          assert.ok((s.receptions ?? 0) <= (s.targets ?? 0));
          if (!(s.receptions > 0)) assert.ok(!(s.recYd || s.recTD));
          if (!(s.rushAtt > 0)) assert.ok(!(s.rushYd || s.rushTD));
          assert.ok((s.recTD ?? 0) <= (s.receptions ?? 0));
          assert.ok((s.rushTD ?? 0) <= (s.rushAtt ?? 0));
        }
        invariantTeamGames++;
      }
      const perPosition = {};
      for (const p of rows) {
        const bucket = perPosition[p.pos] ??= { rushAtt: 0, rushYd: 0, targets: 0, receptions: 0, recYd: 0, recTD: 0 };
        for (const key of Object.keys(bucket)) bucket[key] += p.stats[key] ?? 0;
        playerGames.push({ pos: p.pos, ...p.stats });
      }
      teams.push({ id: side === 'home' ? game.homeTeamId : game.awayTeamId, ...t, points: side === 'home' ? game.homeScore : game.awayScore,
        perPosition, qbCarries: perPosition.QB?.rushAtt ?? 0,
        topTargetShare: Math.max(0, ...rows.map(p => p.stats.targets ?? 0)) / Math.max(1, sum('targets')),
        topCarryShare: Math.max(0, ...rows.map(p => p.stats.rushAtt ?? 0)) / Math.max(1, t.rushAtt) });
    }
  } });
  assert.equal(teams.length, 2176);
  const total = key => teams.reduce((n, t) => n + (t[key] ?? 0), 0);
  const positional = {};
  for (const t of teams) for (const [pos, stats] of Object.entries(t.perPosition)) {
    const bucket = positional[pos] ??= Object.fromEntries(Object.keys(stats).map(key => [key, 0]));
    for (const key of Object.keys(stats)) bucket[key] += stats[key];
  }
  const report = { seed, soak, correctedLedger, invariantTeamGames,
    efficiency: { attempts: total('passAtt') / teams.length, completionRate: total('passComp') / total('passAtt'),
      yardsPerCompletion: total('passYd') / total('passComp'), yardsPerAttempt: total('passYd') / total('passAtt'),
      carries: total('rushAtt') / teams.length, yardsPerCarry: total('rushYd') / total('rushAtt'),
      plays: total('plays') / teams.length, sacks: total('sacksAllowed') / teams.length, sackLoss: total('sackYards') / teams.length,
      touchdowns: (total('passTD') + total('rushTD')) / teams.length,
      touchdownPerPlay: (total('passTD') + total('rushTD')) / total('plays'),
      reportedRedZoneTrips: total('redZoneTrips') / teams.length, redZoneEfficiency: null,
      redZoneLimitation: 'Existing trips count backward crossings of the 80, not distinct drives. Ratio is invalid; see traced adversarial audit.',
      turnovers: total('turnovers') / teams.length, qbCarryShare: (positional.QB?.rushAtt ?? 0) / total('rushAtt') },
    teamGameDistributions: Object.fromEntries(['points', 'plays', 'passAtt', 'passComp', 'passYd', 'rushAtt', 'rushYd', 'sacksAllowed', 'qbCarries', 'topTargetShare', 'topCarryShare'].map(key => [key, distribution(teams.map(t => t[key]))])),
    teamMeansAcrossFourSeasons: Array.from({ length: 32 }, (_, id) => {
      const games = teams.filter(t => t.id === id);
      return { id, ...Object.fromEntries(['points', 'plays', 'passYd', 'rushYd'].map(key => [key, games.reduce((n, t) => n + t[key], 0) / games.length])) };
    }),
    positional,
    playerDistributions: Object.fromEntries(['QB', 'RB', 'WR', 'TE'].map(pos => [pos, Object.fromEntries(['rushAtt', 'rushYd', 'targets', 'receptions', 'recYd', 'recTD'].map(key => [key, distribution(playerGames.filter(p => p.pos === pos && ((p.rushAtt ?? 0) > 0 || (p.targets ?? 0) > 0 || (p.passAtt ?? 0) > 0)).map(p => p[key] ?? 0))]))])),
    drives: { completed: drives.length, results: drives.reduce((counts, d) => { counts[d.result] = (counts[d.result] ?? 0) + 1; return counts; }, {}),
      plays: distribution(drives.map(d => d.plays)), yards: distribution(drives.map(d => d.yards)), seconds: distribution(drives.map(d => d.topSeconds)) },
    gameScores };
  reports.push(report);
  console.error(JSON.stringify({ seed, gate: soak.gate.passed, ...report.efficiency }));
}
const json = JSON.stringify({ root: resolve(root), reports }, null, 2) + '\n';
if (output) writeFileSync(output, json);
else console.log(json);
