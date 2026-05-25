import { describe, expect, it } from 'vitest';
import { resolveMatchup } from '../../src/core/sim/matchupEngine.ts';
import { simulateRichGame } from '../../src/core/sim/richGameSimulator.ts';
import { mapOverallToAttributesV2 } from '../../src/core/migration/attributeMigrator.ts';
import { buildBoxScoreViewModel } from '../../src/ui/utils/boxScoreViewModel.js';

const off = {
  release: 70, routeRunning: 70, separation: 70, catchInTraffic: 70, ballTracking: 70,
  throwAccuracyShort: 70, throwAccuracyDeep: 70, throwPower: 70, decisionMaking: 70,
  pocketPresence: 60, passBlockFootwork: 40, passBlockStrength: 55,
  passRush: 40, pressCoverage: 40, zoneCoverage: 40,
};

const def = {
  release: 40, routeRunning: 40, separation: 40, catchInTraffic: 40, ballTracking: 40,
  throwAccuracyShort: 40, throwAccuracyDeep: 40, throwPower: 40, decisionMaking: 40,
  pocketPresence: 40, passBlockFootwork: 40, passBlockStrength: 40,
  passRush: 95, pressCoverage: 85, zoneCoverage: 85,
};

function sequenceRng(values) {
  let idx = 0;
  return () => {
    const value = values[idx] ?? values[values.length - 1] ?? 0.5;
    idx += 1;
    return value;
  };
}

describe('advanced box score event attribution', () => {
  it('is deterministic with same seed', () => {
    const payload = {
      gameId: 'evt-1',
      homeTeamId: 1,
      awayTeamId: 2,
      seed: 4242,
      weather: 'clear',
      homeOffense: mapOverallToAttributesV2(84, 5.5, 'h-off'),
      awayOffense: mapOverallToAttributesV2(83, 5.5, 'a-off'),
      homeDefense: mapOverallToAttributesV2(82, 5.5, 'h-def'),
      awayDefense: mapOverallToAttributesV2(82, 5.5, 'a-def'),
    };

    const one = simulateRichGame(payload);
    const two = simulateRichGame(payload);
    expect(one.advancedAttribution).toEqual(two.advancedAttribution);
  });

  it('increments sacks, drops, and batted pass events by attributed player', () => {
    const dropPlay = resolveMatchup(off, def, {
      down: 2, distance: 8, yardLine: 45, quarter: 1, clockSec: 600, playType: 'pass',
      targetId: 'wr-1', defenderId: 'cb-1', blockerId: 'ot-1', rusherId: 'edge-1',
    }, sequenceRng([0.95, 0.99, 0.99, 0.4, 0.2]));

    const battedPlay = resolveMatchup(off, def, {
      down: 2, distance: 8, yardLine: 45, quarter: 1, clockSec: 600, playType: 'pass',
      targetId: 'wr-1', defenderId: 'cb-1', blockerId: 'ot-1', rusherId: 'edge-1',
    }, sequenceRng([0.95, 0.99, 0.99, 0.4, 0.8, 0.2]));

    const sackPlay = resolveMatchup(off, def, {
      down: 3, distance: 10, yardLine: 35, quarter: 2, clockSec: 500, playType: 'pass',
      targetId: 'wr-1', defenderId: 'cb-1', blockerId: 'ot-1', rusherId: 'edge-1',
    }, sequenceRng([0.95, 0.01, 0.99, 0.4]));

    const flatten = (play) => Object.fromEntries((play.attributionEvents ?? []).map((e) => [e.type, e.playerId]));
    expect(flatten(dropPlay).DROP).toBe('wr-1');
    expect(flatten(battedPlay).BATTED_PASS).toBe('cb-1');
    expect(flatten(sackPlay).SACK_ALLOWED).toBe('ot-1');
    expect(flatten(sackPlay).SACK_MADE).toBe('edge-1');
  });

  it('legacy summaries without advanced attribution still build safely', () => {
    const vm = buildBoxScoreViewModel({
      league: { teams: [] },
      gameId: 'legacy-1',
      game: { gameId: 'legacy-1', homeId: 1, awayId: 2, homeScore: 21, awayScore: 17, played: true },
      context: {},
    });

    expect(vm).toBeTruthy();
    expect(vm.advancedAttribution).toEqual({});
  });

  it('does not mutate player objects passed into simulation', () => {
    const homePlayers = [{ id: 1, name: 'Home WR', pos: 'WR', ovr: 82 }];
    const awayPlayers = [{ id: 2, name: 'Away CB', pos: 'CB', ovr: 81 }];
    const homeSnapshot = JSON.parse(JSON.stringify(homePlayers));
    const awaySnapshot = JSON.parse(JSON.stringify(awayPlayers));

    simulateRichGame({
      gameId: 'immut-1',
      homeTeamId: 1,
      awayTeamId: 2,
      seed: 99,
      weather: 'clear',
      homeOffense: mapOverallToAttributesV2(82, 5.5, 'h-off-immut'),
      awayOffense: mapOverallToAttributesV2(82, 5.5, 'a-off-immut'),
      homeDefense: mapOverallToAttributesV2(82, 5.5, 'h-def-immut'),
      awayDefense: mapOverallToAttributesV2(82, 5.5, 'a-def-immut'),
      homePlayers,
      awayPlayers,
    });

    expect(homePlayers).toEqual(homeSnapshot);
    expect(awayPlayers).toEqual(awaySnapshot);
  });
});
