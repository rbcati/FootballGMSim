import 'fake-indexeddb/auto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { Games } from '../../db/index.js';
import { cache } from '../../db/cache.js';
import { dispatchWorker, loadWorkerModule } from '../../testSupport/dynastySoakRunner.js';
import { toWorker, toUI } from '../protocol.js';
import * as rich from '../../core/sim/richGameSimulator.ts';
import { aggregateTeamUnitsFromRoster } from '../../core/sim/weekSimulationBridge.ts';

// Real commands, real matchup builder and inline production SimulationManager.
// The spy records inputs/results and calls through to the actual engine.
describe.sequential('scheme authority in production Watch/Quick Sim and weekly advancement',()=>{
  afterAll(()=>vi.restoreAllMocks());
  it('refreshes current schemes/personnel into rich resolution and persists the canonical result',async()=>{
    await loadWorkerModule();
    await dispatchWorker(toWorker.INIT,{}, {timeoutMs:30000});
    const boot=await dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE,{
      slotKey:'save_slot_1',options:{rngSeed:1802,userTeamId:0,name:'Scheme execution integration'},
    },{timeoutMs:60000});
    expect(boot.payload.settings.useNewSimulationEngine).toBe(true);
    const freshFits=cache.getAllTeams().map(t=>aggregateTeamUnitsFromRoster(cache.getPlayersByTeam(t.id),t.id,{
      offSchemeId:t.strategies?.offSchemeId??t.staff?.headCoach?.offScheme??'WEST_COAST',
      defSchemeId:t.strategies?.defSchemeId??t.staff?.headCoach?.defScheme??'COVER_2',
    }).schemeFit);
    expect(freshFits.some(f=>f.offense!==0)).toBe(true);
    expect(freshFits.some(f=>f.defense!==0)).toBe(true);
    for(const p of cache.getPlayersByTeam(0)) {
      const a={...p.attributesV2};
      if(p.pos==='QB') Object.assign(a,{throwPower:99,throwAccuracyDeep:99,throwAccuracyShort:30,release:30,decisionMaking:30});
      if(['WR','TE'].includes(p.pos)) Object.assign(a,{separation:99,ballTracking:99,routeRunning:30,catchInTraffic:30});
      cache.updatePlayer(p.id,{attributesV2:a,...(['QB','WR','TE'].includes(p.pos)?{ratings:undefined}:{})});
    }
    const team=cache.getTeam(0);
    cache.updateTeam(0,{strategies:{...team.strategies,offSchemeId:'VERTICAL',defSchemeId:'COVER_2',gamePlan:{...team.strategies?.gamePlan,blitzFrequency:75}}});
    const snapshot=cache.snapshotStartNewSeasonState();
    const ratings=cache.getPlayersByTeam(0).map(p=>({id:p.id,ovr:p.ovr,attributesV2:structuredClone(p.attributesV2)}));
    const calls=[];const actual=rich.simulateRichGame;
    vi.spyOn(rich,'simulateRichGame').mockImplementation(payload=>{
      const result=actual(payload);calls.push({payload:structuredClone(payload),result});return result;
    });
    const first=await dispatchWorker(toWorker.WATCH_GAME,{}, {timeoutMs:60000});
    expect(first.type).toBe(toUI.PLAY_LOGS);expect(calls).toHaveLength(1);
    const side=calls[0].payload.homeTeamId===0?'home':'away';
    const firstPayload=calls[0].payload;
    expect(firstPayload).toMatchObject({gameId:expect.any(String)});
    expect(firstPayload[`${side}SchemeFit`].offense).toBeGreaterThan(0);
    const unit=aggregateTeamUnitsFromRoster(cache.getPlayersByTeam(0),0,{offSchemeId:'VERTICAL',defSchemeId:'COVER_2'});
    expect(firstPayload[`${side}SchemeFit`]).toEqual(unit.schemeFit);
    expect(firstPayload.gameDayUnits[side]).toEqual(unit.selectedUnitPlayerIds);
    const plan=firstPayload[`${side}PrepMultipliers`];
    expect(plan.blitzFrequency).toBe(75);
    const book=await Games.load(firstPayload.gameId);
    expect(book).toBeTruthy();
    expect(book.canonicalEvents.at(-1).scoreAfter).toEqual({home:calls[0].result.homeScore,away:calls[0].result.awayScore});
    expect(first.payload.teamStats).toEqual(calls[0].result.teamStats);
    expect(first.payload.playerStats).toEqual(calls[0].result.boxScore);

    cache.restoreStartNewSeasonState(snapshot);
    const originalTeam=cache.getTeam(0);
    cache.updateTeam(0,{strategies:{...originalTeam.strategies,offSchemeId:'WEST_COAST'}});
    await dispatchWorker(toWorker.WATCH_GAME,{}, {timeoutMs:60000});
    expect(calls).toHaveLength(2);
    const secondPayload=calls[1].payload;
    expect(secondPayload[`${side}SchemeFit`].offense).toBe(-firstPayload[`${side}SchemeFit`].offense);
    expect(secondPayload[`${side}SchemeFit`].defense).toBe(firstPayload[`${side}SchemeFit`].defense);
    expect(secondPayload[`${side}PrepMultipliers`]).toEqual(plan);
    expect(secondPayload[`${side}Offense`]).toEqual(firstPayload[`${side}Offense`]);
    // Removing only the new context recovers exact seeded baseline execution.
    const neutral={...firstPayload,playerStatsStore:undefined,homeSchemeFit:undefined,awaySchemeFit:undefined};
    expect(actual(neutral)).toEqual(actual({...secondPayload,playerStatsStore:undefined,homeSchemeFit:undefined,awaySchemeFit:undefined}));
    let changed=0;
    for(let seed=1;seed<=40;seed++) {
      const a=actual({...firstPayload,seed,playerStatsStore:undefined});
      const b=actual({...secondPayload,seed,playerStatsStore:undefined});
      changed+=Number(JSON.stringify(a.teamStats)!==JSON.stringify(b.teamStats));
    }
    expect(changed).toBeGreaterThan(0);
    expect(cache.getPlayersByTeam(0).map(p=>({id:p.id,ovr:p.ovr,attributesV2:p.attributesV2}))).toEqual(ratings);
    const gameId=secondPayload.gameId;
    const advanced=await dispatchWorker(toWorker.ADVANCE_WEEK,{skipUserGame:true},{timeoutMs:120000});
    expect(advanced.type).toBe(toUI.WEEK_COMPLETE);
    expect(advanced.payload.results.some(g=>g.gameId===gameId)).toBe(false);
    expect(calls.length).toBeGreaterThan(2);
    // AI-v-AI games carry the identical bounded context contract for both sides.
    for(const {payload} of calls.slice(2)) for(const unitSide of ['home','away']) {
      const fit=payload[`${unitSide}SchemeFit`];
      expect(fit.version).toBe('selected-personnel-relative-v1');
      expect(Math.abs(fit.offense)).toBeLessThanOrEqual(.025);
      expect(Math.abs(fit.defense)).toBeLessThanOrEqual(.025);
    }
  },180000);
});
