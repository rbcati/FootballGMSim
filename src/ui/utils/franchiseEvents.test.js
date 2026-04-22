import { describe, it, expect } from 'vitest';
import {
  resolveWeeklyEvent,
  evaluateTradeFairness,
  buildContractCounterOffer,
  updateRelationshipScore,
} from './franchiseEvents.js';

function buildLeague(overrides = {}) {
  return {
    year: 2028,
    week: 8,
    phase: 'regular',
    userTeamId: 1,
    teams: [{
      id: 1,
      wins: 2,
      losses: 5,
      ties: 0,
      trainingFacilityRank: 24,
      recentResults: ['W', 'L', 'L', 'L'],
      roster: [
        { id: 11, ovr: 91, age: 27, contract: { yearsRemaining: 1 } },
        { id: 12, ovr: 80, age: 32, contract: { yearsRemaining: 2 } },
      ],
    }],
    ...overrides,
  };
}

describe('resolveWeeklyEvent', () => {
  it('creates pending events when weighted triggers are present', () => {
    const league = buildLeague();
    const event = resolveWeeklyEvent({ league, rng: () => 0 });
    expect(event).toBeTruthy();
    expect(event.state).toBe('pending');
    expect(event.id).toContain('wk8');
  });
});

describe('evaluateTradeFairness', () => {
  it('marks close offers as counter and strong offers as accept', () => {
    const counter = evaluateTradeFairness({ offerValue: 90, askValue: 100, relationship: 0 });
    const accept = evaluateTradeFairness({ offerValue: 104, askValue: 100, relationship: 0 });
    expect(counter.verdict).toBe('Counter');
    expect(accept.verdict).toBe('Accept');
  });
});

describe('buildContractCounterOffer', () => {
  it('adds a loser tax when team performance and morale are low', () => {
    const lowState = buildContractCounterOffer({ demandAav: 20, offerAav: 16, teamWinPct: 0.2, morale: 35, marketHeat: 1.1 });
    expect(lowState.aav).toBeGreaterThan(20);
  });
});

describe('updateRelationshipScore', () => {
  it('clamps the score between -100 and 100', () => {
    expect(updateRelationshipScore(95, 20)).toBe(100);
    expect(updateRelationshipScore(-95, -20)).toBe(-100);
  });
});
