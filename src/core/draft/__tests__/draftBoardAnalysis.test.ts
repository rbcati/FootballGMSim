import { describe, expect, it } from 'vitest';
import { buildDraftBoardAnalysis } from '../draftBoardAnalysis.js';

const team = { id: 1 };
const baseTeamBuilder = { positionGroups: [
  { key: 'QB', needLevel: 'urgent', needScore: 80, reason: 'starter weak' },
  { key: 'K', needLevel: 'stable', needScore: 15, reason: 'fine' },
  { key: 'CB', needLevel: 'thin', needScore: 55, reason: 'depth' },
]};

describe('draftBoardAnalysis', () => {
  it('missing prospect data does not crash', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{}], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].name).toBe('Unknown prospect');
  });
  it('urgent need boosts fit', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{ id:1,name:'A',pos:'QB',ovr:68,potential:78 }, {id:2,name:'B',pos:'K',ovr:72,potential:74}], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].pos).toBe('QB');
  });
  it('premium urgent outranks low-priority K', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{ id:1,name:'Q',pos:'QB',ovr:65,potential:80 }, { id:2,name:'K',pos:'K',ovr:80,potential:82 }], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.topFits[0].pos).toBe('QB');
  });
  it('high potential young gets upside tag', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{ id:1,name:'U',pos:'CB',age:21,ovr:60,potential:80 }], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.upsidePicks.length).toBe(1);
  });
  it('low scouting confidence label', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{ id:1,name:'L',pos:'CB',scoutingConfidence:20 }], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].scoutingConfidence).toBe('low');
  });
  it('projected round labels', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'R',pos:'CB',projectedRound:4},{id:2,name:'F',pos:'CB',projectedRound:1},{id:3,name:'B',pos:'CB',projectedRound:2}], draftPicks: [{teamId:1,round:2,pick:1}], teamBuilder: baseTeamBuilder });
    const map = Object.fromEntries(out.prospectRows.map(p=>[p.name,p.pickValueFit]));
    expect(map.R).toBe('reach'); expect(map.F).toBe('bargain'); expect(map.B).toBe('fair_value');
  });
  it('safe picks exclude high-risk', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'I',pos:'CB',injuryRisk:80},{id:2,name:'S',pos:'CB',ovr:70,potential:78,scoutingConfidence:90}], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.safePicks.find(p=>p.name==='I')).toBeUndefined();
  });
  it('risk flags populate', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'O',pos:'CB',age:24,schemeFit:40}], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].riskFlags).toContain('old_prospect');
    expect(out.prospectRows[0].riskFlags).toContain('low_scheme_fit');
  });
  it('top fits sorted desc', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'A',pos:'QB',ovr:80,potential:85},{id:2,name:'B',pos:'QB',ovr:60,potential:65}], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.topFits[0].fitScore).toBeGreaterThanOrEqual(out.topFits[1].fitScore);
  });
  it('missing draft picks yields unknown', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'A',pos:'QB',projectedRound:1}], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].pickValueFit).toBe('unknown');
  });
  it('draft needs derived from teamBuilder', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.draftNeeds[0].pos).toBe('QB');
  });
  it('manualOrderIds affects ordering', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'A',pos:'QB',ovr:80,potential:82},{id:2,name:'B',pos:'QB',ovr:70,potential:71}], manualOrderIds:[2,1], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].prospectId).toBe(2);
  });
  it('shortlistIds marks rows', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:8,name:'A',pos:'QB'}], shortlistIds:[8], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].isShortlist).toBe(true);
  });
  it('tier labels assigned', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: Array.from({ length: 20 }).map((_, i) => ({ id:i+1, name:`P${i}`, pos:'QB', ovr:80-i, potential:85-i })), draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].tier).toBe('Tier 1');
    expect(out.prospectRows[10].tier).toBe('Tier 2');
  });
  it('class identity and early runs populated', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'A',pos:'QB',projectedRound:1},{id:2,name:'B',pos:'QB',projectedRound:2},{id:3,name:'C',pos:'WR',projectedRound:1},{id:4,name:'D',pos:'P',projectedRound:7}], draftPicks: [], teamBuilder: baseTeamBuilder });
    expect(out.classIdentity.strengths.length).toBeGreaterThan(0);
    expect(out.classIdentity.thinSpots).toContain('P');
    expect(out.classIdentity.likelyEarlyRuns).toContain('QB');
  });
  it('comparison receipt and sort keys present', () => {
    const out = buildDraftBoardAnalysis({ team, prospects: [{id:1,name:'A',pos:'QB',projectedRound:1,scoutingConfidence:10,rawness:80}], draftPicks: [{teamId:1,round:3,pick:1}], teamBuilder: baseTeamBuilder });
    expect(out.prospectRows[0].comparisonReceipt.length).toBeGreaterThan(0);
    expect(out.prospectRows[0].sortKeys).toBeTruthy();
  });
});
