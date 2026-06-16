/**
 * statLeaderboard.test.js — All-Time Career Stat Leaderboard (Feature C)
 *
 * Pure-function tests for buildLeaderboard, buildAllLeaderboards,
 * getPlayerAllTimeRank, and TRACKED_STATS.
 */

import { describe, it, expect } from 'vitest';
import {
  TRACKED_STATS,
  buildLeaderboard,
  buildAllLeaderboards,
  getPlayerAllTimeRank,
} from './statLeaderboard.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeHofEntry(overrides = {}) {
  return {
    playerId: 'hof1',
    playerName: 'HOF Guy',
    position: 'QB',
    teamIds: ['NE'],
    careerStats: {
      passTD: 400, passYd: 60000,
      rushTD: 0, rushYd: 0,
      recTD: 0, recYd: 0,
      sacks: 0, interceptions: 0,
    },
    ...overrides,
  };
}

function makeActivePlayer(overrides = {}) {
  return {
    id: 'p1',
    name: 'Active Guy',
    pos: 'QB',
    status: 'active',
    hofStatus: 'none',
    teamName: 'KC',
    careerStats: [
      { passTD: 30, passYd: 4500 },
      { passTD: 35, passYd: 5000 },
    ],
    ...overrides,
  };
}

// ── TRACKED_STATS ─────────────────────────────────────────────────────────────

describe('TRACKED_STATS', () => {
  it('contains exactly 8 stat definitions', () => {
    expect(TRACKED_STATS).toHaveLength(8);
  });

  it('each entry has key, label, and positions', () => {
    for (const s of TRACKED_STATS) {
      expect(typeof s.key).toBe('string');
      expect(typeof s.label).toBe('string');
      expect(Array.isArray(s.positions)).toBe(true);
      expect(s.positions.length).toBeGreaterThan(0);
    }
  });

  it('includes all required stat keys', () => {
    const keys = TRACKED_STATS.map((s) => s.key);
    expect(keys).toContain('passTd');
    expect(keys).toContain('passYd');
    expect(keys).toContain('rushTd');
    expect(keys).toContain('rushYd');
    expect(keys).toContain('recTd');
    expect(keys).toContain('recYd');
    expect(keys).toContain('sacks');
    expect(keys).toContain('int');
  });
});

// ── buildLeaderboard ──────────────────────────────────────────────────────────

describe('buildLeaderboard', () => {
  it('returns max 10 entries even with more candidates', () => {
    const hofRoster = Array.from({ length: 15 }, (_, i) => makeHofEntry({
      playerId: `h${i}`,
      playerName: `HOF${i}`,
      careerStats: { passTD: 300 - i, passYd: 0 },
    }));
    const result = buildLeaderboard(hofRoster, [], 'passTd');
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it('returns entries sorted descending by stat value', () => {
    const hofRoster = [
      makeHofEntry({ playerId: 'h1', careerStats: { passTD: 200 } }),
      makeHofEntry({ playerId: 'h2', careerStats: { passTD: 350 } }),
      makeHofEntry({ playerId: 'h3', careerStats: { passTD: 100 } }),
    ];
    const result = buildLeaderboard(hofRoster, [], 'passTd');
    expect(result[0].value).toBeGreaterThanOrEqual(result[1].value);
    expect(result[1].value).toBeGreaterThanOrEqual(result[2].value);
  });

  it('active player with higher value ranks above retired HOF inductee', () => {
    const hofRoster = [makeHofEntry({ playerId: 'retired1', careerStats: { passTD: 300, passYd: 0 } })];
    const active = [makeActivePlayer({
      id: 'active1',
      careerStats: [{ passTD: 400 }],
      hofStatus: 'none',
    })];
    const result = buildLeaderboard(hofRoster, active, 'passTd');
    expect(result[0].playerId).toBe('active1');
    expect(result[1].playerId).toBe('retired1');
  });

  it('HOF inductee snapshot value used correctly (not re-aggregated from careerStats)', () => {
    const snapshot = { passTD: 500, passYd: 80000 };
    const hofRoster = [makeHofEntry({ playerId: 'hof_star', careerStats: snapshot })];
    const result = buildLeaderboard(hofRoster, [], 'passTd');
    expect(result[0].value).toBe(500);
    expect(result[0].isInducted).toBe(true);
  });

  it('player appearing in both HOF roster and active list is not duplicated', () => {
    const hofRoster = [makeHofEntry({ playerId: 'dual', careerStats: { passTD: 400 } })];
    const active = [makeActivePlayer({ id: 'dual', hofStatus: 'inducted', careerStats: [{ passTD: 50 }] })];
    const result = buildLeaderboard(hofRoster, active, 'passTd');
    const matches = result.filter((e) => e.playerId === 'dual');
    expect(matches).toHaveLength(1);
    // HOF snapshot (400) wins over active sum (50)
    expect(matches[0].value).toBe(400);
  });

  it('missing stat field treated as 0, no crash', () => {
    const hofRoster = [makeHofEntry({ careerStats: {} })];
    const active = [makeActivePlayer({ careerStats: [{}] })];
    expect(() => buildLeaderboard(hofRoster, active, 'passTd')).not.toThrow();
    const result = buildLeaderboard(hofRoster, active, 'passTd');
    result.forEach((e) => expect(e.value).toBe(0));
  });

  it('rank numbers start at 1 and increment by 1', () => {
    const hofRoster = [
      makeHofEntry({ playerId: 'h1', careerStats: { passTD: 300 } }),
      makeHofEntry({ playerId: 'h2', careerStats: { passTD: 200 } }),
    ];
    const result = buildLeaderboard(hofRoster, [], 'passTd');
    expect(result[0].rank).toBe(1);
    expect(result[1].rank).toBe(2);
  });

  it('includes isActive=true for active players and isInducted=true for HOF', () => {
    const hofRoster = [makeHofEntry({ playerId: 'hof1', careerStats: { passTD: 100 } })];
    const active = [makeActivePlayer({ id: 'act1', careerStats: [{ passTD: 80 }] })];
    const result = buildLeaderboard(hofRoster, active, 'passTd');
    const hofEntry = result.find((e) => e.playerId === 'hof1');
    const activeEntry = result.find((e) => e.playerId === 'act1');
    expect(hofEntry?.isInducted).toBe(true);
    expect(hofEntry?.isActive).toBe(false);
    expect(activeEntry?.isActive).toBe(true);
    expect(activeEntry?.isInducted).toBe(false);
  });

  it('filters by position — QB stat excludes RB', () => {
    const hofRoster = [
      makeHofEntry({ playerId: 'qb1', position: 'QB', careerStats: { passTD: 300 } }),
      makeHofEntry({ playerId: 'rb1', position: 'RB', careerStats: { passTD: 5 } }),
    ];
    const result = buildLeaderboard(hofRoster, [], 'passTd');
    const rbEntry = result.find((e) => e.playerId === 'rb1');
    expect(rbEntry).toBeUndefined();
  });

  it('handles interceptions via "int" key with field aliases', () => {
    const hofRoster = [makeHofEntry({
      playerId: 'cb1',
      position: 'CB',
      careerStats: { interceptions: 52 },
    })];
    const result = buildLeaderboard(hofRoster, [], 'int');
    expect(result[0]?.value).toBe(52);
  });

  it('aggregates active player careerStats array correctly', () => {
    const active = [makeActivePlayer({
      id: 'qb_act',
      careerStats: [
        { passTD: 30 },
        { passTD: 35 },
        { passTD: 40 },
      ],
    })];
    const result = buildLeaderboard([], active, 'passTd');
    expect(result[0]?.value).toBe(105);
  });

  it('returns empty array for unknown stat key', () => {
    expect(buildLeaderboard([], [], 'unknownStat')).toEqual([]);
  });

  it('is deterministic — same inputs produce same output', () => {
    const hofRoster = [makeHofEntry({ playerId: 'h1', careerStats: { passTD: 300 } })];
    const active = [makeActivePlayer({ id: 'a1', careerStats: [{ passTD: 250 }] })];
    const r1 = buildLeaderboard(hofRoster, active, 'passTd');
    const r2 = buildLeaderboard(hofRoster, active, 'passTd');
    expect(r1).toEqual(r2);
  });

  it('gracefully handles null/undefined hofRoster and activePlayers', () => {
    expect(() => buildLeaderboard(null, null, 'passTd')).not.toThrow();
    expect(() => buildLeaderboard(undefined, undefined, 'sacks')).not.toThrow();
  });
});

// ── buildAllLeaderboards ──────────────────────────────────────────────────────

describe('buildAllLeaderboards', () => {
  it('returns an entry for each TRACKED_STATS key', () => {
    const result = buildAllLeaderboards([], []);
    for (const s of TRACKED_STATS) {
      expect(result).toHaveProperty(s.key);
      expect(Array.isArray(result[s.key])).toBe(true);
    }
  });

  it('builds correct data for each stat', () => {
    const hofRoster = [
      makeHofEntry({ playerId: 'q1', position: 'QB', careerStats: { passTD: 300, passYd: 50000 } }),
      makeHofEntry({ playerId: 'r1', position: 'RB', careerStats: { rushTD: 80, rushYd: 12000 } }),
    ];
    const result = buildAllLeaderboards(hofRoster, []);
    expect(result.passTd[0]?.playerId).toBe('q1');
    expect(result.passYd[0]?.playerId).toBe('q1');
    expect(result.rushTd[0]?.playerId).toBe('r1');
  });

  it('is deterministic — same inputs produce same output', () => {
    const hofRoster = [makeHofEntry({ playerId: 'h1', careerStats: { passTD: 300 } })];
    const r1 = buildAllLeaderboards(hofRoster, []);
    const r2 = buildAllLeaderboards(hofRoster, []);
    expect(r1).toEqual(r2);
  });

  it('old save with no hofRoster returns empty leaderboards without crash', () => {
    expect(() => buildAllLeaderboards(undefined, [])).not.toThrow();
    const result = buildAllLeaderboards(undefined, []);
    for (const s of TRACKED_STATS) {
      expect(result[s.key]).toEqual([]);
    }
  });
});

// ── getPlayerAllTimeRank ──────────────────────────────────────────────────────

describe('getPlayerAllTimeRank', () => {
  it('returns correct rank for player in top 10', () => {
    const hofRoster = [
      makeHofEntry({ playerId: 'h1', careerStats: { passTD: 400 } }),
      makeHofEntry({ playerId: 'h2', careerStats: { passTD: 300 } }),
    ];
    const rank = getPlayerAllTimeRank('h2', hofRoster, [], 'passTd');
    expect(rank).toBe(2);
  });

  it('returns null when player not in top 10', () => {
    const hofRoster = Array.from({ length: 10 }, (_, i) =>
      makeHofEntry({ playerId: `h${i}`, careerStats: { passTD: 500 - i * 10 } }),
    );
    const rank = getPlayerAllTimeRank('outsider', hofRoster, [], 'passTd');
    expect(rank).toBeNull();
  });

  it('returns null for empty leaderboard', () => {
    expect(getPlayerAllTimeRank('p1', [], [], 'passTd')).toBeNull();
  });

  it('returns null for null playerId', () => {
    expect(getPlayerAllTimeRank(null, [], [], 'passTd')).toBeNull();
  });

  it('returns 1 for clear top player', () => {
    const hofRoster = [makeHofEntry({ playerId: 'top', careerStats: { passTD: 600 } })];
    expect(getPlayerAllTimeRank('top', hofRoster, [], 'passTd')).toBe(1);
  });
});
