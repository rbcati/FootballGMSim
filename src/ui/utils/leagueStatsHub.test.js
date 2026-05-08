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

  it('de-dupes completed games by game id across schedule shapes', () => {
    const sharedGame = { id: 's1_w1_1_2', played: true, homeId: 1, awayId: 2, homeScore: 21, awayScore: 14, teamStats:{ home:{ passYd:200,rushYd:40 }, away:{ passYd:150,rushYd:30 } } };
    const league = {
      teams: [{ id: 1, abbr: 'AAA' }, { id: 2, abbr: 'BBB' }],
      schedule: {
        weeks: [{ week: 1, games: [sharedGame] }],
      },
    };
    // Also include legacy flat schedule referencing the same object (should not double count)
    league.scheduleLegacy = [sharedGame];
    // pass both shapes into buildLeagueStatsHubModel via spread
    const model = buildLeagueStatsHubModel({ ...league, schedule: [...(league.scheduleLegacy ?? []), ...(league.schedule.weeks[0].games ?? [])] });
    const offense = model.teamRankings.offense.find((r) => r.teamId === 1);
    expect(offense.g).toBe(1);
    expect(offense.ppg).toBe(21);
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
    expect(full.teamRankings.defense[0].ydsAllowed).toBe(0);
    expect(full.statSources.teamStats).toBe('gameTeamStats');
  });

  it('supports team stat aliases and truthful score-only output', () => {
    const model = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA'},{id:2,abbr:'BBB'}], schedule:[{played:true,homeId:1,awayId:2,homeScore:17,awayScore:10,teamStats:{home:{passYards:190,rushingYards:90,giveaways:1,takeaways:2,sacks:3},away:{passYds:120,rushYds:70,giveaways:2,takeaways:1}}}] });
    expect(model.teamRankings.offense[0].passYds).toBe(190);
    expect(model.teamRankings.offense[0].rushYds).toBe(90);
    expect(model.teamRankings.defense[0].ppgAllowed).toBe(10);
  });

  it('marks no team ranking data when scores and team stats are missing', () => {
    const model = buildLeagueStatsHubModel({ teams:[{id:1,abbr:'AAA'},{id:2,abbr:'BBB'}], schedule:[{homeId:1,awayId:2}] });
    expect(model.teamRankings.offense).toHaveLength(0);
    expect(model.statSources.teamStats).toBe('unavailable');
  });
});
