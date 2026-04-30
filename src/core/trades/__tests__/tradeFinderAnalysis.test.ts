import { describe, it, expect } from 'vitest';
import { buildTradeFinderAnalysis } from '../tradeFinderAnalysis.js';

const makePlayer = (id:number, teamId:number, pos:string, ovr:number, extras:any={}) => ({ id, teamId, pos, ovr, potential: ovr+2, age: 26, name:`P${id}`, contract:{ baseAnnual:6, yearsRemaining:2 }, ...extras });
const base = () => {
  const userRoster = [makePlayer(1,1,'QB',82),makePlayer(2,1,'RB',80),makePlayer(3,1,'RB',75),makePlayer(4,1,'RB',73),makePlayer(5,1,'WR',70),makePlayer(6,1,'WR',68),makePlayer(7,1,'TE',74),makePlayer(8,1,'OL',76),makePlayer(9,1,'OL',75),makePlayer(10,1,'OL',74),makePlayer(11,1,'OL',73),makePlayer(12,1,'OL',72),makePlayer(13,1,'DL',75),makePlayer(14,1,'DL',74),makePlayer(15,1,'DL',73),makePlayer(16,1,'DL',72),makePlayer(17,1,'LB',74),makePlayer(18,1,'LB',73),makePlayer(19,1,'LB',72),makePlayer(20,1,'CB',75),makePlayer(21,1,'CB',74),makePlayer(22,1,'CB',73),makePlayer(23,1,'S',74),makePlayer(24,1,'S',73),makePlayer(25,1,'K',70),makePlayer(26,1,'P',70)];
  const teams=[{id:1,abbr:'USR'},{id:2,abbr:'AI1'},{id:3,abbr:'AI2'}];
  const leaguePlayers=[...userRoster, makePlayer(101,2,'WR',84,{potential:90,age:23}), makePlayer(102,2,'WR',76), makePlayer(103,3,'WR',79,{age:32,contract:{baseAnnual:18}}), makePlayer(104,-1,'WR',88)];
  return { userTeam:{id:1}, teams, userRoster, leaguePlayers, cap:{capRoom:5} };
};

describe('tradeFinderAnalysis', () => {
  it('generates target ideas for urgent needs', () => {
    const out = buildTradeFinderAnalysis(base());
    expect(out.tradeIdeas.length).toBeGreaterThan(0);
  });
  it('builds trade chips from surplus', () => expect(buildTradeFinderAnalysis(base()).userTradeChips.length).toBeGreaterThan(0));
  it('excludes same-team and FA targets', () => {
    const out = buildTradeFinderAnalysis(base());
    expect(out.tradeIdeas.every((i:any)=>i.targetTeamId !== 1 && i.targetTeamId >=0)).toBe(true);
  });
  it('labels value deltas', () => {
    const out = buildTradeFinderAnalysis(base());
    expect(out.tradeIdeas.some((i:any)=>['fair','expensive','unrealistic'].includes(i.valueMatch))).toBe(true);
  });
  it('cap impact label when salary exists', () => expect(buildTradeFinderAnalysis(base()).tradeIdeas[0].capImpactLabel).toMatch(/cap/));
  it('missing cap/salary does not crash', () => expect(() => buildTradeFinderAnalysis({ ...base(), cap:{}, userRoster:[makePlayer(1,1,'QB',80,{contract:{}})] })).not.toThrow());
  it('does not pick only starter as outgoing chip', () => {
    const out = buildTradeFinderAnalysis({ ...base(), userRoster:[makePlayer(1,1,'QB',80)] });
    expect(out.userTradeChips.find((c:any)=>c.pos==='QB')).toBeFalsy();
  });
  it('youth upside role tag exists', () => expect(buildTradeFinderAnalysis(base()).tradeIdeas.some((i:any)=>i.roleFit==='youth_upside')).toBe(true));
  it('old expensive gets risk flags', () => {
    const out = buildTradeFinderAnalysis(base());
    expect(out.tradeIdeas.some((i:any)=>i.riskFlags.includes('aging_curve') || i.riskFlags.includes('high_salary'))).toBe(true);
  });
  it('sorted by fitScore and capped', () => {
    const out = buildTradeFinderAnalysis(base());
    expect(out.tradeIdeas.length).toBeLessThanOrEqual(15);
    expect(out.tradeIdeas.every((v:any,idx:number,arr:any[])=> idx===0 || arr[idx-1].fitScore>=v.fitScore)).toBe(true);
  });
});
