/** Paired deterministic scheme calibration. Run with Node 22: npx tsx scripts/schemeFitSweep.ts [seeds]. */
import { aggregateTeamUnitsFromRoster } from '../src/core/sim/weekSimulationBridge.ts';
import { mapOverallToAttributesV2 } from '../src/core/migration/attributeMigrator.ts';
import { deriveGamePlanMultipliers } from '../src/core/sim/gamePlanMultipliers.ts';
import { simulateRichGame } from '../src/core/sim/richGameSimulator.ts';

export function fixture(teamId = 1, talent = 75, profile = 'vertical') {
  const positions = ['QB','WR','WR','WR','TE','RB','OL','OL','OL','OL','OL','EDGE','EDGE','IDL','IDL','LB','LB','LB','CB','CB','S','S'];
  return positions.map((pos, i) => {
    const attributesV2 = Object.fromEntries(Object.keys(mapOverallToAttributesV2(talent)).map(k => [k, talent]));
    const set = (keys: string[], value: number) => keys.forEach(k => { attributesV2[k] = Math.min(99, Math.max(1, value)); });
    if (profile === 'vertical') {
      const spread = Math.min(25, 99 - talent);
      if (pos === 'QB') {
        set(['throwPower','throwAccuracyDeep'], talent + spread);
        set(['throwAccuracyShort','release','decisionMaking'], talent - spread);
      }
      if (['WR','TE'].includes(pos)) {
        set(['separation','ballTracking'], talent + spread);
        set(['routeRunning','catchInTraffic'], talent - spread);
      }
      if (['CB','S','LB'].includes(pos)) {
        set(['zoneCoverage'], talent + spread);
        set(['pressCoverage','passRush'], talent - spread);
      }
    }
    const ratings = profile === 'legacy' ? {
      throwPower:75,throwAccuracy:75,awareness:75,intelligence:75,speed:75,acceleration:75,
      catching:75,catchInTraffic:75,passBlock:75,runBlock:75,runStop:75,passRushPower:75,passRushSpeed:75,coverage:75,trucking:75,juking:75,
    } : undefined;
    if (ratings && ['QB','WR','TE','RB'].includes(pos)) Object.assign(ratings,{
      throwPower:99,throwAccuracy:40,awareness:40,intelligence:40,speed:99,acceleration:99,catching:40,catchInTraffic:40,
    });
    if (ratings && pos==='OL') Object.assign(ratings,{passBlock:99,runBlock:40});
    if (ratings && ['EDGE','IDL','LB','CB','S'].includes(pos)) Object.assign(ratings,{
      coverage:95,awareness:95,intelligence:95,speed:40,acceleration:40,runStop:95,passRushPower:40,passRushSpeed:40,
    });
    return { id: teamId * 100 + i, teamId, ratings, name: `${pos} ${i}`, pos, ovr: talent, attributesV2 };
  });
}

const count = Number(process.argv[2] ?? 300);
const scenarios = [
  ['vertical',75,'vertical','VERTICAL','COVER_2',50],
  ['westCoast',75,'vertical','WEST_COAST','COVER_2',50],
  ['man',75,'vertical','VERTICAL','MAN_COVERAGE',50],
  ['blitz34',75,'vertical','VERTICAL','BLITZ_34',50],
  ['neutralVertical',75,'neutral','VERTICAL','COVER_2',50],
  ['neutralWestCoast',75,'neutral','WEST_COAST','COVER_2',50],
  ['highTalentNeutral',90,'neutral','VERTICAL','COVER_2',50],
  ['highTalentPoor',90,'vertical','WEST_COAST','MAN_COVERAGE',50],
  ['averageTalentExcellent',70,'vertical','VERTICAL','COVER_2',50],
  ['averageTalentNeutral',70,'neutral','VERTICAL','COVER_2',50],
  ['legacyVertical',75,'legacy','VERTICAL','COVER_2',50],
  ['legacyWestCoast',75,'legacy','WEST_COAST','COVER_2',50],
  ['legacyMan',75,'legacy','VERTICAL','MAN_COVERAGE',50],
  ['gamePlan',75,'vertical','VERTICAL','COVER_2',80],
] as const;
const rows = scenarios.map(([name,talent,profile,offSchemeId,defSchemeId,runPassBalance]) => {
  const home = aggregateTeamUnitsFromRoster(fixture(1,talent,profile) as any, 1, { offSchemeId, defSchemeId });
  const away = aggregateTeamUnitsFromRoster(fixture(2,75,'neutral') as any, 2, { offSchemeId:'VERTICAL',defSchemeId:'COVER_2' });
  const total = { points:0, allowed:0, yards:0, passYards:0,rushYards:0,comp:0,att:0,turnovers:0,sacks:0,wins:0,plays:0,explosive:0,fg:0,success:0 };
  for(let i=0;i<count;i++) {
    const r = simulateRichGame({gameId:'scheme-calibration',seed:70000+i,homeTeamId:1,awayTeamId:2,
      homeOffense:home.offense,homeDefense:home.defense,awayOffense:away.offense,awayDefense:away.defense,
      homeSchemeFit:home.schemeFit,awaySchemeFit:away.schemeFit,
      homePrepMultipliers:deriveGamePlanMultipliers({weeklyPrepState:{insights:{weakSecondary:true}},gamePlan:{runPassBalance}}),awayPrepMultipliers:deriveGamePlanMultipliers({}),
    });
    const s=r.teamStats.home;
    total.points+=r.homeScore;total.allowed+=r.awayScore;total.yards+=s.totalYards;total.passYards+=s.passYd;total.rushYards+=s.rushYd;
    total.comp+=s.passComp;total.att+=s.passAtt;total.turnovers+=s.turnovers;total.sacks+=s.sacksAllowed;total.wins+=Number(r.homeScore>r.awayScore);
    total.plays+=s.plays;total.explosive+=s.explosivePlays;total.fg+=s.fieldGoalsMade;total.success+=s.successRate;
  }
  const avg=Object.fromEntries(Object.entries(total).map(([k,v])=>[k,+(v/count).toFixed(4)]));
  return { name,games:count,fit:home.schemeFit??null,...avg,completionRate:+(total.comp/total.att).toFixed(5) };
});
console.log(JSON.stringify({ seeds:[70000,70000+count-1], games:count*rows.length,rows },null,2));
