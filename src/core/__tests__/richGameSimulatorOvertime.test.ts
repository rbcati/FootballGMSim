import { describe, expect, it } from 'vitest';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import { simulateRichGame } from '../sim/richGameSimulator.ts';
import type { RichGameSummary } from '../sim/richGameSimulator.ts';

// Post-engine-flip stabilization coverage (audit at 9e5de0a):
// 1. The rich engine must never return a tied final score — downstream playoff
//    code resolves homeScore >= awayScore as a silent home win.
// 2. scoringSummary points must come from score deltas, not a hardcoded 7,
//    so two-point conversions reconcile with the final score.

function buildPayload(seed: number) {
  return {
    gameId: `ot-${seed}`,
    homeTeamId: 1,
    awayTeamId: 2,
    seed,
    weather: 'clear' as const,
    // Evenly matched units maximise the chance of regulation ties so the OT
    // path gets real coverage inside the seed sweep below.
    homeOffense: mapOverallToAttributesV2(80, 5.5, `h-off-${seed}`),
    awayOffense: mapOverallToAttributesV2(80, 5.5, `a-off-${seed}`),
    homeDefense: mapOverallToAttributesV2(80, 5.5, `h-def-${seed}`),
    awayDefense: mapOverallToAttributesV2(80, 5.5, `a-def-${seed}`),
  };
}

const SEED_SWEEP = Array.from({ length: 400 }, (_, i) => i + 1);

function sumQuarterScores(summary: RichGameSummary, side: 'home' | 'away'): number {
  return summary.quarterScores[side].reduce((acc, q) => acc + q, 0);
}

function sumScoringSummary(summary: RichGameSummary, teamId: number): number {
  return summary.scoringSummary
    .filter((event) => event.teamId === teamId)
    .reduce((acc, event) => acc + event.points, 0);
}

describe('simulateRichGame overtime', () => {
  const games = SEED_SWEEP.map((seed) => simulateRichGame(buildPayload(seed)));
  const overtimeGames = games.filter((g) => g.overtime.played);

  it('never returns a tied final score', () => {
    for (const game of games) {
      expect(game.homeScore).not.toBe(game.awayScore);
    }
  });

  it('the seed sweep actually exercises regulation ties and OT', () => {
    expect(games.some((g) => g.regulationTied)).toBe(true);
    expect(overtimeGames.length).toBeGreaterThan(0);
  });

  it('resolves every regulation tie through overtime (or the explicit seeded fallback)', () => {
    for (const game of games.filter((g) => g.regulationTied)) {
      expect(game.overtime.played || game.overtime.decidedBy === 'deadlock_fg').toBe(true);
      expect(game.overtime.decidedBy).not.toBeNull();
    }
  });

  it('emits the OT winner digest event and extends quarterScores per OT period', () => {
    for (const game of overtimeGames) {
      expect(game.quarterScores.home).toHaveLength(4 + game.overtime.periods);
      expect(game.quarterScores.away).toHaveLength(4 + game.overtime.periods);
      // playDigest is capped at the first 12 digest events, so the OT winner
      // event may fall outside it — but a score-decided OT always leaves a
      // quarter > 4 row in scoringSummary, and the fallback marks decidedBy.
      const winnerText = `OT — ${game.homeScore > game.awayScore ? 'Home' : 'Away'} wins in overtime`;
      const inDigest = game.playDigest.some((e) => e.text.startsWith(winnerText));
      const otScore = game.scoringSummary.some((e) => e.quarter > 4);
      expect(inDigest || otScore || game.overtime.decidedBy === 'deadlock_fg').toBe(true);
    }
  });

  it('keeps quarterScores, teamStats, and final score internally consistent in every game', () => {
    for (const game of games) {
      expect(sumQuarterScores(game, 'home')).toBe(game.homeScore);
      expect(sumQuarterScores(game, 'away')).toBe(game.awayScore);
      for (const side of ['home', 'away'] as const) {
        const line = game.teamStats[side];
        const score = side === 'home' ? game.homeScore : game.awayScore;
        const tds = line.passTD + line.rushTD;
        const base = tds * 6 + line.fieldGoalsMade * 3 + line.extraPointsMade;
        const residual = score - base;
        // Residual is the two-point conversions: even, non-negative, at most 2/TD.
        expect(residual).toBeGreaterThanOrEqual(0);
        expect(residual % 2).toBe(0);
        expect(residual).toBeLessThanOrEqual(2 * tds);
      }
    }
  });

  it('is deterministic for a fixed seed, including OT games', () => {
    const otSeed = SEED_SWEEP.find((seed, idx) => games[idx].overtime.played);
    expect(otSeed).toBeDefined();
    const one = simulateRichGame(buildPayload(otSeed as number));
    const two = simulateRichGame(buildPayload(otSeed as number));
    expect(one).toEqual(two);
  });
});

describe('simulateRichGame scoringSummary points', () => {
  const games = SEED_SWEEP.map((seed) => simulateRichGame(buildPayload(seed)));

  it('reconciles scoringSummary points with the final score in every game', () => {
    for (const game of games) {
      expect(sumScoringSummary(game, 1)).toBe(game.homeScore);
      expect(sumScoringSummary(game, 2)).toBe(game.awayScore);
    }
  });

  it('covers the two-point path (a TD row worth 6 or 8, not the old hardcoded 7)', () => {
    const tdRows = games.flatMap((g) => g.scoringSummary.filter((e) => e.scoreType === 'touchdown'));
    expect(tdRows.some((row) => row.points === 8 || row.points === 6)).toBe(true);
    for (const row of tdRows) {
      expect([6, 7, 8]).toContain(row.points);
    }
  });

  it('keeps every field goal row at 3 points', () => {
    for (const game of games) {
      for (const row of game.scoringSummary.filter((e) => e.scoreType === 'field_goal')) {
        expect(row.points).toBe(3);
      }
    }
  });
});
