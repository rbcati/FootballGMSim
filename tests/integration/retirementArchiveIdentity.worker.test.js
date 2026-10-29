import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Players, Transactions, Seasons } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker } from '../../src/worker/protocol.js';
import * as retirement from '../../src/core/retirement-system.js';
import { Utils } from '../../src/core/utils.js';

async function boot(source) {
  const result = await dispatchWorker(source === 'normal' ? toWorker.NEW_LEAGUE : toWorker.USE_SAFE_STARTER_LEAGUE, { teams: DEFAULT_TEAMS, slotKey: 'save_slot_2', options: { year: 2026, rngSeed: 1807, userTeamId: 0, salaryCap: 500 } });
  await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: result.payload.activeLeagueId });
  return result.payload.activeLeagueId;
}

describe.sequential('retirement and persisted season archive player identity', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal', 'fallback']) describe.sequential(source, () => {
    it('records a real retirement and returns only that player in profile history after reload', async () => {
      const leagueId = await boot(source);
      const [target, unrelated] = cache.getPlayersByTeam(0).map(p => structuredClone(p));
      await Transactions.add({ type: 'SIGN', seasonId: 's1', week: 1, teamId: 0, details: { playerId: unrelated.id } });
      cache.updatePlayer(target.id, { age: 50 });
      cache.setMeta({ phase: 'offseason_resign' });
      // Control only the random draw inside the real retirement evaluator.
      // The production age/trait/injury rules and worker lifecycle still run.
      const evaluate = retirement.evaluateRetirements;
      const evaluator = vi.spyOn(retirement, 'evaluateRetirements').mockImplementation(players => {
        const random = vi.spyOn(Utils, 'random').mockReturnValue(0.5);
        try { return evaluate(players); } finally { random.mockRestore(); }
      });
      let result;
      try { result = await dispatchWorker(toWorker.ADVANCE_OFFSEASON); }
      finally { evaluator.mockRestore(); }
      expect(result.payload.retired.some(p => p.id === target.id)).toBe(true);
      const records = (await Transactions.bySeason('s1')).filter(t => t.type === 'RETIREMENT');
      const record = records.find(t => t.playerId === target.id);
      console.log('RETIREMENT REPRO', source, records.map(t => [t.playerId, t.details.playerId]));
      expect(records).toHaveLength(result.payload.retired.length);
      for (const tx of records) {
        expect(result.payload.retired.some(p => p.id === tx.playerId)).toBe(true);
        expect(tx.details.playerId).toBe(tx.playerId);
      }
      expect(record).toMatchObject({ playerId: target.id, details: { playerId: target.id } });
      expect(await Players.load(target.id)).toMatchObject({ id: target.id, status: 'retired' });
      const verify = async () => {
        const profile = await dispatchWorker(toWorker.GET_TRANSACTIONS, { playerId: target.id, seasonId: 's1' });
        expect(profile.payload.transactions.filter(t => t.type === 'retirement')).toEqual([expect.objectContaining({ playerId: target.id, playerName: target.name, pos: target.pos })]);
        const other = await dispatchWorker(toWorker.GET_TRANSACTIONS, { playerId: unrelated.id, seasonId: 's1' });
        expect(other.payload.transactions).toContainEqual(expect.objectContaining({ type: 'signing', playerId: unrelated.id, playerName: unrelated.name }));
        expect(other.payload.transactions.some(t => t.type === 'retirement' && t.playerId === target.id)).toBe(false);
      };
      await verify();
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId });
      expect((await Transactions.bySeason('s1')).find(t => t.id === record.id)).toEqual(record);
      await verify();
    }, 180000);

    it('archives distinct historical actions through START_NEW_SEASON and persists their associations', async () => {
      const leagueId = await boot(source);
      const actors = cache.getPlayersByTeam(1).slice(0, 6).map(p => structuredClone(p));
      actors[4] = structuredClone(cache.getPlayersByTeam(0)[0]);
      const types = ['SIGN', 'RELEASE', 'TRADE', 'DRAFT', 'RETIREMENT'];
      // Supported historical transaction forms; players/identities come from
      // production generation. The archive itself is produced by real rollover.
      const records = types.map((type, index) => ({ id: 91000 + index, type, seasonId: 's1', week: 18, teamId: actors[index].teamId, details: { playerId: actors[index].id, ...(type === 'TRADE' ? { receivedPlayerId: actors[5].id, fromTeamId: 1, toTeamId: 2 } : {}), ...(type === 'DRAFT' ? { overall: 1, round: 1 } : {}) } }));
      await Transactions.addBulk(records);
      const retiree = actors[4];
      // Match the production retirement boundary: persist then evict from hot cache.
      cache.updatePlayer(retiree.id, { status: 'retired', teamId: null });
      await dispatchWorker(toWorker.SAVE_NOW);
      cache.setMeta({ retiredPlayers: [{ ...retiree }], phase: 'offseason', championTeamId: 0 });
      cache.evictRetired();
      await dispatchWorker(toWorker.START_NEW_SEASON);
      expect(cache.getMeta().currentSeasonId).toBe('s2');
      const archive = await Seasons.load('s1');
      expect(archive?.transactionTimelineV1?.rows).toBeTruthy();
      const verify = rowSet => {
        for (const index of [1, 0, 2, 3, 4]) {
          const actor = actors[index];
          const row = rowSet.find(r => r.rawId === records[index].id);
          console.log('ARCHIVE REPRO', source, types[index], row?.playerName, row?.headline);
          expect(row).toMatchObject({ playerId: actor.id, playerName: actor.name, pos: actor.pos, teamId: actor.teamId, teamAbbr: cache.getTeam(actor.teamId).abbr });
          expect(row.playerName).not.toBe(actors[5].name);
        }
      };
      verify(archive.transactionTimelineV1.rows);
      const trade = archive.transactionTimelineV1.rows.find(r => r.rawId === records[2].id);
      expect(trade.detail).toContain(actors[5].name);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId });
      const reloaded = await Seasons.load('s1');
      expect(reloaded.transactionTimelineV1).toEqual(archive.transactionTimelineV1);
      verify(reloaded.transactionTimelineV1.rows);
      const view = await dispatchWorker(toWorker.GET_SEASON_HISTORY, { seasonId: 's1' });
      expect(JSON.stringify(view.payload)).toContain(actors[1].name);
    }, 180000);
  });
});
