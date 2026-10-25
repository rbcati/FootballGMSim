import 'fake-indexeddb/auto';
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker, toUI } from '../../src/worker/protocol.js';
import * as market from '../../src/core/trades/aiTradeEngine.js';
import * as requests from '../../src/core/trades/tradeRequestEngine.js';

const byOvr = (a,b) => (b.ovr ?? 0) - (a.ovr ?? 0);

describe.sequential('weekly opaque player identity consumers', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal', 'fallback']) describe.sequential(source, () => {
    let targetId, backupId, pendingId, starterId, pursuits, built, ranks, beforeReload;
    beforeAll(async () => {
      const boot = source === 'normal'
        ? await dispatchWorker(toWorker.NEW_LEAGUE, { teams: DEFAULT_TEAMS, options: { year: 2026, userTeamId: 0, rngSeed: 1807, salaryCap: 301.2, injuryFrequency: 'none' } })
        : await dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE, { slotKey: 'save_slot_3', options: { year: 2026, userTeamId: 0, rngSeed: 1807 } });
      cache.setMeta({ settings: { ...cache.getMeta().settings, injuryFrequency: 0 } });
      const roster = cache.getPlayersByTeam(0);
      const qbs = roster.filter(p => p.pos === 'QB').sort(byOvr);
      targetId = qbs[0].id;
      backupId = qbs.at(-1).id;
      starterId = qbs[0].id;
      pendingId = roster.filter(p => p.pos === 'RB').sort(byOvr)[0].id;
      cache.updatePlayer(targetId, { onTradeBlock: true });
      for (const qb of qbs.slice(1)) cache.updatePlayer(qb.id, { morale: 30, contractYearsLeft: 3, extensionOfferedThisSeason: true, tradeRequest: null, moraleEvents: [], holdout: null });
      cache.updatePlayer(pendingId, { morale: 60, tradeRequest: { status: 'pending', reason: 'personal', requestedSeason: 1, requestedWeek: 1, stonewalledWeeks: 3 }, moraleEvents: [], holdout: null });
      const actual = requests.shouldPlayerRequestTrade;
      ranks = [];
      const rankSpy = vi.spyOn(requests, 'shouldPlayerRequestTrade').mockImplementation((p, team, season, week, context) => {
        ranks.push({ id: p.id, teamId: p.teamId, pos: p.pos, rank: context.depthRank, expected: cache.getPlayersByTeam(p.teamId).filter(x => x.pos === p.pos).sort(byOvr).findIndex(x => x.id === p.id) });
        return actual(p, team, season, week, context);
      });
      const targets = vi.spyOn(market, 'getAITradeBlockTargets');
      const build = vi.spyOn(market, 'buildAITradeOffer');
      try {
        const result = await dispatchWorker(toWorker.ADVANCE_WEEK, { skipUserGame: true }, { timeoutMs: 120000 });
        expect([toUI.WEEK_COMPLETE, toUI.FULL_STATE]).toContain(result.type);
        pursuits = targets.mock.results.flatMap(r => r.value ?? []);
        built = build.mock.calls.map(args => args[0].id);
      } finally { rankSpy.mockRestore(); targets.mockRestore(); build.mockRestore(); }
      // Progression can reorder tied numeric fallback QBs during the game.
      // Select the actual third QB at evaluation time rather than assuming a
      // pre-game ordering survives unchanged. Both backups start unhappy.
      backupId = ranks.find(r => r.teamId === 0 && r.pos === 'QB' && r.expected === 2).id;
      beforeReload = { backup: structuredClone(cache.getPlayer(backupId)), pending: structuredClone(cache.getPlayer(pendingId)), starter: structuredClone(cache.getPlayer(starterId)), offers: structuredClone(cache.getMeta().tradeOffers ?? []) };
      console.log('WEEKLY ID REPRO', JSON.stringify({ source, pursuits: pursuits.length, buildCalls: built.length, backupRank: ranks.find(r => r.id === backupId)?.rank, reason: beforeReload.backup.tradeRequest?.reason, teammateEvents: beforeReload.starter.moraleEvents?.filter(e => e.type === 'TEAMMATE_TRADE_REQUEST').length }));
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE, { leagueId: boot.payload.activeLeagueId });
    }, 180000);

    it('resolves actual AI pursuits into inbound offers for the selected player', () => {
      expect(pursuits.filter(p => p.targetPlayerId === targetId).length).toBeGreaterThan(0);
      expect(built.filter(id => id === targetId)).toHaveLength(pursuits.filter(p => p.targetPlayerId === targetId).length);
      const offers = (cache.getMeta().tradeOffers ?? []).filter(o => o.isBlockOffer && o.targetPlayerId === targetId);
      expect(offers.length).toBeGreaterThan(0);
      for (const offer of offers) expect(offer.targetPlayerId).toBe(targetId);
    });
    it('preserves depth rank and playing-time requests for an unhappy backup', () => {
      for (const row of ranks) expect(row.rank, `rank of ${row.id}`).toBe(row.expected);
      expect(ranks.find(r => r.id === backupId).rank).toBe(2);
      expect(cache.getPlayer(backupId)).toMatchObject({ id: backupId, tradeRequest: { status: 'pending', reason: 'playing_time' } });
      expect(cache.getPlayer(backupId).tradeRequest).toEqual(beforeReload.backup.tradeRequest);
    });
    it('applies starter teammate effects for new and stonewalled requests without self-attribution', () => {
      const starter = cache.getPlayer(starterId);
      const events = starter.moraleEvents.filter(e => e.type === 'TEAMMATE_TRADE_REQUEST');
      expect(events.some(e => e.reason.endsWith('requested a trade'))).toBe(true);
      expect(events.some(e => e.reason.includes(beforeReload.pending.name))).toBe(true);
      expect(cache.getPlayer(pendingId).moraleEvents.filter(e => e.type === 'TEAMMATE_TRADE_REQUEST').some(e => e.reason.includes(beforeReload.pending.name))).toBe(false);
    });
  });
});
