import { describe, it, expect } from 'vitest';
import { rankTradePartners, playerAssetValue, pickAssetValue, buildCounterAdjustment } from './tradeFinder.js';

describe('tradeFinder ranking', () => {
  it('ranks teams with matching immediate needs and cap higher', () => {
    const teams = [
      { id: 1, abbr: 'USR', teamIntel: { direction: 'balanced', needsNow: [{ pos: 'WR', severity: 2 }] } },
      { id: 2, abbr: 'A', capRoom: 24, teamIntel: { direction: 'contender', needsNow: [{ pos: 'WR', severity: 3 }], needsLater: [{ pos: 'CB', severity: 1 }] } },
      { id: 3, abbr: 'B', capRoom: 2, teamIntel: { direction: 'rebuilding', needsNow: [{ pos: 'DL', severity: 2 }] } },
    ];
    const out = rankTradePartners({ teams, userTeamId: 1, outgoingPlayers: [{ pos: 'WR', ovr: 82, age: 27 }], week: 10 });
    expect(out[0].teamId).toBe(2);
    expect(out[0].reasons.join(' ')).toContain('Immediate WR need');
  });

  it('handles needsLater fallback and contender vs rebuilder preference', () => {
    const teams = [
      { id: 1, abbr: 'USR', teamIntel: { direction: 'balanced', needsNow: [] } },
      { id: 2, abbr: 'CONT', capRoom: 18, teamIntel: { direction: 'contender', needsNow: [], needsLater: [{ pos: 'CB', severity: 2 }] } },
      { id: 3, abbr: 'REB', capRoom: 18, teamIntel: { direction: 'rebuilding', needsNow: [], needsLater: [{ pos: 'CB', severity: 2 }] } },
    ];
    const out = rankTradePartners({ teams, userTeamId: 1, outgoingPlayers: [{ pos: 'CB', ovr: 70, age: 23 }], week: 11 });
    const contender = out.find((t) => t.teamId === 2);
    const rebuilder = out.find((t) => t.teamId === 3);
    expect(contender.preference).toBe('balanced_package');
    expect(rebuilder.preference).toBe('future_control');
  });

  it('values picks more for rebuilders near deadline', () => {
    const pk = { round: 1, projectedRange: 'early' };
    expect(pickAssetValue(pk, { week: 12, direction: 'rebuilding' })).toBeGreaterThan(
      pickAssetValue(pk, { week: 2, direction: 'contender' }),
    );
  });

  it('values youth/potential for rebuild context', () => {
    const player = { pos: 'WR', ovr: 78, potential: 88, age: 23, contract: { years: 4, baseAnnual: 6 } };
    expect(playerAssetValue(player, { direction: 'rebuilding' })).toBeGreaterThan(
      playerAssetValue(player, { direction: 'contender' }),
    );
  });

  it('builds realistic make-deal-work adjustment hints', () => {
    const adj = buildCounterAdjustment({
      partnerTeam: { teamIntel: { direction: 'rebuilding', needsNow: [{ pos: 'CB' }] }, roster: [{ id: 10, pos: 'CB', age: 24, ovr: 70, potential: 78 }] },
      outgoingPlayers: [{ id: 1, pos: 'WR', age: 31, ovr: 75 }],
      incomingPlayers: [{ id: 2, pos: 'WR', age: 29, ovr: 80 }],
    });
    expect(['add_pick', 'swap_younger', 'swap_need_fit', 'balance_salary', 'small_add', 'swap_surplus']).toContain(adj.type);
    expect(typeof adj.explain).toBe('string');
  });
});
