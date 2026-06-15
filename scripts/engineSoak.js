#!/usr/bin/env node
/**
 * Engine Soak Test — Wave 3 gate for flipping `useNewSimulationEngine`.
 *
 * Simulates many full seasons with BOTH simulation engines and compares them on
 * five checks. The new matchup/play-by-play engine (richGameSimulator) must pass
 * ALL five checks before the default is flipped in leagueSettings.js.
 *
 * Engines:
 *   - legacy  ("Bernoulli")  : src/core/simulation/index.js  → simGameStats()
 *   - matchup ("PBP")        : src/core/sim/richGameSimulator.ts → simulateRichGame()
 *
 * Both engines consume the SAME generated rosters, so the comparison is fair.
 *
 * Checks (applied to the matchup engine as the flip gate):
 *   1. Win distribution : top-quartile teams (by roster OVR) win ~68–76% of games
 *   2. Stat realism     : pass yds/game 220–280, rush yds/game 100–130, pts/game 20–27
 *   3. Score variance   : std-dev of final team scores reported (PBP should be >= legacy)
 *   4. Performance      : wall-clock ms per game
 *   5. Crash/error rate : zero throws across the whole run
 *
 * Usage:  npx tsx scripts/engineSoak.js [--seasons=100] [--teams=32] [--seed=20260605] [--json]
 *
 * Exit code 0 = matchup engine passed all checks (safe to flip); 1 = failed.
 */

import { Utils } from '../src/core/utils.js';
import { Constants } from '../src/core/constants.js';
import { makePlayer } from '../src/core/player.js';
import { makeLeague } from '../src/core/league.js';
import { simGameStats } from '../src/core/simulation/index.js';
import { simulateRichGame } from '../src/core/sim/richGameSimulator.ts';
import { aggregateTeamUnitsFromRoster, buildDeterministicSeed } from '../src/core/sim/weekSimulationBridge.ts';

// ── thresholds (from Wave 3 spec) ────────────────────────────────────────────
export const SOAK_THRESHOLDS = Object.freeze({
  topQuartileWinPct: { min: 0.68, max: 0.76 },
  passYdsPerGame: { min: 220, max: 280 },
  rushYdsPerGame: { min: 100, max: 130 },
  pointsPerGame: { min: 20, max: 27 },
  maxMsPerGame: 50, // generous upper bound for a headless single-game sim
  // OT must resolve ties: the rich engine should essentially never return a
  // tied final (downstream playoff code cannot represent ties).
  maxFinalTieRate: 0.01,
});

function parseArgs(argv) {
  const out = { seasons: 100, teams: 32, seed: 20260605, json: false };
  for (const arg of argv.slice(2)) {
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (m) {
      const [, k, v] = m;
      if (k === 'seasons') out.seasons = Math.max(1, parseInt(v, 10) || out.seasons);
      else if (k === 'teams') out.teams = Math.max(4, parseInt(v, 10) || out.teams);
      else if (k === 'seed') out.seed = parseInt(v, 10) || out.seed;
    } else if (arg === '--json') out.json = true;
  }
  return out;
}

// Build N team stubs spread across 2 conferences / 4 divisions.
function buildTeamStubs(n) {
  const stubs = [];
  for (let i = 0; i < n; i++) {
    stubs.push({
      name: `Team ${i}`,
      abbr: `T${String(i).padStart(2, '0')}`,
      city: `City ${i}`,
      conf: i < n / 2 ? 0 : 1,
      div: i % 4,
    });
  }
  return stubs;
}

// Circle-method round robin: returns `weeks` rounds of [home, away] index pairs.
function buildSchedule(n, weeks) {
  const ids = Array.from({ length: n }, (_, i) => i);
  const rounds = [];
  const arr = ids.slice();
  const fixed = arr.shift();
  for (let w = 0; w < weeks; w++) {
    const pairs = [];
    const order = [fixed, ...arr];
    for (let i = 0; i < n / 2; i++) {
      const a = order[i];
      const b = order[n - 1 - i];
      // Alternate home/away by week for fairness.
      pairs.push(w % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr.push(arr.shift()); // rotate
  }
  return rounds;
}

function stdDev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Per-engine accumulators.
function newAccumulator(teamCount) {
  return {
    games: 0,
    crashes: 0,
    totalMs: 0,
    points: 0,
    passYds: 0,
    rushYds: 0,
    teamGames: 0,
    scores: [],
    wins: new Array(teamCount).fill(0),
    losses: new Array(teamCount).fill(0),
    minTeamScore: Infinity,
    // Tie / shutout-floor observability (FIX 1 / FIX 6). regulationTies and
    // floorTeamGames are only reported by the matchup engine; tracksOvertime
    // stays false for engines that don't expose the flags so summarize() can
    // report n/a instead of a misleading 0.
    finalTies: 0,
    regulationTies: 0,
    floorTeamGames: 0,
    tracksOvertime: false,
  };
}

function recordGame(acc, homeIdx, awayIdx, g) {
  const { homeScore, awayScore } = g;
  acc.games += 1;
  acc.teamGames += 2;
  acc.points += homeScore + awayScore;
  acc.passYds += g.homePassYd + g.awayPassYd;
  acc.rushYds += g.homeRushYd + g.awayRushYd;
  acc.scores.push(homeScore, awayScore);
  acc.minTeamScore = Math.min(acc.minTeamScore, homeScore, awayScore);
  if (homeScore === awayScore) acc.finalTies += 1;
  if (g.regulationTied != null) {
    acc.tracksOvertime = true;
    if (g.regulationTied) acc.regulationTies += 1;
    acc.floorTeamGames += Number(g.floorCount ?? 0);
  }
  if (homeScore >= awayScore) { acc.wins[homeIdx] += 1; acc.losses[awayIdx] += 1; }
  else { acc.wins[awayIdx] += 1; acc.losses[homeIdx] += 1; }
}

function simulateLegacyGame(league, homeIdx, awayIdx) {
  const res = simGameStats(league.teams[homeIdx], league.teams[awayIdx], { league });
  if (!res) throw new Error('legacy sim returned null');
  const home = res.teamDriveStats?.home ?? {};
  const away = res.teamDriveStats?.away ?? {};
  return {
    homeScore: Number(res.homeScore ?? 0),
    awayScore: Number(res.awayScore ?? 0),
    homePassYd: Number(home.passYds ?? 0),
    homeRushYd: Number(home.rushYds ?? 0),
    awayPassYd: Number(away.passYds ?? 0),
    awayRushYd: Number(away.rushYds ?? 0),
    // The legacy engine resolves OT internally and does not expose
    // regulation-tie or shutout-floor flags.
    regulationTied: null,
    floorCount: null,
  };
}

function simulateMatchupGame(league, homeIdx, awayIdx, season, week) {
  const home = league.teams[homeIdx];
  const away = league.teams[awayIdx];
  const hu = aggregateTeamUnitsFromRoster(home.roster);
  const au = aggregateTeamUnitsFromRoster(away.roster);
  const seed = buildDeterministicSeed(`${season}:${week}:${homeIdx}:${awayIdx}`);
  const res = simulateRichGame({
    gameId: `${season}-${week}-${homeIdx}-${awayIdx}`,
    seed,
    homeTeamId: homeIdx,
    awayTeamId: awayIdx,
    homeOffense: hu.offense,
    homeDefense: hu.defense,
    awayOffense: au.offense,
    awayDefense: au.defense,
    homePlayers: home.roster.map((p) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr })),
    awayPlayers: away.roster.map((p) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr })),
    weather: 'clear',
  });
  return {
    homeScore: Number(res.homeScore ?? 0),
    awayScore: Number(res.awayScore ?? 0),
    homePassYd: Number(res.teamStats?.home?.passYd ?? 0),
    homeRushYd: Number(res.teamStats?.home?.rushYd ?? 0),
    awayPassYd: Number(res.teamStats?.away?.passYd ?? 0),
    awayRushYd: Number(res.teamStats?.away?.rushYd ?? 0),
    regulationTied: Boolean(res.regulationTied),
    floorCount: Number(res.shutoutFloorApplied?.home ? 1 : 0) + Number(res.shutoutFloorApplied?.away ? 1 : 0),
  };
}

function runEngine(label, simFn, league, schedule, seasons) {
  const acc = newAccumulator(league.teams.length);
  for (let s = 0; s < seasons; s++) {
    for (let w = 0; w < schedule.length; w++) {
      for (const [homeIdx, awayIdx] of schedule[w]) {
        const t0 = performance.now();
        try {
          const g = simFn(league, homeIdx, awayIdx, s, w);
          acc.totalMs += performance.now() - t0;
          recordGame(acc, homeIdx, awayIdx, g);
        } catch (err) {
          acc.totalMs += performance.now() - t0;
          acc.crashes += 1;
          if (acc.crashes <= 3) console.error(`[soak:${label}] crash:`, err?.message ?? err);
        }
      }
    }
  }
  return acc;
}

// Top-quartile win% by roster OVR.
function topQuartileWinPct(acc, ovrByTeam) {
  const ranked = ovrByTeam
    .map((ovr, idx) => ({ idx, ovr }))
    .sort((a, b) => b.ovr - a.ovr);
  const q = Math.max(1, Math.floor(ranked.length / 4));
  const top = ranked.slice(0, q);
  let wins = 0, games = 0;
  for (const { idx } of top) {
    wins += acc.wins[idx];
    games += acc.wins[idx] + acc.losses[idx];
  }
  return games > 0 ? wins / games : 0;
}

function summarize(acc, ovrByTeam) {
  return {
    games: acc.games,
    crashes: acc.crashes,
    msPerGame: acc.games > 0 ? acc.totalMs / acc.games : 0,
    pointsPerGame: acc.teamGames > 0 ? acc.points / acc.teamGames : 0,
    passYdsPerGame: acc.teamGames > 0 ? acc.passYds / acc.teamGames : 0,
    rushYdsPerGame: acc.teamGames > 0 ? acc.rushYds / acc.teamGames : 0,
    scoreStdDev: stdDev(acc.scores),
    topQuartileWinPct: topQuartileWinPct(acc, ovrByTeam),
    minTeamScore: acc.minTeamScore === Infinity ? 0 : acc.minTeamScore,
    // Tie/floor observability. finalTieRate is gated; regulationTieRate is
    // reported (not gated) so the engine's underlying tie tendency stays
    // visible even though OT resolves it. preFloorShutoutRate is per
    // team-game: the floor fires exactly when a side's pre-floor score is 0,
    // so this doubles as the floor trigger rate.
    finalTieRate: acc.games > 0 ? acc.finalTies / acc.games : 0,
    regulationTieRate: acc.tracksOvertime && acc.games > 0 ? acc.regulationTies / acc.games : null,
    preFloorShutoutRate: acc.tracksOvertime && acc.teamGames > 0 ? acc.floorTeamGames / acc.teamGames : null,
  };
}

function inRange(v, { min, max }) { return v >= min && v <= max; }

// Evaluate the matchup engine against the gate thresholds.
export function evaluateGate(matchup, legacy) {
  const t = SOAK_THRESHOLDS;
  const checks = [
    { name: 'Win distribution (top-quartile win%)', pass: inRange(matchup.topQuartileWinPct, t.topQuartileWinPct), detail: `${(matchup.topQuartileWinPct * 100).toFixed(1)}% (want ${(t.topQuartileWinPct.min * 100)}–${(t.topQuartileWinPct.max * 100)}%)` },
    { name: 'Stat realism (pass yds/game)', pass: inRange(matchup.passYdsPerGame, t.passYdsPerGame), detail: `${matchup.passYdsPerGame.toFixed(1)} (want ${t.passYdsPerGame.min}–${t.passYdsPerGame.max})` },
    { name: 'Stat realism (rush yds/game)', pass: inRange(matchup.rushYdsPerGame, t.rushYdsPerGame), detail: `${matchup.rushYdsPerGame.toFixed(1)} (want ${t.rushYdsPerGame.min}–${t.rushYdsPerGame.max})` },
    { name: 'Stat realism (points/game)', pass: inRange(matchup.pointsPerGame, t.pointsPerGame), detail: `${matchup.pointsPerGame.toFixed(1)} (want ${t.pointsPerGame.min}–${t.pointsPerGame.max})` },
    // FLOOR REGRESSION CHECK ONLY: the end-of-game shutout floor guarantees
    // minTeamScore >= 3 by construction, so this no longer measures scoring
    // health — it just trips if the floor itself regresses. The underlying
    // scoring tail is reported separately as preFloorShutoutRate.
    { name: 'Floor regression check (shutout floor guarantees >= 3; not a scoring-health gate)', pass: matchup.minTeamScore >= 3, detail: `min individual team score: ${matchup.minTeamScore}` },
    { name: 'Final tie rate (OT must resolve ties)', pass: Number(matchup.finalTieRate ?? 0) <= t.maxFinalTieRate, detail: `${((matchup.finalTieRate ?? 0) * 100).toFixed(2)}% of games (max ${(t.maxFinalTieRate * 100).toFixed(0)}%)` },
    { name: 'Score variance (PBP std-dev >= legacy)', pass: matchup.scoreStdDev >= legacy.scoreStdDev, detail: `PBP ${matchup.scoreStdDev.toFixed(2)} vs legacy ${legacy.scoreStdDev.toFixed(2)}` },
    { name: 'Performance (ms/game)', pass: matchup.msPerGame <= t.maxMsPerGame, detail: `${matchup.msPerGame.toFixed(3)} ms (max ${t.maxMsPerGame})` },
    { name: 'Crash/error rate (zero throws)', pass: matchup.crashes === 0, detail: `${matchup.crashes} crashes` },
  ];
  return { checks, passed: checks.every((c) => c.pass) };
}

// Re-scale a generated league so teams span a realistic talent gradient. Without
// this, makeLeague yields near-identical ~75 OVR teams and the win-distribution
// check is meaningless (every team is a coin flip). We scale each player's ovr
// and numeric ratings toward a per-team target, then drop attributesV2 so the
// matchup engine re-derives units from the scaled ratings.
function applyTalentTiers(league) {
  const n = league.teams.length;
  league.teams.forEach((team, idx) => {
    const targetOvr = 68 + (idx * 17) / Math.max(1, n - 1); // 68 .. 85 spread
    const current = team.ovr || 75;
    const factor = targetOvr / current;
    for (const p of team.roster) {
      p.ovr = Math.max(40, Math.min(99, Math.round((p.ovr || 70) * factor)));
      if (p.ratings) {
        for (const k of Object.keys(p.ratings)) {
          if (typeof p.ratings[k] === 'number') {
            p.ratings[k] = Math.max(40, Math.min(99, Math.round(p.ratings[k] * factor)));
          }
        }
        if (typeof p.ratings.overall === 'number') p.ratings.overall = p.ovr;
      }
      delete p.attributesV2; // force re-derivation from scaled ratings/ovr
    }
    const total = team.roster.reduce((acc, p) => acc + (p.ovr || 0), 0);
    team.ovr = team.roster.length ? Math.round(total / team.roster.length) : targetOvr;
  });
}

export function runEngineSoak({ seasons = 100, teams = 32, seed = 20260605 } = {}) {
  Utils.setSeed(seed);
  const stubs = buildTeamStubs(teams);
  const league = makeLeague(stubs, {}, { Constants, Utils, makePlayer });
  // makeLeague seeds per-save entropy from Math.random (league.globalSeed) and
  // the legacy drive engine mixes it into its per-game seeds, which made the
  // legacy comparison baseline — and therefore the comparative variance gate —
  // nondeterministic across identical soak invocations. Pin it to the CLI seed
  // so the whole soak is reproducible.
  league.globalSeed = seed >>> 0;
  applyTalentTiers(league);
  const ovrByTeam = league.teams.map((t) => t.ovr);
  const schedule = buildSchedule(teams, 17);

  const legacyAcc = runEngine('legacy', simulateLegacyGame, league, schedule, seasons);
  const matchupAcc = runEngine('matchup', simulateMatchupGame, league, schedule, seasons);

  const legacy = summarize(legacyAcc, ovrByTeam);
  const matchup = summarize(matchupAcc, ovrByTeam);
  const gate = evaluateGate(matchup, legacy);
  return { seasons, teams, seed, legacy, matchup, gate };
}

function printReport(report) {
  const { seasons, teams, seed, legacy, matchup, gate } = report;
  const row = (label, l, m) => `  ${label.padEnd(28)} legacy=${String(l).padStart(10)}   matchup=${String(m).padStart(10)}`;
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(` ENGINE SOAK  —  ${seasons} seasons × ${teams} teams (seed ${seed})`);
  console.log('══════════════════════════════════════════════════════════════════');
  console.log(row('games simulated', legacy.games, matchup.games));
  console.log(row('points / game', legacy.pointsPerGame.toFixed(2), matchup.pointsPerGame.toFixed(2)));
  console.log(row('pass yds / game', legacy.passYdsPerGame.toFixed(1), matchup.passYdsPerGame.toFixed(1)));
  console.log(row('rush yds / game', legacy.rushYdsPerGame.toFixed(1), matchup.rushYdsPerGame.toFixed(1)));
  console.log(row('score std-dev', legacy.scoreStdDev.toFixed(2), matchup.scoreStdDev.toFixed(2)));
  console.log(row('min team score', legacy.minTeamScore, matchup.minTeamScore));
  const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(2)}%`);
  console.log(row('regulation tie rate', pct(legacy.regulationTieRate), pct(matchup.regulationTieRate)));
  console.log(row('final tie rate', pct(legacy.finalTieRate), pct(matchup.finalTieRate)));
  console.log(row('pre-floor shutout rate', pct(legacy.preFloorShutoutRate), pct(matchup.preFloorShutoutRate)));
  console.log(row('top-quartile win%', (legacy.topQuartileWinPct * 100).toFixed(1) + '%', (matchup.topQuartileWinPct * 100).toFixed(1) + '%'));
  console.log(row('ms / game', legacy.msPerGame.toFixed(3), matchup.msPerGame.toFixed(3)));
  console.log(row('crashes', legacy.crashes, matchup.crashes));
  console.log('\n  GATE (matchup engine must pass ALL):');
  for (const c of gate.checks) {
    console.log(`    [${c.pass ? 'PASS' : 'FAIL'}] ${c.name.padEnd(40)} ${c.detail}`);
  }
  console.log('\n  RESULT: ' + (gate.passed ? '✅ PASS — safe to flip useNewSimulationEngine' : '❌ FAIL — DO NOT flip useNewSimulationEngine'));
  console.log('══════════════════════════════════════════════════════════════════\n');
}

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('engineSoak.js');
if (isMain) {
  const args = parseArgs(process.argv);
  const report = runEngineSoak(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  process.exit(report.gate.passed ? 0 : 1);
}
