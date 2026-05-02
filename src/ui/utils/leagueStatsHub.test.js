import { describe, it, expect } from 'vitest';
import { buildLeagueStatsHubModel } from './leagueStatsHub.js';

describe('buildLeagueStatsHubModel', () => {
  it('normalizes alias fields and derived passing stats', () => {
    const model = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'QB',position:'QB',seasonStats:{passYd:300,passComp:20,passAtt:30}}]}], schedule:[] });
    expect(model.playerTables.passing[0].passYds).toBe(300);
    expect(model.playerTables.passing[0].passPct).toBeCloseTo(66.666, 2);
    expect(model.playerTables.passing[0].ypa).toBe(10);
  });

  it('prefers season totals and avoids double count', () => {
    const model = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'P',position:'QB',seasonStats:{passYards:400}}]}], schedule:[{played:true,homeId:1,awayId:2,playerStats:{home:{1:{stats:{passYards:100}}},away:{}}}] });
    expect(model.playerTables.passing[0].passYds).toBe(400);
    expect(model.statSources.playerStats).toBe('seasonStats');
  });

  it('aggregates game logs without duplicate games and supports aliases', () => {
    const model = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA',roster:[]},{id:2,abbr:'BBB',roster:[]}], schedule:[{played:true,homeId:1,awayId:2,playerStats:{home:{10:{name:'QB A',stats:{passYd:300,passTd:3}}},away:{20:{name:'RB B',stats:{rushYd:120,rushingAttempts:20,recYd:20}}}}}] });
    expect(model.playerTables.passing[0].passYds).toBe(300);
    expect(model.playerTables.rushing[0].rushYds).toBe(120);
    expect(model.playerTables.receiving[0].recYds).toBe(20);
  });

  it('leader cards prefer non-zero leaders', () => {
    const model = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'A',position:'QB',seasonStats:{passYards:0}},{id:2,name:'B',position:'QB',seasonStats:{passYards:100}}]}], schedule:[] });
    expect(model.playerLeaders.passing[0].name).toBe('B');
  });

  it('team rankings aggregate score-only and teamStats data', () => {
    const scoreOnly = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA'},{id:2,abbr:'BBB'}], schedule:[{played:true,homeId:1,awayId:2,homeScore:21,awayScore:14}] });
    expect(scoreOnly.teamRankings.offense[0].ppg).toBe(21);
    expect(scoreOnly.statSources.teamStats).toBe('scoreOnly');

    const full = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA'},{id:2,abbr:'BBB'}], schedule:[{played:true,homeId:1,awayId:2,homeScore:7,awayScore:3,teamStats:{home:{passYd:200,rushYd:80,sacks:2,defInt:1},away:{passYd:120,rushYd:70}}}] });
    expect(full.teamRankings.offense[0].yds).toBe(280);
    expect(full.statSources.teamStats).toBe('gameTeamStats');
  });
});
