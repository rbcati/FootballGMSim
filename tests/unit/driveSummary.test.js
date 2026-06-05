import { describe, it, expect } from 'vitest';
import { simulateRichGame } from '../../src/core/sim/richGameSimulator.ts';
import { mapOverallToAttributesV2 } from '../../src/core/migration/attributeMigrator.ts';
import { buildGameFlowSummary } from '../../src/core/sim/gameFlowSummary.js';

// Wave 3: richGameSimulator now tracks per-drive data and gameFlowSummary emits
// it (previously a permanently-deferred stub).

const VALID_RESULTS = new Set(['TD', 'FG', 'Punt', 'INT', 'Fumble', 'Downs']);

function buildGame(seed = 11) {
  return simulateRichGame({
    gameId: `d-${seed}`, seed, weather: 'clear',
    homeTeamId: 1, awayTeamId: 2,
    homeOffense: mapOverallToAttributesV2(85, 5.5, `ho-${seed}`),
    awayOffense: mapOverallToAttributesV2(80, 5.5, `ao-${seed}`),
    homeDefense: mapOverallToAttributesV2(83, 5.5, `hd-${seed}`),
    awayDefense: mapOverallToAttributesV2(79, 5.5, `ad-${seed}`),
  });
}

describe('richGameSimulator driveSummary', () => {
  it('emits per-drive entries with valid shape', () => {
    const game = buildGame(11);
    expect(Array.isArray(game.driveSummary)).toBe(true);
    expect(game.driveSummary.length).toBeGreaterThan(0);
    for (const d of game.driveSummary) {
      expect(['home', 'away']).toContain(d.team);
      expect(VALID_RESULTS.has(d.result)).toBe(true);
      expect(d.plays).toBeGreaterThan(0);
      expect(Number.isFinite(d.yards)).toBe(true);
      expect(d.topSeconds).toBeGreaterThanOrEqual(0);
    }
    // Drive numbers are sequential.
    game.driveSummary.forEach((d, i) => expect(d.drive).toBe(i + 1));
  });

  it('produces touchdowns and varied drive outcomes', () => {
    const results = new Set(buildGame(7).driveSummary.map((d) => d.result));
    expect(results.has('TD')).toBe(true);
    expect(results.size).toBeGreaterThan(1);
  });

  it('is deterministic for a fixed seed', () => {
    expect(buildGame(99).driveSummary).toEqual(buildGame(99).driveSummary);
  });
});

describe('gameFlowSummary driveSummary integration', () => {
  it('includes driveSummary when the game supplies it', () => {
    const flow = buildGameFlowSummary(buildGame(13));
    expect(flow).not.toBeNull();
    expect(Array.isArray(flow.driveSummary)).toBe(true);
    expect(flow.driveSummary.length).toBeGreaterThan(0);
    expect(VALID_RESULTS.has(flow.driveSummary[0].result)).toBe(true);
  });

  it('omits driveSummary for legacy games without per-drive data', () => {
    const legacyGame = {
      homeTeamId: 1, awayTeamId: 2, homeScore: 21, awayScore: 17,
      scoringSummary: [{ quarter: 1, teamId: 1, points: 7, type: 'touchdown', scoreAfter: { home: 7, away: 0 } }],
    };
    const flow = buildGameFlowSummary(legacyGame);
    expect(flow).not.toBeNull();
    expect(flow).not.toHaveProperty('driveSummary');
  });
});
