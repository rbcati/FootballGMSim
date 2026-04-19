import { describe, expect, it } from 'vitest';
import {
  buildRetentionBoard,
  evaluateReSigningPriority,
  getExtensionReadiness,
} from '../retention/reSigning.js';

describe('retention workflow helpers', () => {
  it('marks expiring core players as high-priority keeps', () => {
    const team = { id: 1, wins: 11, losses: 6, ties: 0, capRoom: 45 };
    const player = {
      id: 'p1', teamId: 1, status: 'active', pos: 'QB', ovr: 90, potential: 93,
      age: 27, morale: 80, schemeFit: 86, contract: { years: 1, baseAnnual: 18 },
    };
    const league = { players: [player], week: 12, phase: 'offseason_resign' };
    const res = evaluateReSigningPriority(player, team, league);
    expect(['cornerstone_priority', 'strong_keep']).toContain(res.recommendation);
  });

  it('builds cap outlook and retention board rows', () => {
    const team = { id: 1, wins: 8, losses: 9, ties: 0, capRoom: 20 };
    const players = [
      { id: 'a', name: 'A', teamId: 1, status: 'active', pos: 'WR', ovr: 84, potential: 85, age: 26, morale: 72, schemeFit: 80, contract: { years: 1, baseAnnual: 15 } },
      { id: 'b', name: 'B', teamId: 1, status: 'active', pos: 'WR', ovr: 70, potential: 71, age: 30, morale: 63, schemeFit: 62, contract: { years: 1, baseAnnual: 8 } },
    ];
    const out = buildRetentionBoard(team, { players, week: 5, phase: 'regular' });
    expect(out.board.length).toBe(2);
    expect(out.capOutlook).toHaveProperty('summary');
  });

  it('returns early extension state labels', () => {
    const state = getExtensionReadiness({ contract: { years: 2 } }, { profile: { moneyPriority: 0.8, loyalty: 0.4, securityPriority: 0.4 }, phase: 'regular' });
    expect(['prefers_to_wait', 'wants_market_reset', 'likely_to_test_free_agency']).toContain(state);
  });
});
