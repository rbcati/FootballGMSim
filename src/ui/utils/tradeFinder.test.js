import { describe, it, expect } from 'vitest';
import { rankTradePartners, playerAssetValue, pickAssetValue } from './tradeFinder.js';

describe('tradeFinder ranking', () => {
  it('ranks teams with matching needs and cap higher', () => {
    const teams = [
      { id: 1, abbr: 'USR', teamIntel: { direction: 'balanced', needs: ['WR'] } },
      { id: 2, abbr: 'A', capRoom: 24, teamIntel: { direction: 'contender', needs: ['WR', 'CB'] } },
      { id: 3, abbr: 'B', capRoom: 2, teamIntel: { direction: 'rebuilding', needs: ['DL'] } },
    ];
    const out = rankTradePartners({ teams, userTeamId: 1, outgoingPlayers: [{ pos: 'WR', ovr: 82, age: 27 }], week: 10 });
    expect(out[0].teamId).toBe(2);
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
});
