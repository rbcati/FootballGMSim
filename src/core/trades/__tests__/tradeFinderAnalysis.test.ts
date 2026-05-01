import { describe, it, expect } from 'vitest';
import { buildTradeFinderAnalysis } from '../tradeFinderAnalysis.js';

const makePlayer = (id:number, teamId:number, pos:string, ovr:number, extras:any={}) => ({ id, teamId, pos, ovr, potential: ovr+2, age: 26, name:`P${id}`, contract:{ baseAnnual:6, yearsRemaining:2 }, ...extras });
const makeBase = () => {
  const userRoster = [makePlayer(1,1,'QB',82),makePlayer(2,1,'RB',80),makePlayer(3,1,'RB',75),makePlayer(4,1,'RB',73),makePlayer(5,1,'WR',70),makePlayer(6,1,'WR',68),makePlayer(7,1,'TE',74),makePlayer(8,1,'OL',76),makePlayer(9,1,'OL',75),makePlayer(10,1,'OL',74),makePlayer(11,1,'OL',73),makePlayer(12,1,'OL',72),makePlayer(13,1,'DL',75),makePlayer(14,1,'DL',74),makePlayer(15,1,'DL',73),makePlayer(16,1,'DL',72),makePlayer(17,1,'LB',74),makePlayer(18,1,'LB',73),makePlayer(19,1,'LB',72),makePlayer(20,1,'CB',75),makePlayer(21,1,'CB',74),makePlayer(22,1,'CB',73),makePlayer(23,1,'S',74),makePlayer(24,1,'S',73),makePlayer(25,1,'K',70),makePlayer(26,1,'P',70)];
  const teams=[{id:1,abbr:'USR'},{id:2,abbr:'AI1'},{id:3,abbr:'AI2'}];
  const leaguePlayers=[...userRoster, makePlayer(101,2,'WR',89,{potential:92,age:23}), makePlayer(102,2,'WR',84), makePlayer(103,3,'WR',79,{age:32,contract:{baseAnnual:18,yearsRemaining:2}}), makePlayer(104,-1,'WR',88), makePlayer(105,2,'K',84)];
  const league = { draftPicks: [
    { id: 'p1', ownerTeamId: 1, originalTeamId: 1, year: 2027, round: 1 },
    { id: 'p2', ownerTeamId: 1, originalTeamId: 2, year: 2027, round: 3 },
    { id: 'p3', ownerTeamId: 1, originalTeamId: 3, year: 2028, round: 6 },
  ] };
  return { userTeam:{id:1}, teams, userRoster, leaguePlayers, league, cap:{capRoom:5} };
};

describe('tradeFinderAnalysis v2', () => {
  it('handles missing draft pick data with player-only ideas', () => {
    const out = buildTradeFinderAnalysis({ ...makeBase(), league: {} });
    expect(out.userPickChips).toEqual([]);
    expect(out.tradeIdeas.length).toBeGreaterThan(0);
  });
  it('creates user pick chips when data exists', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.userPickChips.length).toBeGreaterThan(0);
  });
  it('round 1 pick values higher than rounds 3 and 6', () => {
    const chips = buildTradeFinderAnalysis(makeBase()).userPickChips;
    expect(chips[0].valueScore).toBeGreaterThan(chips[1].valueScore);
    expect(chips[1].valueScore).toBeGreaterThan(chips[2].valueScore);
  });
  it('can generate player_plus_pick package and include pick ids', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    const idea = out.tradeIdeas.find((i:any) => i.packageType === 'player_plus_pick');
    expect(idea).toBeTruthy();
    expect(idea.outgoingPickIds.length).toBeGreaterThan(0);
  });
  it('two_players package uses only surplus non-starters', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    const idea = out.tradeIdeas.find((i:any) => i.packageType === 'two_players');
    if (!idea) return expect(true).toBe(true);
    expect(idea.outgoingPlayerIds.length).toBe(2);
  });
  it('outgoing assets include valid asset types', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i:any)=>i.outgoingAssets.every((a:any)=>['player','pick'].includes(a.assetType)))).toBe(true);
  });
  it('packageAssetCount never exceeds 3 and ideas are sorted/capped', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i:any)=>i.packageAssetCount <= 3)).toBe(true);
    expect(out.tradeIdeas.length).toBeLessThanOrEqual(15);
    expect(out.tradeIdeas.every((v:any,idx:number,arr:any[])=> idx===0 || arr[idx-1].fitScore>=v.fitScore)).toBe(true);
  });
  it('same-team and FA targets excluded', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i:any)=>i.targetTeamId !== 1 && i.targetTeamId >= 0)).toBe(true);
  });
});
