/** Explicit diagnostic, not a replacement for the unchanged engineSoak calibration gate.
 * GAME_STAT_BASELINE=/path/to/0185cd0b worktree GAME_STAT_CALIBRATION_OUTPUT=/tmp/report.json
 * npx vitest run tests/unit/gameStatCalibrationComparison.test.js
 */
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as rich from '../../src/core/sim/richGameSimulator.ts';
import * as matchup from '../../src/core/sim/matchupEngine.ts';
import { runEngineSoak } from '../../scripts/engineSoak.js';

const baseline = process.env.GAME_STAT_BASELINE;
const sumPassing = game => game.teamStats.home.passYd + game.teamStats.away.passYd;

describe.skipIf(!baseline)('controlled baseline attribution calibration diagnosis', () => {
  it('decomposes paired yards with identical rosters, seeds, and injury conditions', async () => {
    const oldRich = await import(/* @vite-ignore */ pathToFileURL(`${baseline}/src/core/sim/richGameSimulator.ts`).href);
    const oldSoak = await import(/* @vite-ignore */ pathToFileURL(`${baseline}/scripts/engineSoak.js`).href);
    const originalNew = rich.simulateRichGame;
    const originalOld = oldRich.simulateRichGame;
    const actualResolve = matchup.resolveMatchup;
    const reviewedRoot = process.env.GAME_STAT_REVIEWED;
    const reviewedRich = reviewedRoot ? await import(/* @vite-ignore */ pathToFileURL(`${reviewedRoot}/src/core/sim/richGameSimulator.ts`).href) : null;
    const reviewedSoak = reviewedRoot ? await import(/* @vite-ignore */ pathToFileURL(`${reviewedRoot}/scripts/engineSoak.js`).href) : null;
    const report = { baselineRef: '0185cd0b1182fda4d6f76fb4517298b83e13c93d', reviewedRef: 'fc98cdb4292a4b43cedb18bc854b864902cec4df', seed: 20260605, seasons: 4, corpora: [] };
    for (const source of reviewedRoot ? ['baseline', 'reviewed', 'repaired'] : ['baseline', 'repaired']) {
      const richModule = source === 'baseline' ? oldRich : source === 'reviewed' ? reviewedRich : rich;
      const simulate = richModule.simulateRichGame;
      const runSoak = source === 'baseline' ? oldSoak.runEngineSoak : source === 'reviewed' ? reviewedSoak.runEngineSoak : runEngineSoak;
      const inputs = [];
      const spy = vi.spyOn(richModule, 'simulateRichGame').mockImplementation(payload => {
        inputs.push(structuredClone(payload));
        return simulate(payload);
      });
      const soak = runSoak({ seasons: 4, seed: 20260605 });
      spy.mockRestore();
      let oldYards = 0, newYards = 0, excludedPassGains = 0, completionEndzoneExcess = 0;
      let negativeExcluded = 0, positiveExcluded = 0, scoreDifferences = 0, unexplainedYards = 0;
      const trace = vi.spyOn(matchup, 'resolveMatchup').mockImplementation((offense, defense, context, rng) => {
        const result = actualResolve(offense, defense, context, rng);
        if (context.playType === 'pass') {
          const complete = result.success && !result.isSack && result.turnoverType !== 'interception';
          if (!complete) {
            excludedPassGains += result.yardsGained;
            if (result.yardsGained < 0) negativeExcluded += result.yardsGained;
            else positiveExcluded += result.yardsGained;
          } else completionEndzoneExcess += result.yardsGained - Math.min(result.yardsGained, 100 - context.yardLine);
        }
        return result;
      });
      for (const input of inputs) {
        const oldGame = originalOld(structuredClone(input));
        const beforeExcluded = excludedPassGains, beforeExcess = completionEndzoneExcess;
        const newGame = originalNew(structuredClone(input));
        oldYards += sumPassing(oldGame); newYards += sumPassing(newGame);
        const explained = excludedPassGains - beforeExcluded + completionEndzoneExcess - beforeExcess;
        unexplainedYards += sumPassing(oldGame) - sumPassing(newGame) - explained;
        if (oldGame.homeScore !== newGame.homeScore || oldGame.awayScore !== newGame.awayScore) scoreDifferences++;
      }
      trace.mockRestore();
      const teamGames = inputs.length * 2;
      const result = { source, games: inputs.length, teamGames, sequentialSoakPassing: soak.matchup.passYdsPerGame,
        baselinePassing: oldYards / teamGames, repairedPassing: newYards / teamGames,
        excludedPassGainsPerTeamGame: excludedPassGains / teamGames,
        excludedNegativeGainsPerTeamGame: negativeExcluded / teamGames,
        excludedPositiveGainsPerTeamGame: positiveExcluded / teamGames,
        completionEndzoneExcessPerTeamGame: completionEndzoneExcess / teamGames,
        unexplainedYards, scoreDifferences, crashes: soak.matchup.crashes, legacyCrashes: soak.legacy.crashes };
      report.corpora.push(result);
      expect(inputs).toHaveLength(1088);
      expect(unexplainedYards).toBe(0);
      expect(scoreDifferences).toBe(0);
      expect(soak.matchup.crashes).toBe(0);
    }
    if (reviewedRoot) {
      report.reviewedSequentialMovement = report.corpora[1].sequentialSoakPassing - report.corpora[0].sequentialSoakPassing;
      report.reviewedChangedLegacyInjuryInputsMovement = report.corpora[1].repairedPassing - report.corpora[0].repairedPassing;
      report.reviewFixSequentialMovement = report.corpora[2].sequentialSoakPassing - report.corpora[1].sequentialSoakPassing;
    }
    report.sequentialMovement = report.corpora.at(-1).sequentialSoakPassing - report.corpora[0].sequentialSoakPassing;
    report.attributionMovementOnBaselineInputs = report.corpora[0].repairedPassing - report.corpora[0].baselinePassing;
    report.changedLegacyInjuryInputsMovement = report.corpora.at(-1).repairedPassing - report.corpora[0].repairedPassing;
    console.info('CONTROLLED CALIBRATION', JSON.stringify(report));
    if (process.env.GAME_STAT_CALIBRATION_OUTPUT) writeFileSync(process.env.GAME_STAT_CALIBRATION_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  }, 180000);
});
