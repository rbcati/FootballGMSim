import { describe, expect, it } from 'vitest';
import { buildFreeAgencyMarketAnalysis } from '../freeAgencyMarketAnalysis.js';

const team = { capRoom: 20 };
const roster = [
  { id: 1, name: 'QB A', pos: 'QB', ovr: 68, age: 28 },
  { id: 2, name: 'RB A', pos: 'RB', ovr: 70, age: 29 },
  { id: 3, name: 'K A', pos: 'K', ovr: 70, age: 28 },
];

const teamBuilder = {
  positionGroups: [
    { key: 'QB', needLevel: 'urgent', needScore: 72 },
    { key: 'RB', needLevel: 'stable', needScore: 28 },
    { key: 'K', needLevel: 'stable', needScore: 20 },
    { key: 'WR', needLevel: 'thin', needScore: 55 },
  ],
  capSummary: { payrollPressure: 'low' },
};

describe('buildFreeAgencyMarketAnalysis', () => {
  it('urgent need boosts matching fit score and wrong position does not', () => {
    const res = buildFreeAgencyMarketAnalysis({ team, roster, teamBuilder, freeAgents: [
      { id: 10, name: 'FA QB', pos: 'QB', ovr: 74, age: 27, potential: 78, contractDemand: { baseAnnual: 8 } },
      { id: 11, name: 'FA RB', pos: 'RB', ovr: 74, age: 27, potential: 78, contractDemand: { baseAnnual: 8 } },
    ] });
    expect(res.marketRows.find((r) => r.playerId === 10)?.fitScore).toBeGreaterThan(res.marketRows.find((r) => r.playerId === 11)?.fitScore ?? 0);
  });

  it('higher OVR than starter gets starter_upgrade', () => {
    const res = buildFreeAgencyMarketAnalysis({ team, roster, teamBuilder, freeAgents: [{ id: 10, name: 'FA QB', pos: 'QB', ovr: 80, age: 27, potential: 82, contractDemand: { baseAnnual: 10 } }] });
    expect(res.marketRows[0].roleFit).toBe('starter_upgrade');
  });

  it('young high potential becomes development_stash/young upside', () => {
    const res = buildFreeAgencyMarketAnalysis({ team, roster, teamBuilder, freeAgents: [{ id: 15, name: 'FA WR', pos: 'WR', ovr: 66, age: 23, potential: 80, contractDemand: { baseAnnual: 2 } }] });
    expect(['development_stash', 'depth_patch', 'starter_upgrade']).toContain(res.marketRows[0].roleFit);
    expect(res.filters.youngUpside(res.marketRows[0])).toBe(true);
  });

  it('old expensive low fit gets avoid risk', () => {
    const res = buildFreeAgencyMarketAnalysis({ team: { capRoom: 4 }, roster, teamBuilder: { ...teamBuilder, capSummary: { payrollPressure: 'high' } }, freeAgents: [{ id: 20, name: 'Old RB', pos: 'RB', ovr: 69, age: 33, potential: 69, schemeFit: 40, contractDemand: { baseAnnual: 9 } }] });
    expect(res.marketRows[0].recommendation).toBe('avoid');
    expect(res.marketRows[0].riskFlags).toContain('expensive');
  });

  it('high cap pressure penalizes expensive cap fit', () => {
    const res = buildFreeAgencyMarketAnalysis({ team: { capRoom: 5 }, roster, teamBuilder: { ...teamBuilder, capSummary: { payrollPressure: 'high' } }, freeAgents: [{ id: 21, name: 'Costly QB', pos: 'QB', ovr: 82, age: 28, potential: 84, contractDemand: { baseAnnual: 8 } }] });
    expect(res.marketRows[0].capFit).toBe('expensive');
  });

  it('K/P not over-prioritized unless urgent', () => {
    const res = buildFreeAgencyMarketAnalysis({ team, roster, teamBuilder, freeAgents: [
      { id: 30, name: 'FA K', pos: 'K', ovr: 90, age: 27, potential: 91, contractDemand: { baseAnnual: 1.5 } },
      { id: 31, name: 'FA QB', pos: 'QB', ovr: 78, age: 27, potential: 80, contractDemand: { baseAnnual: 9 } },
    ] });
    expect(res.marketRows.find((r) => r.playerId === 31)?.fitScore).toBeGreaterThan(res.marketRows.find((r) => r.playerId === 30)?.fitScore ?? 0);
  });

  it('missing salary/cap/scheme data does not crash', () => {
    const res = buildFreeAgencyMarketAnalysis({ team: {}, roster, freeAgents: [{ id: 40, name: 'Unknown', pos: 'QB', ovr: 70 }] });
    expect(res.marketRows[0].capFit).toBe('unknown');
  });

  it('topFits sorted by fitScore descending', () => {
    const res = buildFreeAgencyMarketAnalysis({ team, roster, teamBuilder, freeAgents: [
      { id: 51, name: 'A', pos: 'QB', ovr: 80, age: 27, potential: 81, contractDemand: { baseAnnual: 7 } },
      { id: 52, name: 'B', pos: 'QB', ovr: 72, age: 31, potential: 72, contractDemand: { baseAnnual: 11 } },
    ] });
    expect(res.topFits[0].fitScore).toBeGreaterThanOrEqual(res.topFits[1].fitScore);
  });

  it('bargainOptions require affordable/low-cost data', () => {
    const res = buildFreeAgencyMarketAnalysis({ team, roster, teamBuilder, freeAgents: [
      { id: 61, name: 'Cheap', pos: 'WR', ovr: 71, age: 24, potential: 76, contractDemand: { baseAnnual: 2 } },
      { id: 62, name: 'Expensive', pos: 'WR', ovr: 80, age: 28, potential: 82, contractDemand: { baseAnnual: 20 } },
    ] });
    expect(res.bargainOptions.some((p) => p.playerId === 61)).toBe(true);
    expect(res.bargainOptions.some((p) => p.playerId === 62)).toBe(false);
  });
});
