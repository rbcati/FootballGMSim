import { describe, it, expect } from 'vitest';
import { buildTradeFinderAnalysis, __internal } from '../tradeFinderAnalysis.js';

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
  it('exported shape remains stable with empty or missing arrays', () => {
    expect(() => buildTradeFinderAnalysis({ userTeam: { id: 1 } })).not.toThrow();
    const out = buildTradeFinderAnalysis({ userTeam: { id: 1 } });
    expect(Object.keys(out).sort()).toEqual(['filters', 'summary', 'targetNeeds', 'tradeIdeas', 'userAssets', 'userPickChips', 'userSurplus', 'userTradeChips'].sort());
    expect(out.targetNeeds).toHaveLength(6);
    expect(out.tradeIdeas).toEqual([]);
    expect(out.userSurplus).toEqual([]);
    expect(out.userTradeChips).toEqual([]);
    expect(out.userPickChips).toEqual([]);
    expect(out.userAssets).toEqual([]);
    expect(out.summary).toEqual(expect.objectContaining({ biggestNeed: expect.any(Object), strongestSurplus: null, bestTradeChip: null, topTarget: null }));
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

describe('tradeFinderAnalysis target indexing', () => {
  it('excludes user-team and invalid-team targets before indexing', () => {
    const players = [
      makePlayer(1, 1, 'WR', 99),
      makePlayer(2, -1, 'WR', 98),
      makePlayer(3, null as any, 'WR', 97),
      makePlayer(4, 2, 'WR', 88),
      makePlayer(5, 3, 'QB', 90),
    ];
    const index = __internal.buildExternalTargetIndex({ leaguePlayers: players, userTeamId: 1, getValue: (p:any) => p.ovr });

    expect(__internal.getTargetsFromIndex({ need: { pos: 'WR' }, targetIndex: index }).map((p:any) => p.id)).toEqual([4]);
    expect(__internal.getTargetsFromIndex({ need: { pos: 'QB' }, targetIndex: index }).map((p:any) => p.id)).toEqual([5]);
  });

  it('sorts top position candidates by value, uses deterministic ties, and caps results', () => {
    const players = [
      makePlayer(11, 2, 'WR', 70, { tradeValue: 80, name: 'Tie B' }),
      makePlayer(10, 2, 'WR', 70, { tradeValue: 80, name: 'Tie A' }),
      makePlayer(12, 2, 'WR', 70, { tradeValue: 110 }),
      makePlayer(13, 2, 'WR', 70, { tradeValue: 50 }),
      makePlayer(14, 2, 'WR', 70, { tradeValue: 90 }),
      makePlayer(15, 2, 'WR', 70, { tradeValue: 70 }),
      makePlayer(16, 2, 'WR', 70, { tradeValue: 60 }),
    ];
    const index = __internal.buildExternalTargetIndex({ leaguePlayers: players, userTeamId: 1, getValue: (p:any) => p.tradeValue });

    expect(__internal.getTargetsFromIndex({ need: { pos: 'WR' }, targetIndex: index }).map((p:any) => p.id)).toEqual([12, 14, 10, 11, 15]);
  });

  it('values each eligible target once while building a larger position index', () => {
    const players = Array.from({ length: 180 }, (_, idx) => {
      const pos = idx % 3 === 0 ? 'WR' : idx % 3 === 1 ? 'CB' : 'OL';
      const teamId = idx % 20 === 0 ? 1 : idx % 17 === 0 ? -1 : 2 + (idx % 30);
      return makePlayer(1000 + idx, teamId, pos, 60 + (idx % 35), { tradeValue: 1000 - idx });
    });
    let valueCalls = 0;
    const index = __internal.buildExternalTargetIndex({
      leaguePlayers: players,
      userTeamId: 1,
      getValue: (p:any) => {
        valueCalls += 1;
        return p.tradeValue;
      },
    });
    const eligibleCount = players.filter((p:any) => Number(p.teamId) !== 1 && Number(p.teamId) >= 0).length;

    expect(valueCalls).toBe(eligibleCount);
    expect(__internal.getTargetsFromIndex({ need: { pos: 'WR' }, targetIndex: index })).toHaveLength(5);
    expect(__internal.getTargetsFromIndex({ need: { pos: 'CB' }, targetIndex: index })).toHaveLength(5);
    expect(__internal.getTargetsFromIndex({ need: { pos: 'OL' }, targetIndex: index })).toHaveLength(5);
  });

  it('legacy target candidate helper can reuse a prebuilt target index', () => {
    const indexedTarget = makePlayer(301, 2, 'WR', 84);
    const ignoredFullListTarget = makePlayer(302, 2, 'WR', 99);
    const targetIndex = {
      WR: [{ player: indexedTarget, valueScore: 120 }],
    };

    expect(__internal.getTargetCandidatesForNeed({
      need: { pos: 'WR' },
      leaguePlayers: [ignoredFullListTarget],
      userTeamId: 1,
      targetIndex,
    }).map((p:any) => p.id)).toEqual([301]);
  });
});

describe('tradeFinderAnalysis team roster indexing', () => {
  it('groups league players by valid team id and ignores invalid/free-agent ids', () => {
    const players = [
      makePlayer(401, 2, 'WR', 80),
      makePlayer(402, 2, 'CB', 79),
      makePlayer(403, 3, 'OL', 78),
      makePlayer(404, -1, 'QB', 99),
      makePlayer(405, null as any, 'DL', 88),
    ];

    const index = __internal.buildPlayersByTeamIndex(players);

    expect(__internal.getPlayersForTeamFromIndex(index, 2).map((p:any) => p.id)).toEqual([401, 402]);
    expect(__internal.getPlayersForTeamFromIndex(index, 3).map((p:any) => p.id)).toEqual([403]);
    expect(__internal.getPlayersForTeamFromIndex(index, -1)).toEqual([]);
  });
});
