/** Measures model coverage in an untouched fresh franchise; never edits ratings. */
import 'fake-indexeddb/auto';
import { writeFileSync } from 'node:fs';
import { cache } from '../src/db/cache.js';
import { dispatchWorker, loadWorkerModule } from '../src/testSupport/dynastySoakRunner.js';
import { toWorker, toUI } from '../src/worker/protocol.js';
import { aggregateTeamUnitsFromRoster } from '../src/core/sim/weekSimulationBridge.ts';

await loadWorkerModule();
await dispatchWorker(toWorker.INIT,{}, {timeoutMs:30000});
const output='docs/simulation/scheme-fit-v1-franchise-coverage.json';
await dispatchWorker(toWorker.USE_SAFE_STARTER_LEAGUE,{slotKey:'save_slot_1',options:{rngSeed:1802,userTeamId:0,name:'Scheme evidence coverage'}},{timeoutMs:60000});
const rows=[];
let games=0;
for(let i=0;i<18;i++) {
  const meta=cache.getMeta();
  const fits=cache.getAllTeams().map(team=>aggregateTeamUnitsFromRoster(cache.getPlayersByTeam(team.id),team.id,{
    offSchemeId:team.strategies?.offSchemeId??team.staff?.headCoach?.offScheme??'WEST_COAST',
    defSchemeId:team.strategies?.defSchemeId??team.staff?.headCoach?.defScheme??'COVER_2',
  }).schemeFit);
  const max=(key:'offense'|'defense')=>Math.max(...fits.map(f=>Math.abs(f[key])));
  rows.push({phase:meta.phase,week:meta.currentWeek,offenseNonzero:fits.filter(f=>f.offense!==0).length,defenseNonzero:fits.filter(f=>f.defense!==0).length,maxOffense:max('offense'),maxDefense:max('defense')});
  writeFileSync(output,JSON.stringify({seed:1802,games,rows},null,2)+'\n');
  if(meta.phase!=='regular') break;
  const result=await dispatchWorker(toWorker.ADVANCE_WEEK,{skipUserGame:true},{timeoutMs:120000});
  games+=result.payload?.results?.length??0;
  if(result.type!==toUI.WEEK_COMPLETE) throw new Error(`Unexpected response ${result.type}`);
}
writeFileSync(output,JSON.stringify({seed:1802,games,rows},null,2)+'\n');
