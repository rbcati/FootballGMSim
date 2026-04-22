import { describe, expect, it } from 'vitest';
import { buildLeagueHeadlines, buildPowerRankings } from './franchiseCommandCenter.js';

describe('buildPowerRankings', () => {
  it('sorts teams by weekly power score with record-leading teams first', () => {
    const league = {
      teams: [
        { id: 1, abbr: 'AAA', wins: 2, losses: 5, ties: 0, ptsFor: 120, ptsAgainst: 180, recentResults: ['L', 'L', 'L'] },
        { id: 2, abbr: 'BBB', wins: 6, losses: 1, ties: 0, ptsFor: 190, ptsAgainst: 110, recentResults: ['W', 'W', 'W'] },
      ],
    };
    const rankings = buildPowerRankings(league, { limit: 2 });
    expect(rankings).toHaveLength(2);
    expect(rankings[0].teamAbbr).toBe('BBB');
  });
});

describe('buildLeagueHeadlines', () => {
  it('generates newest-first headlines with timestamp labels', () => {
    const league = {
      week: 9,
      newsItems: [
        { id: 'n1', week: 8, headline: 'Old', summary: 'Old summary' },
        { id: 'n2', week: 9, headline: 'New', summary: 'New summary' },
      ],
    };
    const headlines = buildLeagueHeadlines(league, { limit: 5 });
    expect(headlines[0].headline).toBe('New');
    expect(headlines[0].timestamp).toBe('Week 9');
  });
});
