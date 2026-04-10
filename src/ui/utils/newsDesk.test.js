import { describe, expect, it } from 'vitest';
import { buildNewsDeskModel } from './newsDesk.js';

describe('buildNewsDeskModel', () => {
  it('promotes high-priority team-relevant stories', () => {
    const league = {
      userTeamId: 1,
      teams: [{ id: 1 }, { id: 2 }],
      newsItems: [
        { id: 'a', headline: 'League note', priority: 'low', teamId: 2, category: 'standings' },
        { id: 'b', headline: 'Team injury', priority: 'high', teamId: 1, category: 'injury' },
      ],
    };
    const model = buildNewsDeskModel(league, { segment: 'team' });
    expect(model.teamStories.some((s) => s.headline === 'Team injury')).toBe(true);
    expect(model.filtered.some((s) => s.headline === 'Team injury')).toBe(true);
  });

  it('respects transactions segment filter', () => {
    const league = {
      userTeamId: 1,
      teams: [{ id: 1 }, { id: 2 }],
      newsItems: [
        { id: 'x', headline: 'Trade complete', priority: 'medium', category: 'trade_completed' },
        { id: 'y', headline: 'Standings update', priority: 'medium', category: 'standings' },
      ],
    };

    const model = buildNewsDeskModel(league, { segment: 'transactions' });
    expect(model.filtered).toHaveLength(1);
    expect(model.filtered[0].headline).toBe('Trade complete');
  });
});
