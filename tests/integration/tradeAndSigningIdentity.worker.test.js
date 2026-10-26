import 'fake-indexeddb/auto';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Transactions } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker } from '../../src/worker/protocol.js';
import { getPlayerCapHit } from '../../src/core/teamValidation.js';
import { buildAITradeOffer } from '../../src/core/trades/aiTradeEngine.js';

describe.sequential('trade execution and immediate signing identity', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal', 'fallback']) describe.sequential(source, () => {
    let boot, generatedOffer;
    beforeAll(async () => {
      boot = await dispatchWorker(source === 'normal' ? toWorker.NEW_LEAGUE : toWorker.USE_SAFE_STARTER_LEAGUE, { teams: DEFAULT_TEAMS, slotKey: 'save_slot_2', options: { year: 2026, rngSeed: 1807, userTeamId: 0, salaryCap: 500 } });
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    }, 60000);
    it('actually exchanges an accepted AI offer and persists identity, cap and history', async () => {
      let target;
      const ai = cache.getTeam(1);
      let offer;
      for (const player of cache.getPlayersByTeam(0)) {
        const candidate = buildAITradeOffer(player, ai, cache.getPlayersByTeam(1), [], 1, 1, 1807);
        if (candidate?.offerPlayers?.length === 1) { offer = candidate; target = player; break; }
      }
      expect(offer).toBeTruthy();
      generatedOffer = offer;
      const incoming = cache.getPlayer(offer.offerPlayers[0].id);
      cache.updatePlayer(target.id, { holdout: { active: true, reason: 'contract' } });
      for (const teamId of [0, 1]) cache.updateTeam(teamId, { wins: 8, losses: 0 });
      const original = [target, incoming].map(p => structuredClone(cache.getPlayer(p.id)));
      const oldCaps = [0,1].map(id => structuredClone(cache.getTeam(id)));
      cache.setMeta({ tradeOffers: [{ ...offer, isBlockOffer: true, status: 'pending' }] });
      const result = await dispatchWorker(toWorker.ACCEPT_TRADE_OFFER, { offerId: offer.offerId });
      console.log('TRADE REPRO', source, result.payload, target.id, cache.getPlayer(target.id).teamId);
      expect(result.payload.accepted).toBe(true);
      expect(cache.getPlayer(target.id).teamId).toBe(1);
      expect(cache.getPlayer(incoming.id).teamId).toBe(0);
      expect(cache.getPlayer(target.id).holdout.active).toBe(false);
      for (const p of [target, incoming]) expect(cache.getPlayer(p.id).moraleEvents.some(e => e.source === 'trade')).toBe(true);
      for (const [index, outgoing, arriving] of [[0, target, incoming], [1, incoming, target]]) {
        const team = cache.getTeam(index);
        expect(team.capUsed).toBeCloseTo(oldCaps[index].capUsed - getPlayerCapHit(outgoing) + getPlayerCapHit(arriving) + (team.deadCap ?? 0) - (oldCaps[index].deadCap ?? 0), 5);
      }
      const state = original.map(p => structuredClone(cache.getPlayer(p.id)));
      for (let i=0;i<2;i++) expect(state[i]).toMatchObject({ id: original[i].id, contract: original[i].contract, ratings: original[i].ratings });
      const history = await Transactions.loadRecent();
      expect(history.some(t => t.type === 'TRADE' && t.details.offering.playerIds.includes(target.id) && t.details.receiving.playerIds.includes(incoming.id))).toBe(true);
      const caps = [0,1].map(id => structuredClone(cache.getTeam(id)));
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      for (const p of state) expect(cache.getPlayer(p.id)).toMatchObject({ id: p.id, teamId: p.teamId, contract: p.contract });
      for (const t of caps) expect(cache.getTeam(t.id).capUsed).toBeCloseTo(t.capUsed, 5);
      const reverse = { ...offer, offerId: 'failed-mutation', targetPlayerId: incoming.id, offerPlayers: [{ id: target.id }], isBlockOffer: true, status: 'pending' };
      cache.setMeta({ tradeOffers: [reverse] });
      for (const badIds of [[null], ['unknown-id'], [incoming.id], [target.id, target.id]]) {
        cache.setMeta({ tradeOffers: [{ ...reverse, offerPlayers: badIds.map(id => ({ id })) }] });
        const rejected = await dispatchWorker(toWorker.ACCEPT_TRADE_OFFER, { offerId: reverse.offerId });
        expect(rejected.payload.accepted).toBe(false);
        expect(cache.getPlayer(target.id).teamId).toBe(1);
        expect(cache.getPlayer(incoming.id).teamId).toBe(0);
      }
      cache.updatePlayer(incoming.id, { teamId: null });
      cache.setMeta({ tradeOffers: [reverse] });
      const unsigned = await dispatchWorker(toWorker.ACCEPT_TRADE_OFFER, { offerId: reverse.offerId });
      expect(unsigned.payload.accepted).toBe(false);
      expect(cache.getPlayer(incoming.id).teamId).toBeNull();
      cache.updatePlayer(incoming.id, { teamId: 0 });
      cache.setMeta({ tradeOffers: [reverse] });
      const beforeFailure = original.map(p => structuredClone(cache.getPlayer(p.id)));
      const update = cache.updatePlayer;
      let skipped = false;
      const spy = vi.spyOn(cache, 'updatePlayer').mockImplementation((id, patch) => {
        if (!skipped && patch.teamId != null) { skipped = true; return; }
        return update(id, patch);
      });
      try { await expect(dispatchWorker(toWorker.ACCEPT_TRADE_OFFER, { offerId: reverse.offerId })).rejects.toThrow('required roster mutations'); }
      finally { spy.mockRestore(); }
      for (const p of beforeFailure) expect(cache.getPlayer(p.id)).toEqual(p);
      expect(cache.getMeta().tradeOffers[0].status).toBe('pending');
      cache.setMeta({ tradeOffers: [{ ...offer, offerId: 'stale', isBlockOffer: true, status: 'pending' }] });
      const stale = await dispatchWorker(toWorker.ACCEPT_TRADE_OFFER, { offerId: 'stale' });
      expect(stale.payload.accepted).toBe(false);
    }, 60000);
    it('executes an accepted counter using real valuation and original IDs', async () => {
      const outgoing = [...cache.getPlayersByTeam(0)].sort((a,b) => b.ovr-a.ovr)[0];
      const incoming = [...cache.getPlayersByTeam(1)].sort((a,b) => a.ovr-b.ovr)[0];
      cache.setMeta({ tradeOffers: [{ ...generatedOffer, offerId: 'counter', aiTeamId: 1, targetPlayerId: outgoing.id, offerPlayers: [{ id: incoming.id }], offerPicks: [], isBlockOffer: true, status: 'pending' }] });
      const result = await dispatchWorker(toWorker.COUNTER_TRADE_OFFER, { offerId: 'counter', counterPlayers: [String(outgoing.id)], counterPicks: [] });
      expect(result.payload.accepted).toBe(true);
      expect(cache.getPlayer(outgoing.id).teamId).toBe(1);
      expect(cache.getPlayer(incoming.id).teamId).toBe(0);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      expect(cache.getPlayer(outgoing.id).teamId).toBe(1);
      expect(cache.getPlayer(incoming.id).teamId).toBe(0);
    }, 60000);
    it('immediately signs a qualifying released player, without changing unrelated players', async () => {
      const waiting = cache.getPlayersByTeam(0).find(p => p.pos === 'WR');
      await dispatchWorker(toWorker.RELEASE_PLAYER, { playerId: waiting.id, teamId: 0 });
      cache.setMeta({ phase: 'free_agency' });
      await dispatchWorker(toWorker.SUBMIT_OFFER, { playerId: waiting.id, teamId: 0, contract: { baseAnnual: 0.8, signingBonus: 0, yearsTotal: 1, years: 1 } });
      expect(cache.getPlayer(waiting.id).teamId).toBeNull();
      expect(cache.getPlayer(waiting.id).offers.length).toBeGreaterThan(0);
      cache.setMeta({ phase: 'regular' });
      const player = cache.getPlayersByTeam(0).find(p => p.pos === 'P');
      await dispatchWorker(toWorker.RELEASE_PLAYER, { playerId: player.id, teamId: 0 });
      const before = new Map(cache.getAllPlayers().map(p => [p.id, JSON.stringify(p)]));
      const result = await dispatchWorker(toWorker.SUBMIT_OFFER, { playerId: player.id, teamId: 0, contract: { baseAnnual: 30, signingBonus: 30, yearsTotal: 3, years: 3, guaranteedPct: 1 } });
      console.log('SIGNING REPRO', source, result.type, cache.getPlayer(player.id).teamId);
      expect(cache.getPlayer(player.id).teamId).toBe(0);
      for (const p of cache.getAllPlayers()) if (p.id !== player.id) expect(JSON.stringify(p)).toBe(before.get(p.id));
      const signed = structuredClone(cache.getPlayer(player.id));
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
      expect(cache.getPlayer(player.id)).toMatchObject({ id: player.id, teamId: 0, contract: signed.contract });
      expect(cache.getPlayer(waiting.id).teamId).toBeNull();
      expect(JSON.stringify(cache.getPlayer(waiting.id))).toBe(before.get(waiting.id));
    }, 60000);
  });
});
