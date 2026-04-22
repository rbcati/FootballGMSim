import { describe, it, expect } from 'vitest';
import {
  resolveWeeklyEvent,
  evaluateTradeFairness,
  buildContractCounterOffer,
  buildEventChoiceImpactChips,
  resolveHoldoutReturnChance,
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

describe('resolveHoldoutReturnChance', () => {
  it('stays in 20%-50% band and is deterministic with provided rng', () => {
    const low = resolveHoldoutReturnChance({ weeksHeldOut: 0, morale: 25, teamWinPct: 0.2, rng: () => 0.3 });
    const high = resolveHoldoutReturnChance({ weeksHeldOut: 6, morale: 88, teamWinPct: 0.8, rng: () => 0.3 });
    expect(low.chance).toBeGreaterThanOrEqual(0.2);
    expect(low.chance).toBeLessThanOrEqual(0.5);
    expect(high.chance).toBeLessThanOrEqual(0.5);
    expect(high.returns).toBe(true);
  });
});

describe('buildEventChoiceImpactChips', () => {
  it('builds readable impact chips including cap fallback', () => {
    const chips = buildEventChoiceImpactChips({ effects: { ownerApproval: 4, morale: -6, capImpact: 0 } });
    expect(chips.some((chip) => chip.label.includes('Owner +4%'))).toBe(true);
    expect(chips.some((chip) => chip.label.includes('Morale -6'))).toBe(true);
    expect(chips.some((chip) => chip.label.includes('Cap none'))).toBe(true);
  });
});
