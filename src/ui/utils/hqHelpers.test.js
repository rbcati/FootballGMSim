import { describe, expect, it } from 'vitest';
import {
  getTeamStatusLine,
  getActionContext,
  getActionDestination,
  rankHqPriorityItems,
  getTeamSnapshotNotes,
} from './hqHelpers.js';

const team = {
  id: 1,
  conf: 0,
  div: 0,
  wins: 5,
  losses: 6,
  ovr: 86,
  capRoom: -2,
  roster: [{ id: 11 }, { id: 12 }],
};

const league = {
  phase: 'regular',
  week: 14,
  userTeamId: 1,
  tradeDeadline: 14,
  teams: [
    team,
    { id: 2, conf: 0, div: 0, wins: 6, losses: 5, ovr: 84 },
    { id: 3, conf: 0, div: 0, wins: 9, losses: 2, ovr: 90 },
  ],
};

describe('hqHelpers', () => {
  it('builds grounded status for must-win and owner pressure scenarios', () => {
    const status = getTeamStatusLine(team, league, {
      pressurePoints: { ownerApproval: 35 },
      ownerContext: { pressureState: 'urgent_demand' },
    });
    expect(status).toContain('Owner pressure');
  });

  it('generates action contexts and destinations with matchup awareness', () => {
    const nextGame = { isHome: false, opp: { abbr: 'DET', offenseRating: 88, defenseRating: 79, ovr: 89 } };
    const weekly = { pressurePoints: { injuriesCount: 3, incomingTradeCount: 2 } };

    expect(getActionContext('lineup', weekly, nextGame)).toContain('3 injury');
    expect(getActionContext('gameplan', weekly, nextGame)).toContain('explosive offense');
    expect(getActionDestination('lineup', nextGame)).toBe('Roster:depth|ALL');
    expect(getActionDestination('opponent', nextGame)).toBe('Weekly Prep');
  });

  it('ranks a featured urgent item and limits secondary items', () => {
    const ranked = rankHqPriorityItems(team, league, {
      pressurePoints: { injuriesCount: 5, expiringCount: 6, ownerApproval: 32 },
      urgentItems: [{ label: 'Legacy Alert', tab: 'News', rank: 50, level: 'recommendation' }],
    }, { opp: { abbr: 'GB', ovr: 92 } });

    expect(ranked.featured).toBeTruthy();
    expect(['urgent', 'recommended', 'info']).toContain(ranked.featured.level);
    expect(ranked.secondary.length).toBeLessThanOrEqual(3);
  });

  it('handles partial or missing state safely', () => {
    expect(getTeamStatusLine(null, null, null)).toBe('Season in progress');
    expect(getActionContext('news', null, null)).toContain('Review');
    const ranked = rankHqPriorityItems({ roster: null }, { week: 1, phase: 'regular' }, null, null);
    expect(ranked).toHaveProperty('featured');
    expect(Array.isArray(ranked.secondary)).toBe(true);
    expect(ranked.secondary.length).toBeLessThanOrEqual(3);
  });

  it('derives team snapshot notes from cap, injuries, and expiring context', () => {
    const notes = getTeamSnapshotNotes({ ovr: 88, roster: new Array(54).fill({}) }, { direction: 'balanced', pressurePoints: { injuriesCount: 1, expiringCount: 5 } }, -4);
    expect(notes.ovrNote).toContain('Championship');
    expect(notes.capNote).toContain('Over cap');
    expect(notes.rosterNote).toContain('Cutdown');
    expect(notes.expiringNote).toContain('core');
  });
});
