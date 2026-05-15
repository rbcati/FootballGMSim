import { describe, expect, it } from 'vitest';
import { buildLeaguePulseItems, mergeLeaguePulseItems, selectLeaguePulseHighlights } from '../../leaguePulse.js';

function makeLeague(overrides = {}) {
  return {
    seasonId: '2031',
    year: 2031,
    week: 3,
    phase: 'regular',
    userTeamId: 1,
    teams: [
      { id: 1, name: 'Arizona', abbr: 'ARI', conf: 1, div: 1, wins: 1, losses: 4, recentResults: ['L', 'L'], fanApproval: 38, roster: [
        { id: '101', name: 'Rookie Runner', pos: 'RB', teamId: 1, yearsPro: 0, ovr: 79, contract: { years: 3 } },
        { id: '102', name: 'Edge Star', pos: 'EDGE', teamId: 1, yearsPro: 5, ovr: 88, contract: { years: 1 } },
      ] },
      { id: 2, name: 'Seattle', abbr: 'SEA', conf: 1, div: 1, wins: 5, losses: 0, recentResults: ['W', 'W'], roster: [] },
      { id: 3, name: 'Denver', abbr: 'DEN', conf: 0, div: 0, wins: 3, losses: 2, recentResults: ['W'], roster: [
        { id: '301', name: 'Injured Tackle', pos: 'OT', teamId: 3, ovr: 86, injuryWeeksRemaining: 3 },
      ] },
      { id: 4, name: 'Miami', abbr: 'MIA', conf: 0, div: 0, wins: 2, losses: 3, recentResults: ['L'], roster: [] },
      { id: 5, name: 'Chicago', abbr: 'CHI', conf: 0, div: 1, wins: 4, losses: 1, recentResults: ['W'], roster: [] },
      { id: 6, name: 'Detroit', abbr: 'DET', conf: 0, div: 1, wins: 2, losses: 3, recentResults: ['L'], roster: [] },
      { id: 7, name: 'Buffalo', abbr: 'BUF', conf: 1, div: 0, wins: 4, losses: 1, recentResults: ['W'], roster: [] },
      { id: 8, name: 'Kansas City', abbr: 'KC', conf: 1, div: 0, wins: 3, losses: 2, recentResults: ['W'], roster: [] },
    ],
    schedule: {
      weeks: [
        { week: 4, games: [{ home: 1, away: 2, played: false }] },
      ],
    },
    newsItems: [],
    ...overrides,
  };
}

function makeResults() {
  return [
    {
      gameId: '2031_w3_1_2',
      home: 1,
      away: 2,
      scoreHome: 17,
      scoreAway: 28,
      boxScore: {
        home: {
          101: { name: 'Rookie Runner', pos: 'RB', stats: { rushAtt: 18, rushYd: 124, rushTD: 1 } },
        },
        away: {
          201: { name: 'Seattle QB', pos: 'QB', stats: { passAtt: 31, passYd: 318, passTD: 3 } },
        },
      },
    },
    {
      gameId: '2031_w3_3_4',
      home: 3,
      away: 4,
      scoreHome: 24,
      scoreAway: 23,
      boxScore: { home: {}, away: {} },
    },
  ];
}

describe('League Pulse V1', () => {
  it('generates deterministic pulse items from the same league state', () => {
    const input = { league: makeLeague(), results: makeResults(), week: 3 };
    const first = buildLeaguePulseItems(input);
    const second = buildLeaguePulseItems(input);
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(3);
    expect(first.length).toBeLessThanOrEqual(8);
  });

  it('does not crash with missing teams, stats, players, or schedule', () => {
    expect(Array.isArray(buildLeaguePulseItems({ league: {}, results: [{ home: 1, away: 2 }] }))).toBe(true);
  });

  it('suppresses duplicate story keys inside the cooldown window', () => {
    const league = makeLeague();
    const pulse = buildLeaguePulseItems({ league, results: makeResults(), week: 3 });
    const existing = [{ ...pulse[0], week: 2 }];
    const merged = mergeLeaguePulseItems(existing, pulse, { currentWeek: 3, cooldownWeeks: 3 });
    expect(merged.filter((item) => item.dedupeKey === pulse[0].dedupeKey)).toHaveLength(1);
    expect(merged.some((item) => item.id === existing[0].id)).toBe(true);
  });

  it('prioritizes user-team relevant stories ahead of generic league items', () => {
    const items = buildLeaguePulseItems({ league: makeLeague(), results: makeResults(), week: 3 });
    expect(Number(items[0].relatedTeamId)).toBe(1);
  });

  it('survives JSON save and reload with required timeline fields', () => {
    const [item] = buildLeaguePulseItems({ league: makeLeague(), results: makeResults(), week: 3 });
    const reloaded = JSON.parse(JSON.stringify(item));
    expect(reloaded.source).toBe('league_pulse_v1');
    expect(reloaded.id).toBeTruthy();
    expect(reloaded.week).toBe(3);
    expect(reloaded.relatedTeamId).not.toBeUndefined();
    expect(reloaded.dedupeKey).toBeTruthy();
  });

  it('selects pulse highlights with user-team relevance first', () => {
    const league = makeLeague({
      newsItems: [
        { id: 'league', source: 'league_pulse_v1', headline: 'League', body: 'League', importance: 90, week: 3, relatedTeamId: 2, teamId: 2, timestamp: 2 },
        { id: 'team', source: 'league_pulse_v1', headline: 'Team', body: 'Team', importance: 50, week: 3, relatedTeamId: 1, teamId: 1, timestamp: 1 },
      ],
    });
    expect(selectLeaguePulseHighlights(league, { limit: 2 })[0].headline).toBe('Team');
  });
});

