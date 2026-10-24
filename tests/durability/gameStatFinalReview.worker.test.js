import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { LifecycleDriver } from './lifecycleDriver.js';
import { makePlayer } from '../../src/core/player.js';
import { cache } from '../../src/db/cache.js';
import { Games } from '../../src/db/index.js';
import { dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import { calculateCanonicalPasserRating } from '../../src/core/simulation/mathHelpers.js';
import { buildLeagueStatsHubModel } from '../../src/ui/utils/leagueStatsHub.js';
import { recordedPlayerSeasonTotals } from '../../src/ui/utils/playerGameLogs.js';
import { canPlayerPlay } from '../../src/core/injury-core.js';
import { isAvailableForGameDay } from '../../src/core/holdouts/holdoutEngine.js';

async function assertRatings() {
  const response = await dispatchWorker(toWorker.GET_ALL_PLAYER_STATS);
  const teams = cache.getAllTeams().map(t => ({ ...t, roster: cache.getPlayersByTeam(t.id).map(p => ({ ...p, seasonStats: cache.getSeasonStat(p.id)?.totals ?? {} })) }));
  const hub = buildLeagueStatsHubModel({ teams, games: [] });
  const qbs = response.payload.stats.filter(p => p.pos === 'QB' && p.passYards > 0);
  expect(qbs.length).toBeGreaterThan(0);
  for (const qb of qbs) {
    const totals = cache.getSeasonStat(qb.id).totals;
    const expected = calculateCanonicalPasserRating(totals);
    expect(qb.passerRating, `AnalyticsHub QB=${qb.id}`).toBe(expected);
    expect(hub.playerTables.passing.find(p => p.playerId === qb.id)?.rate, `League Stats QB=${qb.id}`).toBe(expected);
    const profileTotals = recordedPlayerSeasonTotals({ seasonId: 's1' }, cache.getPlayer(qb.id), [{ seasonId: 's1', totals }]);
    expect(calculateCanonicalPasserRating(profileTotals), `profile QB=${qb.id}`).toBe(expected);
  }
  return qbs.map(p => [p.id, p.passerRating]);
}

describe('final stat review through the real worker', () => {
  it('derives season ratings from completed games before and after save/reload, never from stale ratings', async () => {
    const driver = new LifecycleDriver({ seed: 1804 });
    await driver.initLeague();
    delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
    for (let week = 1; week <= 2; week++) await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 120000 });
    const games = (await Games.bySeason('s1')).filter(g => g.week <= 2);
    expect(games).toHaveLength(32);
    for (const stat of cache.getAllSeasonStats()) {
      const rows = games.flatMap(g => Object.values(g.playerStats).flatMap(side => Object.entries(side).filter(([id]) => id === stat.playerId).map(([, row]) => row.stats)));
      for (const key of ['passAtt', 'passComp', 'passYd', 'passTD']) expect(stat.totals[key] ?? 0).toBe(rows.reduce((sum, row) => sum + (row[key] ?? 0), 0));
      // Simulate a legacy cached derived value: every reader must ignore it.
      if ((stat.totals.passAtt ?? 0) > 0) cache.updateSeasonStat(stat.playerId, stat.teamId, {});
      stat.totals.passerRating = 999;
    }
    const ratings = await assertRatings();
    await driver.save();
    await driver.reload();
    expect(await assertRatings()).toEqual(ratings);
  }, 180000);

  it.each([0, 1])('rejects a normal depleted QB room on team %i, then plays using a legitimately signed QB', async teamId => {
    const driver = new LifecycleDriver({ seed: 1804 });
    await driver.initLeague();
    delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
    await dispatchWorker(toWorker.UPDATE_SETTINGS, { settings: { useNewSimulationEngine: false } });
    // Stock a legitimate pre-game free-agent fixture using the production factory.
    // Safe-starter leagues intentionally have no free-agent pool of their own.
    const candidate = { ...makePlayer('QB', 25, 70), teamId: null, status: 'free_agent', contract: null };
    cache.setPlayer(candidate);
    const qbs = cache.getPlayersByTeam(teamId).filter(p => p.pos === 'QB');
    expect(qbs.length).toBeGreaterThan(0);
    for (const qb of qbs) cache.updatePlayer(qb.id, { injured: true, injuryWeeksRemaining: 6, injuries: [{ name: 'Concussion', weeksRemaining: 6 }] });
    await driver.save();
    const week = cache.getMeta().currentWeek;
    await expect(dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 120000 })).rejects.toThrow(/no eligible QB/);
    expect(cache.getMeta().currentWeek).toBe(week);
    expect(await Games.bySeason('s1')).toHaveLength(0);
    for (const qb of qbs) expect(cache.getSeasonStat(qb.id)?.totals?.passAtt ?? 0).toBe(0);
    const healthy = cache.getAllPlayers().find(p => p.teamId == null && p.pos === 'QB' && canPlayerPlay(p));
    expect(healthy).toBeTruthy();
    if (cache.getPlayersByTeam(teamId).length >= 53) {
      const receiver = cache.getPlayersByTeam(teamId).filter(p => p.pos === 'WR').at(-1);
      await dispatchWorker(toWorker.RELEASE_PLAYER, { playerId: receiver.id, teamId }, { timeoutMs: 30000 });
    }
    await dispatchWorker(toWorker.SIGN_PLAYER, { playerId: healthy.id, teamId, contract: { baseAnnual: 1, yearsTotal: 1, signingBonus: 0 } }, { timeoutMs: 30000 });
    expect(cache.getPlayer(healthy.id).teamId).toBe(teamId);
    expect(isAvailableForGameDay(cache.getPlayer(healthy.id), { teamId })).toBe(true);
    await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 120000 });
    await driver.save();
    const played = (await Games.bySeason('s1')).find(g => g.homeId === teamId || g.awayId === teamId);
    expect(played).toBeTruthy();
    const side = played.homeId === teamId ? 'home' : 'away';
    expect(played.playerStats[side][healthy.id].stats.passAtt).toBeGreaterThan(0);
    for (const qb of qbs) expect(played.playerStats[side][qb.id]?.stats.passAtt ?? 0).toBe(0);
    await driver.reload();
    expect((await Games.load(played.id)).playerStats).toEqual(played.playerStats);
    expect(cache.getSeasonStat(healthy.id).totals.passAtt).toBe(played.playerStats[side][healthy.id].stats.passAtt);
  }, 180000);
});
