/**
 * Simulation Engine Strategic Responsiveness & Executive Postgame Diagnostics
 * — Invariant Regression Suite (V1)
 *
 * Guarantees:
 *  1. Bounded strategic modifiers never exceed the ±5% schematic execution cap,
 *     and are derived purely (deterministically) from the selected plan IDs.
 *  2. Identical tactical setups under matching seeds yield byte-identical
 *     mathematical outcomes (scores, drive stats, and gameReasoningFlags).
 *  3. Legacy save states missing dynamic strategies fall back safely to standard
 *     team-match parameters without crashing, and still emit a flags array.
 *  4. The diagnostic engine surfaces the documented core tokens and the shared
 *     token→bullet translator produces polished, attributed prose.
 */

import { describe, it, expect } from 'vitest';
import { Utils as U } from '../utils.js';
import { simGameStats } from '../game-simulator.js';
import { computeStrategicEdge } from '../strategy.js';
import { deriveGameReasoningFlags, GAME_REASONING_TOKENS } from '../weeklyNarrativeFlags.js';
import { buildReasoningBullets } from '../gameSummary.js';

// ── Minimal roster factory (mirrors the engine's expected player shape) ─────────
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

// Fresh team objects each call so no cached non-enumerable props leak between runs.
function buildTeam(id, strategies = null) {
  const team = {
    id,
    abbr: `T${id}`,
    name: `Team ${id}`,
    roster: [
      makePlayer(`${id}-qb1`, 'QB', 80),
      makePlayer(`${id}-qb2`, 'QB', 64),
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
  if (strategies) team.strategies = strategies;
  return team;
}

function buildLeague(userTeamId, homeStrats = null, awayStrats = null) {
  return {
    week: 1,
    seasonId: 2030,
    year: 2030,
    userTeamId,
    teams: [buildTeam(1, homeStrats), buildTeam(2, awayStrats)],
    resultsByWeek: { 0: [] },
  };
}

// A clean home counter: AGGRESSIVE_PASSING beats away BLITZ_HEAVY (+1) and
// DISGUISE_COVERAGE smothers away AGGRESSIVE_PASSING (+1) → net +2 (countered).
const HOME_COUNTER = { offPlanId: 'AGGRESSIVE_PASSING', defPlanId: 'DISGUISE_COVERAGE', riskId: 'BALANCED' };
const AWAY_EXPOSED = { offPlanId: 'AGGRESSIVE_PASSING', defPlanId: 'BLITZ_HEAVY', riskId: 'BALANCED' };

function runGame(seed, { homeStrats = null, awayStrats = null } = {}) {
  const home = buildTeam(1, homeStrats);
  const away = buildTeam(2, awayStrats);
  const league = buildLeague(1, homeStrats, awayStrats);
  // Use the SAME fresh team objects the league references so strategies resolve.
  league.teams[0] = home;
  league.teams[1] = away;
  U.setSeed(seed);
  return simGameStats(home, away, {
    generateLogs: true,
    league,
    homeAbbr: 'T1',
    awayAbbr: 'T2',
  });
}

// ── 1. Bounded strategic modifiers (pure, deterministic) ────────────────────────
describe('computeStrategicEdge — bounded, deterministic counters', () => {
  it('never exceeds the ±5% execution cap for any plan combination', () => {
    const offPlans = ['BALANCED', 'AGGRESSIVE_PASSING', 'BALL_CONTROL', 'PROTECT_QB', 'FEED_STAR'];
    const defPlans = ['BALANCED', 'SELL_OUT_RUN', 'DISGUISE_COVERAGE', 'BLITZ_HEAVY', 'TWO_HIGH_SAFE'];
    const risks = ['CONSERVATIVE', 'BALANCED', 'AGGRESSIVE'];
    for (const offPlanId of offPlans) {
      for (const defPlanId of defPlans) {
        for (const riskId of risks) {
          const team = { strategies: { offPlanId, defPlanId, riskId } };
          for (const oOff of offPlans) {
            for (const oDef of defPlans) {
              const opp = { strategies: { offPlanId: oOff, defPlanId: oDef, riskId: 'BALANCED' } };
              const { edge } = computeStrategicEdge(team, opp);
              expect(Math.abs(edge)).toBeLessThanOrEqual(0.05 + 1e-9);
              expect(Number.isFinite(edge)).toBe(true);
            }
          }
        }
      }
    }
  });

  it('is a pure function of plan identifiers (repeatable)', () => {
    const team = { strategies: HOME_COUNTER };
    const opp = { strategies: AWAY_EXPOSED };
    const a = computeStrategicEdge(team, opp);
    const b = computeStrategicEdge(team, opp);
    expect(a).toEqual(b);
  });

  it('flags a clean hard counter as a schematic edge', () => {
    const res = computeStrategicEdge({ strategies: HOME_COUNTER }, { strategies: AWAY_EXPOSED });
    expect(res.offCounter + res.defCounter).toBeGreaterThanOrEqual(2);
    expect(res.countered).toBe(true);
    expect(res.edge).toBeGreaterThan(0);
  });

  it('returns a neutral zero edge for legacy teams without strategies', () => {
    // No own strategy → neutral.
    expect(computeStrategicEdge({}, {})).toEqual({ edge: 0, offCounter: 0, defCounter: 0, countered: false });
    // Own counter plan but an opponent with no tendency to exploit → still neutral.
    expect(computeStrategicEdge({ strategies: HOME_COUNTER }, {}).edge).toBe(0);
    // Own counter plan vs an exposed opponent → a real, non-zero edge.
    expect(computeStrategicEdge({ strategies: HOME_COUNTER }, { strategies: AWAY_EXPOSED }).edge).toBeGreaterThan(0);
  });
});

// ── 2. Identical setups + matching seed → identical math ────────────────────────
describe('simGameStats — deterministic strategic responsiveness', () => {
  it('identical tactical setups under matching seeds yield identical outcomes', () => {
    const opts = { homeStrats: HOME_COUNTER, awayStrats: AWAY_EXPOSED };
    const r1 = runGame(4242, opts);
    const r2 = runGame(4242, opts);

    expect(r1).toBeTruthy();
    expect(r2).toBeTruthy();
    expect(r1.homeScore).toBe(r2.homeScore);
    expect(r1.awayScore).toBe(r2.awayScore);
    expect(r1.teamDriveStats).toEqual(r2.teamDriveStats);
    expect(r1.gameReasoningFlags).toEqual(r2.gameReasoningFlags);
  });

  it('a schematic counter shifts outcomes versus a neutral plan under the same seed', () => {
    // Both runs share the seed; only the home tactical setup changes. Because the
    // edge is applied without consuming RNG, divergence is purely the bounded
    // modifier's doing — proving the tactical input maps into the drive loop.
    let sawDifference = false;
    for (let i = 0; i < 8 && !sawDifference; i++) {
      const seed = 9100 + i * 31;
      const countered = runGame(seed, { homeStrats: HOME_COUNTER, awayStrats: AWAY_EXPOSED });
      const neutral = runGame(seed, {
        homeStrats: { offPlanId: 'BALANCED', defPlanId: 'BALANCED', riskId: 'BALANCED' },
        awayStrats: AWAY_EXPOSED,
      });
      if (countered.homeScore !== neutral.homeScore || countered.awayScore !== neutral.awayScore) {
        sawDifference = true;
      }
    }
    expect(sawDifference).toBe(true);
  });
});

// ── 3. Legacy save fallback safety ──────────────────────────────────────────────
describe('simGameStats — legacy save fallback', () => {
  it('does not crash when teams have no dynamic strategies', () => {
    const r = runGame(7001, { homeStrats: null, awayStrats: null });
    expect(r).toBeTruthy();
    expect(Number.isFinite(r.homeScore)).toBe(true);
    expect(Number.isFinite(r.awayScore)).toBe(true);
    expect(Array.isArray(r.gameReasoningFlags)).toBe(true);
    // No schematic edge should ever be claimed without a strategy profile.
    expect(r.gameReasoningFlags.some((f) => f.token === GAME_REASONING_TOKENS.SCHEMATIC_EDGE)).toBe(false);
  });

  it('produces identical legacy outcomes under matching seeds', () => {
    const a = runGame(7002, {});
    const b = runGame(7002, {});
    expect(a.homeScore).toBe(b.homeScore);
    expect(a.awayScore).toBe(b.awayScore);
    expect(a.gameReasoningFlags).toEqual(b.gameReasoningFlags);
  });
});

// ── 4. Diagnostic flag engine + bullet translation ──────────────────────────────
describe('gameReasoningFlags — engine output', () => {
  it('attaches a gameReasoningFlags array to every simulated game', () => {
    const r = runGame(8080, { homeStrats: HOME_COUNTER, awayStrats: AWAY_EXPOSED });
    expect(Array.isArray(r.gameReasoningFlags)).toBe(true);
    r.gameReasoningFlags.forEach((flag) => {
      expect(typeof flag.token).toBe('string');
      expect(flag).toHaveProperty('teamAbbr');
    });
  });

  it('surfaces SCHEMATIC_EDGE for a team that hard-counters its opponent', () => {
    const r = runGame(8081, { homeStrats: HOME_COUNTER, awayStrats: AWAY_EXPOSED });
    const edgeFlag = r.gameReasoningFlags.find((f) => f.token === GAME_REASONING_TOKENS.SCHEMATIC_EDGE);
    expect(edgeFlag).toBeTruthy();
    expect(edgeFlag.teamAbbr).toBe('T1');
  });
});

describe('deriveGameReasoningFlags — pure diagnostic derivation', () => {
  const base = {
    home: { id: 1, abbr: 'PIT' },
    away: { id: 2, abbr: 'CLE' },
    homeScore: 27,
    awayScore: 17,
  };

  it('emits TRENCH_DOMINANCE when an OL overmatches the opposing front', () => {
    const flags = deriveGameReasoningFlags({
      ...base,
      trenches: { homeOL: 90, awayDL: 70, awayOL: 72, homeDL: 74 },
    });
    const t = flags.find((f) => f.token === GAME_REASONING_TOKENS.TRENCH_DOMINANCE);
    expect(t).toBeTruthy();
    expect(t.teamAbbr).toBe('PIT');
  });

  it('emits RED_ZONE_EFFICIENCY when a team stalls on multiple trips', () => {
    const flags = deriveGameReasoningFlags({
      ...base,
      redZone: { home: { trips: 4, tds: 1 }, away: { trips: 2, tds: 2 } },
    });
    const rz = flags.find((f) => f.token === GAME_REASONING_TOKENS.RED_ZONE_EFFICIENCY);
    expect(rz).toBeTruthy();
    expect(rz.teamAbbr).toBe('PIT');
  });

  it('emits TURNOVER_SWING and attributes it to the beneficiary', () => {
    const flags = deriveGameReasoningFlags({
      ...base,
      turnovers: { home: 0, away: 3 }, // CLE gave it away 3 times → PIT benefits
    });
    const to = flags.find((f) => f.token === GAME_REASONING_TOKENS.TURNOVER_SWING);
    expect(to).toBeTruthy();
    expect(to.teamAbbr).toBe('PIT');
  });

  it('emits DEPTH_COLLAPSE when attrition forces low backups into key roles', () => {
    const flags = deriveGameReasoningFlags({
      ...base,
      depth: { home: { occurred: true, gap: 14 }, away: { occurred: false } },
    });
    const dc = flags.find((f) => f.token === GAME_REASONING_TOKENS.DEPTH_COLLAPSE);
    expect(dc).toBeTruthy();
    expect(dc.teamAbbr).toBe('PIT');
  });

  it('returns an empty array for a featureless game and never throws', () => {
    expect(deriveGameReasoningFlags({})).toEqual([]);
    expect(deriveGameReasoningFlags(base)).toEqual([]);
  });
});

describe('buildReasoningBullets — shared token translation', () => {
  it('translates tokens into polished, attributed bullet prose', () => {
    const bullets = buildReasoningBullets([
      { token: 'TRENCH_DOMINANCE', teamAbbr: 'Pittsburgh', detail: '' },
      { token: 'TURNOVER_SWING', teamAbbr: 'Pittsburgh', detail: '' },
    ]);
    expect(bullets).toHaveLength(2);
    expect(bullets[0]).toMatch(/Pittsburgh/);
    expect(bullets[0].toLowerCase()).toContain('trench');
    expect(bullets[1].toLowerCase()).toContain('turnover');
  });

  it('ignores unknown tokens and dedupes identical clauses', () => {
    const bullets = buildReasoningBullets([
      { token: 'NONSENSE', teamAbbr: 'X' },
      { token: 'SCHEMATIC_EDGE', teamAbbr: 'X', detail: '' },
      { token: 'SCHEMATIC_EDGE', teamAbbr: 'X', detail: '' },
    ]);
    expect(bullets).toHaveLength(1);
  });

  it('is safe with empty / non-array input', () => {
    expect(buildReasoningBullets()).toEqual([]);
    expect(buildReasoningBullets(null)).toEqual([]);
  });
});
