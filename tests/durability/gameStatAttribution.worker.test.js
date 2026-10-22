import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { LifecycleDriver } from './lifecycleDriver.js';
import { dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Games, PlayerStats, Seasons } from '../../src/db/index.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import * as rich from '../../src/core/sim/richGameSimulator.ts';
import { isAvailableForGameDay } from '../../src/core/holdouts/holdoutEngine.js';
import { validateOffensiveStatIntegrity, reconcilePlayerToTeam } from '../../src/core/simulation/gameStatReconciliation.js';
import { buildGameBookPresentation } from '../../src/ui/utils/boxScoreViewModel.js';
import { calculateCanonicalPasserRating } from '../../src/core/simulation/mathHelpers.js';
import { buildLeagueStatsHubModel } from '../../src/ui/utils/leagueStatsHub.js';

const copy = (x) => JSON.parse(JSON.stringify(x));
const KEYS = ['passAtt', 'passComp', 'passYd', 'passTD', 'rushAtt', 'rushYd', 'rushTD', 'targets', 'receptions', 'recYd', 'recTD'];
const MAX = ['longestPass', 'longestRun', 'longestCatch'];
const reports = [];

// Independent sums/maxima, deliberately not the production accumulator.
function sumGames(games) {
  const totals = new Map();
  for (const game of games.filter((g) => g.week <= 18)) for (const side of ['home', 'away']) {
    for (const [id, row] of Object.entries(game.playerStats[side])) {
      const target = totals.get(id) ?? {};
      for (const key of KEYS) target[key] = (target[key] ?? 0) + (row.stats[key] ?? 0);
      for (const key of MAX) if (row.stats[key] != null) target[key] = target[key] == null ? row.stats[key] : Math.max(target[key], row.stats[key]);
      target.gamesPlayed = (target.gamesPlayed ?? 0) + 1;
      totals.set(id, target);
    }
  }
  return totals;
}
function assertSeason(games) {
  const expected = sumGames(games);
  for (const [id, total] of expected) {
    const actual = cache.getSeasonStat(id)?.totals ?? {};
    for (const key of [...KEYS, 'gamesPlayed', ...MAX.filter((k) => total[k] != null)]) {
      expect(actual[key] ?? 0, `player=${id} season ${key}`).toBe(total[key] ?? 0);
    }
  }
  // Reject phantom production as well as missing/incorrect production.
  for (const entry of cache.getAllSeasonStats()) for (const key of KEYS) {
    expect(entry.totals[key] ?? 0, `player=${entry.playerId} phantom ${key}`).toBe(expected.get(String(entry.playerId))?.[key] ?? 0);
  }
  return expected;
}
async function assertConsumers(games) {
  const totals = assertSeason(games);
  const game = games[0];
  const snapshot = copy(game);
  for (let i = 0; i < 2; i++) {
    const response = await dispatchWorker(toWorker.GET_BOX_SCORE, { gameId: game.id });
    expect(response.type).toBe(toUI.BOX_SCORE);
    expect(response.payload.game.playerStats).toEqual(snapshot.playerStats);
    const book = buildGameBookPresentation({ game: response.payload.game, league: { teams: cache.getAllTeams() } });
    for (const side of ['home', 'away']) for (const row of book.playerTables[side]) {
      const original = snapshot.playerStats[side][String(row.playerId)].stats;
      for (const key of KEYS) expect(row.stats[key] ?? 0).toBe(original[key] ?? 0);
      if (original.longestRun != null) expect(row.stats.rushLong).toBe(original.longestRun);
    }
    expect(await Games.load(game.id)).toEqual(snapshot);
  }
  const stats = await dispatchWorker(toWorker.GET_ALL_PLAYER_STATS, {});
  for (const row of stats.payload.stats) {
    const total = totals.get(String(row.id)) ?? {};
    expect(row.passYards).toBe(total.passYd ?? 0);
    expect(row.rushYards).toBe(total.rushYd ?? 0);
    expect(row.recYards).toBe(total.recYd ?? 0);
    expect(row.receptions).toBe(total.receptions ?? 0);
    if (row.pos === 'QB' && (total.passAtt ?? 0) > 0) expect(row.passerRating, `AnalyticsHub QB=${row.id}`).toBe(calculateCanonicalPasserRating({ ...total, interceptions: cache.getSeasonStat(row.id)?.totals?.interceptions ?? 0 }));
  }
  const teams = cache.getAllTeams().map((t) => ({ ...t, roster: cache.getPlayersByTeam(t.id).map((p) => ({ ...p, seasonStats: cache.getSeasonStat(p.id)?.totals ?? {} })) }));
  const hub = buildLeagueStatsHubModel({ teams, schedule: games });
  for (const row of hub.playerTables.passing) expect(row.rate, `League Stats QB=${row.playerId}`).toBe(calculateCanonicalPasserRating(row.canonicalStats));
  for (const [category, fields] of Object.entries({ passing: { passYds: 'passYd', passTd: 'passTD', cmp: 'passComp' }, rushing: { rushYds: 'rushYd', rushTd: 'rushTD', rushAtt: 'rushAtt' }, receiving: { recYds: 'recYd', recTd: 'recTD', rec: 'receptions' } })) {
    for (const row of hub.playerTables[category]) for (const [display, key] of Object.entries(fields)) {
      expect(row[display], `LeagueStats ${category}/${row.playerId}/${display}`).toBe(totals.get(String(row.playerId))?.[key] ?? 0);
    }
  }
  for (const mode of ['season', 'alltime']) {
    const leaders = await dispatchWorker(toWorker.GET_LEAGUE_LEADERS, { mode });
    for (const [category, field, key] of [['passing', 'passYards', 'passYd'], ['passing', 'passTDs', 'passTD'], ['rushing', 'rushYards', 'rushYd'], ['rushing', 'rushTDs', 'rushTD'], ['receiving', 'recYards', 'recYd'], ['receiving', 'recTDs', 'recTD']]) {
      for (const row of leaders.payload.categories[category][field]) {
        expect(row.value, `${mode} leader ${row.playerId}/${key}`).toBe(totals.get(String(row.playerId))?.[key] ?? 0);
      }
    }
  }
  assertSeason(games);
}

describe.sequential('game-stat ledger through the real worker and IndexedDB', () => {
  afterAll(() => { vi.restoreAllMocks(); if (process.env.GAME_STAT_AUDIT) writeFileSync(process.env.GAME_STAT_AUDIT, JSON.stringify(reports, null, 2)); });

  it.each([{ seed: 1804, engine: true, weeks: 18 }, { seed: 4180, engine: false, weeks: 4 }])('seed=$seed engine=$engine: simulation, save/reload, consumers and advancement', async ({ seed, engine, weeks }) => {
    const driver = new LifecycleDriver({ seed, phaseTimeoutMs: 180000 });
    await driver.initLeague();
    delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
    globalThis.__DYNASTY_SOAK_THROTTLE_PERSIST__ = false;
    await dispatchWorker(toWorker.UPDATE_SETTINGS, { settings: { useNewSimulationEngine: engine, injuryFrequency: 75 } });
    const inactive = cache.getPlayersByTeam(0).find((p) => p.pos === 'QB');
    cache.updatePlayer(inactive.id, { inactive: true });
    const events = [];
    const driveLedgers = new Map();
    const actual = rich.simulateRichGame;
    const spy = vi.spyOn(rich, 'simulateRichGame').mockImplementation((payload) => {
      const result = actual(payload); // Instrumentation calls the real simulator unchanged.
      for (const side of ['home', 'away']) {
        const ids = payload[`${side}Players`].map((p) => String(p.id));
        expect(validateOffensiveStatIntegrity(result.boxScore[side], { eligibleIds: ids, context: `${seed}/${payload.gameId}/${side}` }).errors).toEqual([]);
      }
      driveLedgers.set(result.gameId, structuredClone(result.driveSummary));
      events.push(result.gameId);
      return result;
    });
    let snapshots = [];
    let completed = [];
    let injuryCount = 0;
    try {
      if (engine) {
        const watched = await dispatchWorker(toWorker.WATCH_GAME, {}, { timeoutMs: 60000 });
        expect(watched.type).toBe(toUI.PLAY_LOGS);
        expect(events).toHaveLength(1);
      }
      for (let w = 1; w <= weeks; w++) {
        if (process.env.GAME_STAT_PROGRESS) writeFileSync(process.env.GAME_STAT_PROGRESS, JSON.stringify({ seed, engine, week: w }));
        const unavailable = new Set(cache.getAllPlayers().filter((p) => !isAvailableForGameDay(p, { teamId: p.teamId }) && !p.injured).map((p) => String(p.id)));
        const response = await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 180000 });
        expect(response.type, JSON.stringify(response.payload?.message)).toBe(toUI.WEEK_COMPLETE);
        await driver.save();
        completed = (await Games.bySeason('s1')).filter((g) => g.week <= 18);
        for (const game of completed.filter((g) => g.week === w)) {
          expect(game.statAttributionVersion).toBe(1);
          if (engine) expect(game.driveSummary, `${game.id} archived drives`).toEqual(driveLedgers.get(game.id));
          expect(game.statScope).toBe('regular');
          for (const side of ['home', 'away']) {
            expect(validateOffensiveStatIntegrity(game.playerStats[side], { context: `seed=${seed}/${game.id}/${side}` }).errors).toEqual([]);
            expect(reconcilePlayerToTeam(game.playerStats[side], game.teamStats[side]).ok).toBe(true);
            const sacks = Object.values(game.playerStats[side]).reduce((sum, row) => sum + (row.stats.sackYards ?? 0), 0);
            expect(game.teamStats[side].totalYards, `${game.id}/${side} net yards`).toBe((game.teamStats[side].passYd ?? game.teamStats[side].passYards ?? 0) + (game.teamStats[side].rushYd ?? game.teamStats[side].rushYards ?? 0) - sacks);
            if (game.week === w) for (const id of Object.keys(game.playerStats[side])) expect(unavailable.has(id), `${game.id} inactive=${id}`).toBe(false);
            const td = Object.values(game.playerStats[side]).reduce((s, r) => s + (r.stats.passTD ?? 0) + (r.stats.rushTD ?? 0), 0);
            const score = side === 'home' ? game.homeScore : game.awayScore;
            expect(td * 6).toBeLessThanOrEqual(score);
          }
        }
        injuryCount = completed.reduce((s, g) => s + (g.injuries?.length ?? 0), 0);
        for (const game of completed.filter((g) => g.week === w)) for (const injury of game.injuries ?? []) {
          const side = injury.teamId === game.homeId ? 'home' : 'away';
          expect(game.playerStats[side][String(injury.playerId)], `${game.id} injured participant ${injury.playerId}`).toBeTruthy();
        }
        for (const prev of snapshots) expect(await Games.load(prev.id)).toEqual(prev);
        assertSeason(completed);
        if (w === 2) {
          snapshots = copy(completed);
          const savedStats = copy(await PlayerStats.bySeason('s1'));
          await driver.reload();
          expect(await PlayerStats.bySeason('s1')).toEqual(savedStats);
          for (const prev of snapshots) expect(await Games.load(prev.id)).toEqual(prev);
          await assertConsumers(completed);
        }
        console.info(`Stat integrity seed=${seed} engine=${engine} week=${w} completed=${completed.length}`);
      }
      if (engine) {
        expect(completed).toHaveLength(272);
        expect(events).toHaveLength(272); // No rich failures concealed by a legacy fallback.
        expect(cache.getPhase()).toBe('playoffs');
      } else {
        expect(events).toHaveLength(0);
        expect(injuryCount).toBeGreaterThan(0);
      }
      await assertConsumers(completed);
      const seasonSnapshot = copy(cache.getAllSeasonStats().map((s) => ({ playerId: s.playerId, totals: s.totals })));
      const gameSnapshot = copy(completed);
      await driver.reload();
      expect(Object.fromEntries(cache.getAllSeasonStats().map((s) => [s.playerId, s.totals]))).toEqual(Object.fromEntries(seasonSnapshot.map((s) => [s.playerId, s.totals])));
      await assertConsumers(completed);
      if (engine) {
        // Play one actual playoff week: regular-season accumulators stay frozen.
        const playoff = await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 180000 });
        expect(playoff.type).toBe(toUI.WEEK_COMPLETE);
        await driver.save();
        for (const s of seasonSnapshot) expect(cache.getSeasonStat(s.playerId)?.totals).toEqual(s.totals);
        const playoffGames = (await Games.bySeason('s1')).filter((g) => g.week > 18);
        expect(playoffGames.length).toBeGreaterThan(0);
        expect(playoffGames.every((g) => g.statScope === 'playoffs')).toBe(true);
        expect(cache.getAllSeasonStats().some((s) => Object.keys(s.playoffTotals ?? {}).length)).toBe(true);
        await driver.reload();
        for (const s of seasonSnapshot) expect(cache.getSeasonStat(s.playerId)?.totals).toEqual(s.totals);
        // Complete the remaining playoffs and the existing offseason lifecycle.
        await driver.simToPhase('offseason');
        await driver.simToPhase('preseason');
        await driver.save();
        expect(cache.getMeta().currentSeasonId).toBe('s2');
        const archived = await PlayerStats.bySeason('s1');
        for (const s of seasonSnapshot) expect(archived.find((r) => r.playerId === s.playerId)?.totals).toEqual(s.totals);
        expect(await Seasons.load('s1')).toBeTruthy();
        await driver.reload();
        expect(cache.getMeta().currentSeasonId).toBe('s2');
      }
      for (const game of gameSnapshot) expect(await Games.load(game.id)).toEqual(game);
      reports.push({ seed, engine: engine ? 'rich' : 'legacy', regularGames: completed.length, fullRegularSeason: weeks === 18, injuries: injuryCount, saveReload: 'passed', gameBook: 'passed', seasonTotals: 'passed', leagueStats: 'passed', allTimeDeduplication: 'passed', rollover: engine ? 'passed' : 'not run' });
    } finally { spy.mockRestore(); }
  }, 480000);
});
