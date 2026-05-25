import { describe, expect, it } from 'vitest';
import { mapOverallToAttributesV2 } from '../../src/core/migration/attributeMigrator.ts';
import { simulateRichGame } from '../../src/core/sim/richGameSimulator.ts';
import { buildBoxScoreViewModel } from '../../src/ui/utils/boxScoreViewModel.js';

function buildPayload(seed = 42) {
  return {
    gameId: `attr-${seed}`,
    homeTeamId: 10,
    awayTeamId: 20,
    seed,
    weather: 'clear',
    homeOffense: mapOverallToAttributesV2(84, 5.5, `ho-${seed}`),
    awayOffense: mapOverallToAttributesV2(82, 5.5, `ao-${seed}`),
    homeDefense: mapOverallToAttributesV2(83, 5.5, `hd-${seed}`),
    awayDefense: mapOverallToAttributesV2(81, 5.5, `ad-${seed}`),
    homePlayers: [
      { id: 'h-qb', name: 'HQB', pos: 'QB', ovr: 84 },
      { id: 'h-wr1', name: 'HWR1', pos: 'WR', ovr: 82 },
      { id: 'h-te1', name: 'HTE1', pos: 'TE', ovr: 80 },
      { id: 'h-edge1', name: 'HEDGE1', pos: 'EDGE', ovr: 84 },
      { id: 'h-cb1', name: 'HCB1', pos: 'CB', ovr: 83 },
    ],
    awayPlayers: [
      { id: 'a-qb', name: 'AQB', pos: 'QB', ovr: 83 },
      { id: 'a-wr1', name: 'AWR1', pos: 'WR', ovr: 81 },
      { id: 'a-te1', name: 'ATE1', pos: 'TE', ovr: 79 },
      { id: 'a-edge1', name: 'AEDGE1', pos: 'EDGE', ovr: 83 },
      { id: 'a-cb1', name: 'ACB1', pos: 'CB', ovr: 82 },
    ],
  };
}

describe('advanced box score event attribution', () => {
  it('captures pass-context events in the attribution map', () => {
    const summary = simulateRichGame(buildPayload(77));
    const rows = Object.values(summary.advancedAttribution ?? {});

    const totalTargets = rows.reduce((sum, row) => sum + (row.targets ?? 0), 0);
    const totalDrops = rows.reduce((sum, row) => sum + (row.drops ?? 0), 0);
    const totalBatted = rows.reduce((sum, row) => sum + (row.battedPasses ?? 0), 0);

    expect(totalTargets).toBeGreaterThan(0);
    expect(totalDrops + totalBatted).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic for seeded replays', () => {
    const one = simulateRichGame(buildPayload(1234));
    const two = simulateRichGame(buildPayload(1234));
    expect(one.advancedAttribution).toEqual(two.advancedAttribution);
  });

  it('keeps legacy summaries render-safe when attribution is absent', () => {
    const legacySummary = simulateRichGame(buildPayload(88));
    delete legacySummary.advancedAttribution;

    const vm = buildBoxScoreViewModel({
      league: { teams: [{ id: 10, abbr: 'HOM', name: 'Home' }, { id: 20, abbr: 'AWY', name: 'Away' }] },
      game: { ...legacySummary, id: legacySummary.gameId, played: true },
    });

    expect(vm.advancedAttribution).toEqual({});
    expect(vm.archiveQuality).toBeTruthy();
  });
});
