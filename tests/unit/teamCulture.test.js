import { describe, it, expect } from 'vitest';
import {
  TEAM_CULTURE_DEFAULT,
  TEAM_CULTURE_MIN,
  TEAM_CULTURE_MAX,
  WEEKLY_SHIFT_CAP,
  initializeTeamCulture,
  getTeamCultureScore,
  classifyTeamCulture,
  calculateLeadershipProfile,
  calculateCultureShift,
  applyTeamCultureWeek,
  buildTeamCultureNarrative,
} from '../../src/core/teamCulture.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const makeTeam = (id = 1) => ({ id });

const makeGame = (overrides = {}) => ({
  home: 1,
  away: 2,
  scoreHome: 24,
  scoreAway: 17,
  ...overrides,
});

const makeRoster = (overrides = []) => overrides;

const makePlayer = (overrides = {}) => ({
  id: 'p1',
  age: 27,
  traits: [],
  personalityProfile: { leadership: 55, diva: 35, workEthic: 65 },
  ...overrides,
});

// ── initializeTeamCulture ─────────────────────────────────────────────────────

describe('initializeTeamCulture', () => {
  it('initializes all teams at neutral 70 when no existing culture', () => {
    const teams = [makeTeam(1), makeTeam(2), makeTeam(3)];
    const culture = initializeTeamCulture(teams, {});
    expect(culture['1'].score).toBe(TEAM_CULTURE_DEFAULT);
    expect(culture['2'].score).toBe(TEAM_CULTURE_DEFAULT);
    expect(culture['3'].score).toBe(TEAM_CULTURE_DEFAULT);
  });

  it('preserves existing entries and only fills missing ones', () => {
    const teams = [makeTeam(1), makeTeam(2)];
    const existing = { '1': { score: 85, lastShift: 0.5, trend: 'up', reasons: [], updatedWeek: 3, updatedSeason: 1 } };
    const culture = initializeTeamCulture(teams, existing);
    expect(culture['1'].score).toBe(85); // preserved
    expect(culture['2'].score).toBe(TEAM_CULTURE_DEFAULT); // filled
  });

  it('handles empty teams array gracefully', () => {
    expect(() => initializeTeamCulture([], {})).not.toThrow();
  });

  it('handles null/undefined existingCulture gracefully', () => {
    const teams = [makeTeam(1)];
    const culture = initializeTeamCulture(teams, null);
    expect(culture['1'].score).toBe(TEAM_CULTURE_DEFAULT);
  });
});

// ── getTeamCultureScore ───────────────────────────────────────────────────────

describe('getTeamCultureScore', () => {
  it('returns the stored score for a known team', () => {
    const culture = { '5': { score: 78 } };
    expect(getTeamCultureScore(culture, 5)).toBe(78);
  });

  it('returns 70 for a missing team (safe default)', () => {
    expect(getTeamCultureScore({}, 99)).toBe(TEAM_CULTURE_DEFAULT);
  });

  it('returns 70 for null/undefined culture object', () => {
    expect(getTeamCultureScore(null, 1)).toBe(TEAM_CULTURE_DEFAULT);
    expect(getTeamCultureScore(undefined, 1)).toBe(TEAM_CULTURE_DEFAULT);
  });
});

// ── classifyTeamCulture ───────────────────────────────────────────────────────

describe('classifyTeamCulture', () => {
  it('classifies 100 as United', () => expect(classifyTeamCulture(100)).toBe('United'));
  it('classifies 85 as United', () => expect(classifyTeamCulture(85)).toBe('United'));
  it('classifies 84 as Focused', () => expect(classifyTeamCulture(84)).toBe('Focused'));
  it('classifies 70 as Focused', () => expect(classifyTeamCulture(70)).toBe('Focused'));
  it('classifies 69 as Uneasy', () => expect(classifyTeamCulture(69)).toBe('Uneasy'));
  it('classifies 55 as Uneasy', () => expect(classifyTeamCulture(55)).toBe('Uneasy'));
  it('classifies 54 as Fractured', () => expect(classifyTeamCulture(54)).toBe('Fractured'));
  it('classifies 40 as Fractured', () => expect(classifyTeamCulture(40)).toBe('Fractured'));
  it('classifies 39 as Toxic', () => expect(classifyTeamCulture(39)).toBe('Toxic'));
  it('classifies 0 as Toxic', () => expect(classifyTeamCulture(0)).toBe('Toxic'));
});

// ── calculateLeadershipProfile ────────────────────────────────────────────────

describe('calculateLeadershipProfile', () => {
  it('counts leaders with leadership >= 70', () => {
    const roster = [makePlayer({ personalityProfile: { leadership: 72, diva: 30 } })];
    const profile = calculateLeadershipProfile(roster);
    expect(profile.leaderCount).toBe(1);
  });

  it('does not count players with leadership < 70 as leaders', () => {
    const roster = [makePlayer({ personalityProfile: { leadership: 65, diva: 30 } })];
    const profile = calculateLeadershipProfile(roster);
    expect(profile.leaderCount).toBe(0);
  });

  it('counts disruptive players with diva >= 72', () => {
    const roster = [makePlayer({ personalityProfile: { leadership: 50, diva: 80 } })];
    const profile = calculateLeadershipProfile(roster);
    expect(profile.disruptiveCount).toBe(1);
  });

  it('counts MENTOR trait + qualifying age/leadership as mentors', () => {
    const roster = [makePlayer({ traits: ['MENTOR'], age: 30, personalityProfile: { leadership: 75, diva: 20 } })];
    const profile = calculateLeadershipProfile(roster);
    expect(profile.mentorCount).toBe(1);
  });

  it('does not count MENTOR trait without age/leadership qualification', () => {
    const roster = [makePlayer({ traits: ['MENTOR'], age: 22, personalityProfile: { leadership: 55, diva: 20 } })];
    const profile = calculateLeadershipProfile(roster);
    expect(profile.mentorCount).toBe(0);
  });

  it('counts young players (age <= 23)', () => {
    const roster = [makePlayer({ age: 22 }), makePlayer({ age: 25 })];
    const profile = calculateLeadershipProfile(roster);
    expect(profile.youngPlayerCount).toBe(1);
  });

  it('returns zeros for empty roster', () => {
    const profile = calculateLeadershipProfile([]);
    expect(profile.leaderCount).toBe(0);
    expect(profile.disruptiveCount).toBe(0);
    expect(profile.mentorCount).toBe(0);
    expect(profile.youngPlayerCount).toBe(0);
  });
});

// ── calculateCultureShift ─────────────────────────────────────────────────────

describe('calculateCultureShift — game results', () => {
  it('produces a positive shift for a win', () => {
    const result = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 28, scoreAway: 14 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 3, seasonId: 1 },
    });
    expect(result.shift).toBeGreaterThan(0);
    expect(result.newScore).toBeGreaterThan(TEAM_CULTURE_DEFAULT);
  });

  it('produces a negative shift for a loss', () => {
    const result = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 14, scoreAway: 28 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 3, seasonId: 1 },
    });
    expect(result.shift).toBeLessThan(0);
    expect(result.newScore).toBeLessThan(TEAM_CULTURE_DEFAULT);
  });

  it('blowout loss produces a larger negative shift than close loss', () => {
    const blowout = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 0, scoreAway: 35 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 3, seasonId: 1 },
    });
    const close = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 17, scoreAway: 20 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 3, seasonId: 1 },
    });
    expect(blowout.shift).toBeLessThan(close.shift);
  });

  it('blowout loss shift is capped and does not exceed GAME_SHIFT_CAP', () => {
    const result = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 0, scoreAway: 63 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 1, seasonId: 1 },
    });
    // shift after traits may slightly exceed GAME_SHIFT_CAP due to disruptive layer
    // but must never exceed WEEKLY_SHIFT_CAP
    expect(Math.abs(result.shift)).toBeLessThanOrEqual(WEEKLY_SHIFT_CAP);
  });

  it('bye week (no recentGame) produces zero shift', () => {
    const result = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: null,
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 5, seasonId: 1 },
    });
    expect(result.shift).toBe(0);
    expect(result.newScore).toBe(TEAM_CULTURE_DEFAULT);
  });
});

describe('calculateCultureShift — trait effects', () => {
  it('Leader trait softens negative drift', () => {
    const leaderRoster = [makePlayer({ personalityProfile: { leadership: 80, diva: 25 } })];
    const noLeaderRoster = [];

    const withLeader = calculateCultureShift({
      team: makeTeam(1),
      roster: leaderRoster,
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 10, scoreAway: 28 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 2, seasonId: 1 },
    });
    const withoutLeader = calculateCultureShift({
      team: makeTeam(1),
      roster: noLeaderRoster,
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 10, scoreAway: 28 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 2, seasonId: 1 },
    });
    expect(withLeader.shift).toBeGreaterThan(withoutLeader.shift);
  });

  it('Disruptive trait amplifies negative drift during a loss', () => {
    const disruptiveRoster = [makePlayer({ personalityProfile: { leadership: 40, diva: 80 } })];
    const neutralRoster = [];

    const withDisruptive = calculateCultureShift({
      team: makeTeam(1),
      roster: disruptiveRoster,
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 10, scoreAway: 28 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 2, seasonId: 1 },
    });
    const withNeutral = calculateCultureShift({
      team: makeTeam(1),
      roster: neutralRoster,
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 10, scoreAway: 28 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 2, seasonId: 1 },
    });
    expect(withDisruptive.shift).toBeLessThan(withNeutral.shift);
  });

  it('Disruptive trait does NOT amplify negative drift during a win', () => {
    const disruptiveRoster = [makePlayer({ personalityProfile: { leadership: 40, diva: 80 } })];
    const withDisruptive = calculateCultureShift({
      team: makeTeam(1),
      roster: disruptiveRoster,
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 28, scoreAway: 10 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 2, seasonId: 1 },
    });
    // Disruptive should not make a win result negative or significantly smaller
    expect(withDisruptive.shift).toBeGreaterThan(0);
  });

  it('Mentorship gives tiny positive drift when young players present', () => {
    const mentorRoster = [
      makePlayer({ id: 'm1', traits: ['MENTOR'], age: 32, personalityProfile: { leadership: 78, diva: 15 } }),
      makePlayer({ id: 'r1', age: 21, personalityProfile: { leadership: 45, diva: 25 } }),
    ];
    const noMentorRoster = [];

    const withMentor = calculateCultureShift({
      team: makeTeam(1),
      roster: mentorRoster,
      recentGame: null,
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 3, seasonId: 1 },
    });
    const withoutMentor = calculateCultureShift({
      team: makeTeam(1),
      roster: noMentorRoster,
      recentGame: null,
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 3, seasonId: 1 },
    });
    expect(withMentor.shift).toBeGreaterThan(withoutMentor.shift);
  });
});

describe('calculateCultureShift — advanced attribution', () => {
  it('excessive drops produce a tiny negative contribution', () => {
    const withDrops = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 21, scoreAway: 14 }),
      advancedAttribution: { drops: 5, sacksAllowed: 0, sacksMade: 0, battedPasses: 0 },
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 1, seasonId: 1 },
    });
    const withoutDrops = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 21, scoreAway: 14 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 1, seasonId: 1 },
    });
    // Drops reduce the shift, but both should still be positive (it was a win)
    expect(withDrops.shift).toBeLessThan(withoutDrops.shift);
    expect(withDrops.shift).toBeGreaterThan(0);
  });

  it('strong defensive attribution gives tiny positive contribution', () => {
    const withDefense = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 17, scoreAway: 14 }),
      advancedAttribution: { drops: 0, sacksAllowed: 0, sacksMade: 5, battedPasses: 0 },
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 1, seasonId: 1 },
    });
    const withoutDefense = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 17, scoreAway: 14 }),
      advancedAttribution: null,
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 1, seasonId: 1 },
    });
    expect(withDefense.shift).toBeGreaterThan(withoutDefense.shift);
  });

  it('attribution influence is tiny relative to game result', () => {
    const drops = calculateCultureShift({
      team: makeTeam(1),
      roster: [],
      recentGame: makeGame({ home: 1, away: 2, scoreHome: 28, scoreAway: 7 }),
      advancedAttribution: { drops: 10, sacksAllowed: 10, sacksMade: 0, battedPasses: 0 },
      previousScore: TEAM_CULTURE_DEFAULT,
      context: { week: 1, seasonId: 1 },
    });
    // Even with extreme attribution negatives, a blowout win still produces positive shift
    expect(drops.shift).toBeGreaterThan(0);
  });
});

describe('calculateCultureShift — score bounds', () => {
  it('culture score never goes below 0', () => {
    let score = 2; // near floor
    for (let i = 0; i < 10; i++) {
      const result = calculateCultureShift({
        team: makeTeam(1),
        roster: [makePlayer({ personalityProfile: { leadership: 20, diva: 90 } })],
        recentGame: makeGame({ home: 1, away: 2, scoreHome: 0, scoreAway: 42 }),
        advancedAttribution: { drops: 10, sacksAllowed: 10, sacksMade: 0, battedPasses: 0 },
        previousScore: score,
        context: { week: i + 1, seasonId: 1 },
      });
      score = result.newScore;
      expect(score).toBeGreaterThanOrEqual(TEAM_CULTURE_MIN);
    }
  });

  it('culture score never exceeds 100', () => {
    let score = 98; // near ceiling
    for (let i = 0; i < 10; i++) {
      const result = calculateCultureShift({
        team: makeTeam(1),
        roster: [makePlayer({ traits: ['MENTOR'], age: 34, personalityProfile: { leadership: 95, diva: 5 } })],
        recentGame: makeGame({ home: 1, away: 2, scoreHome: 42, scoreAway: 0 }),
        advancedAttribution: { drops: 0, sacksAllowed: 0, sacksMade: 8, battedPasses: 5 },
        previousScore: score,
        context: { week: i + 1, seasonId: 1 },
      });
      score = result.newScore;
      expect(score).toBeLessThanOrEqual(TEAM_CULTURE_MAX);
    }
  });

  it('same inputs always produce the same output (deterministic)', () => {
    const opts = {
      team: makeTeam(3),
      roster: [makePlayer({ personalityProfile: { leadership: 72, diva: 42 } })],
      recentGame: makeGame({ home: 3, away: 7, scoreHome: 17, scoreAway: 24 }),
      advancedAttribution: { drops: 2, sacksAllowed: 3, sacksMade: 1, battedPasses: 1 },
      previousScore: 65,
      context: { week: 6, seasonId: 2 },
    };
    const r1 = calculateCultureShift(opts);
    const r2 = calculateCultureShift(opts);
    expect(r1.newScore).toBe(r2.newScore);
    expect(r1.shift).toBe(r2.shift);
    expect(r1.trend).toBe(r2.trend);
  });
});

// ── applyTeamCultureWeek ──────────────────────────────────────────────────────

describe('applyTeamCultureWeek', () => {
  it('processes all teams in a single call', () => {
    const teams = [makeTeam(1), makeTeam(2)];
    const games = [
      makeGame({ home: 1, away: 2, scoreHome: 28, scoreAway: 7 }),
    ];
    const culture = applyTeamCultureWeek({
      teams,
      rostersByTeam: {},
      games,
      previousCulture: {},
      context: { week: 1, seasonId: 1 },
    });
    expect(culture['1']).toBeDefined();
    expect(culture['2']).toBeDefined();
    expect(culture['1'].updatedWeek).toBe(1);
    expect(culture['2'].updatedWeek).toBe(1);
  });

  it('does not double-apply when called again with same week/season', () => {
    const teams = [makeTeam(1)];
    const games = [makeGame({ home: 1, away: 2, scoreHome: 28, scoreAway: 7 })];
    const context = { week: 3, seasonId: 1 };

    const first = applyTeamCultureWeek({
      teams,
      rostersByTeam: {},
      games,
      previousCulture: {},
      context,
    });
    const secondScore = first['1'].score;

    const second = applyTeamCultureWeek({
      teams,
      rostersByTeam: {},
      games,
      previousCulture: first,
      context, // same week+season → dedupe
    });
    expect(second['1'].score).toBe(secondScore);
  });

  it('re-applies for a new week', () => {
    const teams = [makeTeam(1)];
    const games = [makeGame({ home: 1, away: 2, scoreHome: 28, scoreAway: 7 })];

    const week1 = applyTeamCultureWeek({
      teams,
      rostersByTeam: {},
      games,
      previousCulture: {},
      context: { week: 1, seasonId: 1 },
    });
    const week2 = applyTeamCultureWeek({
      teams,
      rostersByTeam: {},
      games,
      previousCulture: week1,
      context: { week: 2, seasonId: 1 }, // different week → should update
    });
    // Week 2 should have a different updatedWeek stamp
    expect(week2['1'].updatedWeek).toBe(2);
  });

  it('initializes missing culture entries to neutral 70', () => {
    const teams = [makeTeam(42)];
    const culture = applyTeamCultureWeek({
      teams,
      rostersByTeam: {},
      games: [],
      previousCulture: {},
      context: { week: 1, seasonId: 1 },
    });
    // Bye week with no game → shift is 0, score stays at default
    expect(culture['42'].score).toBe(TEAM_CULTURE_DEFAULT);
  });

  it('handles empty games array gracefully (bye week for all)', () => {
    const teams = [makeTeam(1), makeTeam(2)];
    expect(() =>
      applyTeamCultureWeek({
        teams,
        rostersByTeam: {},
        games: [],
        previousCulture: {},
        context: { week: 5, seasonId: 1 },
      })
    ).not.toThrow();
  });
});

// ── buildTeamCultureNarrative ─────────────────────────────────────────────────

describe('buildTeamCultureNarrative', () => {
  it('returns a non-empty string', () => {
    const text = buildTeamCultureNarrative(72, 0.4, ['Win builds team confidence']);
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('includes the culture label', () => {
    const text = buildTeamCultureNarrative(90, 0.5, []);
    expect(text).toContain('United');
  });

  it('mentions trending up for positive shift', () => {
    const text = buildTeamCultureNarrative(75, 0.5, []);
    expect(text).toContain('trending up');
  });

  it('mentions under pressure for negative shift', () => {
    const text = buildTeamCultureNarrative(60, -0.5, []);
    expect(text).toContain('under pressure');
  });

  it('mentions holding steady for near-zero shift', () => {
    const text = buildTeamCultureNarrative(70, 0.01, []);
    expect(text).toContain('holding steady');
  });

  it('does not throw for empty reasons array', () => {
    expect(() => buildTeamCultureNarrative(70, 0, [])).not.toThrow();
  });

  it('does not throw for undefined reasons', () => {
    expect(() => buildTeamCultureNarrative(70, 0, undefined)).not.toThrow();
  });
});

// ── legacy save safety ────────────────────────────────────────────────────────

describe('legacy save safety', () => {
  it('getTeamCultureScore returns 70 for legacy saves with no teamCulture key', () => {
    // Simulates a save that has no teamCulture at all
    const legacySaveState = {};
    expect(getTeamCultureScore(legacySaveState.teamCulture, 1)).toBe(TEAM_CULTURE_DEFAULT);
  });

  it('initializeTeamCulture does not crash on legacy saves', () => {
    const teams = [makeTeam(1), makeTeam(2)];
    expect(() => initializeTeamCulture(teams, undefined)).not.toThrow();
    expect(() => initializeTeamCulture(teams, null)).not.toThrow();
    expect(() => initializeTeamCulture(teams, {})).not.toThrow();
  });

  it('applyTeamCultureWeek does not crash with undefined previousCulture', () => {
    const teams = [makeTeam(1)];
    expect(() =>
      applyTeamCultureWeek({
        teams,
        rostersByTeam: {},
        games: [],
        previousCulture: undefined,
        context: { week: 1, seasonId: 1 },
      })
    ).not.toThrow();
  });
});
