import 'fake-indexeddb/auto';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadWorkerModule, dispatchWorker } from '../../src/testSupport/dynastySoakRunner.js';
import { cache } from '../../src/db/cache.js';
import { Transactions } from '../../src/db/index.js';
import { DEFAULT_TEAMS } from '../../src/data/default-teams.js';
import { toWorker } from '../../src/worker/protocol.js';

describe.sequential('bounded player-profile draft transaction attribution', () => {
  beforeAll(async()=>{await loadWorkerModule();await dispatchWorker(toWorker.INIT);});
  for (const source of ['normal','fallback']) it(`${source} resolves distinct historical player records and profile context`,async()=>{
    const boot=await dispatchWorker(source==='normal'?toWorker.NEW_LEAGUE:toWorker.USE_SAFE_STARTER_LEAGUE,{teams:DEFAULT_TEAMS,slotKey:'save_slot_2',options:{year:2026,rngSeed:1807,userTeamId:0,salaryCap:500}});
    const players=cache.getPlayersByTeam(0).slice(0,2);
    for (const [index,p] of players.entries()) {
      cache.updatePlayer(p.id,{draftYear:2026});
      await Transactions.add({type:'DRAFT',seasonId:'s1',week:1,teamId:0,details:{playerId:p.id,overall:index+1,round:1,pickInRound:index+1}});
    }
    const verify=async()=>{
      const result=await dispatchWorker(toWorker.GET_DRAFT_CLASS,{seasonId:'s1'});
      for (const [index,p] of players.entries()) {
        const row=result.payload.model.picks.find(row=>row.playerId===p.id);
        console.log('HISTORY AUDIT REPRO',source,p.id,row?.playerName);
        expect(row).toMatchObject({playerId:p.id,playerName:p.name,pos:p.pos});
        const profile=await dispatchWorker(toWorker.GET_PLAYER_DRAFT_CONTEXT,{playerId:p.id});
        expect(profile.payload.context).toMatchObject({known:true,overall:index+1});
      }
      const invalid=await dispatchWorker(toWorker.GET_PLAYER_DRAFT_CONTEXT,{playerId:'unknown-id'});
      expect(invalid.payload.context.known).toBe(false);
    };
    await verify();
    await dispatchWorker(toWorker.SAVE_NOW);
    await dispatchWorker(toWorker.LOAD_SAVE,{leagueId:boot.payload.activeLeagueId});
    await verify();
  },60000);
});
