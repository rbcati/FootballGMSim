import { describe, it, expect } from 'vitest';
import {
  ensureLeagueMemoryMeta,
  updateFranchiseHistory,
  updateRecordBook,
  evaluateHallOfFameCandidate,
  buildSeasonArchiveSummary,
  buildSeasonStorylineSnapshot,
} from '../../src/core/league-memory.js';
import { PLAYER_SEASON_STATS_ARCHIVE_SCHEMA_VERSION } from '../../src/core/playerSeasonStatsArchive.js';
import { TRANSACTION_TIMELINE_SCHEMA_VERSION } from '../../src/core/transactionTimeline.js';

describe('league memory helpers', () => {
  it('adds defaults for old saves', () => {
    const meta = ensureLeagueMemoryMeta({ year: 2030 });
    expect(Array.isArray(meta.leagueHistory)).toBe(true);
    expect(meta.recordBook.singleSeason.passYd.value).toBe(0);
    expect(Array.isArray(meta.hallOfFame.classes)).toBe(true);
  });

  it('persists franchise timeline milestones and totals', () => {
    let meta = ensureLeagueMemoryMeta({});
    const season = buildSeasonArchiveSummary({
      year: 2031,
      seasonId: 's7',
      standings: [{ id: 0, name: 'Boston', abbr: 'BOS', wins: 13, losses: 4, ties: 0, pf: 410, pa: 280 }],
      awards: { mvp: { playerId: 'p1', name: 'Ace QB' } },
      leaders: {},
      champion: { id: 0, name: 'Boston', abbr: 'BOS' },
      runnerUp: null,
      userTeamId: 0,
      championshipGameId: 's7_w22_0_1',
      games: [
        { id: 's7_w1_0_1', week: 1, homeId: 0, awayId: 1, homeScore: 24, awayScore: 17 },
        { id: 's7_w22_0_1', week: 22, homeId: 0, awayId: 1, homeScore: 31, awayScore: 28 },
      ],
      seasonStats: [
        { playerId: 10, name: 'Ace QB', pos: 'QB', teamId: 0, totals: { passYd: 4500, passTD: 35 } },
        { playerId: 11, name: 'Top RB', pos: 'RB', teamId: 0, totals: { rushYd: 1500, rushTD: 13 } },
      ],
    });
    expect(season.gameIndex).toHaveLength(2);
    expect(season.gameIndex[0].id).toBe('s7_w1_0_1');
    expect(season.schemaVersion).toBe(1);
    expect(season.championshipGameId).toBe('s7_w22_0_1');
    expect(season.playerStatLeaders.passingYards.playerName).toBe('Ace QB');
    expect(season.notableGames.length).toBeGreaterThan(0);
    meta = updateFranchiseHistory(meta, season, []);
    expect(meta.franchiseHistoryByTeam['0'].totals.championships).toBe(1);
    expect(meta.franchiseHistoryByTeam['0'].milestones.length).toBe(1);
  });

  it('includes playerSeasonStatsV1 when provided with rows', () => {
    const season = buildSeasonArchiveSummary({
      year: 2044,
      seasonId: 's44',
      standings: [],
      awards: {},
      leaders: {},
      champion: null,
      runnerUp: null,
      userTeamId: 0,
      games: [],
      seasonStats: [],
      playerSeasonStatsV1: {
        schemaVersion: PLAYER_SEASON_STATS_ARCHIVE_SCHEMA_VERSION,
        rows: [{ playerId: 'z', playerName: 'Zed', pos: 'QB', teamId: 1, year: 2044, seasonId: 's44', gamesPlayed: 1, passYds: 50, passTDs: 0, passInts: 0, rushYds: 0, rushTDs: 0, recYds: 0, recTDs: 0, tackles: 0, sacks: 0, defInts: 0, fgMade: 0, xpMade: 0 }],
        meta: { source: 'seasonStats', partial: false, createdAt: 'now' },
      },
    });
    expect(season.playerSeasonStatsV1.rows).toHaveLength(1);
    expect(season.playerSeasonStatsV1.schemaVersion).toBe(1);
  });

  it('includes transactionTimelineV1 when provided with rows', () => {
    const season = buildSeasonArchiveSummary({
      year: 2045,
      seasonId: 's45',
      standings: [],
      awards: {},
      leaders: {},
      champion: null,
      runnerUp: null,
      userTeamId: 0,
      games: [],
      seasonStats: [],
      transactionTimelineV1: {
        schemaVersion: TRANSACTION_TIMELINE_SCHEMA_VERSION,
        rows: [{ id: 'tx-1', type: 'signing', headline: 'Test signed', week: 1 }],
        meta: { source: 'transactions', partial: false, createdAt: 'now' },
      },
    });
    expect(season.transactionTimelineV1.rows).toHaveLength(1);
    expect(season.transactionTimelineV1.schemaVersion).toBe(TRANSACTION_TIMELINE_SCHEMA_VERSION);
  });

  it('keeps archive shape stable when championship data is unavailable', () => {
    const season = buildSeasonArchiveSummary({
      year: 2033,
      seasonId: 's9',
      standings: [],
      awards: {},
      leaders: {},
      champion: null,
      runnerUp: null,
      userTeamId: 0,
      games: [{ id: 's9_w18', week: 18, homeId: 1, awayId: 2, homeScore: 24, awayScore: 21 }],
      seasonStats: [],
    });
    expect(season.schemaVersion).toBe(1);
    expect(season.seasonId).toBe('s9');
    expect(season.id).toBe('s9');
    expect(typeof season.completedAt).toBe('string');
    expect(season.playoffSummary.finals).toBe(null);
    expect(Array.isArray(season.notableGames)).toBe(true);
    expect(season.awards).toEqual({});
    expect(season.leaders).toEqual({});
  });

  it('updates record book and hall evaluations', () => {
    let meta = ensureLeagueMemoryMeta({
      leagueHistory: [{
        year: 2032,
        seasonId: 's5',
        id: 's5',
        playerStatLeaders: {
          passingYards: { playerId: 'p1', playerName: 'Ace QB', teamId: 0, teamAbbr: 'BOS', position: 'QB', value: 5200, stat: 'passYd' },
        },
        standings: [{ id: 0, name: 'Boston', abbr: 'BOS', wins: 14, losses: 3, ties: 0, pf: 410, pa: 280 }],
      }],
    });
    meta = updateRecordBook(meta, {
      allPlayers: [{ id: 'p1', name: 'Ace QB', teamId: 0, careerStats: [{ season: 's5', passYds: 5200, passTDs: 45 }] }],
    });
    expect(meta.recordBook.schemaVersion).toBe(1);
    expect(meta.recordBook.singleSeason.passYd.value).toBe(5200);
    expect(meta.recordBook.career.passYd.value).toBe(5200);

    const hof = evaluateHallOfFameCandidate({ pos: 'QB', accolades: [{ type: 'MVP' }], careerStats: Array.from({ length: 12 }).map(() => ({ passYds: 1200, ovr: 90 })) }, 2032);
    expect(hof.inducted).toBe(true);
  });

  it('builds dynasty/drought storyline cards', () => {
    const meta = ensureLeagueMemoryMeta({
      leagueHistory: [{ year: 2035, champion: { id: 1, name: 'Sharks', abbr: 'SHK' } }],
      franchiseHistoryByTeam: {
        '1': { totals: { championships: 3, playoffAppearances: 8 }, bestSeason: { wins: 15, losses: 2 }, lastChampionshipYear: 2035 },
        '2': { totals: {}, lastChampionshipYear: 2028 },
      },
    });
    const cards = buildSeasonStorylineSnapshot(meta, [{ id: 1, abbr: 'SHK', name: 'Sharks' }, { id: 2, abbr: 'COL', name: 'Colts' }], 1);
    expect(cards.length).toBeGreaterThan(1);
  });
});
