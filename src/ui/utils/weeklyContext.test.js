import { describe, expect, it } from 'vitest';
import { evaluateWeeklyContext } from './weeklyContext.js';

function makeLeague(overrides = {}) {
  return {
    week: 11,
    year: 3,
    phase: 'regular',
    userTeamId: 1,
    ownerApproval: 41,
    incomingTradeOffers: [
      {
        id: 'o1',
        offeringTeamAbbr: 'BOS',
        offeringPlayerName: 'R. Hill',
        receivingPlayerName: 'M. Quinn',
        reason: 'BOS needs help at WR for a playoff run.',
        urgency: 'high',
      },
    ],
    teams: [
      {
        id: 1,
        wins: 4,
        losses: 6,
        recentResults: ['W', 'L', 'L', 'L'],
        capRoom: 30,
        roster: [
          { id: 11, name: 'M. Quinn', pos: 'WR', contract: { yearsRemaining: 1 } },
          { id: 12, name: 'A. Cole', pos: 'CB', injury: 'Hamstring', injuredWeeks: 1, contract: { yearsRemaining: 1 } },
          { id: 13, name: 'L. Wade', pos: 'LB', contract: { yearsRemaining: 1 } },
          { id: 14, name: 'J. Kent', pos: 'S', contract: { yearsRemaining: 1 } },
          { id: 15, name: 'R. Moss', pos: 'RB', contract: { yearsRemaining: 1 } },
        ],
      },
    ],
    ...overrides,
  };
}

describe('evaluateWeeklyContext', () => {
  it('surfaces owner pressure and incoming trade urgency', () => {
    const ctx = evaluateWeeklyContext(makeLeague());
    expect(ctx).toBeTruthy();
    expect(ctx.urgentItems.length).toBeGreaterThan(0);
    expect(ctx.incomingOffers.length).toBe(1);
    expect(ctx.focus.title.length).toBeGreaterThan(5);
    expect(Array.isArray(ctx.storylineCards)).toBe(true);
    expect(ctx.storylineCards.length).toBeGreaterThan(0);
  });

  it('returns a stable fallback when no offers are available', () => {
    const ctx = evaluateWeeklyContext(makeLeague({ incomingTradeOffers: [], ownerApproval: 75, week: 3, teams: [{ id: 1, wins: 2, losses: 1, capRoom: 8, roster: [] }] }));
    expect(ctx.marketPulse.length).toBeGreaterThan(5);
    expect(ctx.direction).toBe('balanced');
  });
});
