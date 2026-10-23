import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import * as matchup from '../sim/matchupEngine.ts';
import { simulateRichGame } from '../sim/richGameSimulator.ts';
import { aggregateTeamUnitsFromRoster, buildEligibleGameDayRoster } from '../sim/weekSimulationBridge.ts';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import { deriveGamePlanMultipliers } from '../sim/gamePlanMultipliers.ts';

const roster = (teamId: number, offense: number, defense: number) => {
  const groups: Array<[string, number, boolean]> = [['QB', 2, true], ['RB', 3, true], ['WR', 5, true], ['TE', 2, true], ['OL', 6, true],
    ['EDGE', 3, false], ['IDL', 3, false], ['LB', 4, false], ['CB', 4, false], ['S', 3, false]];
  return groups.flatMap(([pos, count, isOffense]) => Array.from({ length: count }, (_, index) => {
    const ovr = (isOffense ? offense : defense) - index * 3;
    const id = `${teamId}-${pos}-${index}`;
    return { id, teamId, pos, name: id, ovr, depthOrder: index + 1, depthRowKey: pos,
      depthChart: { rowKey: pos, order: index + 1 }, attributesV2: mapOverallToAttributesV2(ovr, 5.5, id) };
  }));
};

describe('offensive production calibration under actual gameplay', () => {
  it('preserves seeded replay, football tails and availability across talent, plans and schemes', () => {
    const resolve = matchup.resolveMatchup;
    let traces: Array<{ context: Parameters<typeof resolve>[2]; result: ReturnType<typeof resolve> }> = [];
    const spy = vi.spyOn(matchup, 'resolveMatchup').mockImplementation((offense, defense, context, rng) => {
      const result = resolve(offense, defense, context, rng);
      traces.push({ context: { ...context }, result });
      return result;
    });
    const report = { games: 0, minScore: Infinity, maxScore: 0, maxRushAtt: 0, maxPassAtt: 0, negativeRuns: 0, negativeCompletions: 0,
      sacks: 0, kneels: 0, redZoneDrives: 0, redZoneTouchdowns: 0, scoreChanges: 0,
      meanScoreDelta: 0, meanPlayDelta: 0, maxScoreDelta: 0, beforeNegativeRuns: 0, beforeSacks: 0, runs: 0, successfulRuns: 0, beforeRuns: 0, beforeSuccessfulRuns: 0, scenarios: [] as object[] };
    try {
      for (const offense of [65, 75, 90]) for (const defense of [65, 90]) for (const setting of ['neutral', 'pass', 'run', 'unavailable']) {
        const scores: number[] = [], plays: number[] = [], rbShares: number[] = [], targetShares: number[] = [];
        for (let index = 0; index < 8; index++) {
          const seed = 900001 + index * 104729;
          const home = roster(1, offense, 75), away = roster(2, 75, defense);
          if (setting === 'unavailable') {
            Object.assign(home[0], { injured: true });
            Object.assign(home.find(p => p.pos === 'RB')!, { status: 'injured_reserve' });
            Object.assign(home.find(p => p.pos === 'WR')!, { injured: true });
          }
          const schemes = { offSchemeId: setting === 'pass' ? 'VERTICAL' : 'WEST_COAST', defSchemeId: setting === 'run' ? 'BLITZ_34' : 'COVER_2' };
          const hu = aggregateTeamUnitsFromRoster(home as any, 1, schemes), au = aggregateTeamUnitsFromRoster(away as any, 2, schemes);
          const prep = deriveGamePlanMultipliers({ gamePlan: { runPassBalance: setting === 'pass' ? 80 : setting === 'run' ? 20 : 50,
            blitzFrequency: setting === 'pass' ? 100 : 0 }, weeklyPrepState: { insights: { weakSecondary: setting === 'pass', weakRunDefense: setting === 'run' } } });
          const payload = { gameId: `calibration-${offense}-${defense}-${setting}-${seed}`, seed, homeTeamId: 1, awayTeamId: 2,
            // Mirror the production bridge: submit eligible personnel on both branches.
            // #1804's own invariant tests also submit raw unavailable refs.
            homePlayers: buildEligibleGameDayRoster(home as any, 1), awayPlayers: buildEligibleGameDayRoster(away as any, 2), homeOffense: hu.offense, homeDefense: hu.defense, awayOffense: au.offense, awayDefense: au.defense,
            homeSchemeFit: hu.schemeFit, awaySchemeFit: au.schemeFit, homePrepMultipliers: prep, awayPrepMultipliers: prep };
          traces = [];
          const game = simulateRichGame(payload);
          const observed = traces.slice();
          expect(simulateRichGame(payload)).toEqual(game);
          report.games++;
          let redZone = false;
          for (const { context: c, result: r } of observed) {
            if (c.playType === 'run') { report.runs++; if (r.success) report.successfulRuns++; if (r.yardsGained < 0) report.negativeRuns++; }
            if (c.playType === 'pass' && r.success && r.turnoverType !== 'interception' && r.yardsGained < 0) report.negativeCompletions++;
            if (c.playType === 'pass' && r.isSack && r.turnoverType !== 'interception') report.sacks++;
            redZone ||= c.yardLine >= 80 || (!r.turnover && r.nextYardLine >= 80 && r.nextYardLine < 100);
            const touchdown = !r.turnover && r.nextYardLine >= 100;
            if (r.turnover || touchdown || (c.down === 4 && !r.success)) {
              if (redZone) { report.redZoneDrives++; if (touchdown) report.redZoneTouchdowns++; }
              redZone = false;
            }
          }
          // Red-zone TD efficiency above comes from field states, never broken summary counters.
          for (const side of ['home', 'away'] as const) {
            const t = game.teamStats[side], rows = Object.values(game.boxScore[side]);
            const score = side === 'home' ? game.homeScore : game.awayScore;
            expect(game.quarterScores[side].reduce((n, p) => n + p, 0)).toBe(score);
            expect(t.plays).toBeGreaterThan(0);
            expect(game.homeScore).not.toBe(game.awayScore);
            report.minScore = Math.min(report.minScore, score); report.maxScore = Math.max(report.maxScore, score);
            report.maxRushAtt = Math.max(report.maxRushAtt, t.rushAtt); report.maxPassAtt = Math.max(report.maxPassAtt, t.passAtt);
            if (setting === 'unavailable' && side === 'home') {
              for (const player of home.filter(p => (p as any).injured || (p as any).status === 'injured_reserve')) expect(game.boxScore.home[player.id]).toBeUndefined();
            }
            // #1804 exposes explicit sack losses; then require its stronger ledger invariants too.
            if ('sackYards' in t) {
              const sum = (key: string) => rows.reduce((n, p) => n + (p.stats[key] ?? 0), 0);
              expect(sum('recYd')).toBe(t.passYd); expect(sum('passYd')).toBe(t.passYd);
              expect(sum('receptions')).toBe(t.passComp); expect(sum('rushAtt')).toBe(t.rushAtt); expect(sum('rushYd')).toBe(t.rushYd);
              expect(t.totalYards).toBe(t.passYd + t.rushYd - sum('sackYards'));
              for (const { stats: s } of rows) {
                if (!s.receptions) expect([s.recYd ?? 0, s.recTD ?? 0]).toEqual([0, 0]);
                if (!s.rushAtt) expect([s.rushYd ?? 0, s.rushTD ?? 0]).toEqual([0, 0]);
              }
            }
          }
          const t = game.teamStats.home, rows = Object.values(game.boxScore.home);
          const rbAtt = rows.filter(p => p.pos === 'RB').reduce((n, p) => n + (p.stats.rushAtt ?? 0), 0);
          scores.push(game.homeScore); plays.push(t.plays); rbShares.push(rbAtt / t.rushAtt);
          targetShares.push(Math.max(...rows.map(p => p.stats.targets ?? 0)) / Math.max(1, t.passAtt));
          const qbRuns = rows.filter(p => p.pos === 'QB').reduce((n, p) => n + (p.stats.rushAtt ?? 0), 0);
          const tracedRuns = observed.filter(x => x.context.playType === 'run' && String(x.context.blockerId).startsWith('1-')).length;
          report.kneels += Math.max(0, t.rushAtt - tracedRuns);
          // A paired replay restores only the previous clock base. All RNG draws and mechanics remain real.
          spy.mockImplementation((o, d, c, rng) => {
            const r = resolve(o, d, c, rng);
            if (c.playType === 'run') { report.beforeRuns++; if (r.success) report.beforeSuccessfulRuns++; if (r.yardsGained < 0) report.beforeNegativeRuns++; }
            if (c.playType === 'pass' && r.isSack && r.turnoverType !== 'interception') report.beforeSacks++;
            return { ...r, clockElapsedSec: r.clockElapsedSec + 2 };
          });
          const before = simulateRichGame(payload);
          spy.mockImplementation((o, d, c, rng) => { const r = resolve(o, d, c, rng); traces.push({ context: { ...c }, result: r }); return r; });
          if (before.homeScore !== game.homeScore || before.awayScore !== game.awayScore) report.scoreChanges++;
          report.meanScoreDelta += game.homeScore + game.awayScore - before.homeScore - before.awayScore;
          report.meanPlayDelta += game.totalPlays - before.totalPlays;
          report.maxScoreDelta = Math.max(report.maxScoreDelta, Math.abs(game.homeScore - before.homeScore), Math.abs(game.awayScore - before.awayScore));
          expect(qbRuns).toBeLessThanOrEqual(t.rushAtt);
        }
        const mean = (xs: number[]) => xs.reduce((n, x) => n + x, 0) / xs.length;
        report.scenarios.push({ offense, defense, setting, points: mean(scores), plays: mean(plays), rbShare: mean(rbShares), topTargetShare: mean(targetShares) });
      }
      report.meanScoreDelta /= report.games * 2; report.meanPlayDelta /= report.games * 2;
      expect(report.minScore).toBeLessThanOrEqual(7); expect(report.maxScore).toBeGreaterThanOrEqual(42);
      expect(report.negativeRuns).toBeGreaterThan(0); expect(report.sacks).toBeGreaterThan(0); expect(report.kneels).toBeGreaterThan(0);
      expect(report.maxRushAtt).toBeGreaterThan(35); expect(report.maxPassAtt).toBeGreaterThan(40);
      expect(report.redZoneDrives).toBeGreaterThan(0); expect(report.meanPlayDelta).toBeGreaterThan(0);
      if (process.env.FOOTBALL_CALIBRATION_AUDIT) writeFileSync(process.env.FOOTBALL_CALIBRATION_AUDIT, JSON.stringify(report, null, 2) + '\n');
    } finally { spy.mockRestore(); }
  }, 30000);
});
