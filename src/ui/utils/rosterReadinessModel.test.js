import { describe, expect, it } from 'vitest';
import { deriveRosterReadinessModel } from './rosterReadinessModel.js';

const team = { id: 1, name: 'Sharks' };

function makePlayer(id, pos, overrides = {}) {
  return {
    id,
    teamId: 1,
    name: `P${id}`,
    pos,
    ovr: 78,
    depthChart: { rowKey: pos === 'DE' ? 'EDGE' : pos, order: 1 },
    ...overrides,
  };
}

describe('deriveRosterReadinessModel', () => {
  it('returns ready status for a healthy balanced roster', () => {
    const roster = [makePlayer(1, 'QB'), makePlayer(2, 'RB'), makePlayer(3, 'WR'), makePlayer(4, 'TE'), makePlayer(5, 'OL'), makePlayer(6, 'DE', { depthChart: { rowKey: 'EDGE', order: 1 } }), makePlayer(7, 'DT', { depthChart: { rowKey: 'IDL', order: 1 } }), makePlayer(8, 'LB'), makePlayer(9, 'CB'), makePlayer(10, 'S'), makePlayer(11, 'K'), makePlayer(12, 'P')];
    const assignments = {
      QB: [1, 1],
      RB: [2, 2, 2],
      WR: [3, 3, 3, 3],
      TE: [4, 4],
      OL: [5, 5, 5, 5, 5, 5],
      EDGE: [6, 6, 6],
      IDL: [7, 7, 7],
      LB: [8, 8, 8, 8],
      CB: [9, 9, 9, 9],
      S: [10, 10, 10],
      K: [11],
      P: [12],
      RS: [3],
    };
    const model = deriveRosterReadinessModel({ team, roster, league: { phase: 'regular' }, assignments });
    expect(model.status).toBe('ready');
    expect(model.missingStarterCount).toBe(0);
    expect(model.safeToMarkLineupChecked).toBe(true);
  });

  it('flags missing starter fallback as blocked', () => {
    const model = deriveRosterReadinessModel({ team, roster: [makePlayer(1, 'QB')] });
    expect(model.status).toBe('blocked');
    expect(model.missingStarterCount).toBeGreaterThan(0);
    expect(model.safeToMarkLineupChecked).toBe(false);
  });

  it('flags injury replacement concerns', () => {
    const roster = [makePlayer(1, 'QB', { injuryWeeksRemaining: 2 }), makePlayer(2, 'QB', { depthChart: { rowKey: 'QB', order: 2 } })];
    const model = deriveRosterReadinessModel({ team, roster });
    expect(model.injuryReplacementConcerns).toBeGreaterThan(0);
    expect(model.status).not.toBe('ready');
  });

  it('handles empty roster and missing team fallback safely', () => {
    expect(deriveRosterReadinessModel({ team: null, roster: [] }).status).toBe('blocked');
    expect(deriveRosterReadinessModel({ team, roster: [] }).recommendedNextAction).toMatch(/sign players/i);
  });
});
