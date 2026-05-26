import { describe, it, expect } from 'vitest';
import { buildPlayerAdvancedStatsView } from '../../src/ui/utils/playerAdvancedStatsViewModel.js';

describe('buildPlayerAdvancedStatsView', () => {
  it('returns an empty view when archive is missing', () => {
    expect(buildPlayerAdvancedStatsView(11, null)).toEqual({
      hasData: false,
      career: null,
      seasons: [],
    });
  });

  it('returns an empty view when the player has no archived advanced records', () => {
    const archive = {
      12: {
        2031: { targets: 8 },
      },
    };

    expect(buildPlayerAdvancedStatsView(11, archive).hasData).toBe(false);
  });

  it('resolves string and numeric player ids interchangeably', () => {
    const archive = {
      11: {
        2031: { battedPasses: 3 },
      },
    };

    expect(buildPlayerAdvancedStatsView(11, archive).career.battedPasses).toBe(3);
    expect(buildPlayerAdvancedStatsView('11', archive).career.battedPasses).toBe(3);
  });

  it('ignores archive metadata and player-year metadata', () => {
    const archive = {
      __meta: {
        archivedGameIds: {
          '2031:g1': true,
        },
      },
      11: {
        __meta: { source: 'test' },
        archivedGameIds: { stray: true },
        2031: { targets: 4, drops: 1 },
      },
    };

    const view = buildPlayerAdvancedStatsView(11, archive);
    expect(view.hasData).toBe(true);
    expect(view.seasons).toHaveLength(1);
    expect(view.career.targets).toBe(4);
    expect(view.career.drops).toBe(1);
  });

  it('sums sparse multi-season records into career totals', () => {
    const archive = {
      p1: {
        2029: { targets: 11, drops: 2, sacksMade: 1 },
        2030: { coverageTargets: 14, coverageCompletionsAllowed: 6 },
        2031: { targets: 9, drops: 1, sacksAllowed: 3, receptionsAllowed: 5 },
      },
    };

    const view = buildPlayerAdvancedStatsView('p1', archive);
    expect(view.career).toEqual({
      targets: 20,
      drops: 3,
      battedPasses: 0,
      coverageTargets: 14,
      coverageCompletionsAllowed: 6,
      receptionsAllowed: 5,
      sacksAllowed: 3,
      sacksMade: 1,
    });
  });

  it('sorts season rows newest-first', () => {
    const archive = {
      p1: {
        2029: { targets: 1 },
        2031: { targets: 3 },
        2030: { targets: 2 },
      },
    };

    const view = buildPlayerAdvancedStatsView('p1', archive);
    expect(view.seasons.map((row) => row.season)).toEqual([2031, 2030, 2029]);
  });

  it('does not mutate the archive input', () => {
    const archive = {
      p1: {
        2031: { targets: '6', drops: 2 },
      },
      __meta: { archivedGameIds: { '2031:g1': true } },
    };
    const snapshot = JSON.parse(JSON.stringify(archive));

    buildPlayerAdvancedStatsView('p1', archive);
    expect(archive).toEqual(snapshot);
  });

  it('does not crash on legacy malformed save shapes', () => {
    expect(buildPlayerAdvancedStatsView('p1', [])).toEqual({
      hasData: false,
      career: null,
      seasons: [],
    });
    expect(buildPlayerAdvancedStatsView('p1', { p1: [] })).toEqual({
      hasData: false,
      career: null,
      seasons: [],
    });
    expect(buildPlayerAdvancedStatsView('p1', { p1: { 2031: null } })).toEqual({
      hasData: false,
      career: null,
      seasons: [],
    });
  });
});

