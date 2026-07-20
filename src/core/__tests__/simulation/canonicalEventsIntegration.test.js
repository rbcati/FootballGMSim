/**
 * Canonical event ledger — full production-path integration (#1700)
 * ─────────────────────────────────────────────────────────────────
 * Proves that the SAME canonical event ledger reconciles to the official final
 * score when produced through the real simulation path (simGameStats and the
 * full simulateBatch → commitGameResult commit path), not just from synthetic
 * drive logs. This is the boundary the worker forwards and the archive persists.
 */
import { describe, it, expect } from 'vitest';
import { Utils as U } from '../../utils.js';
import { simGameStats, simulateBatch } from '../../simulation/index.js';
import { reconcileCanonicalEvents } from '../../simulation/canonicalGameEvents.js';

function makePlayer(id, pos, ovr = 75) {
  const ratings = {
    QB: { throwPower: 82, throwAccuracy: 84, awareness: 82 },
    RB: { speed: 88, trucking: 80, juking: 84 },
    WR: { speed: 90, awareness: 80, catching: 88 },
    TE: { speed: 76, awareness: 76, catching: 80 },
    OL: { passBlock: 80, runBlock: 80 },
    DL: { passRushPower: 80, passRushSpeed: 78, tackle: 76, strength: 80 },
    LB: { tackle: 80, awareness: 76, speed: 76 },
    CB: { speed: 86, awareness: 76 },
    S: { speed: 82, awareness: 78, tackle: 74 },
    K: { kickPower: 82, kickAccuracy: 82 },
    P: { kickPower: 80 },
  };
  return { id: `${id}`, pos, ovr, name: `${pos} ${id}`, ratings: ratings[pos] || {}, stats: { game: {}, season: {} } };
}

function buildTeam(id, abbr) {
  return {
    id, abbr, name: abbr,
    roster: [
      makePlayer(`${id}-qb1`, 'QB', 88), makePlayer(`${id}-qb2`, 'QB', 74),
      makePlayer(`${id}-rb1`, 'RB', 84), makePlayer(`${id}-rb2`, 'RB', 74),
      makePlayer(`${id}-wr1`, 'WR', 86), makePlayer(`${id}-wr2`, 'WR', 80), makePlayer(`${id}-wr3`, 'WR', 74),
      makePlayer(`${id}-te1`, 'TE', 78),
      ...[1, 2, 3, 4, 5].map((i) => makePlayer(`${id}-ol${i}`, 'OL', 76)),
      makePlayer(`${id}-dl1`, 'DL', 80), makePlayer(`${id}-dl2`, 'DL', 74),
      makePlayer(`${id}-lb1`, 'LB', 78), makePlayer(`${id}-lb2`, 'LB', 72),
      makePlayer(`${id}-cb1`, 'CB', 78), makePlayer(`${id}-cb2`, 'CB', 74),
      makePlayer(`${id}-s1`, 'S', 76),
      makePlayer(`${id}-k1`, 'K', 78), makePlayer(`${id}-p1`, 'P', 74),
    ],
  };
}

const SEEDS = [6, 39, 123, 777, 2026, 4242, 8888];

function assertLedgerReconciles(events, finalScore) {
  expect(Array.isArray(events)).toBe(true);
  expect(events.length).toBeGreaterThan(0);
  const rec = reconcileCanonicalEvents(events, finalScore);
  expect(rec.finalMatchesSum).toBe(true);
  expect(rec.finalMatchesLast).toBe(true);
  expect(rec.monotonic).toBe(true);
  expect(rec.scoreOnlyOnScore).toBe(true);
  expect(rec.strictlyOrdered).toBe(true);
  expect(rec.uniqueIds).toBe(true);
}

describe('simGameStats emits a canonical event ledger that reconciles to the final', () => {
  it.each(SEEDS)('seed %i: canonicalEvents / quarterScores / scoringSummary all == final', (seed) => {
    const home = buildTeam(1, 'NYJ');
    const away = buildTeam(2, 'BAL');
    const league = { week: 6, seasonId: 2026, year: 2026, teams: [home, away], globalSeed: seed };
    U.setSeed(seed);
    const result = simGameStats(home, away, { generateLogs: true, league, homeAbbr: 'NYJ', awayAbbr: 'BAL' });
    expect(result).toBeTruthy();

    const finalScore = { home: result.homeScore, away: result.awayScore };
    assertLedgerReconciles(result.canonicalEvents, finalScore);

    // Quarter totals equal the final score.
    const total = (arr) => (arr || []).reduce((a, b) => a + b, 0);
    expect(total(result.quarterScores?.home)).toBe(finalScore.home);
    expect(total(result.quarterScores?.away)).toBe(finalScore.away);

    // Scoring summary totals equal the final score.
    const ssHome = (result.scoringSummary || []).filter((r) => r.teamId === 1).reduce((a, r) => a + r.points, 0);
    const ssAway = (result.scoringSummary || []).filter((r) => r.teamId === 2).reduce((a, r) => a + r.points, 0);
    expect(ssHome).toBe(finalScore.home);
    expect(ssAway).toBe(finalScore.away);
  });
});

describe('full commit path (simulateBatch → commitGameResult) carries the same ledger', () => {
  it.each(SEEDS)('seed %i: result package canonicalEvents reconcile to scoreHome/scoreAway', (seed) => {
    const home = buildTeam(1, 'NYJ');
    const away = buildTeam(2, 'BAL');
    const league = { id: 'L', week: 6, seasonId: 2026, year: 2026, teams: [home, away], globalSeed: seed };
    U.setSeed(seed);
    const [res] = simulateBatch([{ home, away, week: 6 }], { league, generateLogs: true });
    expect(res).toBeTruthy();

    const finalScore = {
      home: res.scoreHome ?? res.homeScore,
      away: res.scoreAway ?? res.awayScore,
    };
    assertLedgerReconciles(res.canonicalEvents, finalScore);
  });
});
