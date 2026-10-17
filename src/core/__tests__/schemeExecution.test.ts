import { describe, expect, it } from 'vitest';
import { aggregateTeamUnitsFromRoster } from '../sim/weekSimulationBridge.ts';
import { projectSchemeExecution, schemeMatchupDelta, SCHEME_EXECUTION_VERSION } from '../sim/schemeExecution.ts';
import { mapOverallToAttributesV2 } from '../migration/attributeMigrator.ts';
import { resolveMatchup } from '../sim/matchupEngine.ts';
import { simulateRichGame } from '../sim/richGameSimulator.ts';
import { deriveGamePlanMultipliers } from '../sim/gamePlanMultipliers.ts';
import { SimulationManager } from '../../worker/WorkerPool.ts';
import { calculatePlayerSchemeFit, OFFENSIVE_SCHEMES } from '../scheme-core.js';

const attrs = (n=75) => Object.fromEntries(Object.keys(mapOverallToAttributesV2(n)).map(k=>[k,n])) as any;
const player = (id:number,pos='QB',patch:any={}) => ({id,name:`P${id}`,teamId:1,pos,ovr:75,attributesV2:attrs(),...patch});
const deep = {...attrs(),throwPower:99,throwAccuracyDeep:99,throwAccuracyShort:30,release:30,decisionMaking:30};
const short = {...attrs(),throwPower:30,throwAccuracyDeep:30,throwAccuracyShort:99,release:99,decisionMaking:99};
const schemes = {offSchemeId:'VERTICAL',defSchemeId:'COVER_2'};
const aggregate = (roster:any[], context=schemes) => aggregateTeamUnitsFromRoster(roster,1,context);
const execution = (offense=0,defense=0) => ({version:SCHEME_EXECUTION_VERSION,offense,defense});
const ctx = {down:1,distance:10,yardLine:25,quarter:1,clockSec:900};
const payload = {gameId:'test',seed:777,homeTeamId:1,awayTeamId:2,homeOffense:attrs(),homeDefense:attrs(),awayOffense:attrs(),awayDefense:attrs()};

describe('AttributesV2 relative scheme execution V1',()=>{
  it.each(['VERTICAL','Vertical','Air Raid','Vertical / Air Raid','Pass Heavy'])('resolves offense ID %s',(offSchemeId)=>{
    expect(aggregate([player(1,'QB',{attributesV2:deep})],{...schemes,offSchemeId}).schemeFit.offense).toBe(.025);
  });
  it.each(['COVER_2','4-3 Cover 2','Cover 2','4-3'])('resolves defense ID %s',(defSchemeId)=>{
    expect(aggregate([player(1,'CB',{attributesV2:{...attrs(),zoneCoverage:99,pressCoverage:30}})],{...schemes,defSchemeId}).schemeFit.defense).toBe(.025);
  });
  it('bounds poor/excellent evidence and combines opposing effects under one cap',()=>{
    const good=aggregate([player(1,'QB',{attributesV2:deep})]).schemeFit;
    const bad=aggregate([player(1,'QB',{attributesV2:short})]).schemeFit;
    expect(good.offense).toBe(.025);expect(bad.offense).toBe(-.025);
    expect(schemeMatchupDelta(good,execution(0,-.025))).toBe(.025);
    expect(schemeMatchupDelta(bad,execution(0,.025))).toBe(-.025);
    expect(schemeMatchupDelta(execution(Infinity),execution(0,NaN))).toBe(0);
  });
  it('uses selected QB depth authority; bench attributes and stored fit cannot override it',()=>{
    const starter=player(1,'QB',{attributesV2:deep,depthChart:{rowKey:'QB',order:1}});
    const bench=player(2,'QB',{attributesV2:short,ovr:99,schemeFit:100,depthChart:{rowKey:'QB',order:2}});
    const before=aggregate([starter,bench]);
    expect(before.selectedUnitPlayerIds.offense).toEqual([1]);expect(before.schemeFit.offense).toBe(.025);
    bench.attributesV2=deep;
    expect(aggregate([starter,bench]).schemeFit).toEqual(before.schemeFit);
    bench.attributesV2=short;bench.depthChart.order=1;starter.depthChart.order=2;
    expect(aggregate([starter,bench]).schemeFit.offense).toBe(-.025);
  });
  it.each([{injured:true},{status:'injured_reserve'},{holdout:{active:true}},{teamId:2},{retired:true},{onPracticeSquad:true}])('excludes unavailable personnel %j',(patch)=>{
    const r=aggregate([player(1,'QB',{attributesV2:deep,...patch}),player(2,'QB',{attributesV2:short})]);
    expect(r.selectedUnitPlayerIds.offense).not.toContain(1);expect(r.schemeFit.offense).toBe(-.025);
  });
  it('refreshes scheme, recovery, trade, signing, release and progression without stale caches',()=>{
    const p=player(1,'QB',{attributesV2:deep});const roster=[p];
    expect(aggregate(roster).schemeFit.offense).toBe(.025);
    expect(aggregate(roster,{...schemes,offSchemeId:'WEST_COAST'}).schemeFit.offense).toBe(-.025);
    p.injured=true;expect(aggregate(roster).schemeFit.offense).toBe(0);
    p.injured=false;expect(aggregate(roster).schemeFit.offense).toBe(.025);
    p.teamId=2;expect(aggregate(roster).schemeFit.offense).toBe(0);
    p.teamId=1;expect(aggregate(roster).schemeFit.offense).toBe(.025);
    roster.pop();expect(aggregate(roster).schemeFit.offense).toBe(0);
    roster.push(p);expect(aggregate(roster).schemeFit.offense).toBe(.025);
    p.attributesV2=attrs();expect(aggregate(roster).schemeFit.offense).toBe(0);
  });
  it('keeps uniform talents and unsupported Smashmouth/OL/RB evidence neutral',()=>{
    for(const n of [25,50,75,99]) expect(aggregate([player(1,'QB',{attributesV2:attrs(n)})]).schemeFit).toEqual(execution());
    expect(aggregate([player(1,'QB',{attributesV2:deep})],{...schemes,offSchemeId:'SMASHMOUTH'}).schemeFit.offense).toBe(0);
    expect(aggregate([player(1,'OL',{attributesV2:deep}),player(2,'RB',{attributesV2:deep})]).schemeFit.offense).toBe(0);
  });
  it.each([undefined,NaN,Infinity,0,-1,101,'99'])('treats incomplete/invalid evidence %s conservatively',(value)=>{
    const a={...deep,throwPower:value};expect(aggregate([player(1,'QB',{attributesV2:a})]).schemeFit.offense).toBe(0);
  });
  it('does not manufacture fit from the existing overall-based migration shape',()=>{
    for(let id=0;id<100;id++) for(const pos of ['QB','WR','TE','LB','CB','S']) {
      expect(aggregate([player(id,pos,{attributesV2:undefined})]).schemeFit).toEqual(execution());
      expect(aggregate([player(id,pos,{attributesV2:mapOverallToAttributesV2(75,5.5,`${id}:P${id}`)})]).schemeFit).toEqual(execution());
    }
    expect(aggregate([]).schemeFit).toEqual(execution());
    expect(aggregate([player(1,'QB',{attributesV2:deep})],{} as any).schemeFit).toEqual(execution());
  });
  it('dilutes supported evidence across actual selected seats, including neutral roles',()=>{
    expect(aggregate([player(1,'QB',{attributesV2:deep}),player(2,'OL')]).schemeFit.offense).toBe(.0125);
  });
  it('respects row eligibility and applies the same role-adjusted evidence as unit strengths',()=>{
    const p=player(1,'QB',{attributesV2:deep,depthChart:{rowKey:'CB',order:1}});
    const result=aggregate([p]);expect(result.selectedUnitPlayerIds.defense).toEqual([]);
    expect(result.schemeFit.defense).toBe(0);
    // Ineligible row cannot turn a QB into a coverage contributor.
    expect(result.schemeFit.offense).toBe(.025);
  });
  it('applies exactly one relative probability adjustment; runs are bit-for-bit untouched',()=>{
    const base=resolveMatchup(attrs(),attrs(),ctx,()=>.9);
    const adjusted=resolveMatchup(attrs(),attrs(),{...ctx,schemeExecutionDelta:.025},()=>.9);
    expect(adjusted.successProbability/base.successProbability).toBeCloseTo(1.025,12);
    expect(resolveMatchup(attrs(),attrs(),{...ctx,playType:'run',schemeExecutionDelta:.025},()=>.9))
      .toEqual(resolveMatchup(attrs(),attrs(),{...ctx,playType:'run'},()=>.9));
    expect(resolveMatchup(attrs(),attrs(),{...ctx,schemeExecutionDelta:NaN},()=>.9)).toEqual(base);
  });
  it('offense/defense contexts stay independent and symmetric between team representations',()=>{
    const r=[player(1,'QB',{attributesV2:deep}),player(2,'CB',{attributesV2:{...attrs(),zoneCoverage:99,pressCoverage:30}})];
    const base=aggregate(r).schemeFit;
    expect(aggregate(r,{...schemes,offSchemeId:'WEST_COAST'}).schemeFit).toEqual({...base,offense:-base.offense});
    expect(aggregate(r,{...schemes,defSchemeId:'MAN_COVERAGE'}).schemeFit).toEqual({...base,defense:-base.defense});
    expect(schemeMatchupDelta(base,execution())).toBe(schemeMatchupDelta({...base},execution()));
    expect(projectSchemeExecution([r[0]] as any,[] as any,schemes).offense).toBe(.025);
  });
  it('keeps Game Plan/blitz independent with deterministic replay, score/stat accounting and no rating mutation',async()=>{
    const plan=deriveGamePlanMultipliers({gamePlan:{blitzFrequency:100,runPassBalance:80}});
    const input={...payload,homePrepMultipliers:plan,homeSchemeFit:execution(.025,.025)};
    const before=structuredClone(input);const r=simulateRichGame(input);
    expect(simulateRichGame(input)).toEqual(r);expect(input).toEqual(before);
    expect(r.simFactors.home.defensiveBlitzFrequency).toBe(100);
    expect(r.simFactors.home.defensivePressureDelta).toBe(plan.blitzPressureDelta);
    const inline=await new SimulationManager().simWeekParallel([input]);expect(inline.results[0]).toEqual(r);
    for(const side of ['home','away'] as const) {
      const s=r.teamStats[side];expect(r.quarterScores[side].reduce((a,b)=>a+b,0)).toBe(r[`${side}Score`]);
      expect(s.totalYards).toBe(s.passYd+s.rushYd);
      const box=Object.values(r.boxScore[side]);
      expect(box.reduce((sum,p)=>sum+(p.stats.passYd??0),0)).toBe(s.passYd);
      expect(s.passComp).toBeLessThanOrEqual(s.passAtt);
    }
    expect(r.scoringSummary.at(-1)?.scoreAfter).toEqual({home:r.homeScore,away:r.awayScore});
  });
  it('keeps offense/defense channels separate under home/away exchange',()=>{
    const home=execution(.015,-.01), away=execution(-.005,.02);
    expect(schemeMatchupDelta(home,away)).toBeCloseTo(-.005);
    expect(schemeMatchupDelta(away,home)).toBeCloseTo(.005);
    expect(schemeMatchupDelta({...home,defense:.025},away)).toBe(schemeMatchupDelta(home,away));
    expect(schemeMatchupDelta(home,{...away,offense:.025})).toBe(schemeMatchupDelta(home,away));
    const original=player(1,'QB',{attributesV2:deep});
    expect(aggregateTeamUnitsFromRoster([original],1,schemes).schemeFit)
      .toEqual(aggregateTeamUnitsFromRoster([{...original,teamId:2}],2,schemes).schemeFit);
  });
  it('transports scheme context through the real SimWorker entrypoint without changing inline authority',async()=>{
    const listeners=new Set<(event:any)=>void>();
    const previousSelf=globalThis.self;
    const workerScope:any={onmessage:null,postMessage:(data:any)=>listeners.forEach(fn=>fn({data:structuredClone(data)}))};
    let handler:any;
    try {
      globalThis.self=workerScope;
      await import('../../worker/SimWorker.js');
      handler=workerScope.onmessage;
    } finally { globalThis.self=previousSelf; }
    let transported:any;
    const worker:any={
      addEventListener:(name:string,fn:any)=>{if(name==='message')listeners.add(fn);},
      removeEventListener:(name:string,fn:any)=>{if(name==='message')listeners.delete(fn);},
      terminate:()=>{},
      postMessage:(data:any)=>{
        transported=structuredClone(data);
        const saved=globalThis.self;
        try {globalThis.self=workerScope;handler({data:transported});}
        finally {globalThis.self=saved;}
      },
    };
    const input={...payload,homeSchemeFit:execution(.025,-.01),awaySchemeFit:execution(-.02,.01)};
    const manager=new SimulationManager({poolSize:1,workerFactory:()=>worker});
    try {
      const summary=await manager.simWeekParallel([input]);
      expect(transported.payload).toEqual(input);
      expect(summary.results[0]).toEqual(simulateRichGame(input));
    } finally {manager.dispose();}
  });
  it('uses the existing visible evaluator for complete genuine legacy skills without V2 conversion',()=>{
    const p=player(1,'QB',{ratings:{throwPower:95,throwAccuracy:60,awareness:60,intelligence:60,speed:60}});
    const base=structuredClone(p);
    const vertical=calculatePlayerSchemeFit(p,OFFENSIVE_SCHEMES.VERTICAL);
    const westCoast=calculatePlayerSchemeFit(p,OFFENSIVE_SCHEMES.WEST_COAST);
    expect(vertical).toBeGreaterThan(westCoast);
    expect(aggregate([p]).schemeFit.offense).toBe((vertical-westCoast)/20*.025);
    expect(aggregate([p],{...schemes,offSchemeId:'WEST_COAST'}).schemeFit.offense).toBe((westCoast-vertical)/20*.025);
    expect(p).toEqual(base);
    // With both schemas present, choose the complete observed source once.
    expect(aggregate([{...p,attributesV2:short}]).schemeFit.offense).toBe(aggregate([p]).schemeFit.offense);
  });
  it('keeps uniformly excellent legacy ratings neutral and rejects incomplete evidence',()=>{
    for(const n of [25,75,99]) {
      const ratings={throwPower:n,throwAccuracy:n,awareness:n,intelligence:n,speed:n};
      expect(aggregate([player(1,'QB',{ratings})]).schemeFit.offense).toBe(0);
    }
    for(const value of [undefined,NaN,0,101,'99']) {
      const ratings={throwPower:99,throwAccuracy:40,awareness:40,intelligence:40,speed:value};
      expect(aggregate([player(1,'QB',{ratings})]).schemeFit.offense).toBe(0);
    }
  });
  it('refreshes real observed progression and selected personnel without persistent mutation',()=>{
    const p=player(1,'QB',{attributesV2:undefined,ratings:{throwPower:99,throwAccuracy:40,awareness:40,intelligence:40,speed:40}});
    const before=structuredClone(p);
    const first=aggregate([p]).schemeFit.offense;
    expect(first).toBeGreaterThan(0);expect(p).toEqual(before);
    p.ratings.throwPower=40;
    expect(aggregate([p]).schemeFit.offense).toBe(0);
    p.injured=true;expect(aggregate([p]).schemeFit.offense).toBe(0);
  });
  it('neutral context preserves exact prior seeded rich outputs',()=>{
    expect(simulateRichGame({...payload,homeSchemeFit:execution(),awaySchemeFit:execution()})).toEqual(simulateRichGame(payload));
  });
});
