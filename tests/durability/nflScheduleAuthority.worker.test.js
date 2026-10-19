import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import * as nflAuthority from '../../src/core/nflSchedule.js';
import { LifecycleDriver } from './lifecycleDriver.js';
import { dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Games, Meta, Seasons, Transactions } from '../../src/db/index.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import {
  validateNflSchedule,
  generateNflSchedule,
  completedRegularDivisionRanks,
} from '../../src/core/nflSchedule.js';
import { buildCanonicalGameId } from '../../src/core/gameIdentity.js';

const copy = (x) => JSON.parse(JSON.stringify(x));
function regularSchedule() {
  const schedule = cache.getMeta().schedule;
  return { ...schedule, weeks: schedule.weeks.filter((w) => w.week <= 18) };
}
function assertLiveSchedule() {
  const result = validateNflSchedule(regularSchedule(), cache.getAllTeams());
  expect(result.errors).toEqual([]);
  expect(result.valid).toBe(true);
}
function pittsburgh(schedule) {
  return schedule.weeks.map((w) => ({
    week: w.week,
    bye: w.teamsWithBye?.includes(7),
    game: w.games.find((g) => g.home === 7 || g.away === 7),
  }));
}

describe('NFL scheduling through the production worker', () => {
  it('plays two full regular seasons, preserves results, reloads, and rolls through Season 3', async () => {
    const driver = new LifecycleDriver({
      seed: 1803,
      phaseTimeoutMs: 300000,
      onEvent: (e) => console.info('NFL lifecycle', e),
    });
    await driver.initLeague();
    const boot = await dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE, {
      slotKey: 'save_slot_1',
      options: {
        rngSeed: 1803,
        userTeamId: 7,
        name: 'Pittsburgh schedule integrity',
      },
    });
    expect(boot.type).toBe(toUI.FULL_STATE);
    driver.view = boot.payload;
    assertLiveSchedule();
    const first = copy(regularSchedule());
    const examples = [
      {
        season: 1,
        rotation: first.metadata.rotation,
        pittsburgh: pittsburgh(first),
      },
    ];
    console.info('Pittsburgh Season 1', JSON.stringify(pittsburgh(first)));
    const generated = generateNflSchedule(cache.getAllTeams(), {
      year: 2026,
      seasonId: 's1',
      seed: 1803,
    });
    for (const w of generated.weeks) for (const g of w.games) delete g.category;
    expect(first).toEqual(generated);
    delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
    const firstGame = first.weeks[0].games.find(
      (g) => g.home === 7 || g.away === 7
    );
    await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true });
    await driver.save();
    const saved = await Games.load(firstGame.id);
    expect(saved).toMatchObject({
      id: firstGame.id,
      seasonId: 's1',
      week: 1,
      homeId: firstGame.home,
      awayId: firstGame.away,
    });
    expect(saved.id).toBe(
      buildCanonicalGameId({
        seasonId: 's1',
        week: 1,
        homeId: saved.homeId,
        awayId: saved.awayId,
      })
    );
    expect(
      Number.isFinite(saved.homeScore) && Number.isFinite(saved.awayScore)
    ).toBe(true);
    const user = cache.getTeam(7);
    expect(user.wins + user.losses + user.ties).toBe(1);
    const playedSnapshot = copy(saved);
    const activeSnapshot = copy(cache.getMeta().schedule);
    await driver.reload();
    expect(cache.getMeta().schedule).toEqual(activeSnapshot);
    expect(await Games.load(firstGame.id)).toEqual(playedSnapshot);

    globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__ = true;
    for (let season = 1; season <= 2; season++) {
      assertLiveSchedule();
      await driver.simToPhase('playoffs', {
        checkpoint: `season-${season}-regular-complete`,
      });
      const schedule = regularSchedule();
      assertLiveSchedule();
      const games = schedule.weeks.flatMap((w) => w.games);
      expect(games).toHaveLength(272);
      expect(games.every((g) => g.played)).toBe(true);
      for (const t of cache.getAllTeams()) {
        expect(
          games.filter((g) => g.home === t.id || g.away === t.id)
        ).toHaveLength(17);
        expect(t.wins + t.losses + t.ties).toBe(17);
        expect(
          schedule.weeks.filter((w) => w.teamsWithBye.includes(t.id))
        ).toHaveLength(1);
      }
      expect(
        cache.getMeta().schedule.weeks.find((w) => w.week === 19)
      ).toBeTruthy();
      const ranks = copy(cache.getMeta().completedSeasonSchedulingRanks.ranks);
      expect(ranks).toEqual(
        completedRegularDivisionRanks(
          cache.getAllTeams(),
          schedule,
          cache.getMeta().globalSeed ?? 0
        )
      );
      await driver.save();
      const persisted = (await Games.bySeason(`s${season}`)).filter(
        (g) => g.week <= 18
      );
      expect(persisted).toHaveLength(272);
      expect(new Set(persisted.map((g) => g.id)).size).toBe(272);
      await driver.simToPhase('offseason', {
        checkpoint: `season-${season}-playoffs-complete`,
      });
      expect(cache.getMeta().completedSeasonSchedulingRanks.ranks).toEqual(
        ranks
      );
      await driver.simToPhase('preseason', {
        checkpoint: `season-${season + 1}-rollover`,
      });
      assertLiveSchedule();
      expect(cache.getMeta().currentSeasonId).toBe(`s${season + 1}`);
      expect(cache.getMeta().schedule.metadata.priorRanks).toEqual(ranks);
      expect(cache.getMeta().schedule.metadata.rotation.sameMask).toBe(
        [1, 2, 3][season % 3]
      );
      expect(cache.getMeta().schedule.metadata.rotation.mainOffset).toBe(
        season % 4
      );
      expect(await Games.load(firstGame.id)).toEqual(playedSnapshot);
      expect((await Seasons.loadAll()).some((s) => s.id === `s${season}`)).toBe(
        true
      );
      const before = copy(cache.getMeta().schedule);
      examples.push({
        season: season + 1,
        rotation: before.metadata.rotation,
        priorRanks: before.metadata.priorRanks,
        pittsburgh: pittsburgh(before),
      });
      await driver.save();
      await driver.reload();
      expect(cache.getMeta().schedule).toEqual(before);
      assertLiveSchedule();
      if (season === 1)
        console.info('Pittsburgh Season 2', JSON.stringify(pittsburgh(before)));
    }
    const txs = await Transactions.loadRecent(4000);
    expect(new Set(txs.map((t) => t.id)).size).toBe(txs.length);
    expect((await Meta.load()).schedule).toEqual(cache.getMeta().schedule);
    if (process.env.NFL_SCHEDULE_WORKER_AUDIT)
      writeFileSync(
        process.env.NFL_SCHEDULE_WORKER_AUDIT,
        JSON.stringify(
          {
            seed: 1803,
            regularSeasonsPlayed: 2,
            regularGamesPersisted: 544,
            examples,
          },
          null,
          2
        ) + '\n'
      );
  }, 600000);
  it('rejects a failed rollover before persistence and preserves an existing active schedule on reload', async () => {
    const driver = new LifecycleDriver({ seed: 1803 });
    await driver.initLeague();
    delete globalThis.__FOOTBALL_GM_LITE_BATCH_SIM__;
    // Represent an existing invalid active season. Loading must preserve it;
    // strict validation gates newly generated seasons only.
    const legacy = copy(cache.getMeta().schedule);
    const game = legacy.weeks[0].games[0];
    Object.assign(game, { played: true, homeScore: 24, awayScore: 17 });
    legacy.weeks[1].games[0].away = game.away;
    cache.setMeta({ schedule: legacy });
    await driver.save();
    await driver.reload();
    expect(cache.getMeta().schedule).toEqual(legacy);
    cache.setMeta({
      phase: 'offseason',
      completedSeasonSchedulingRanks: { seasonId: 's1', ranks: {} },
    });
    const before = copy(cache.getMeta());
    const persisted = copy(await Meta.load());
    const archives = copy(await Seasons.loadAll());
    await expect(dispatchWorker(toWorker.START_NEW_SEASON)).rejects.toThrow(
      /previous-season ranks/
    );
    expect(cache.getMeta()).toEqual(before);
    expect(await Meta.load()).toEqual(persisted);
    expect(await Seasons.loadAll()).toEqual(archives);
    expect(cache.getMeta().schedule.weeks[0].games[0]).toEqual(game);
    // A legacy offseason save with only partial results must also fail before
    // it can turn those interim records into next year's same-place opponents.
    cache.setMeta({ completedSeasonSchedulingRanks: null });
    await driver.save();
    const partialBefore = copy(cache.getMeta());
    const partialPersisted = copy(await Meta.load());
    await expect(dispatchWorker(toWorker.START_NEW_SEASON)).rejects.toThrow(
      /incomplete previous regular season/i
    );
    expect(cache.getMeta()).toEqual(partialBefore);
    expect(await Meta.load()).toEqual(partialPersisted);
    expect(cache.getMeta().schedule.weeks[0].games[0]).toEqual(game);
  }, 180000);
  it('rejects a bad new-franchise schedule before clearing the active save', async () => {
    const driver = new LifecycleDriver({ seed: 1803 });
    await driver.initLeague();
    const before = copy(cache.getMeta());
    const persisted = copy(await Meta.load());
    const validate = vi
      .spyOn(nflAuthority, 'assertNflSchedule')
      .mockImplementationOnce(() => {
        throw new Error('injected strict schedule rejection');
      });
    try {
      await expect(
        dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE, {
          slotKey: 'save_slot_1',
          options: { userTeamId: 7 },
        })
      ).rejects.toThrow(/injected strict schedule rejection/);
      expect(cache.getMeta()).toEqual(before);
      expect(await Meta.load()).toEqual(persisted);
    } finally {
      validate.mockRestore();
    }
  }, 180000);
});
