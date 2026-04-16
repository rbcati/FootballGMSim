import { describe, expect, it } from 'vitest';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import { simulateRichGame } from '../sim/richGameSimulator.ts';

function buildPayload(seed = 7) {
  return {
    gameId: `g-${seed}`,
    homeTeamId: 1,
    awayTeamId: 2,
    seed,
    weather: 'clear' as const,
    homeOffense: mapOverallToAttributesV2(86, 5.5, `h-off-${seed}`),
    awayOffense: mapOverallToAttributesV2(84, 5.5, `a-off-${seed}`),
    homeDefense: mapOverallToAttributesV2(83, 5.5, `h-def-${seed}`),
    awayDefense: mapOverallToAttributesV2(82, 5.5, `a-def-${seed}`),
    homePlayers: [
      { id: 'h-qb', name: 'Home QB', pos: 'QB', ovr: 88 },
      { id: 'h-rb', name: 'Home RB', pos: 'RB', ovr: 84 },
      { id: 'h-wr1', name: 'Home WR1', pos: 'WR', ovr: 85 },
      { id: 'h-wr2', name: 'Home WR2', pos: 'WR', ovr: 82 },
      { id: 'h-te', name: 'Home TE', pos: 'TE', ovr: 80 },
      { id: 'h-edge', name: 'Home EDGE', pos: 'EDGE', ovr: 83 },
      { id: 'h-lb', name: 'Home LB', pos: 'LB', ovr: 81 },
      { id: 'h-cb', name: 'Home CB', pos: 'CB', ovr: 82 },
    ],
    awayPlayers: [
      { id: 'a-qb', name: 'Away QB', pos: 'QB', ovr: 85 },
      { id: 'a-rb', name: 'Away RB', pos: 'RB', ovr: 82 },
      { id: 'a-wr1', name: 'Away WR1', pos: 'WR', ovr: 84 },
      { id: 'a-wr2', name: 'Away WR2', pos: 'WR', ovr: 81 },
      { id: 'a-te', name: 'Away TE', pos: 'TE', ovr: 79 },
      { id: 'a-edge', name: 'Away EDGE', pos: 'EDGE', ovr: 82 },
      { id: 'a-lb', name: 'Away LB', pos: 'LB', ovr: 80 },
      { id: 'a-cb', name: 'Away CB', pos: 'CB', ovr: 81 },
    ],
  };
}

describe('simulateRichGame', () => {
  it('is deterministic for the same seed and emits rich outputs', () => {
    const one = simulateRichGame(buildPayload(101));
    const two = simulateRichGame(buildPayload(101));

    expect(one).toEqual(two);
    expect(one.teamStats.home.plays).toBeGreaterThan(40);
    expect(one.playDigest.length).toBeGreaterThan(0);
    expect(one.quarterScores.home).toHaveLength(4);
  });

  it('keeps player and team totals internally consistent', () => {
    const summary = simulateRichGame(buildPayload(91));

    const homeRows = Object.values(summary.boxScore.home);
    const awayRows = Object.values(summary.boxScore.away);

    const homePassYd = homeRows.reduce((sum, row) => sum + Number(row.stats.passYd ?? 0), 0);
    const awayPassYd = awayRows.reduce((sum, row) => sum + Number(row.stats.passYd ?? 0), 0);
    const homeRushYd = homeRows.reduce((sum, row) => sum + Number(row.stats.rushYd ?? 0), 0);
    const awayRushYd = awayRows.reduce((sum, row) => sum + Number(row.stats.rushYd ?? 0), 0);

    expect(homePassYd).toBe(summary.teamStats.home.passYd);
    expect(awayPassYd).toBe(summary.teamStats.away.passYd);
    expect(homeRushYd).toBe(summary.teamStats.home.rushYd);
    expect(awayRushYd).toBe(summary.teamStats.away.rushYd);
  });

  it('creates a mixed run/pass offense profile', () => {
    const summary = simulateRichGame(buildPayload(313));
    const homePassRate = summary.teamStats.home.passAtt / Math.max(1, summary.teamStats.home.plays);
    const awayPassRate = summary.teamStats.away.passAtt / Math.max(1, summary.teamStats.away.plays);

    expect(homePassRate).toBeGreaterThan(0.25);
    expect(homePassRate).toBeLessThan(0.85);
    expect(awayPassRate).toBeGreaterThan(0.25);
    expect(awayPassRate).toBeLessThan(0.85);
  });
});
