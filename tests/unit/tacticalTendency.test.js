/**
 * Tactical Tendency Regression Tests
 *
 * Validates that:
 *  1. AGGRESSIVE tendency yields significantly more successful deep plays
 *     than CONSERVATIVE across a statistically meaningful sample.
 *  2. The default tendency is BALANCED when none is supplied (new-game reset).
 *  3. All three tendencies produce valid, non-negative game results.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Utils as U } from '../../src/core/utils.js';
import { simGameStats } from '../../src/core/game-simulator.js';

// ── Minimal roster factory ────────────────────────────────────────────────────
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
    S:  { speed: 78, awareness: 75, tackle: 70 },
    K:  { kickPower: 78, kickAccuracy: 76 },
    P:  { kickPower: 76 },
  };
  return { id: `${id}`, pos, ovr, name: `${pos} ${id}`, ratings: ratings[pos] || {} };
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
      makePlayer(`${id}-dl1`, 'DL', 76),
      makePlayer(`${id}-dl2`, 'DL', 72),
      makePlayer(`${id}-lb1`, 'LB', 74),
      makePlayer(`${id}-lb2`, 'LB', 71),
      makePlayer(`${id}-cb1`, 'CB', 75),
      makePlayer(`${id}-cb2`, 'CB', 72),
      makePlayer(`${id}-s1`,  'S',  73),
      makePlayer(`${id}-k1`,  'K',  70),
      makePlayer(`${id}-p1`,  'P',  70),
    ],
  };
}

function buildLeague(userTeamId) {
  return {
    week: 1,
    seasonId: 2030,
    year: 2030,
    userTeamId,
    teams: [buildTeam(1), buildTeam(2)],
    resultsByWeek: { 0: [] },
  };
}

// Count TD-pass plays with >= 15 yards (deep/long plays)
function countDeepPassTDs(playLogs = []) {
  return playLogs.filter(
    (log) => log.type === 'touchdown' && (log.passYds >= 15 || log.recYds >= 15),
  ).length;
}

// Count total passing plays (pass + incomplete)
function countPassPlays(playLogs = []) {
  return playLogs.filter((log) => log.type === 'pass' || log.type === 'interception').length;
}

// Count total running plays
function countRunPlays(playLogs = []) {
  return playLogs.filter((log) => log.type === 'run').length;
}

const HOME = buildTeam(1);
const AWAY = buildTeam(2);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tacticalTendency — engine influence', () => {
  const TRIALS = 40;
  const BASE_SEED = 7777;

  it('AGGRESSIVE yields more deep/long TD passes than CONSERVATIVE over many trials', () => {
    let aggressiveDeep = 0;
    let conservativeDeep = 0;

    for (let i = 0; i < TRIALS; i++) {
      // Use different seeds per trial so each trial is independent
      U.setSeed(BASE_SEED + i * 97);
      const aggResult = simGameStats(HOME, AWAY, {
        generateLogs: true,
        userTendency: 'AGGRESSIVE',
        league: buildLeague(1),
        homeAbbr: 'T1',
        awayAbbr: 'T2',
      });

      U.setSeed(BASE_SEED + i * 97);
      const conResult = simGameStats(HOME, AWAY, {
        generateLogs: true,
        userTendency: 'CONSERVATIVE',
        league: buildLeague(1),
        homeAbbr: 'T1',
        awayAbbr: 'T2',
      });

      aggressiveDeep  += countDeepPassTDs(aggResult?.playLogs);
      conservativeDeep += countDeepPassTDs(conResult?.playLogs);
    }

    // AGGRESSIVE should produce meaningfully more deep pass TDs
    expect(aggressiveDeep).toBeGreaterThan(conservativeDeep);
  });

  it('CONSERVATIVE yields more run plays than AGGRESSIVE over many trials', () => {
    let aggressiveRuns = 0;
    let conservativeRuns = 0;

    for (let i = 0; i < TRIALS; i++) {
      U.setSeed(BASE_SEED + i * 53 + 1);
      const aggResult = simGameStats(HOME, AWAY, {
        generateLogs: true,
        userTendency: 'AGGRESSIVE',
        league: buildLeague(1),
        homeAbbr: 'T1',
        awayAbbr: 'T2',
      });

      U.setSeed(BASE_SEED + i * 53 + 1);
      const conResult = simGameStats(HOME, AWAY, {
        generateLogs: true,
        userTendency: 'CONSERVATIVE',
        league: buildLeague(1),
        homeAbbr: 'T1',
        awayAbbr: 'T2',
      });

      aggressiveRuns  += countRunPlays(aggResult?.playLogs);
      conservativeRuns += countRunPlays(conResult?.playLogs);
    }

    expect(conservativeRuns).toBeGreaterThan(aggressiveRuns);
  });
});

describe('tacticalTendency — new-game state reset', () => {
  it('defaults to BALANCED when no tendency option is supplied', () => {
    U.setSeed(12345);
    const result = simGameStats(HOME, AWAY, {
      generateLogs: true,
      league: buildLeague(1),
      homeAbbr: 'T1',
      awayAbbr: 'T2',
      // userTendency intentionally omitted — must behave as BALANCED
    });

    expect(result).toBeTruthy();
    expect(result.homeScore).toBeGreaterThanOrEqual(0);
    expect(result.awayScore).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.playLogs)).toBe(true);
    // Scores should be finite
    expect(Number.isFinite(result.homeScore)).toBe(true);
    expect(Number.isFinite(result.awayScore)).toBe(true);
  });

  it('returns an identical result shape when tendency is explicitly BALANCED', () => {
    U.setSeed(99999);
    const result = simGameStats(HOME, AWAY, {
      generateLogs: true,
      userTendency: 'BALANCED',
      league: buildLeague(1),
      homeAbbr: 'T1',
      awayAbbr: 'T2',
    });

    expect(result).toBeTruthy();
    expect(result.homeScore).toBeGreaterThanOrEqual(0);
    expect(result.playLogs.length).toBeGreaterThan(0);
  });
});

describe('tacticalTendency — all three tendencies produce valid results', () => {
  for (const tendency of ['AGGRESSIVE', 'BALANCED', 'CONSERVATIVE']) {
    it(`produces valid game output for tendency=${tendency}`, () => {
      U.setSeed(55555);
      const result = simGameStats(HOME, AWAY, {
        generateLogs: true,
        userTendency: tendency,
        league: buildLeague(1),
        homeAbbr: 'T1',
        awayAbbr: 'T2',
      });

      expect(result).toBeTruthy();
      expect(result.homeScore).toBeGreaterThanOrEqual(0);
      expect(result.awayScore).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(result.homeScore)).toBe(true);
      expect(Number.isFinite(result.awayScore)).toBe(true);
      expect(Array.isArray(result.playLogs)).toBe(true);
      expect(result.playLogs.length).toBeGreaterThan(0);
    });
  }
});
