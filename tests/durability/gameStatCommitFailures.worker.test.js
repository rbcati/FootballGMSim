import 'fake-indexeddb/auto';
import { describe, it, expect, vi } from 'vitest';
import { LifecycleDriver } from './lifecycleDriver.js';
import { cache } from '../../src/db/cache.js';
import { Games, Meta, PlayerStats } from '../../src/db/index.js';
import { simulateRichGame } from '../../src/core/sim/richGameSimulator.ts';
import { aggregateTeamUnitsFromRoster } from '../../src/core/sim/weekSimulationBridge.ts';

const copy = value => structuredClone(value);
const sorted = rows => [...rows].sort((a, b) => String(a.playerId).localeCompare(String(b.playerId)));

describe('exactly-once credited games through worker persistence', () => {
  it('rolls back partial commits and retries atomic storage without losing or duplicating either team', async () => {
    const driver = new LifecycleDriver({ seed: 1804 });
    await driver.initLeague();
    delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
    const { applyGameResultToCache, flushDirty } = await import('../../src/worker/worker.js');
    const seasonId = cache.getMeta().currentSeasonId;
    const week = cache.getMeta().schedule.weeks.find(w => w.week === 1);
    const fixtures = week.games.slice(0, 3);
    for (const [index, fixture] of fixtures.entries()) {
      const hId = Number(fixture.home), aId = Number(fixture.away);
      const home = cache.getTeam(hId), away = cache.getTeam(aId);
      const hu = aggregateTeamUnitsFromRoster(home.roster), au = aggregateTeamUnitsFromRoster(away.roster);
      const result = simulateRichGame({ gameId: fixture.id, seed: 1804 + index, homeTeamId: hId, awayTeamId: aId,
        homePlayers: home.roster, awayPlayers: away.roster,
        homeOffense: hu.offense, homeDefense: hu.defense, awayOffense: au.offense, awayDefense: au.defense });
      const ids = [...Object.keys(result.boxScore.home), ...Object.keys(result.boxScore.away)];
      const before = copy(cache.getAllSeasonStats());
      const gamesBefore = copy(cache.getWeekGames());
      const fixtureBefore = copy(cache.getMeta().schedule.weeks[0].games[index]);
      const teamsBefore = [copy(home), copy(away)];
      const rosterReferences = [home.roster, away.roster];
      if (index < 2) {
        const method = index === 0 ? 'updateSeasonStat' : 'addGame';
        const actual = cache[method];
        let calls = 0;
        const spy = vi.spyOn(cache, method).mockImplementation((...args) => {
          const value = actual(...args);
          if (++calls === (index === 0 ? ids.length : 1)) throw new Error(`injected ${method} failure after mutation`);
          return value;
        });
        expect(() => applyGameResultToCache(result, 1, seasonId)).toThrow(/injected/);
        spy.mockRestore();
        expect(cache.getAllSeasonStats()).toEqual(before);
        expect(cache.getWeekGames()).toEqual(gamesBefore);
        expect(cache.getMeta().schedule.weeks[0].games[index]).toEqual(fixtureBefore);
        expect([cache.getTeam(hId), cache.getTeam(aId)]).toEqual(teamsBefore);
        expect(cache.getTeam(hId).roster).toBe(rosterReferences[0]);
        expect(cache.getTeam(aId).roster).toBe(rosterReferences[1]);
      }
      applyGameResultToCache(result, 1, seasonId);
      const committed = copy(cache.getAllSeasonStats());
      const archived = copy(cache.getWeekGames().at(-1));
      expect(cache.getMeta().schedule.weeks[0].games[index].statisticsCommitted).toBe(true);
      applyGameResultToCache(result, 1, seasonId);
      expect(sorted(cache.getAllSeasonStats())).toEqual(sorted(committed));
      expect(cache.getWeekGames().filter(g => g.id === archived.id)).toHaveLength(1);
      for (const side of ['home', 'away']) for (const [id, row] of Object.entries(result.boxScore[side])) {
        const prior = before.find(s => s.playerId === id)?.totals ?? {};
        const totals = cache.getSeasonStat(id).totals;
        expect(totals.gamesPlayed).toBe((prior.gamesPlayed ?? 0) + 1);
        for (const stat of ['passAtt', 'passComp', 'passYd', 'receptions', 'recYd', 'rushAtt', 'rushYd', 'passTD', 'recTD', 'rushTD']) {
          expect(totals[stat] ?? 0, `${side}/${id}/${stat}`).toBe((prior[stat] ?? 0) + (row.stats[stat] ?? 0));
        }
      }
      if (index === 2) {
        const persistedBefore = await PlayerStats.bySeason(seasonId);
        const metaBefore = await Meta.load();
        const put = IDBObjectStore.prototype.put;
        const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
          if (this.name === 'games') throw new Error('injected persistent game write failure');
          return put.apply(this, args);
        });
        await expect(flushDirty()).rejects.toThrow(/injected persistent/);
        spy.mockRestore();
        expect(await Games.load(archived.id)).toBeFalsy();
        expect(await PlayerStats.bySeason(seasonId)).toEqual(persistedBefore);
        expect(await Meta.load()).toEqual(metaBefore);
        // The hot commit remains pending and dirty; replay is a no-op, then SAVE_NOW retries it.
        expect(cache.isDirty()).toBe(true);
        applyGameResultToCache(result, 1, seasonId);
        expect(sorted(cache.getAllSeasonStats())).toEqual(sorted(committed));
      }
      await driver.save();
      await driver.reload();
      expect(await Games.load(archived.id)).toEqual(archived);
      expect((await Games.bySeason(seasonId)).filter(g => g.id === archived.id)).toHaveLength(1);
      expect(sorted(cache.getAllSeasonStats())).toEqual(sorted(committed));
      expect(cache.getMeta().schedule.weeks[0].games[index].statisticsCommitted).toBe(true);
      applyGameResultToCache(result, 1, seasonId);
      await driver.save();
      expect(sorted(cache.getAllSeasonStats())).toEqual(sorted(committed));
    }
  }, 180000);
});
