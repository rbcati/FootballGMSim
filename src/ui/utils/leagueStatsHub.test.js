import { describe, it, expect } from 'vitest';
import { buildLeagueStatsHubModel } from './leagueStatsHub.js';

describe('buildLeagueStatsHubModel', () => {
  it('aggregates player stats from completed game logs', () => {
    const model = buildLeagueStatsHubModel({
      teams:[{id:1,abbr:'AAA',roster:[]},{id:2,abbr:'BBB',roster:[]}],
      schedule:[{played:true,homeId:1,awayId:2,playerStats:{home:{10:{name:'QB A',stats:{passYards:300,passTD:3}}},away:{20:{name:'RB B',stats:{rushYards:120,rushAtt:20}}}}}],
    });
    expect(model.playerTables.passing[0].passYds).toBe(300);
    expect(model.playerTables.rushing[0].rushYds).toBe(120);
    expect(model.statSources.playerStats).toBe('gameLogs');
  });

  it('prefers season totals and avoids double count', () => {
    const model = buildLeagueStatsHubModel({
      teams:[{id:1,abbr:'AAA',roster:[{id:1,name:'P',position:'QB',seasonStats:{passYards:400}}]}],
      schedule:[{played:true,homeId:1,awayId:2,playerStats:{home:{1:{stats:{passYards:100}}},away:{}}}],
    });
    expect(model.playerTables.passing[0].passYds).toBe(400);
    expect(model.statSources.playerStats).toBe('seasonStats');
  });

  it('handles missing data safely', () => {
    const model = buildLeagueStatsHubModel({ teams:[], schedule:[] });
    expect(model.playerTables.passing).toHaveLength(0);
    expect(model.warnings.length).toBeGreaterThan(0);
  });
});
