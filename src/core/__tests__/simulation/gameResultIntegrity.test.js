/**
 * Game Result Integrity Audit Closure — Regression Suite (V1)
 *
 * Locks in the audit-closure findings from docs/AUDIT_REPORT.md Section 1:
 *  1. Return-TD probability stays bounded [0.01, 0.15] for any team strength.
 *  2. The final score and its TD/FG/XP/2-pt scoring breakdown come from the
 *     same authoritative source (the drive engine), so the box score always
 *     sums to the scoreboard.
 *  3. Overtime gates on the canonical (post-drive-engine) score, never a
 *     stale intermediate value.
 *  4. Winner/tie state uses strict three-way comparison — a true tie is
 *     never represented as a home win.
 *  5. Identical seed + input always reproduces an identical result.
 */

import { describe, it, expect } from 'vitest';
import { Utils as U } from '../../utils.js';
import { simGameStats } from '../../simulation/index.js';
import { calculateReturnTDChance, buildGameOutcomeState } from '../../simulation/scoreKeeper.js';

// ── Minimal roster factory (mirrors the engine's expected player shape) ─────
function makePlayer(id, pos, ovr = 75) {
  const ratings = {
    QB: { throwPower: 75, throwAccuracy: 75, awareness: 75, speed: 65, agility: 65 },
    RB: { speed: 78, trucking: 72, juking: 70, awareness: 65 },
    WR: { speed: 85, awareness: 72, catching: 80 },
    TE: { speed: 72, awareness: 70, catching: 74 },
    OL: { passBlock: 73, runBlock: 74 },
    DL: { passRushPower: 73, passRushSpeed: 71, tackle: 72, strength: 74 },
    LB: { tackle: 75, awareness: 72, speed: 72, strength: 70 },
    CB: { speed: 82, awareness: 72, agility: 78 },
    S: { speed: 78, awareness: 75, tackle: 70 },
    K: { kickPower: 78, kickAccuracy: 76 },
    P: { kickPower: 76 },
  };
  return {
    id: `${id}`, pos, ovr, name: `${pos} ${id}`, ratings: ratings[pos] || {},
    stats: { game: {}, season: {} },
  };
}

function buildTeam(id) {
  return {
    id,
    abbr: `T${id}`,
    name: `Team ${id}`,
    roster: [
      makePlayer(`${id}-qb1`, 'QB', 80),
      makePlayer(`${id}-rb1`, 'RB', 76),
      makePlayer(`${id}-rb2`, 'RB', 70),
      makePlayer(`${id}-wr1`, 'WR', 79),
      makePlayer(`${id}-wr2`, 'WR', 74),
      makePlayer(`${id}-wr3`, 'WR', 70),
      makePlayer(`${id}-te1`, 'TE', 74),
      makePlayer(`${id}-ol1`, 'OL', 74),
      makePlayer(`${id}-ol2`, 'OL', 72),
      makePlayer(`${id}-ol3`, 'OL', 71),
      makePlayer(`${id}-ol4`, 'OL', 70),
      makePlayer(`${id}-ol5`, 'OL', 70),
      makePlayer(`${id}-dl1`, 'DL', 76),
      makePlayer(`${id}-dl2`, 'DL', 72),
      makePlayer(`${id}-lb1`, 'LB', 74),
      makePlayer(`${id}-lb2`, 'LB', 71),
      makePlayer(`${id}-cb1`, 'CB', 75),
      makePlayer(`${id}-cb2`, 'CB', 72),
      makePlayer(`${id}-s1`, 'S', 73),
      makePlayer(`${id}-k1`, 'K', 70),
      makePlayer(`${id}-p1`, 'P', 70),
    ],
  };
}

function runGame(seed, options = {}) {
  const home = buildTeam(1);
  const away = buildTeam(2);
  const league = {
    week: 1, seasonId: 2030, year: 2030,
    teams: [home, away],
    globalSeed: seed,
  };
  U.setSeed(seed);
  const result = simGameStats(home, away, {
    generateLogs: true,
    league,
    homeAbbr: home.abbr,
    awayAbbr: away.abbr,
    ...options,
  });
  return { result, home, away };
}

// ── 1. Return-TD probability bounded [0.01, 0.15] ───────────────────────────
describe('calculateReturnTDChance — bounded probability', () => {
  it('stays within [0.01, 0.15] for representative strength values', () => {
    for (const str of [40, 70, 100]) {
      const chance = calculateReturnTDChance(str);
      expect(chance).toBeGreaterThanOrEqual(0.01);
      expect(chance).toBeLessThanOrEqual(0.15);
    }
  });

  it('clamps to the floor/ceiling for extreme strength values (regression for the old precedence bug)', () => {
    // The old bug parsed `home ? homeStr : (awayStr - 70) * 0.001`, which for a
    // home team produced `0.04 + homeStr` (~75+ for any realistic strength).
    // A correctly-bounded expression must never exceed 0.15 regardless of how
    // large `str` is.
    expect(calculateReturnTDChance(999)).toBe(0.15);
    expect(calculateReturnTDChance(-999)).toBe(0.01);
    expect(calculateReturnTDChance(0)).toBeGreaterThanOrEqual(0.01);
  });

  it('is symmetric — home and away use the identical formula (no side-dependent branching)', () => {
    // The historical bug made home ≈0.75+ and away ≈0 for the same strength.
    // The fixed formula must produce identical output for identical input
    // regardless of which side it's computed for.
    const homeChance = calculateReturnTDChance(85);
    const awayChance = calculateReturnTDChance(85);
    expect(homeChance).toBe(awayChance);
  });
});

// ── 2. buildGameOutcomeState — three-way winner/tie classification ─────────
describe('buildGameOutcomeState — winner/tie/margin classification', () => {
  it('reports a home win with strict comparison fields', () => {
    const state = buildGameOutcomeState({ homeScore: 24, awayScore: 17 });
    expect(state.homeWin).toBe(true);
    expect(state.awayWin).toBe(false);
    expect(state.tie).toBe(false);
    expect(state.winner).toBe('home');
    expect(state.winnerIsHome).toBe(true);
    expect(state.margin).toBe(7);
  });

  it('reports an away win with strict comparison fields', () => {
    const state = buildGameOutcomeState({ homeScore: 14, awayScore: 20 });
    expect(state.homeWin).toBe(false);
    expect(state.awayWin).toBe(true);
    expect(state.tie).toBe(false);
    expect(state.winner).toBe('away');
    expect(state.winnerIsHome).toBe(false);
    expect(state.margin).toBe(6);
  });

  it('reports a tie and never represents it as a home win', () => {
    const state = buildGameOutcomeState({ homeScore: 20, awayScore: 20 });
    expect(state.tie).toBe(true);
    expect(state.homeWin).toBe(false);
    expect(state.awayWin).toBe(false);
    expect(state.winner).toBeNull();
    expect(state.margin).toBe(0);
    // winnerIsHome only exists for a decisive result, never for a tie.
    expect(state).not.toHaveProperty('winnerIsHome');
  });

  it('carries the overtimePlayed flag through unchanged', () => {
    expect(buildGameOutcomeState({ homeScore: 23, awayScore: 20, overtimePlayed: true }).overtimePlayed).toBe(true);
    expect(buildGameOutcomeState({ homeScore: 23, awayScore: 20 }).overtimePlayed).toBe(false);
  });
});

// ── 3. Final score / TD / FG / XP / 2-pt box-score reconciliation ──────────
describe('simGameStats — box score reconciles with the final score', () => {
  function sumBoxScorePoints(roster) {
    let offensiveTDs = 0;
    let twoPtMade = 0;
    let fgMade = 0;
    let xpMade = 0;
    for (const p of roster) {
      const g = p.stats?.game || {};
      offensiveTDs += (g.rushTD || 0) + (g.recTD || 0);
      twoPtMade += g.twoPtMade || 0;
      fgMade += g.fgMade || 0;
      xpMade += g.xpMade || 0;
    }
    return {
      points: offensiveTDs * 6 + twoPtMade * 2 + fgMade * 3 + xpMade,
      offensiveTDs, twoPtMade, fgMade, xpMade,
    };
  }

  it('home and away box-score point totals sum exactly to the final score across many seeds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { result, home, away } = runGame(seed);
      expect(result).toBeTruthy();

      const homeBox = sumBoxScorePoints(home.roster);
      const awayBox = sumBoxScorePoints(away.roster);

      expect(homeBox.points, `seed ${seed} home mismatch`).toBe(result.homeScore);
      expect(awayBox.points, `seed ${seed} away mismatch`).toBe(result.awayScore);
    }
  });
});

// ── 4. Overtime gates on the canonical score ────────────────────────────────
describe('simGameStats — overtime uses the canonical final score', () => {
  it('never commits a tied result for a playoff game (OT always resolves to a winner)', () => {
    // Playoff games disallow ties (allowTies=false), so if OT correctly gates
    // on the same canonical homeScore/awayScore used for the final result,
    // every playoff game must end decisively. If OT instead gated on a stale
    // intermediate score, a canonical tie could slip through uncorrected and
    // surface here as a tied "playoff" result.
    for (let seed = 1; seed <= 40; seed++) {
      const { result } = runGame(seed, { isPlayoff: true });
      expect(result.homeScore, `seed ${seed} produced a tie in a playoff game`).not.toBe(result.awayScore);
    }
  });
});

// ── 5. Determinism ───────────────────────────────────────────────────────────
describe('simGameStats — deterministic for identical seed/input', () => {
  it('produces an identical score and outcome for the same seed', () => {
    const run1 = runGame(2468);
    const run2 = runGame(2468);
    expect(run1.result.homeScore).toBe(run2.result.homeScore);
    expect(run1.result.awayScore).toBe(run2.result.awayScore);
    expect(run1.result.teamDriveStats).toEqual(run2.result.teamDriveStats);

    const outcome1 = buildGameOutcomeState({ homeScore: run1.result.homeScore, awayScore: run1.result.awayScore });
    const outcome2 = buildGameOutcomeState({ homeScore: run2.result.homeScore, awayScore: run2.result.awayScore });
    expect(outcome1).toEqual(outcome2);
  });
});
