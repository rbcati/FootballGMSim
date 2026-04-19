import { describe, expect, it } from 'vitest';
import {
  generateCollegeStats,
  getScoutingRangeFromProfile,
  scoreDraftBoardEntry,
  simulateCombineResults,
} from '../../src/core/draft/draftScouting.js';

describe('draft scouting overhaul', () => {
  it('simulates combine results in plausible ranges', () => {
    const res = simulateCombineResults('WR', { speed: 92, acceleration: 90, agility: 88, runBlock: 45 });
    expect(res.fortyTime).toBeGreaterThanOrEqual(4.2);
    expect(res.fortyTime).toBeLessThanOrEqual(5.4);
    expect(res.benchPress).toBeGreaterThanOrEqual(6);
    expect(res.verticalLeap).toBeGreaterThanOrEqual(20);
    expect(res.broadJump).toBeGreaterThanOrEqual(92);
  });

  it('tightens scouting spread with stronger scout profile', () => {
    const weak = getScoutingRangeFromProfile({ trueRating: 78, scoutSkill: 52, scoutingLevel: 1, scoutingBudget: 0.8, fogStrength: 70 });
    const strong = getScoutingRangeFromProfile({ trueRating: 78, scoutSkill: 92, scoutingLevel: 5, scoutingBudget: 1.8, fogStrength: 30 });
    expect(strong.spread).toBeLessThan(weak.spread);
    expect(strong.confidence).toBeGreaterThan(weak.confidence);
  });

  it('scores big-board entries with need and risk context', () => {
    const safeProspect = {
      id: 1,
      pos: 'QB',
      ovr: 80,
      potential: 88,
      schemeFit: 78,
      combineResults: { fortyTime: 4.55, verticalLeap: 34, agility: 7.05 },
      interviewReport: { riskScore: 20 },
      collegeProductionScore: 44,
      archetypeTag: 'west coast qb',
    };
    const riskyProspect = {
      ...safeProspect,
      id: 2,
      interviewReport: { riskScore: 74 },
      combineResults: { fortyTime: 4.84, verticalLeap: 30, agility: 7.48 },
    };
    const team = { id: 10, staff: { headCoach: { schemePreference: 'West Coast' } } };
    const safeScore = scoreDraftBoardEntry(safeProspect, team, { teamNeeds: { QB: 1.9 } });
    const riskScore = scoreDraftBoardEntry(riskyProspect, team, { teamNeeds: { QB: 1.9 } });
    expect(safeScore.score).toBeGreaterThan(riskScore.score);
  });

  it('generates college stats for multiple profiles', () => {
    const qb = generateCollegeStats('QB', 82, 90);
    const dl = generateCollegeStats('DL', 76, 84);
    expect(qb.passYards).toBeGreaterThan(1500);
    expect(dl.tackles).toBeGreaterThan(20);
  });
});
