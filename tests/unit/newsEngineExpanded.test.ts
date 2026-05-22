import { describe, it, expect } from 'vitest';
import { parseWeeklyHeadlines } from '../../src/core/history/NewsEngine.js';

function makeGame(overrides: Record<string, unknown> = {}) {
  return {
    home: 1,
    away: 2,
    homeTeamName: 'Northside',
    awayTeamName: 'Eastport',
    homeTeamAbbr: 'NOR',
    awayTeamAbbr: 'EAS',
    homeScore: 24,
    awayScore: 17,
    injuries: [],
    teamStats: { home: { passYds: 250, rushYds: 100, turnovers: 0 }, away: { passYds: 200, rushYds: 80, turnovers: 0 } },
    ...overrides,
  };
}

function makeTeams(overrides: unknown[] = []) {
  return [
    { id: 1, name: 'Northside', abbr: 'NOR', wins: 5, losses: 3, recentResults: ['W', 'W', 'L', 'W', 'W'], conf: 0, div: 0 },
    { id: 2, name: 'Eastport', abbr: 'EAS', wins: 2, losses: 6, recentResults: ['L', 'L', 'W', 'L', 'L'], conf: 0, div: 1 },
    ...overrides,
  ];
}

describe('parseWeeklyHeadlines — safety', () => {
  it('returns empty array when results is empty', () => {
    expect(parseWeeklyHeadlines({ results: [], week: 1, year: 2025 })).toHaveLength(0);
  });

  it('returns at most 6 headlines', () => {
    const results = Array.from({ length: 10 }, (_, i) => makeGame({
      home: i * 2 + 1, away: i * 2 + 2,
      homeTeamName: `Team${i * 2 + 1}`, awayTeamName: `Team${i * 2 + 2}`,
      homeScore: 35, awayScore: 7,
    }));
    const headlines = parseWeeklyHeadlines({ results, week: 3, year: 2025 });
    expect(headlines.length).toBeLessThanOrEqual(6);
  });

  it('deduplicates headlines by id', () => {
    const results = [makeGame(), makeGame()];
    const headlines = parseWeeklyHeadlines({ results, week: 3, year: 2025 });
    const ids = headlines.map((h) => h.id);
    const unique = new Set(ids);
    expect(ids.length).toBe(unique.size);
  });
});

describe('parseWeeklyHeadlines — blowout detection', () => {
  it('generates BLOWOUT headline for 28+ point margin', () => {
    const results = [makeGame({ homeScore: 42, awayScore: 7 })];
    const headlines = parseWeeklyHeadlines({ results, week: 4, year: 2025 });
    expect(headlines.some((h) => h.type === 'BLOWOUT')).toBe(true);
  });

  it('BLOWOUT severity is MAJOR for 35+ point margin', () => {
    const results = [makeGame({ homeScore: 49, awayScore: 7 })];
    const headlines = parseWeeklyHeadlines({ results, week: 4, year: 2025 });
    const blowout = headlines.find((h) => h.type === 'BLOWOUT');
    expect(blowout?.severity).toBe('MAJOR');
  });
});

describe('parseWeeklyHeadlines — overtime detection', () => {
  it('generates OVERTIME headline when ot flag set', () => {
    const results = [makeGame({ homeScore: 27, awayScore: 24, ot: 1 })];
    const headlines = parseWeeklyHeadlines({ results, week: 5, year: 2025 });
    expect(headlines.some((h) => h.type === 'OVERTIME')).toBe(true);
  });

  it('generates OVERTIME headline via quarterScores length > 4', () => {
    const results = [makeGame({
      homeScore: 20,
      awayScore: 17,
      quarterScores: [[7, 0, 3, 7, 3], [7, 3, 7, 0, 0]],
    })];
    const headlines = parseWeeklyHeadlines({ results, week: 5, year: 2025 });
    expect(headlines.some((h) => h.type === 'OVERTIME')).toBe(true);
  });
});

describe('parseWeeklyHeadlines — upset detection', () => {
  it('generates UPSET headline when heavy underdog wins', () => {
    const teams = [
      { id: 1, wins: 2, losses: 7, abbr: 'NOR', name: 'Northside' },
      { id: 2, wins: 8, losses: 1, abbr: 'EAS', name: 'Eastport' },
    ];
    const results = [makeGame({ home: 1, away: 2, homeScore: 20, awayScore: 17 })];
    const headlines = parseWeeklyHeadlines({ results, week: 10, year: 2025, teams });
    expect(headlines.some((h) => h.type === 'UPSET')).toBe(true);
  });

  it('does not generate UPSET for balanced matchup', () => {
    const teams = makeTeams();
    const results = [makeGame({ homeScore: 21, awayScore: 14 })];
    const headlines = parseWeeklyHeadlines({ results, week: 3, year: 2025, teams });
    const upset = headlines.find((h) => h.type === 'UPSET' && h.headlineText.includes('Upset Alert'));
    expect(upset).toBeUndefined();
  });
});

describe('parseWeeklyHeadlines — streak detection', () => {
  it('generates STREAK headline for 5+ game win streak', () => {
    const teams = [
      { id: 1, name: 'Northside', abbr: 'NOR', wins: 8, losses: 1, recentResults: ['L', 'W', 'W', 'W', 'W', 'W', 'W', 'W'] },
      { id: 2, name: 'Eastport', abbr: 'EAS', wins: 3, losses: 6, recentResults: ['L', 'L', 'L'] },
    ];
    const results = [makeGame({ homeScore: 28, awayScore: 10 })];
    const headlines = parseWeeklyHeadlines({ results, week: 9, year: 2025, teams });
    expect(headlines.some((h) => h.type === 'STREAK')).toBe(true);
  });

  it('generates STREAK headline for undefeated team at 5-0', () => {
    const teams = [
      { id: 1, name: 'Northside', abbr: 'NOR', wins: 5, losses: 0, recentResults: ['W', 'W', 'W', 'W', 'W'] },
      { id: 2, name: 'Eastport', abbr: 'EAS', wins: 2, losses: 3, recentResults: ['L', 'W', 'L'] },
    ];
    const results = [makeGame({ homeScore: 31, awayScore: 14 })];
    const headlines = parseWeeklyHeadlines({ results, week: 5, year: 2025, teams });
    const streak = headlines.find((h) => h.type === 'STREAK');
    expect(streak?.headlineText).toMatch(/perfect|5-0/i);
  });

  it('does not generate streak headline for 4 game streak (threshold is 5)', () => {
    const teams = [
      { id: 1, name: 'Northside', abbr: 'NOR', wins: 6, losses: 2, recentResults: ['L', 'L', 'W', 'W', 'W', 'W'] },
      { id: 2, name: 'Eastport', abbr: 'EAS', wins: 3, losses: 5, recentResults: ['L', 'L', 'L'] },
    ];
    const results = [makeGame({ homeScore: 24, awayScore: 14 })];
    const headlines = parseWeeklyHeadlines({ results, week: 8, year: 2025, teams });
    expect(headlines.some((h) => h.type === 'STREAK')).toBe(false);
  });
});

describe('parseWeeklyHeadlines — performance detection', () => {
  it('generates PERFORMANCE headline for 400+ passing yards', () => {
    const results = [makeGame({
      boxScore: {
        home: [{ id: 42, name: 'Marcus Cole', pos: 'QB', passYds: 412, rushYds: 0, recYds: 0, teamId: 1 }],
        away: [],
      },
    })];
    const headlines = parseWeeklyHeadlines({ results, week: 6, year: 2025 });
    expect(headlines.some((h) => ['PERFORMANCE', 'MILESTONE'].includes(h.type) && h.headlineText.includes('412'))).toBe(true);
  });

  it('generates PERFORMANCE headline for 150+ rushing yards', () => {
    const results = [makeGame({
      boxScore: {
        home: [{ id: 7, name: 'Damon Wells', pos: 'RB', passYds: 0, rushYds: 165, recYds: 0, teamId: 1 }],
        away: [],
      },
    })];
    const headlines = parseWeeklyHeadlines({ results, week: 6, year: 2025 });
    expect(headlines.some((h) => ['PERFORMANCE', 'MILESTONE'].includes(h.type) && h.headlineText.includes('165'))).toBe(true);
  });

  it('generates PERFORMANCE headline for 150+ receiving yards', () => {
    const results = [makeGame({
      boxScore: {
        away: [{ id: 11, name: 'Tyrone Nash', pos: 'WR', passYds: 0, rushYds: 0, recYds: 178, teamId: 2 }],
        home: [],
      },
    })];
    const headlines = parseWeeklyHeadlines({ results, week: 6, year: 2025 });
    expect(headlines.some((h) => ['PERFORMANCE', 'MILESTONE'].includes(h.type) && h.headlineText.includes('178'))).toBe(true);
  });
});

describe('parseWeeklyHeadlines — defensive domination', () => {
  it('generates DEFENSIVE headline for 4+ turnovers forced', () => {
    const results = [makeGame({
      homeScore: 35,
      awayScore: 14,
      teamStats: {
        home: { passYds: 300, rushYds: 130, turnovers: 4 },
        away: { passYds: 150, rushYds: 60, turnovers: 0 },
      },
    })];
    const headlines = parseWeeklyHeadlines({ results, week: 7, year: 2025 });
    expect(headlines.some((h) => h.type === 'DEFENSIVE')).toBe(true);
  });

  it('does not generate DEFENSIVE headline for 3 turnovers', () => {
    const results = [makeGame({
      teamStats: {
        home: { passYds: 280, rushYds: 110, turnovers: 3 },
        away: { passYds: 190, rushYds: 75, turnovers: 0 },
      },
    })];
    const headlines = parseWeeklyHeadlines({ results, week: 7, year: 2025 });
    expect(headlines.some((h) => h.type === 'DEFENSIVE')).toBe(false);
  });
});

describe('parseWeeklyHeadlines — injury detection', () => {
  it('generates INJURY headline for high-OVR player with long injury', () => {
    const player = { id: 55, name: 'Andre King', pos: 'WR', ovr: 88, teamId: 1 };
    const results = [makeGame({
      injuries: [{ playerId: 55, duration: 10, seasonEnding: false }],
    })];
    const headlines = parseWeeklyHeadlines({
      results,
      week: 4,
      year: 2025,
      getPlayer: (id) => (Number(id) === 55 ? player : null),
    });
    expect(headlines.some((h) => h.type === 'INJURY')).toBe(true);
  });

  it('generates CRITICAL INJURY headline for season-ending', () => {
    const player = { id: 12, name: 'Ray Torres', pos: 'QB', ovr: 91, teamId: 2 };
    const results = [makeGame({
      injuries: [{ playerId: 12, duration: 20, seasonEnding: true }],
    })];
    const headlines = parseWeeklyHeadlines({
      results,
      week: 8,
      year: 2025,
      getPlayer: (id) => (Number(id) === 12 ? player : null),
    });
    const injHl = headlines.find((h) => h.type === 'INJURY');
    expect(injHl?.severity).toBe('CRITICAL');
  });

  it('ignores injuries to low-OVR players', () => {
    const player = { id: 99, name: 'Bench Guy', pos: 'TE', ovr: 65, teamId: 1 };
    const results = [makeGame({
      injuries: [{ playerId: 99, duration: 12, seasonEnding: false }],
    })];
    const headlines = parseWeeklyHeadlines({
      results,
      week: 4,
      year: 2025,
      getPlayer: (id) => (Number(id) === 99 ? player : null),
    });
    expect(headlines.some((h) => h.type === 'INJURY')).toBe(false);
  });
});

describe('parseWeeklyHeadlines — comeback detection', () => {
  it('generates COMEBACK headline when winner was trailing after Q3', () => {
    const results = [makeGame({
      homeScore: 24,
      awayScore: 20,
      quarterScores: [
        [0, 0, 0, 24],
        [7, 3, 7, 3],
      ],
    })];
    const headlines = parseWeeklyHeadlines({ results, week: 6, year: 2025 });
    expect(headlines.some((h) => h.type === 'COMEBACK')).toBe(true);
  });
});
