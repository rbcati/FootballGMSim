import { describe, expect, it } from 'vitest';
import {
  buildMediaNarratives,
  MEDIA_STORY_TYPES,
  MEDIA_STORY_MAX,
} from './mediaNarrativeEngine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeOwnerProfile(overrides = {}) {
  return {
    mandate:          'MAKE_PLAYOFFS',
    hotSeatRating:    25,
    seasonsUnderGoal: 0,
    ...overrides,
  };
}

function makeTeam(id, overrides = {}) {
  return {
    id,
    name:   `Team ${id}`,
    abbr:   `T${id}`,
    conf:   id < 16 ? 0 : 1,
    div:    id % 4,
    wins:   8,
    losses: 4,
    ties:   0,
    ovr:    78,
    owner:  makeOwnerProfile(),
    ...overrides,
  };
}

function makeStandingsRows(teams) {
  return teams.map((t) => ({
    tid:  t.id,
    w:    t.wins  ?? 0,
    l:    t.losses ?? 0,
    t:    t.ties  ?? 0,
    abbr: t.abbr,
    conf: t.conf,
  }));
}

function makeLeagueContext(overrides = {}) {
  const teams = Array.from({ length: 8 }, (_, i) => makeTeam(i + 1));
  return {
    year:               2026,
    week:               10,
    season:             2026,
    userTeamId:         1,
    teams,
    standings:          makeStandingsRows(teams),
    newsItems:          [],
    currentSeasonHonors: null,
    leaguePulse:        [],
    ...overrides,
  };
}

// ── View-state exposure ───────────────────────────────────────────────────────

describe('view-state exposure', () => {
  it('buildMediaNarratives returns an array (safe view-state output)', () => {
    const result = buildMediaNarratives(makeLeagueContext());
    expect(Array.isArray(result)).toBe(true);
  });

  it('each story in the result has the required card fields', () => {
    const ctx = makeLeagueContext({
      teams: [makeTeam(1, { owner: makeOwnerProfile({ hotSeatRating: 75, seasonsUnderGoal: 1 }) })],
    });
    const stories = buildMediaNarratives(ctx);
    for (const s of stories) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.type).toBe('string');
      expect(typeof s.priority).toBe('number');
      expect(typeof s.headline).toBe('string');
      expect(typeof s.dek).toBe('string');
      expect(Array.isArray(s.tags)).toBe(true);
      expect(Array.isArray(s.sourceEventIds)).toBe(true);
    }
  });

  it('output is safe for JSON serialization (no circular refs, no undefined)', () => {
    const ctx = makeLeagueContext({
      teams: [makeTeam(1, { owner: makeOwnerProfile({ hotSeatRating: 80, seasonsUnderGoal: 2 }) })],
    });
    const stories = buildMediaNarratives(ctx);
    expect(() => JSON.stringify(stories)).not.toThrow();
  });
});

// ── Owner pressure → story cards ──────────────────────────────────────────────

describe('owner pressure data can produce story cards', () => {
  it('a single team with hotSeatRating 80+ produces an OWNER_PRESSURE card', () => {
    const ctx = makeLeagueContext({
      teams: [makeTeam(5, { owner: makeOwnerProfile({ hotSeatRating: 82, seasonsUnderGoal: 2 }) })],
    });
    const stories = buildMediaNarratives(ctx);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.OWNER_PRESSURE)).toBe(true);
  });

  it('teams with hotSeatRating < 60 do not generate OWNER_PRESSURE cards', () => {
    const ctx = makeLeagueContext({
      teams: Array.from({ length: 8 }, (_, i) =>
        makeTeam(i + 1, { owner: makeOwnerProfile({ hotSeatRating: 30 + i * 3 }) }),
      ),
    });
    const stories = buildMediaNarratives(ctx);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.OWNER_PRESSURE)).toBe(false);
  });

  it('OWNER_PRESSURE story priority is higher for higher hotSeatRating', () => {
    const ctx = makeLeagueContext({
      teams: [
        makeTeam(1, { owner: makeOwnerProfile({ hotSeatRating: 92, seasonsUnderGoal: 3 }) }),
        makeTeam(2, { owner: makeOwnerProfile({ hotSeatRating: 65, seasonsUnderGoal: 1 }) }),
      ],
    });
    const stories = buildMediaNarratives(ctx);
    const pressureStories = stories.filter((s) => s.type === MEDIA_STORY_TYPES.OWNER_PRESSURE);
    expect(pressureStories.length).toBeGreaterThan(0);
    // Higher hotSeat team should have higher priority
    const team1 = pressureStories.find((s) => s.teamId === 1);
    const team2 = pressureStories.find((s) => s.teamId === 2);
    if (team1 && team2) {
      expect(team1.priority).toBeGreaterThan(team2.priority);
    }
  });
});

// ── Trade/history inputs → story cards ───────────────────────────────────────

describe('trade and history inputs can produce story cards', () => {
  it('leaguePulse transaction item produces a BLOCKBUSTER_TRADE card', () => {
    const ctx = makeLeagueContext({
      leaguePulse: [
        {
          id:            'pulse-trade-2026-9',
          type:          'transaction',
          source:        'transaction',
          headline:      'Elite QB Shakes Up the League',
          body:          'The trade reshapes conference power dynamics.',
          importance:    80,
          relatedTeamId: 3,
          season:        2026,
          week:          9,
        },
      ],
    });
    const stories = buildMediaNarratives(ctx);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE)).toBe(true);
  });

  it('newsItems trade entry produces a BLOCKBUSTER_TRADE card', () => {
    const ctx = makeLeagueContext({
      newsItems: [
        {
          id:     'news-trade-1',
          type:   'TRANSACTION',
          text:   'WR traded to gain cap flexibility.',
          teamId: 4,
          week:   8,
          year:   2026,
          extraData: { fromTeamId: 4, toTeamId: 7 },
        },
      ],
    });
    const stories = buildMediaNarratives(ctx);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.BLOCKBUSTER_TRADE)).toBe(true);
  });

  it('honors (First-Team All-Pro) produce a PRESTIGE_HONOR card', () => {
    const ctx = makeLeagueContext({
      currentSeasonHonors: [
        {
          type:       'FIRST_TEAM_ALL_PRO',
          playerId:   99,
          playerName: 'Elite QB',
          pos:        'QB',
          teamId:     6,
          teamAbbr:   'KC',
          year:       2026,
          score:      145,
        },
      ],
    });
    const stories = buildMediaNarratives(ctx);
    expect(stories.some((s) => s.type === MEDIA_STORY_TYPES.PRESTIGE_HONOR)).toBe(true);
  });
});

// ── No gameplay mutations ─────────────────────────────────────────────────────

describe('no gameplay mutations occur during media generation', () => {
  it('does not modify any team objects in the input', () => {
    const teams = Array.from({ length: 4 }, (_, i) =>
      makeTeam(i + 1, { owner: makeOwnerProfile({ hotSeatRating: 70, seasonsUnderGoal: 1 }) }),
    );
    const before = JSON.parse(JSON.stringify(teams));
    const ctx = makeLeagueContext({ teams });
    buildMediaNarratives(ctx);
    expect(JSON.parse(JSON.stringify(ctx.teams))).toEqual(before);
  });

  it('does not modify newsItems array', () => {
    const newsItems = [
      { id: 'n1', type: 'TRANSACTION', text: 'Player traded.', teamId: 2, week: 8, year: 2026, extraData: { fromTeamId: 2, toTeamId: 5 } },
    ];
    const before = JSON.stringify(newsItems);
    buildMediaNarratives(makeLeagueContext({ newsItems }));
    expect(JSON.stringify(newsItems)).toBe(before);
  });

  it('does not modify leaguePulse array', () => {
    const leaguePulse = [
      { id: 'p1', type: 'transaction', headline: 'Trade', body: 'Trade body', importance: 75, relatedTeamId: 1, season: 2026, week: 9 },
    ];
    const before = JSON.stringify(leaguePulse);
    buildMediaNarratives(makeLeagueContext({ leaguePulse }));
    expect(JSON.stringify(leaguePulse)).toBe(before);
  });

  it('does not modify the standings array', () => {
    const teams = Array.from({ length: 4 }, (_, i) => makeTeam(i + 1));
    const standings = makeStandingsRows(teams);
    const before = JSON.stringify(standings);
    buildMediaNarratives(makeLeagueContext({ teams, standings }));
    expect(JSON.stringify(standings)).toBe(before);
  });

  it('does not modify the root context object', () => {
    const ctx = makeLeagueContext({
      teams: [makeTeam(1, { owner: makeOwnerProfile({ hotSeatRating: 85, seasonsUnderGoal: 2 }) })],
    });
    const before = JSON.stringify(ctx);
    buildMediaNarratives(ctx);
    expect(JSON.stringify(ctx)).toBe(before);
  });
});

// ── Old saves remain safe ─────────────────────────────────────────────────────

describe('old saves remain safe', () => {
  it('handles league context with no owner data on any team', () => {
    const ctx = makeLeagueContext({
      teams: Array.from({ length: 4 }, (_, i) => ({
        id:     i + 1,
        name:   `Team ${i + 1}`,
        abbr:   `T${i}`,
        wins:   5,
        losses: 5,
        ties:   0,
        // no owner field at all
      })),
    });
    expect(() => buildMediaNarratives(ctx)).not.toThrow();
    expect(Array.isArray(buildMediaNarratives(ctx))).toBe(true);
  });

  it('handles completely empty league context', () => {
    expect(() => buildMediaNarratives({})).not.toThrow();
    expect(buildMediaNarratives({})).toEqual([]);
  });

  it('handles missing week/year fields', () => {
    const ctx = { teams: [makeTeam(1)], standings: [] };
    expect(() => buildMediaNarratives(ctx)).not.toThrow();
  });

  it('handles null/undefined newsItems, standings, leaguePulse', () => {
    const ctx = {
      year:               2026,
      week:               8,
      teams:              [makeTeam(1, { owner: makeOwnerProfile({ hotSeatRating: 70, seasonsUnderGoal: 1 }) })],
      newsItems:          null,
      standings:          undefined,
      leaguePulse:        null,
      currentSeasonHonors: undefined,
    };
    expect(() => buildMediaNarratives(ctx)).not.toThrow();
    expect(Array.isArray(buildMediaNarratives(ctx))).toBe(true);
  });

  it('handles teams with partial owner profiles', () => {
    const ctx = makeLeagueContext({
      teams: [
        { id: 1, abbr: 'TST', wins: 3, losses: 9, owner: {} },
        { id: 2, abbr: 'OK', wins: 7, losses: 5, owner: { hotSeatRating: 70 } },
      ],
    });
    expect(() => buildMediaNarratives(ctx)).not.toThrow();
  });

  it('max story count is always respected regardless of data volume', () => {
    const teams = Array.from({ length: 32 }, (_, i) =>
      makeTeam(i + 1, { owner: makeOwnerProfile({ hotSeatRating: 60 + i, seasonsUnderGoal: 2 }) }),
    );
    const ctx = makeLeagueContext({
      teams,
      standings: makeStandingsRows(teams),
      leaguePulse: Array.from({ length: 20 }, (_, i) => ({
        id: `p${i}`, type: 'transaction', headline: `Trade ${i}`, body: 'Body', importance: 75, relatedTeamId: i + 1, season: 2026, week: 8,
      })),
    });
    const stories = buildMediaNarratives(ctx);
    expect(stories.length).toBeLessThanOrEqual(MEDIA_STORY_MAX);
  });
});

// ── No Math.random usage ──────────────────────────────────────────────────────

describe('determinism guarantee', () => {
  it('produces identical output on 10 repeated calls with same input', () => {
    const ctx = makeLeagueContext({
      teams: [
        makeTeam(1, { owner: makeOwnerProfile({ hotSeatRating: 80, seasonsUnderGoal: 2 }) }),
        makeTeam(2, { wins: 10, losses: 2, owner: makeOwnerProfile({ hotSeatRating: 15 }) }),
      ],
      leaguePulse: [
        { id: 'p1', type: 'transaction', headline: 'Trade', body: 'X', importance: 75, relatedTeamId: 3, season: 2026, week: 9 },
      ],
    });
    const outputs = Array.from({ length: 10 }, () => JSON.stringify(buildMediaNarratives(ctx)));
    expect(new Set(outputs).size).toBe(1);
  });
});
