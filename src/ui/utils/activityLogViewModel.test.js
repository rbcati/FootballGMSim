import { describe, expect, it } from 'vitest';
import {
  buildActivityLogRows,
  buildActivityLogViewModel,
  filterActivityLogRows,
} from './activityLogViewModel.js';

const league = {
  year: 2032,
  week: 6,
  userTeamId: 1,
  seasonId: 's2032',
  teams: [
    { id: 1, abbr: 'ALP', name: 'Alphas' },
    { id: 2, abbr: 'BRV', name: 'Braves' },
  ],
};

describe('activityLogViewModel', () => {
  it('normalizes chronicle rows into practical activity records', () => {
    const rows = buildActivityLogRows({
      league: {
        ...league,
        franchiseChronicle: [{
          id: 'contract-2032-wk6-1-44',
          type: 'contract',
          season: 2032,
          week: 6,
          headline: 'Dana Moss signs with the franchise',
          summary: '3 years - $36M total',
          meta: {
            teamId: 1,
            player: { id: 44, name: 'Dana Moss', pos: 'QB' },
            years: 3,
            totalValue: 36,
          },
        }],
      },
      transactions: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'chronicle',
      type: 'contract',
      label: 'Contract',
      teamId: 1,
      playerId: 44,
      playerName: 'Dana Moss',
      summary: 'Dana Moss signs with the franchise',
    });
  });

  it('normalizes transaction rows and maps extensions into the contract filter', () => {
    const rows = buildActivityLogRows({
      league,
      transactions: [{
        id: 5,
        type: 'extension',
        seasonId: 's2032',
        year: 2032,
        week: 4,
        teamId: 1,
        teamAbbr: 'ALP',
        playerId: 20,
        playerName: 'Remy Holt',
        headline: 'ALP extended Remy Holt',
        detail: '4y - $52M',
      }],
      chronicleRows: [],
      newsRows: [],
    });

    expect(rows[0]).toMatchObject({
      source: 'transaction',
      type: 'contract',
      label: 'Contract',
      teamAbbr: 'ALP',
      playerName: 'Remy Holt',
      headline: 'ALP extended Remy Holt',
    });
  });

  it('normalizes transaction-like news rows when they exist', () => {
    const rows = buildActivityLogRows({
      league,
      transactions: [],
      chronicleRows: [],
      newsRows: [{
        id: 'news-trade-1',
        type: 'trade',
        season: 2032,
        week: 3,
        teamId: 2,
        headline: 'BRV added a veteran corner',
        body: 'Trade terms were filed with the league office.',
      }],
    });

    expect(rows[0]).toMatchObject({
      source: 'news',
      type: 'trade',
      teamId: 2,
      headline: 'BRV added a veteran corner',
    });
  });

  it('dedupes obvious transaction and chronicle overlap while preferring transaction rows', () => {
    const rows = buildActivityLogRows({
      league: {
        ...league,
        franchiseChronicle: [{
          id: 'free-agent-signing-2032-wk6-1-44',
          type: 'contract',
          season: 2032,
          week: 6,
          headline: 'Dana Moss signs in free agency',
          meta: {
            source: 'free_agent_signing',
            teamId: 1,
            player: { id: 44, name: 'Dana Moss' },
          },
        }],
      },
      transactions: [{
        id: 9,
        type: 'signing',
        season: 2032,
        seasonId: 's2032',
        week: 6,
        teamId: 1,
        teamAbbr: 'ALP',
        playerId: 44,
        playerName: 'Dana Moss',
        headline: 'ALP signed Dana Moss',
      }],
      newsRows: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: 'transaction',
      type: 'signing',
      headline: 'ALP signed Dana Moss',
    });
  });

  it('filters by type, team participant, and search text', () => {
    const rows = buildActivityLogRows({
      league,
      transactions: [
        { id: 1, type: 'trade', season: 2032, week: 5, teamId: 1, fromTeamId: 1, toTeamId: 2, headline: 'Trade: ALP to BRV' },
        { id: 2, type: 'draft', season: 2032, week: 1, teamId: 2, playerName: 'Kai Stone', headline: 'BRV drafted Kai Stone' },
      ],
      chronicleRows: [],
      newsRows: [],
    });

    expect(filterActivityLogRows(rows, { type: 'trade', teamId: 2 })).toHaveLength(1);
    expect(filterActivityLogRows(rows, { type: 'draft', search: 'kai' })).toHaveLength(1);
    expect(filterActivityLogRows(rows, { type: 'signing' })).toHaveLength(0);
  });

  it('handles legacy sparse rows without throwing', () => {
    expect(() => buildActivityLogViewModel({
      league: { franchiseChronicle: [{ result: 'W', score: '21-17' }], newsItems: [{}] },
      transactions: [null, { type: null }],
    })).not.toThrow();

    const model = buildActivityLogViewModel({
      league: { franchiseChronicle: [{ result: 'W', score: '21-17' }], newsItems: [{}] },
      transactions: [{ type: null }],
    });
    expect(model.rows[0]).toMatchObject({ type: 'other', source: 'transaction' });
  });
});
