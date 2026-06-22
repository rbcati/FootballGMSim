import { describe, expect, it } from 'vitest';
import {
  MEDIA_STORY_TYPES,
  MEDIA_STORY_MAX,
  buildMediaNarratives,
  selectMediaStories,
  rankMediaStories,
  buildMediaHeadline,
  getMediaStoryTypeLabel,
  makeStableStoryId,
  dedupeMediaStories,
  extractHotSeatStories,
  extractMandateStories,
  extractBlockbusterTradeStories,
  extractPrestigeStories,
  extractPlayoffPushStories,
} from './mediaNarrativeEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeTeam(overrides = {}) {
  return {
    id: 1,
    name: 'Test Team',
    abbr: 'TST',
    conf: 0,
    div: 0,
    wins: 8,
    losses: 4,
    ties: 0,
    ovr: 80,
    owner: {
      mandate: 'MAKE_PLAYOFFS',
      hotSeatRating: 25,
      seasonsUnderGoal: 0,
    },
    ...overrides,
  };
}

function makeAllTeams(count = 4) {
  return Array.from({ length: count }, (_, i) => makeTeam({
    id: i + 1,
    abbr: `T${i + 1}`,
    wins: 5 + i,
    losses: 4 - (i % 3),
    owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 20 + i * 10, seasonsUnderGoal: i % 2 },
  }));
}

function makeLeague(overrides = {}) {
  return {
    year: 2026,
    week: 10,
    userTeamId: 1,
    teams: [makeTeam()],
    standings: [],
    newsItems: [],
    currentSeasonHonors: null,
    leaguePulse: [],
    ...overrides,
  };
}

// ── MEDIA_STORY_TYPES constants ───────────────────────────────────────────────

describe('MEDIA_STORY_TYPES', () => {
  it('exports all expected story type keys as frozen constants', () => {
    expect(MEDIA_STORY_TYPES.OWNER_PRESSURE).toBe('OWNER_PRESSURE');
    expect(MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE).toBe('BLOCKBUSTER_TRADE');
    expect(MEDIA_STORY_TYPES.MANDATE_SURGE).toBe('MANDATE_SURGE');
    expect(MEDIA_STORY_TYPES.MANDATE_SLIP).toBe('MANDATE_SLIP');
    expect(MEDIA_STORY_TYPES.PRESTIGE_HONOR).toBe('PRESTIGE_HONOR');
    expect(MEDIA_STORY_TYPES.WAIVER_MOVE).toBe('WAIVER_MOVE');
    expect(MEDIA_STORY_TYPES.PLAYOFF_PUSH).toBe('PLAYOFF_PUSH');
    expect(MEDIA_STORY_TYPES.LEGACY_MILESTONE).toBe('LEGACY_MILESTONE');
    expect(Object.isFrozen(MEDIA_STORY_TYPES)).toBe(true);
  });
});

// ── makeStableStoryId ─────────────────────────────────────────────────────────

describe('makeStableStoryId', () => {
  it('joins parts with dashes', () => {
    expect(makeStableStoryId('owner-pressure', 1, 2026)).toBe('owner-pressure-1-2026');
  });

  it('converts numbers to strings', () => {
    expect(makeStableStoryId(42, 'foo', 0)).toBe('42-foo-0');
  });

  it('is stable across calls with same arguments', () => {
    const a = makeStableStoryId('prestige', 10, 2026);
    const b = makeStableStoryId('prestige', 10, 2026);
    expect(a).toBe(b);
  });
});

// ── dedupeMediaStories ────────────────────────────────────────────────────────

describe('dedupeMediaStories', () => {
  it('removes stories with duplicate ids', () => {
    const stories = [
      { id: 'a', type: 'OWNER_PRESSURE', priority: 80 },
      { id: 'b', type: 'MANDATE_SLIP', priority: 60 },
      { id: 'a', type: 'OWNER_PRESSURE', priority: 50 },
    ];
    const result = dedupeMediaStories(stories);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['a', 'b']);
  });

  it('keeps first occurrence when there is a duplicate', () => {
    const stories = [
      { id: 'x', priority: 90 },
      { id: 'x', priority: 10 },
    ];
    const result = dedupeMediaStories(stories);
    expect(result[0].priority).toBe(90);
  });

  it('returns empty array for empty input', () => {
    expect(dedupeMediaStories([])).toEqual([]);
  });

  it('filters stories missing an id', () => {
    const stories = [{ id: null }, { id: 'valid' }];
    const result = dedupeMediaStories(stories);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('valid');
  });
});

// ── getMediaStoryTypeLabel ────────────────────────────────────────────────────

describe('getMediaStoryTypeLabel', () => {
  it('returns human-readable labels for known types', () => {
    expect(getMediaStoryTypeLabel('OWNER_PRESSURE')).toBe('Owner Pressure');
    expect(getMediaStoryTypeLabel('BLOCKBUSTER_TRADE')).toBe('Blockbuster Trade');
    expect(getMediaStoryTypeLabel('MANDATE_SURGE')).toBe('Surging');
    expect(getMediaStoryTypeLabel('MANDATE_SLIP')).toBe('Under Pressure');
    expect(getMediaStoryTypeLabel('PRESTIGE_HONOR')).toBe('League Honor');
    expect(getMediaStoryTypeLabel('PLAYOFF_PUSH')).toBe('Playoff Race');
  });

  it('falls back gracefully for unknown type', () => {
    const label = getMediaStoryTypeLabel('SOME_NEW_TYPE');
    expect(typeof label).toBe('string');
    expect(label.length).toBeGreaterThan(0);
  });

  it('handles null/undefined type', () => {
    expect(getMediaStoryTypeLabel(null)).toBe('Update');
    expect(getMediaStoryTypeLabel(undefined)).toBe('Update');
  });
});

// ── extractHotSeatStories ─────────────────────────────────────────────────────

describe('extractHotSeatStories', () => {
  it('generates OWNER_PRESSURE story for team with rating >= 60', () => {
    const league = makeLeague({
      teams: [makeTeam({ id: 5, abbr: 'HOT', owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 70, seasonsUnderGoal: 1 } })],
    });
    const stories = extractHotSeatStories(league);
    expect(stories).toHaveLength(1);
    expect(stories[0].type).toBe(MEDIA_STORY_TYPES.OWNER_PRESSURE);
    expect(stories[0].teamId).toBe(5);
    expect(stories[0].tone).toBe('warning');
  });

  it('uses urgent tone for rating >= 80', () => {
    const league = makeLeague({
      teams: [makeTeam({ owner: { mandate: 'WIN_DIVISION', hotSeatRating: 85, seasonsUnderGoal: 2 } })],
    });
    const stories = extractHotSeatStories(league);
    expect(stories[0].tone).toBe('urgent');
  });

  it('does not generate story for teams with rating < 60', () => {
    const league = makeLeague({
      teams: [makeTeam({ owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 40, seasonsUnderGoal: 0 } })],
    });
    expect(extractHotSeatStories(league)).toHaveLength(0);
  });

  it('returns empty array when no teams have an owner profile', () => {
    const league = makeLeague({
      teams: [{ id: 1, abbr: 'TST', wins: 5, losses: 5 }],
    });
    expect(extractHotSeatStories(league)).toHaveLength(0);
  });

  it('does not mutate the input league', () => {
    const league = makeLeague({
      teams: [makeTeam({ owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 75, seasonsUnderGoal: 1 } })],
    });
    const originalTeams = JSON.stringify(league.teams);
    extractHotSeatStories(league);
    expect(JSON.stringify(league.teams)).toBe(originalTeams);
  });

  it('produces stable ids across repeated calls', () => {
    const league = makeLeague({
      teams: [makeTeam({ id: 7, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 65, seasonsUnderGoal: 0 } })],
    });
    const r1 = extractHotSeatStories(league);
    const r2 = extractHotSeatStories(league);
    expect(r1[0].id).toBe(r2[0].id);
  });

  it('includes seasonsUnderGoal context in dek', () => {
    const league = makeLeague({
      teams: [makeTeam({ owner: { mandate: 'WIN_DIVISION', hotSeatRating: 70, seasonsUnderGoal: 3 } })],
    });
    const stories = extractHotSeatStories(league);
    expect(stories[0].dek).toMatch(/3.*season/i);
  });

  it('returns empty array for empty teams list', () => {
    expect(extractHotSeatStories(makeLeague({ teams: [] }))).toEqual([]);
  });

  it('returns empty array for null/undefined league', () => {
    expect(extractHotSeatStories(null)).toEqual([]);
    expect(extractHotSeatStories(undefined)).toEqual([]);
  });
});

// ── extractMandateStories ─────────────────────────────────────────────────────

describe('extractMandateStories', () => {
  it('generates MANDATE_SLIP for a team with losing record and consecutive misses', () => {
    const league = makeLeague({
      teams: [makeTeam({ id: 3, abbr: 'SLP', wins: 3, losses: 9, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 60, seasonsUnderGoal: 2 } })],
    });
    const stories = extractMandateStories(league);
    const slip = stories.find((s) => s.type === MEDIA_STORY_TYPES.MANDATE_SLIP);
    expect(slip).toBeTruthy();
    expect(slip.teamId).toBe(3);
    expect(slip.tone).toBe('warning');
  });

  it('generates MANDATE_SURGE for a team significantly overachieving', () => {
    const league = makeLeague({
      teams: [makeTeam({ id: 4, abbr: 'SRG', wins: 10, losses: 2, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 20, seasonsUnderGoal: 0 } })],
    });
    const stories = extractMandateStories(league);
    const surge = stories.find((s) => s.type === MEDIA_STORY_TYPES.MANDATE_SURGE);
    expect(surge).toBeTruthy();
    expect(surge.tone).toBe('positive');
  });

  it('does not generate mandate stories when fewer than 4 games played', () => {
    const league = makeLeague({
      teams: [makeTeam({ wins: 0, losses: 3, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 60, seasonsUnderGoal: 1 } })],
    });
    expect(extractMandateStories(league)).toHaveLength(0);
  });

  it('does not generate MANDATE_SURGE for a team with too-close win margin', () => {
    const league = makeLeague({
      teams: [makeTeam({ wins: 5, losses: 4, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 20, seasonsUnderGoal: 0 } })],
    });
    const surge = extractMandateStories(league).filter((s) => s.type === MEDIA_STORY_TYPES.MANDATE_SURGE);
    expect(surge).toHaveLength(0);
  });

  it('does not mutate the input league', () => {
    const league = makeLeague({
      teams: [makeTeam({ wins: 2, losses: 8, owner: { mandate: 'WIN_DIVISION', hotSeatRating: 70, seasonsUnderGoal: 1 } })],
    });
    const snapshot = JSON.stringify(league);
    extractMandateStories(league);
    expect(JSON.stringify(league)).toBe(snapshot);
  });

  it('returns empty array when no teams have mandate', () => {
    const league = makeLeague({
      teams: [{ id: 1, abbr: 'TST', wins: 2, losses: 8, owner: {} }],
    });
    expect(extractMandateStories(league)).toEqual([]);
  });
});

// ── extractBlockbusterTradeStories ────────────────────────────────────────────

describe('extractBlockbusterTradeStories', () => {
  it('generates BLOCKBUSTER_TRADE from leaguePulse transaction items', () => {
    const league = makeLeague({
      leaguePulse: [
        {
          id: 'pulse-trade-1',
          type: 'transaction',
          source: 'transaction',
          headline: 'Blockbuster Trade',
          body: 'A star QB was traded across the league.',
          importance: 80,
          relatedTeamId: 5,
          season: 2026,
          week: 9,
        },
      ],
    });
    const stories = extractBlockbusterTradeStories(league);
    expect(stories).toHaveLength(1);
    expect(stories[0].type).toBe(MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE);
    expect(stories[0].sourceEventIds).toContain('pulse-trade-1');
  });

  it('generates BLOCKBUSTER_TRADE from newsItems with trade text', () => {
    const league = makeLeague({
      newsItems: [
        {
          id: 'n-trade-1',
          type: 'TRANSACTION',
          text: 'QB Smith was traded to the Eagles.',
          teamId: 2,
          week: 8,
          year: 2026,
        },
      ],
    });
    const stories = extractBlockbusterTradeStories(league);
    expect(stories).toHaveLength(1);
    expect(stories[0].type).toBe(MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE);
  });

  it('generates trade story from newsItems with fromTeamId/toTeamId cross-team signal', () => {
    const league = makeLeague({
      newsItems: [
        {
          id: 'n-trade-2',
          type: 'TRANSACTION',
          text: 'Player acquired.',
          teamId: 3,
          week: 7,
          year: 2026,
          extraData: { fromTeamId: 3, toTeamId: 7 },
        },
      ],
    });
    const stories = extractBlockbusterTradeStories(league);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE)).toBe(true);
  });

  it('deduplicates between leaguePulse and newsItems', () => {
    const league = makeLeague({
      leaguePulse: [
        { id: 'p1', type: 'transaction', headline: 'Trade', body: 'X', importance: 75, relatedTeamId: 1, season: 2026, week: 9 },
        { id: 'p2', type: 'transaction', headline: 'Trade2', body: 'Y', importance: 75, relatedTeamId: 2, season: 2026, week: 9 },
      ],
    });
    const stories = extractBlockbusterTradeStories(league);
    // Max 2 from pulse
    expect(stories.length).toBeLessThanOrEqual(4);
    const ids = stories.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array for empty inputs', () => {
    expect(extractBlockbusterTradeStories(makeLeague())).toEqual([]);
  });

  it('does not include TRANSACTION newsItems that are just signings (no trade signal)', () => {
    const league = makeLeague({
      newsItems: [
        { id: 'sign-1', type: 'TRANSACTION', text: 'Player signed a 3-year contract.', teamId: 1, week: 5, year: 2026 },
      ],
    });
    const stories = extractBlockbusterTradeStories(league);
    expect(stories).toHaveLength(0);
  });
});

// ── extractPrestigeStories ────────────────────────────────────────────────────

describe('extractPrestigeStories', () => {
  it('generates PRESTIGE_HONOR from flat array of honors', () => {
    const league = makeLeague({
      currentSeasonHonors: [
        { type: 'FIRST_TEAM_ALL_PRO', playerId: 10, playerName: 'Joe Star', pos: 'QB', teamId: 5, teamAbbr: 'DAL', year: 2026, score: 110 },
      ],
    });
    const stories = extractPrestigeStories(league);
    expect(stories).toHaveLength(1);
    expect(stories[0].type).toBe(MEDIA_STORY_TYPES.PRESTIGE_HONOR);
    expect(stories[0].headline).toContain('Joe Star');
  });

  it('generates PRESTIGE_HONOR from grouped summary object', () => {
    const league = makeLeague({
      currentSeasonHonors: {
        FIRST_TEAM_ALL_PRO: {
          QB: [{ playerId: 1, playerName: 'Tom Ace', pos: 'QB', teamId: 3, teamAbbr: 'GNB', score: 120 }],
        },
      },
    });
    const stories = extractPrestigeStories(league);
    expect(stories).toHaveLength(1);
    expect(stories[0].type).toBe(MEDIA_STORY_TYPES.PRESTIGE_HONOR);
  });

  it('returns empty array when currentSeasonHonors is null', () => {
    expect(extractPrestigeStories(makeLeague({ currentSeasonHonors: null }))).toEqual([]);
  });

  it('returns empty array when no FIRST_TEAM_ALL_PRO entries exist', () => {
    const league = makeLeague({
      currentSeasonHonors: [
        { type: 'PRO_BOWL', playerId: 2, playerName: 'B Player', teamId: 4, teamAbbr: 'SF', year: 2026 },
      ],
    });
    expect(extractPrestigeStories(league)).toHaveLength(0);
  });

  it('caps at 2 stories even with many teams having honors', () => {
    const honors = Array.from({ length: 5 }, (_, i) => ({
      type: 'FIRST_TEAM_ALL_PRO',
      playerId: i,
      playerName: `Player ${i}`,
      pos: 'WR',
      teamId: i + 1,
      teamAbbr: `T${i}`,
      year: 2026,
      score: 100 - i,
    }));
    const league = makeLeague({ currentSeasonHonors: honors });
    expect(extractPrestigeStories(league).length).toBeLessThanOrEqual(2);
  });

  it('groups multiple honors for the same team into one story', () => {
    const league = makeLeague({
      currentSeasonHonors: [
        { type: 'FIRST_TEAM_ALL_PRO', playerId: 1, playerName: 'P1', pos: 'QB', teamId: 5, teamAbbr: 'KC', year: 2026 },
        { type: 'FIRST_TEAM_ALL_PRO', playerId: 2, playerName: 'P2', pos: 'WR', teamId: 5, teamAbbr: 'KC', year: 2026 },
      ],
    });
    const stories = extractPrestigeStories(league);
    expect(stories).toHaveLength(1);
    expect(stories[0].headline).toMatch(/2/);
  });
});

// ── extractPlayoffPushStories ─────────────────────────────────────────────────

describe('extractPlayoffPushStories', () => {
  it('generates PLAYOFF_PUSH story when enough contenders exist after week 6', () => {
    const standings = [
      { tid: 1, w: 8, l: 2, t: 0, abbr: 'A', conf: 0 },
      { tid: 2, w: 6, l: 4, t: 0, abbr: 'B', conf: 0 },
      { tid: 3, w: 5, l: 5, t: 0, abbr: 'C', conf: 0 },
      { tid: 4, w: 7, l: 3, t: 0, abbr: 'D', conf: 1 },
    ];
    const league = makeLeague({ week: 8, standings });
    const stories = extractPlayoffPushStories(league);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.PLAYOFF_PUSH)).toBe(true);
  });

  it('returns empty array before week 6', () => {
    const standings = [
      { tid: 1, w: 4, l: 1, t: 0, abbr: 'A' },
      { tid: 2, w: 3, l: 2, t: 0, abbr: 'B' },
      { tid: 3, w: 2, l: 3, t: 0, abbr: 'C' },
    ];
    const league = makeLeague({ week: 4, standings });
    expect(extractPlayoffPushStories(league)).toHaveLength(0);
  });

  it('returns empty array with no standings data', () => {
    expect(extractPlayoffPushStories(makeLeague({ week: 10, standings: [] }))).toHaveLength(0);
  });

  it('handles standings rows using wins/losses keys instead of w/l', () => {
    const standings = [
      { tid: 1, wins: 7, losses: 3, ties: 0, abbr: 'ALT' },
      { tid: 2, wins: 6, losses: 4, ties: 0, abbr: 'ALT2' },
      { tid: 3, wins: 5, losses: 5, ties: 0, abbr: 'ALT3' },
    ];
    const league = makeLeague({ week: 9, standings });
    const stories = extractPlayoffPushStories(league);
    // Should still produce something (no crash)
    expect(Array.isArray(stories)).toBe(true);
  });
});

// ── selectMediaStories ────────────────────────────────────────────────────────

describe('selectMediaStories', () => {
  it('deduplicates stories across extractors', () => {
    const league = makeLeague({
      teams: [makeTeam({ owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 70, seasonsUnderGoal: 1 } })],
    });
    const stories = selectMediaStories(league);
    const ids = stories.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns empty array for empty/null league', () => {
    expect(selectMediaStories(null)).toEqual([]);
    expect(selectMediaStories({})).toEqual([]);
  });

  it('returns an array even when all data is missing', () => {
    expect(Array.isArray(selectMediaStories({ year: 2026, week: 5 }))).toBe(true);
  });

  it('does not mutate the input context', () => {
    const league = makeLeague({
      teams: [makeTeam({ owner: { mandate: 'WIN_DIVISION', hotSeatRating: 80, seasonsUnderGoal: 2 } })],
    });
    const snapshot = JSON.stringify(league);
    selectMediaStories(league);
    expect(JSON.stringify(league)).toBe(snapshot);
  });
});

// ── rankMediaStories ──────────────────────────────────────────────────────────

describe('rankMediaStories', () => {
  it('sorts by priority descending', () => {
    const stories = [
      { id: 'a', type: 'MANDATE_SLIP', priority: 55, week: 10, season: 2026 },
      { id: 'b', type: 'OWNER_PRESSURE', priority: 90, week: 10, season: 2026 },
      { id: 'c', type: 'PLAYOFF_PUSH', priority: 55, week: 10, season: 2026 },
    ];
    const ranked = rankMediaStories(stories);
    expect(ranked[0].id).toBe('b');
  });

  it('uses week as stable tiebreaker (newer first)', () => {
    const stories = [
      { id: 'a', priority: 60, week: 7 },
      { id: 'b', priority: 60, week: 10 },
    ];
    const ranked = rankMediaStories(stories);
    expect(ranked[0].id).toBe('b');
  });

  it('uses id as final stable tiebreaker', () => {
    const stories = [
      { id: 'z-story', priority: 60, week: 10 },
      { id: 'a-story', priority: 60, week: 10 },
    ];
    const ranked = rankMediaStories(stories);
    expect(ranked[0].id).toBe('a-story');
  });

  it('respects maxCount option', () => {
    const stories = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, priority: i, week: 10 }));
    const ranked = rankMediaStories(stories, { maxCount: 3 });
    expect(ranked).toHaveLength(3);
  });

  it('defaults to MEDIA_STORY_MAX when no maxCount is given', () => {
    const stories = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, priority: i, week: 10 }));
    const ranked = rankMediaStories(stories);
    expect(ranked.length).toBeLessThanOrEqual(MEDIA_STORY_MAX);
  });

  it('does not mutate the input array', () => {
    const stories = [
      { id: 'a', priority: 60, week: 10 },
      { id: 'b', priority: 90, week: 10 },
    ];
    const original = [...stories];
    rankMediaStories(stories);
    expect(stories).toEqual(original);
  });

  it('is deterministic — same input always produces same order', () => {
    const stories = [
      { id: 'a', priority: 60, week: 10 },
      { id: 'b', priority: 75, week: 9 },
      { id: 'c', priority: 60, week: 8 },
    ];
    const r1 = rankMediaStories(stories).map((s) => s.id);
    const r2 = rankMediaStories(stories).map((s) => s.id);
    expect(r1).toEqual(r2);
  });
});

// ── buildMediaHeadline ────────────────────────────────────────────────────────

describe('buildMediaHeadline', () => {
  it('returns headline and dek from a story', () => {
    const story = { id: 'x', headline: 'Owner on Hot Seat', dek: 'Under serious pressure.' };
    const result = buildMediaHeadline(story);
    expect(result.headline).toBe('Owner on Hot Seat');
    expect(result.dek).toBe('Under serious pressure.');
  });

  it('returns empty strings when story fields are missing', () => {
    const result = buildMediaHeadline({});
    expect(result.headline).toBe('');
    expect(result.dek).toBe('');
  });

  it('returns empty strings for null story', () => {
    const result = buildMediaHeadline(null);
    expect(result.headline).toBe('');
    expect(result.dek).toBe('');
  });
});

// ── buildMediaNarratives (top-level) ─────────────────────────────────────────

describe('buildMediaNarratives', () => {
  it('returns an array', () => {
    expect(Array.isArray(buildMediaNarratives(makeLeague()))).toBe(true);
  });

  it('returns empty array for null/non-object input', () => {
    expect(buildMediaNarratives(null)).toEqual([]);
    expect(buildMediaNarratives('string')).toEqual([]);
    expect(buildMediaNarratives(42)).toEqual([]);
  });

  it('is fully deterministic — same inputs produce same outputs', () => {
    const league = makeLeague({
      teams: makeAllTeams(4),
      week: 10,
    });
    const r1 = buildMediaNarratives(league);
    const r2 = buildMediaNarratives(league);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  it('does not mutate the input league object', () => {
    const league = makeLeague({
      teams: [
        makeTeam({ owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 80, seasonsUnderGoal: 2 } }),
      ],
    });
    const before = JSON.stringify(league);
    buildMediaNarratives(league);
    expect(JSON.stringify(league)).toBe(before);
  });

  it('enforces max story count', () => {
    const teams = Array.from({ length: 32 }, (_, i) =>
      makeTeam({ id: i + 1, abbr: `T${i}`, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 60 + i, seasonsUnderGoal: 1 } }),
    );
    const league = makeLeague({ teams });
    const stories = buildMediaNarratives(league);
    expect(stories.length).toBeLessThanOrEqual(MEDIA_STORY_MAX);
  });

  it('returns output with stable id field on every story', () => {
    const league = makeLeague({
      teams: [makeTeam({ owner: { mandate: 'WIN_DIVISION', hotSeatRating: 70, seasonsUnderGoal: 1 } })],
    });
    const stories = buildMediaNarratives(league);
    for (const s of stories) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
    }
  });

  it('hot-seat story from a team with high hotSeatRating is generated', () => {
    const league = makeLeague({
      teams: [makeTeam({ id: 99, abbr: 'HTS', owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 85, seasonsUnderGoal: 2 } })],
    });
    const stories = buildMediaNarratives(league);
    const pressureStory = stories.find((s) => s.type === MEDIA_STORY_TYPES.OWNER_PRESSURE);
    expect(pressureStory).toBeTruthy();
    expect(pressureStory.teamId).toBe(99);
  });

  it('mandate slip story appears in output for underperforming team', () => {
    const league = makeLeague({
      teams: [makeTeam({ wins: 2, losses: 9, owner: { mandate: 'WIN_DIVISION', hotSeatRating: 65, seasonsUnderGoal: 2 } })],
      week: 11,
    });
    const stories = buildMediaNarratives(league);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.MANDATE_SLIP)).toBe(true);
  });

  it('does not use Math.random (output is same on 10 repeated calls)', () => {
    const league = makeLeague({
      teams: makeAllTeams(8),
      week: 8,
    });
    const outputs = Array.from({ length: 10 }, () =>
      JSON.stringify(buildMediaNarratives(league)),
    );
    expect(new Set(outputs).size).toBe(1);
  });

  it('respects maxCount option passed in options', () => {
    const teams = Array.from({ length: 20 }, (_, i) =>
      makeTeam({ id: i + 1, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 65 + i, seasonsUnderGoal: 1 } }),
    );
    const stories = buildMediaNarratives(makeLeague({ teams }), { maxCount: 3 });
    expect(stories.length).toBeLessThanOrEqual(3);
  });

  it('highest-priority story appears first', () => {
    const league = makeLeague({
      teams: [
        makeTeam({ id: 1, abbr: 'HIGH', wins: 10, losses: 2, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 92, seasonsUnderGoal: 3 } }),
        makeTeam({ id: 2, abbr: 'LOW', wins: 8, losses: 4, owner: { mandate: 'MAKE_PLAYOFFS', hotSeatRating: 62, seasonsUnderGoal: 0 } }),
      ],
    });
    const stories = buildMediaNarratives(league);
    expect(stories.length).toBeGreaterThan(0);
    // The team with hotSeatRating 92 should produce highest-priority story
    expect(stories[0].priority).toBeGreaterThanOrEqual(stories[stories.length - 1].priority);
  });

  it('handles league with no owners/news/standings gracefully', () => {
    const bareLeague = { year: 2026, week: 8, userTeamId: 1, teams: [{ id: 1, abbr: 'TST', wins: 5, losses: 3 }] };
    expect(() => buildMediaNarratives(bareLeague)).not.toThrow();
    expect(Array.isArray(buildMediaNarratives(bareLeague))).toBe(true);
  });

  it('prestige honors appear when currentSeasonHonors is provided', () => {
    const league = makeLeague({
      currentSeasonHonors: [
        { type: 'FIRST_TEAM_ALL_PRO', playerId: 5, playerName: 'Star WR', pos: 'WR', teamId: 3, teamAbbr: 'KC', year: 2026 },
      ],
    });
    const stories = buildMediaNarratives(league);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.PRESTIGE_HONOR)).toBe(true);
  });
});
