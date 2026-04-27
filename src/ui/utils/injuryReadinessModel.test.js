import { describe, expect, it } from 'vitest';
import { deriveInjuryReadinessModel, isPlayerInjured } from './injuryReadinessModel.js';

function makePlayer(id, pos, overrides = {}) {
  return {
    id,
    name: `P${id}`,
    pos,
    ovr: 75,
    injury: { type: 'Hamstring', weeksRemaining: 0 },
    ...overrides,
  };
}

describe('injuryReadinessModel', () => {
  it('returns full strength when no injuries exist', () => {
    const league = {
      userTeamId: 1,
      teams: [{ id: 1, abbr: 'YOU', roster: [makePlayer(1, 'QB'), makePlayer(2, 'RB')] }],
    };
    const model = deriveInjuryReadinessModel({ league });
    expect(model.status.label).toBe('Full Strength');
    expect(model.myTeamInjured).toHaveLength(0);
  });

  it('flags injured starter and high-ovr key contributor', () => {
    const league = {
      userTeamId: 1,
      teams: [{
        id: 1,
        abbr: 'YOU',
        roster: [
          makePlayer(1, 'QB', { ovr: 91, injured: true, injury: { type: 'ACL', weeksRemaining: 12 }, depthChart: { rowKey: 'QB', order: 1 } }),
          makePlayer(2, 'QB', { ovr: 72, depthChart: { rowKey: 'QB', order: 2 } }),
        ],
      }],
    };
    const model = deriveInjuryReadinessModel({ league });
    expect(model.injuredStarterCount).toBe(1);
    expect(model.keyContributorInjuries).toBe(1);
    expect(model.status.label).toMatch(/Needs Attention|Critical/);
  });

  it('derives replacement risk when depth is thin', () => {
    const league = {
      userTeamId: 1,
      teams: [{
        id: 1,
        abbr: 'YOU',
        roster: [makePlayer(10, 'WR', { injuryWeeksRemaining: 5, depthChart: { rowKey: 'WR', order: 1 }, ovr: 84 })],
      }],
    };
    const model = deriveInjuryReadinessModel({ league });
    expect(model.replacementRiskCount).toBeGreaterThan(0);
    expect(model.affectedPositionGroups[0].key).toBe('WR');
  });

  it('handles malformed injury fields safely', () => {
    expect(isPlayerInjured({ status: 'IR' })).toBe(true);
    expect(isPlayerInjured({ injury: { gamesRemaining: '3' } })).toBe(true);
    expect(isPlayerInjured({ injuryWeeksRemaining: 'x' })).toBe(false);
  });

  it('returns safe fallback for empty roster or missing team', () => {
    const missingTeam = deriveInjuryReadinessModel({ league: { userTeamId: 99, teams: [] } });
    const emptyRoster = deriveInjuryReadinessModel({ league: { userTeamId: 1, teams: [{ id: 1, roster: [] }] } });
    expect(missingTeam.routeHints.hq).toBe('HQ');
    expect(emptyRoster.myTeamInjured).toHaveLength(0);
  });
});
