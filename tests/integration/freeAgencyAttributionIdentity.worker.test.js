import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker } from '../../src/worker/protocol.js';
import AiLogic from '../../src/core/ai-logic.js';
async function boot(source) {
  const b = await dispatchWorker(source === 'normal' ? toWorker.NEW_LEAGUE : toWorker.USE_SAFE_STARTER_LEAGUE,{ teams:DEFAULT_TEAMS,slotKey:'save_slot_2',options:{year:2026,rngSeed:1807,userTeamId:0,salaryCap:500} });
  await dispatchWorker(toWorker.LOAD_SAVE,{leagueId:b.payload.activeLeagueId});
  cache.setMeta({phase:'free_agency',freeAgencyState:{day:1,maxDays:5,complete:false},pendingOffers:[],offseasonFaMovements:[]});
  return b.payload.activeLeagueId;
}
describe.sequential('bounded free-agent attribution identity audit', () => {
  beforeAll(async () => { await loadWorkerModule(); await dispatchWorker(toWorker.INIT); });
  for (const source of ['normal','fallback']) {
    it(`${source} preserves release and prior-team free-agent movement identity`, async () => {
      const leagueId = await boot(source);
      const released = structuredClone(cache.getPlayersByTeam(0).find(p=>p.pos==='WR'));
      await dispatchWorker(toWorker.RELEASE_PLAYER,{teamId:0,playerId:released.id});
      // Membership supports legacy free agents retaining their previous teamId.
      const signing = structuredClone(cache.getPlayersByTeam(1).find(p=>p.pos==='WR'));
      cache.updatePlayer(signing.id,{status:'free_agent'});
      await dispatchWorker(toWorker.SIGN_PLAYER,{teamId:0,playerId:signing.id,contract:signing.contract});
      const meta = cache.getMeta();
      const release = meta.offseasonReleaseMap[`2026:${released.id}`];
      const movement = meta.offseasonFaMovements.find(r=>r.playerName===signing.name);
      console.log('FA ATTRIBUTION REPRO',source,release?.playerId,movement?.playerId);
      expect.soft(release.playerId).toBe(released.id);
      expect.soft(movement?.playerId).toBe(signing.id);
      expect(cache.getPlayer(signing.id).teamId).toBe(0);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE,{leagueId});
      expect(cache.getMeta().offseasonReleaseMap[`2026:${released.id}`]).toEqual(release);
      expect(cache.getMeta().offseasonFaMovements).toContainEqual(movement);
    },60000);
    it(`${source} counts the user's opaque/numeric bid in real market competition events`, async () => {
      const leagueId = await boot(source);
      const p = cache.getPlayersByTeam(0).find(p=>p.pos==='WR');
      await dispatchWorker(toWorker.RELEASE_PLAYER,{teamId:0,playerId:p.id});
      const contract = {...p.contract,baseAnnual:p.contract.baseAnnual*2};
      cache.updatePlayer(p.id,{offers:[{teamId:1,contract},{teamId:2,contract}]});
      await dispatchWorker(toWorker.SUBMIT_OFFER,{teamId:0,playerId:p.id,contract:{...p.contract,baseAnnual:0.8,signingBonus:0,yearsTotal:1,years:1}});
      expect(cache.getMeta().pendingOffers.some(r=>r.playerId===p.id && r.status==='pending')).toBe(true);
      let count = null;
      const actual = AiLogic.processFreeAgencyDay;
      const spy = vi.spyOn(AiLogic,'processFreeAgencyDay').mockImplementation(async (...args)=>{
        count = cache.getPlayer(p.id).offers.filter(o=>o.teamId!==0).length;
        return actual.apply(AiLogic,args);
      });
      try {
        globalThis.self.onmessage({data:{type:toWorker.ADVANCE_FREE_AGENCY_DAY,payload:{}}});
        await dispatchWorker(toWorker.GET_FREE_AGENTS);
      } finally { spy.mockRestore(); }
      expect(count).toBeGreaterThanOrEqual(2);
      const pulse = cache.getMeta().leaguePulseItems.find(row=>row.dedupeKey?.startsWith(`fa_bidding_war_${p.id}_`));
      console.log('FA BID REPRO',source,count,pulse?.headline);
      expect(pulse).toMatchObject({relatedPlayerId:p.id});
      expect(pulse.headline).toContain(`${count+1} teams`);
      await dispatchWorker(toWorker.SAVE_NOW);
      await dispatchWorker(toWorker.LOAD_SAVE,{leagueId});
      expect(cache.getMeta().leaguePulseItems).toContainEqual(pulse);
    },60000);
  }
});
