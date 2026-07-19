/**
 * Canonical Game Authority — Revival V1 regression suite
 * ──────────────────────────────────────────────────────
 * Locks in the fix for the "one matchup, multiple incompatible games" fracture:
 * the postgame factual surfaces (player stats, leaders, grades) must consume the
 * CANONICAL player box score, never the narrated liveStats / play-log stream.
 *
 * Characterization (before-fix behavior, still true of the narration stream):
 *   • liveStats rotates the QB every drop-back → many QBs, tiny workloads whose
 *     passing yards badly undercount the real game.
 *
 * Canonical guarantees (after-fix, asserted here):
 *   • the box score attributes passing to a single starter per team;
 *   • player totals reconcile internally (pass==rec yards/TDs, comp==rec);
 *   • the score breakdown sums to the final score;
 *   • grades derive from canonical stats, not narration references.
 */

import { describe, it, expect } from 'vitest';
import { Utils as U } from '../../utils.js';
import { simGameStats, simulateBatch } from '../../simulation/index.js';
import {
  reconcilePlayerIdentities,
  reconcilePlayerToTeam,
  reconcileScoreBreakdown,
  sumBoxScoreSide,
} from '../../simulation/gameStatReconciliation.js';
import { gradeTeamBoxScore } from '../../../ui/utils/gamePerformanceGrades.js';

function makePlayer(id, pos, ovr = 75) {
  const ratings = {
    QB: { throwPower: 82, throwAccuracy: 84, awareness: 82, speed: 70, agility: 68 },
    RB: { speed: 88, trucking: 80, juking: 84, awareness: 72 },
    WR: { speed: 90, awareness: 80, catching: 88 },
    TE: { speed: 76, awareness: 76, catching: 80 },
    OL: { passBlock: 80, runBlock: 80 },
    DL: { passRushPower: 80, passRushSpeed: 78, tackle: 76, strength: 80 },
    LB: { tackle: 80, awareness: 76, speed: 76, strength: 76 },
    CB: { speed: 86, awareness: 76, agility: 82 },
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
      makePlayer(`${id}-qb1`, 'QB', 88), makePlayer(`${id}-qb2`, 'QB', 74), makePlayer(`${id}-qb3`, 'QB', 68),
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

function boxScoreSideFromRoster(team) {
  const side = {};
  for (const p of team.roster) {
    if (p?.stats?.game && Object.keys(p.stats.game).length) {
      side[String(p.id)] = { name: p.name, pos: p.pos, stats: p.stats.game };
    }
  }
  return side;
}

function runGame(seed) {
  const home = buildTeam(1, 'NYJ');
  const away = buildTeam(2, 'BAL');
  const league = { week: 6, seasonId: 2026, year: 2026, teams: [home, away], globalSeed: seed };
  U.setSeed(seed);
  const result = simGameStats(home, away, { generateLogs: true, league, homeAbbr: 'NYJ', awayAbbr: 'BAL' });
  return { result, home, away };
}

/**
 * Run the FULL production commit path (simulateBatch → commitGameResult) so the
 * result package carries the real `boxScore` and `teamStats` the worker emits.
 */
function runBatch(seed, options = {}) {
  const home = buildTeam(1, 'NYJ');
  const away = buildTeam(2, 'BAL');
  const league = { id: 'L', week: 6, seasonId: 2026, year: 2026, teams: [home, away], globalSeed: seed };
  U.setSeed(seed);
  const [res] = simulateBatch([{ home, away, week: 6 }], { league, generateLogs: true, ...options });
  return { res, home, away };
}

const SEEDS = [6, 39, 123, 777, 2026, 4242, 8888];

describe('canonical box score owns QB participation (no rotation)', () => {
  it('attributes passing to a single starter per team even when narration rotates QBs', () => {
    const { result, home, away } = runGame(6);
    expect(result).toBeTruthy();

    // Narration stream (liveStats) rotates through many QBs — the historic bug.
    const liveQBs = Object.values(result.liveStats || {}).filter((p) => p.pos === 'QB' && (p.passAtt || 0) > 0);
    expect(liveQBs.length).toBeGreaterThan(1); // characterizes the narration defect

    // Canonical box score: exactly one QB with attempts per team.
    for (const team of [home, away]) {
      const qbsWithAtt = team.roster.filter((p) => p.pos === 'QB' && (p.stats.game.passAtt || 0) > 0);
      expect(qbsWithAtt).toHaveLength(1);
    }
  });

  it('canonical passing yards exceed the undercounting narration total', () => {
    const { result, home, away } = runGame(6);
    const liveQBYds = Object.values(result.liveStats || {})
      .filter((p) => p.pos === 'QB').reduce((a, p) => a + (p.passYds || 0), 0);
    const canonYds = [home, away].reduce((a, team) => a
      + team.roster.filter((p) => p.pos === 'QB').reduce((s, p) => s + (p.stats.game.passYd || 0), 0), 0);
    expect(canonYds).toBeGreaterThan(liveQBYds);
  });

  it('forced QB injury transfers a real workload — attempts, completions, yards AND TDs — to the backup', () => {
    // Seed 122 with a high injury factor deterministically injures the NYJ (home)
    // starting QB; the backup must inherit a meaningful, reconciled workload.
    const { res, home } = runBatch(122, { injuryFactor: 8 });
    expect(res?.boxScore).toBeTruthy();

    const qbLines = home.roster
      .filter((p) => p.pos === 'QB' && (p.stats.game.passAtt || 0) > 0)
      .sort((a, b) => (b.stats.game.passAtt || 0) - (a.stats.game.passAtt || 0));

    // A QB injury was recorded and two QBs share the passing workload.
    expect((res.injuries || []).some((inj) => String(inj.playerId).includes('qb'))).toBe(true);
    expect(qbLines).toHaveLength(2);

    const [starter, backup] = qbLines;
    // The backup received meaningful attempts, completions, and yards…
    expect(backup.stats.game.passAtt).toBeGreaterThan(0);
    expect(backup.stats.game.passComp).toBeGreaterThan(0);
    expect(backup.stats.game.passYd).toBeGreaterThan(0);
    for (const qb of [starter, backup]) {
      const g = qb.stats.game;
      const sacksTaken = Number(g.sacked ?? g.sacksTaken ?? g.sacks ?? 0);
      expect(g.passComp).toBeLessThanOrEqual(g.passAtt);
      expect(g.dropbacks).toBe(g.passAtt + sacksTaken);
      expect(g.longestPass).toBeLessThanOrEqual(g.passYd);
      if (g.passComp === 0 || g.passYd === 0) expect(g.longestPass).toBe(0);
      expect(g.completionPct).toBe(Math.round((g.passComp / Math.max(1, g.passAtt)) * 1000) / 10);
      expect(g.passerRating).not.toBeNull();
    }

    // …and passing TDs were split by the same workload basis, not dumped on the
    // starter. Team receiving TDs equal the sum of both QBs' passing TDs.
    const teamPassTD = starter.stats.game.passTD + backup.stats.game.passTD;
    const teamRecTD = sumBoxScoreSide(res.boxScore.home).recTD;
    expect(teamPassTD).toBe(teamRecTD);
    if (teamPassTD > 1) {
      // With multiple passing TDs and a genuine two-QB split, the backup shares.
      expect(backup.stats.game.passTD).toBeGreaterThan(0);
    }

    // The whole side still reconciles player↔team after the substitution.
    const rep = reconcilePlayerToTeam(res.boxScore.home, res.teamStats.home);
    expect(rep.ok).toBe(true);
  });
});

describe('canonical player-stat reconciliation', () => {
  it('passing reconciles to receiving for both teams across seeds', () => {
    for (const seed of SEEDS) {
      const { home, away } = runGame(seed);
      for (const team of [home, away]) {
        const rep = reconcilePlayerIdentities(boxScoreSideFromRoster(team));
        expect(rep.ok, `seed ${seed} ${team.abbr}: ${JSON.stringify(rep.checks)}`).toBe(true);
      }
    }
  });



  it('reconciled QB dependent fields remain possible across deterministic seeds', () => {
    for (const seed of SEEDS) {
      const { home, away } = runGame(seed);
      for (const team of [home, away]) {
        const qbs = team.roster.filter((p) => p.pos === 'QB' && (p.stats.game.passAtt || 0) > 0);
        for (const qb of qbs) {
          const g = qb.stats.game;
          const sacksTaken = Number(g.sacked ?? g.sacksTaken ?? g.sacks ?? 0);
          expect(g.passComp, `seed ${seed} ${team.abbr} ${qb.id} comp`).toBeLessThanOrEqual(g.passAtt);
          expect(g.dropbacks, `seed ${seed} ${team.abbr} ${qb.id} dropbacks`).toBe(g.passAtt + sacksTaken);
          expect(g.longestPass, `seed ${seed} ${team.abbr} ${qb.id} long`).toBeLessThanOrEqual(g.passYd);
          if (g.passComp === 0 || g.passYd === 0) expect(g.longestPass).toBe(0);
        }
      }
    }
  });

  it('team touchdown totals from the box score are self-consistent', () => {
    for (const seed of SEEDS) {
      const { home, away } = runGame(seed);
      for (const team of [home, away]) {
        const t = sumBoxScoreSide(boxScoreSideFromRoster(team));
        // Passing TDs are receiving TDs (single-receiver attribution).
        expect(t.passTD).toBe(t.recTD);
      }
    }
  });
});

describe('real result package: player totals reconcile to team totals', () => {
  it('sum(player) == team totals on the actual res.boxScore / res.teamStats for every seed', () => {
    for (const seed of SEEDS) {
      const { res } = runBatch(seed);
      expect(res?.boxScore, `seed ${seed} produced no box score`).toBeTruthy();
      expect(res?.teamStats, `seed ${seed} produced no team stats`).toBeTruthy();
      for (const side of ['home', 'away']) {
        const rep = reconcilePlayerToTeam(res.boxScore[side], res.teamStats[side]);
        const failures = Object.entries(rep.report)
          .filter(([, v]) => v && !v.ok)
          .map(([k, v]) => `${k} player=${v.player} team=${v.team} Δ${v.delta}`);
        expect(rep.ok, `seed ${seed} ${side}: ${failures.join('; ')}`).toBe(true);
      }
    }
  });

  it('there is one yardage authority — team pass/rush yards equal the player sums exactly', () => {
    const { res } = runBatch(123);
    for (const side of ['home', 'away']) {
      const p = sumBoxScoreSide(res.boxScore[side]);
      expect(res.teamStats[side].passYards).toBe(p.passYd);
      expect(res.teamStats[side].rushYards).toBe(p.rushYd);
      expect(res.teamStats[side].passTD).toBe(p.passTD);
      expect(res.teamStats[side].rushTD).toBe(p.rushTD);
    }
  });
});

describe('reconcileScoreBreakdown helper', () => {
  it('reconcileScoreBreakdown correctly proves a composed score', () => {
    // 39 = 5 TD (30) + 4 XP (missed one) + 1 FG (3) + 1 safety (2) = 30+4+3+2 = 39
    const r = reconcileScoreBreakdown({
      touchdowns: 5, xpMade: 4, fieldGoals: 1, safeties: 1, finalScore: 39,
    });
    expect(r.ok).toBe(true);
    // 23 = 3 TD (18) + 3 XP + 0 FG + 1 two-point (2) → 18+3+2 = 23
    const r2 = reconcileScoreBreakdown({
      touchdowns: 3, xpMade: 3, twoPtMade: 1, finalScore: 23,
    });
    expect(r2.ok).toBe(true);
    // A defensive TD is counted as 6 (+XP) and not double-counted with offense.
    const r3 = reconcileScoreBreakdown({
      touchdowns: 2, defensiveTDs: 1, xpMade: 2, returnXpMade: 1, fieldGoals: 2, finalScore: 6 + 6 + 6 + 3 + 6,
    });
    expect(r3.ok).toBe(true);
  });
});

describe('grades read canonical stats, not narration', () => {
  it('a one-target receiver in the canonical box score never grades Elite/Star', () => {
    const rows = gradeTeamBoxScore({
      99: { name: 'One Catch WR', pos: 'WR', stats: { targets: 1, receptions: 1, recYd: 24 } },
    }, { teamId: 1, teamAbbr: 'NYJ', teamSide: 'home' });
    expect(rows).toHaveLength(1);
    expect(rows[0].limitedSample).toBe(true);
    expect(['Star', 'Elite']).not.toContain(rows[0].tier);
  });

  it('grades a real seeded game only from canonical starters', () => {
    const { home } = runGame(123);
    const rows = gradeTeamBoxScore(boxScoreSideFromRoster(home), { teamId: 1, teamAbbr: 'NYJ', teamSide: 'home' });
    const qbRows = rows.filter((r) => r.pos === 'QB');
    expect(qbRows).toHaveLength(1); // one starter, not a rotation
    expect(qbRows[0].teamAbbr).toBe('NYJ');
  });
});
