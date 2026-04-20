import { describe, expect, it } from 'vitest';
import { deriveFranchisePressure } from './pressureModel.js';

function makeLeague(overrides = {}) {
  return {
    week: 12,
    phase: 'regular',
    userTeamId: 1,
    ownerApproval: 44,
    ownerGoals: [{ type: 'win_games', target: 10, current: 6, description: 'Win 10 games' }],
    teams: [
      {
        id: 1,
        wins: 5,
        losses: 7,
        capRoom: 34,
        fanApproval: 48,
        recentResults: ['W', 'L', 'L', 'L'],
        roster: [
          { pos: 'QB', age: 23, ovr: 74 },
          { pos: 'WR', age: 27, ovr: 90 },
          { pos: 'DL', age: 30, ovr: 86 },
        ],
      },
    ],
    ...overrides,
  };
}

describe('deriveFranchisePressure', () => {
  it('builds distinct owner/fan/media layers with reasons', () => {
    const pressure = deriveFranchisePressure(makeLeague(), { direction: 'contender', intel: { expiringStarters: 3 } });
    expect(pressure.owner.state).toBeTruthy();
    expect(pressure.fans.state).toBeTruthy();
    expect(pressure.media.state).toBeTruthy();
    expect(pressure.owner.reasons.length).toBeGreaterThan(0);
    expect(pressure.fans.reasons.length).toBeGreaterThan(0);
    expect(pressure.media.reasons.length).toBeGreaterThan(0);
    expect(pressure.directives.length).toBeGreaterThan(0);
  });

  it('stays deterministic for same input', () => {
    const a = deriveFranchisePressure(makeLeague(), { direction: 'balanced', intel: { expiringStarters: 0 } });
    const b = deriveFranchisePressure(makeLeague(), { direction: 'balanced', intel: { expiringStarters: 0 } });
    expect(a).toEqual(b);
  });
});
