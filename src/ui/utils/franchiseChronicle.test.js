import { describe, it, expect } from 'vitest';
import { syncFranchiseChronicle } from './franchiseChronicle.js';

function buildLeague(overrides = {}) {
  return {
    year: 2026,
    week: 3,
    userTeamId: 1,
    phase: 'regular',
    teams: [
      {
        id: 1,
        conf: 0,
        div: 1,
        abbr: 'PIT',
        wins: 2,
        losses: 1,
        ties: 0,
        capRoom: 15,
        roster: [
          { id: 10, firstName: 'Jay', lastName: 'Stone', pos: 'WR', ovr: 84, yearsPro: 1, draft: { round: 3 }, contract: { yearsRemaining: 1 }, stats: { recYd: 410 } },
          { id: 11, firstName: 'Ty', lastName: 'Cole', pos: 'CB', ovr: 80, yearsPro: 5, contract: { yearsRemaining: 1 } },
          { id: 12, firstName: 'Sam', lastName: 'Roe', pos: 'LT', ovr: 79, yearsPro: 4, contract: { yearsRemaining: 1 } },
        ],
      },
      { id: 2, conf: 0, div: 1, abbr: 'BAL', wins: 1, losses: 2, ties: 0 },
    ],
    schedule: {
      weeks: [
        {
          week: 1,
          games: [{
            id: 'g1',
            played: true,
            home: { id: 1, abbr: 'PIT' },
            away: { id: 2, abbr: 'BAL' },
            homeScore: 24,
            awayScore: 17,
            summary: { playerOfGame: { name: 'Jay Stone', statLine: '7 rec, 121 yds, 1 TD' } },
            boxScore: { playLogs: ['Q4 01:20 Jay Stone 32-yard TD catch for the lead.'] },
          }],
        },
      ],
    },
    newsItems: [{ week: 1, headline: 'PIT extends veteran LT through 2028.' }],
    ...overrides,
  };
}

describe('syncFranchiseChronicle', () => {
  it('builds chronicle entries and keeps backward compatibility for missing saves', () => {
    const league = buildLeague({ franchiseChronicle: undefined });
    const story = syncFranchiseChronicle(league);
    expect(Array.isArray(league.franchiseChronicle)).toBe(true);
    expect(story.entries).toHaveLength(1);
    expect(story.entries[0].week).toBe(1);
    expect(story.entries[0].result).toBe('W');
    expect(story.entries[0].events[0]).toContain('extends veteran LT');
  });

  it('does not duplicate entries when called repeatedly', () => {
    const league = buildLeague();
    syncFranchiseChronicle(league);
    const second = syncFranchiseChronicle(league);
    expect(second.entries).toHaveLength(1);
  });

  it('generates season review once regular season is complete', () => {
    const league = buildLeague({
      phase: 'offseason',
      teams: [{ ...buildLeague().teams[0], wins: 10, losses: 7 }, buildLeague().teams[1]],
    });
    const story = syncFranchiseChronicle(league);
    expect(story.seasonReview?.text).toContain('2026 Season: 10-7');
  });
});
