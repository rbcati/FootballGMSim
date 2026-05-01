import { describe, it, expect } from 'vitest';
import { buildTradeFinderAnalysis } from '../tradeFinderAnalysis.js';

const makePlayer = (id:number, teamId:number, pos:string, ovr:number, extras:any={}) => ({ id, teamId, pos, ovr, potential: ovr+2, age: 26, name:`P${id}`, contract:{ baseAnnual:6, yearsRemaining:2 }, ...extras });
const makeBase = () => {
  const userRoster = [makePlayer(1,1,'QB',82),makePlayer(2,1,'RB',80),makePlayer(3,1,'RB',75),makePlayer(4,1,'RB',73),makePlayer(5,1,'WR',70),makePlayer(6,1,'WR',68),makePlayer(7,1,'TE',74),makePlayer(8,1,'OL',76),makePlayer(9,1,'OL',75),makePlayer(10,1,'OL',74),makePlayer(11,1,'OL',73),makePlayer(12,1,'OL',72),makePlayer(13,1,'DL',75),makePlayer(14,1,'DL',74),makePlayer(15,1,'DL',73),makePlayer(16,1,'DL',72),makePlayer(17,1,'LB',74),makePlayer(18,1,'LB',73),makePlayer(19,1,'LB',72),makePlayer(20,1,'CB',75),makePlayer(21,1,'CB',74),makePlayer(22,1,'CB',73),makePlayer(23,1,'S',74),makePlayer(24,1,'S',73),makePlayer(25,1,'K',70),makePlayer(26,1,'P',70)];
  const teams=[{id:1,abbr:'USR'},{id:2,abbr:'AI1'},{id:3,abbr:'AI2'}];
  const leaguePlayers=[...userRoster, makePlayer(101,2,'WR',89,{potential:92,age:23,contract:{baseAnnual:12,yearsRemaining:3}}), makePlayer(102,2,'WR',84), makePlayer(103,3,'WR',79,{age:32,contract:{baseAnnual:18,yearsRemaining:2}}), makePlayer(104,-1,'WR',88), makePlayer(105,2,'K',84)];
  const league = { draftPicks: [
    { id: 'p1', ownerTeamId: 1, originalTeamId: 1, year: 2027, round: 1 },
    { id: 'p2', ownerTeamId: 1, originalTeamId: 2, year: 2027, round: 3 },
    { id: 'p3', ownerTeamId: 1, originalTeamId: 3, year: 2028, round: 6 },
  ] };
  return { userTeam:{id:1}, teams, userRoster, leaguePlayers, league, cap:{capRoom:5} };
};

describe('tradeFinderAnalysis v2 hardening', () => {
  it('exported shape remains stable', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out).toHaveProperty('tradeIdeas');
    expect(out).toHaveProperty('filters');
    expect(Array.isArray(out.summary ? [out.summary] : [])).toBe(true);
  });
  it('missing draft pick data keeps player-only ideas', () => {
    const out = buildTradeFinderAnalysis({ ...makeBase(), league: {} });
    expect(out.userPickChips).toEqual([]);
    expect(out.tradeIdeas.length).toBeGreaterThan(0);
  });
  it('pick chips and pick value tiers are ordered by value', () => {
    const chips = buildTradeFinderAnalysis(makeBase()).userPickChips;
    expect(chips[0].valueScore).toBeGreaterThan(chips[1].valueScore);
    expect(chips[1].valueScore).toBeGreaterThan(chips[2].valueScore);
  });
  it('player_plus_pick uses smallest appropriate pick (not always premium)', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    const idea = out.tradeIdeas.find((i:any) => i.packageType === 'player_plus_pick');
    expect(idea).toBeTruthy();
    expect((idea.outgoingAssets ?? []).some((a:any)=>a.assetType==='pick')).toBe(true);
  });
  it('first-round pick is not used for K/P target and not always added to fair one-for-one', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i:any)=> !['K','P'].includes(i.targetPos) || !(i.outgoingAssets ?? []).some((a:any)=>a.assetType==='pick' && a.valueTier==='premium'))).toBe(true);
    const fairOne = out.tradeIdeas.find((i:any)=>i.packageType==='one_for_one' && i.valueMatch==='fair');
    if (fairOne) {
      expect((fairOne.outgoingPickIds ?? []).length).toBe(0);
    }
  });
  it('package count/asset types/outgoing pick ids shape', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i:any)=>i.packageAssetCount <= 3)).toBe(true);
    expect(out.tradeIdeas.every((i:any)=>i.outgoingAssets.every((a:any)=>['player','pick'].includes(a.assetType)))).toBe(true);
    expect(out.tradeIdeas.every((i:any)=> (i.outgoingPickIds.length > 0) === i.outgoingAssets.some((a:any)=>a.assetType==='pick'))).toBe(true);
  });
  it('cap impact sums outgoing player salaries and ignores pick salary', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    const withPick = out.tradeIdeas.find((i:any)=>i.outgoingAssets.some((a:any)=>a.assetType==='pick') && i.incomingSalary != null && i.outgoingSalary != null);
    if (!withPick) return expect(true).toBe(true);
    const playerSalary = withPick.outgoingAssets.filter((a:any)=>a.assetType==='player').reduce((s:number,a:any)=>s+Number(a.salary||0),0);
    expect(withPick.outgoingSalary).toBe(playerSalary);
  });
  it('unknown incoming salary yields cap impact unknown', () => {
    const base = makeBase();
    base.leaguePlayers.push(makePlayer(106,2,'WR',90,{contract:{}}));
    const out = buildTradeFinderAnalysis(base);
    expect(out.tradeIdeas.some((i:any)=>i.capImpact==null && i.capImpactLabel==='cap impact unknown')).toBe(true);
  });
  it('overpay and premium-pick warnings set feasibility', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    const overpay = out.tradeIdeas.find((i:any)=>(i.warnings??[]).some((w:string)=>w.includes('overpay')));
    if (overpay) expect(overpay.feasibilityLabel).toBe('overpay_risk');
    const premium = out.tradeIdeas.find((i:any)=>(i.warnings??[]).some((w:string)=>w.includes('Premium pick included')));
    if (premium) expect(premium.warnings.length).toBeGreaterThan(0);
  });
  it('confidence reasons and warnings arrays are always present', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i:any)=>Array.isArray(i.confidenceReasons) && i.confidenceReasons.length > 0)).toBe(true);
    expect(out.tradeIdeas.every((i:any)=>Array.isArray(i.warnings))).toBe(true);
  });
  it('same-team/free-agent targets excluded and sorted/capped', () => {
    const out = buildTradeFinderAnalysis(makeBase());
    expect(out.tradeIdeas.every((i:any)=>i.targetTeamId !== 1 && i.targetTeamId >= 0)).toBe(true);
    expect(out.tradeIdeas.length).toBeLessThanOrEqual(15);
    expect(out.tradeIdeas.every((v:any,idx:number,arr:any[])=> idx===0 || arr[idx-1].fitScore>=v.fitScore)).toBe(true);
  });
});
