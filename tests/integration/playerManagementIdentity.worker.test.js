import 'fake-indexeddb/auto';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import * as serialization from '../../src/worker/serialization.js';
import { cache } from '../../src/db/cache.js';
import { Transactions } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';

const bytes = () => new Map(cache.getAllPlayers().map(p => [p.id, JSON.stringify(p)]));
const unchangedOthers = (before, id) => {
  for (const p of cache.getAllPlayers()) if (p.id !== id) expect(JSON.stringify(p)).toBe(before.get(p.id));
};

describe.sequential('player-management and history worker identity', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal', 'fallback']) describe.sequential(source, () => {
    let boot, player, other;
    beforeAll(async () => {
      boot = source === 'normal'
        ? await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year: 2026, rngSeed: 1810, userTeamId: 0, salaryCap: 301.2 } })
        : await dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE, { slotKey: 'save_slot_2', options: { year: 2026, rngSeed: 1810, userTeamId: 0 } });
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      [player, other] = cache.getAllPlayers().map(p => structuredClone(p));
    }, 60000);

    it('changes only the requested management intent and persists its original ID', async () => {
      const before = bytes();
      const result = await dispatchWorker(toWorker.UPDATE_PLAYER_MANAGEMENT, { playerId: player.id, teamId: player.teamId, updates: { tradeStatus: 'untouchable', extensionDecision: 'let_walk', contractPlan: ['trade_candidate'] } }, { timeoutMs: 30000 });
      expect(result.type).toBe(toUI.STATE_UPDATE);
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, tradeStatus: 'untouchable', extensionDecision: 'let_walk', ratings: player.ratings, contract: player.contract });
      unchangedOthers(before, player.id);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, extensionDecision: 'let_walk', contractPlan: ['trade_candidate'] });
      unchangedOthers(before, player.id);
    }, 60000);

    it('toggles only the selected player on the trade block, including numeric aliases', async () => {
      const before = bytes();
      const result = await dispatchWorker(toWorker.TOGGLE_TRADE_BLOCK, { playerId: String(player.id), teamId: player.teamId }, { timeoutMs: 30000 });
      expect(result.type).toBe(toUI.STATE_UPDATE);
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, onTradeBlock: true, tradeStatus: 'actively_shopping' });
      unchangedOthers(before, player.id);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, onTradeBlock: true });
      unchangedOthers(before, player.id);
    }, 60000);

    it('rejects unknown and invalid management references without changing any player', async () => {
      for (const playerId of ['unknown-id', '', null, true, {}, NaN]) for (const type of [toWorker.UPDATE_PLAYER_MANAGEMENT, toWorker.TOGGLE_TRADE_BLOCK]) {
        const before = bytes();
        await expect(dispatchWorker(type, { playerId, teamId: player.teamId, updates: { tradeStatus: 'available' } }, { timeoutMs: 3000 })).rejects.toThrow(/Player not found|Missing playerId/);
        unchangedOthers(before, undefined);
      }
    }, 60000);

    it('returns exactly the requested player history through the actual transaction handler', async () => {
      await Transactions.addBulk([player, other].map((p, i) => ({ id: 95001 + i, type: 'SIGN', teamId: p.teamId, seasonId: cache.getMeta().currentSeasonId, week: 1, details: { playerId: p.id } })));
      for (const p of [player, other]) {
        const result = await dispatchWorker(toWorker.GET_TRANSACTIONS, { playerId: p.id, limit: 100 });
        console.log('HISTORY REPRO', JSON.stringify({ source, id: p.id, count: result.payload.transactions.length }));
        expect(result.payload.transactions).toHaveLength(1);
        expect(result.payload.transactions[0]).toMatchObject({ playerId: p.id, playerName: cache.getPlayer(p.id).name });
      }
      for (const playerId of ['unknown-id', '', true, {}, NaN]) {
        const result = await dispatchWorker(toWorker.GET_TRANSACTIONS, { playerId, limit: 100 });
        expect(result.payload.transactions).toEqual([]);
      }
    }, 60000);
    for (const [type, status] of [
      [toWorker.HONOR_TRADE_REQUEST, 'honored'],
      [toWorker.STONEWALL_TRADE_REQUEST, 'pending'],
      [toWorker.OFFER_EXTENSION_TO_WITHDRAW, 'withdrawn'],
    ]) it(`resolves ${type} for only the selected player and persists its response`, async () => {
      cache.updatePlayer(player.id, { contractYearsLeft: 1, tradeRequest: { status: 'pending', requestedSeason: 1, requestedWeek: 1, stonewalledWeeks: 0, reason: 'personal' } });
      const before = bytes();
      const serialize = vi.spyOn(serialization, 'serializeLeagueDelta');
      let result;
      try {
        result = await dispatchWorker(type, { playerId: player.id }, { timeoutMs: 30000 });
        // The legacy delta transport drops this unused redirect field for both
        // ID types. Verify its producer preserves identity without changing that
        // separate transport/UI behavior in an ID compatibility patch.
        if (type === toWorker.OFFER_EXTENSION_TO_WITHDRAW) expect(serialize.mock.calls.at(-1)[0].extensionRedirect).toEqual({ playerId: player.id });
      } finally { serialize.mockRestore(); }
      expect(result.type).toBe(toUI.STATE_UPDATE);
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, tradeRequest: { status } });
      if (type === toWorker.STONEWALL_TRADE_REQUEST) expect(cache.getPlayer(player.id).tradeRequest.stonewalledWeeks).toBe(1);
      unchangedOthers(before, player.id);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, tradeRequest: { status } });
      unchangedOthers(before, player.id);
      const after = bytes();
      await expect(dispatchWorker(type, { playerId: 'unknown-id' }, { timeoutMs: 3000 })).rejects.toThrow('Player not found');
      unchangedOthers(after, undefined);
    }, 60000);

  });
});
