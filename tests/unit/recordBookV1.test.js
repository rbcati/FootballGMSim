import { describe, it, expect } from 'vitest';
import {
  rebuildRecordBookV1,
  defensiveInterceptionsSeasonValue,
  dedupeCareerStatLines,
  buildPlayerRecordContext,
  RECORD_KEYS,
} from '../../src/core/recordBookV1.js';

describe('recordBookV1', () => {
  it('single-season scan prefers playerSeasonStatsV1 when present', () => {
    const book = rebuildRecordBookV1({
      leagueHistory: [{
        year: 2090,
        seasonId: 'sx',
        id: 'sx',
        standings: [],
        playerSeasonStatsV1: {
          schemaVersion: 1,
          rows: [
            { playerId: 'wr9', playerName: 'Deep', pos: 'WR', teamId: 2, year: 2090, seasonId: 'sx', gamesPlayed: 11, recYds: 1700, recTDs: 14 },
          ],
          meta: { source: 'seasonStats', partial: false, createdAt: 't' },
        },
      }],
      players: [],
    });
    expect(book.singleSeasonV1[RECORD_KEYS.receivingYards].value).toBe(1700);
    expect(book.singleSeasonV1[RECORD_KEYS.receivingYards].playerId).toBe('wr9');
  });

  it('career leaders merge archive V1 when player lacks careerStats lines', () => {
    const book = rebuildRecordBookV1({
      leagueHistory: [{
        year: 2099,
        seasonId: 's9',
        id: 's9',
        playerSeasonStatsV1: {
          schemaVersion: 1,
          rows: [
            { playerId: 'ghost', playerName: 'Ghost', pos: 'WR', teamId: 1, year: 2099, seasonId: 's9', gamesPlayed: 10, recYds: 900, recTDs: 6 },
          ],
          meta: { source: 'seasonStats', partial: false, createdAt: 't' },
        },
      }],
      players: [{ id: 'ghost', name: 'Ghost', pos: 'WR', careerStats: [] }],
    });
    expect(book.careerLeadersV1[RECORD_KEYS.receivingYards][0]?.value).toBeGreaterThanOrEqual(900);
    expect(book.careerLeadersV1[RECORD_KEYS.receivingYards][0]?.playerId).toBe('ghost');
  });

  it('builds single-season records from archived playerStatLeaders', () => {
    const book = rebuildRecordBookV1({
      leagueHistory: [{
        year: 2030,
        seasonId: 's1',
        id: 's1',
        playerStatLeaders: {
          passingYards: { playerId: 'qb1', playerName: 'Air Raid', value: 5100, position: 'QB', teamAbbr: 'NY' },
        },
        standings: [{ id: 1, name: 'A', abbr: 'A', wins: 12, losses: 5, ties: 0, pf: 400, pa: 300 }],
      }],
      players: [],
    });
    expect(book.singleSeasonV1[RECORD_KEYS.passingYards].value).toBe(5100);
    expect(book.singleSeasonV1[RECORD_KEYS.passingYards].playerId).toBe('qb1');
  });

  it('does not double-count the same season in career totals', () => {
    const player = {
      id: 'p1',
      name: 'Dual',
      careerStats: [
        { season: 's1', passYds: 1000 },
        { season: 's1', passYds: 999 },
      ],
    };
    const book = rebuildRecordBookV1({ leagueHistory: [], players: [player] });
    const leaders = book.careerLeadersV1[RECORD_KEYS.passingYards];
    expect(leaders[0].value).toBe(999);
  });

  it('dedupeCareerStatLines keeps last line per season id', () => {
    const merged = dedupeCareerStatLines([
      { season: 's2', passYds: 100, passTDs: 1 },
      { season: 's2', passYds: 50, passTDs: 2 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].passYds).toBe(50);
    expect(merged[0].passTDs).toBe(2);
  });

  it('defensive INT value ignores QB picks', () => {
    const qbRow = { pos: 'QB', totals: { interceptions: 14, defInterceptions: 0 } };
    expect(defensiveInterceptionsSeasonValue(qbRow)).toBe(0);
    const lb = { pos: 'LB', totals: { interceptions: 4, defInterceptions: 0 } };
    expect(defensiveInterceptionsSeasonValue(lb)).toBe(4);
    const fs = { pos: 'S', totals: { defInterceptions: 6, interceptions: 1 } };
    expect(defensiveInterceptionsSeasonValue(fs)).toBe(6);
  });

  it('builds team records from standings', () => {
    const book = rebuildRecordBookV1({
      leagueHistory: [
        {
          year: 2028,
          seasonId: 'a',
          standings: [
            { id: 1, name: 'High', abbr: 'HI', wins: 15, losses: 2, ties: 0, pf: 500, pa: 280 },
            { id: 2, name: 'Low', abbr: 'LO', wins: 3, losses: 14, ties: 0, pf: 200, pa: 420 },
          ],
        },
      ],
      players: [],
    });
    expect(book.teamSeasonV1.wins.value).toBe(15);
    expect(book.teamSeasonV1.pointsFor.value).toBe(500);
    expect(book.teamSeasonV1.pointsAllowed.value).toBe(280);
  });

  it('preserves existing single-season record when new archive is lower', () => {
    const prev = {
      schemaVersion: 1,
      singleSeasonV1: {
        [RECORD_KEYS.passingYards]: {
          recordKey: RECORD_KEYS.passingYards,
          value: 6000,
          playerId: 'old',
          playerName: 'Legend',
          year: 2020,
          sourceSeasonId: 's0',
          source: 'archivedSeason',
        },
      },
    };
    const book = rebuildRecordBookV1({
      leagueHistory: [{
        year: 2035,
        seasonId: 's9',
        playerStatLeaders: {
          passingYards: { playerId: 'qb2', playerName: 'Rookie', value: 4000, position: 'QB' },
        },
        standings: [],
      }],
      players: [],
      previousRecordBook: prev,
    });
    expect(book.singleSeasonV1[RECORD_KEYS.passingYards].value).toBe(6000);
    expect(book.singleSeasonV1[RECORD_KEYS.passingYards].playerId).toBe('old');
  });

  it('buildPlayerRecordContext for record holder and rank', () => {
    const book = {
      singleSeasonV1: {
        [RECORD_KEYS.rushingYards]: {
          value: 2000,
          playerId: 'rb1',
          year: 2029,
        },
      },
      careerLeadersV1: {
        [RECORD_KEYS.passingYards]: [
          { playerId: 'qb9', value: 50000 },
          { playerId: 'qb1', value: 40000 },
        ],
      },
    };
    const rb = buildPlayerRecordContext(book, 'rb1');
    expect(rb.some((l) => l.kind === 'singleSeasonRecord')).toBe(true);
    const qbLines = buildPlayerRecordContext(book, 'qb1');
    expect(qbLines.some((l) => l.text.includes('#2'))).toBe(true);
    expect(buildPlayerRecordContext(book, 'none')).toHaveLength(0);
  });
});
