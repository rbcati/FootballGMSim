import { describe, it, expect } from 'vitest';
import { buildFranchiseHistoryModel } from '../../src/core/franchiseHistoryModel.js';
import { RECORD_KEYS } from '../../src/core/recordBookV1.js';

const TEAM = { id: 7, abbr: 'SEA', name: 'Seattle' };

function baseSeason(year, overrides = {}) {
  return {
    year,
    seasonId: `s${year}`,
    id: `s${year}`,
    standings: [
      { id: 7, name: 'Seattle', abbr: 'SEA', wins: 10, losses: 7, ties: 0, pf: 380, pa: 340 },
      { id: 2, name: 'Other', abbr: 'OTH', wins: 8, losses: 9, ties: 0, pf: 300, pa: 310 },
    ],
    champion: { id: 2, name: 'Other', abbr: 'OTH' },
    runnerUp: { id: 3, name: 'Third', abbr: 'THD' },
    awards: {
      mvp: { playerId: 'mvp1', name: 'Star QB', pos: 'QB', teamId: 7 },
    },
    playerStatLeaders: {
      passingYards: { playerId: 'qb1', playerName: 'Air', value: 4200, position: 'QB', teamId: 2, teamAbbr: 'OTH' },
      passingTd: { playerId: 'qb2', playerName: 'Local', value: 32, position: 'QB', teamId: 7, teamAbbr: 'SEA' },
    },
    playoffBracketSnapshot: { mode: 'empty', rounds: [] },
    notableGames: [],
    gameIndex: [],
    ...overrides,
  };
}

describe('buildFranchiseHistoryModel', () => {
  it('builds all-time record from archived standings', () => {
    const m = buildFranchiseHistoryModel({
      teamId: TEAM.id,
      teamAbbr: TEAM.abbr,
      teamName: TEAM.name,
      archivedSeasons: [
        baseSeason(2030, { standings: [{ id: 7, abbr: 'SEA', wins: 12, losses: 5, ties: 0, pf: 400, pa: 300 }] }),
        baseSeason(2031, { standings: [{ id: 7, abbr: 'SEA', wins: 9, losses: 8, ties: 0, pf: 350, pa: 360 }] }),
      ],
    });
    expect(m.summary.allTimeWins).toBe(21);
    expect(m.summary.allTimeLosses).toBe(13);
    expect(m.summary.seasonsArchived).toBe(2);
  });

  it('counts titles and runner-up finishes', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [
        baseSeason(2030, { champion: { id: 7, abbr: 'SEA' }, runnerUp: { id: 2, abbr: 'OTH' } }),
        baseSeason(2031, { champion: { id: 2, abbr: 'OTH' }, runnerUp: { id: 7, abbr: 'SEA' } }),
      ],
    });
    expect(m.summary.titles).toBe(1);
    expect(m.summary.runnerUpFinishes).toBe(1);
  });

  it('counts true playoff appearances from bracket when team appears', () => {
    const snap = {
      mode: 'flat',
      rounds: [{
        label: 'Postseason',
        games: [{ homeId: 7, awayId: 2, homeAbbr: 'SEA', awayAbbr: 'OTH', homeScore: 24, awayScore: 21, week: 20 }],
      }],
    };
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [
        baseSeason(2030, { champion: { id: 9, abbr: 'ZZZ' }, runnerUp: { id: 8, abbr: 'YYY' }, playoffBracketSnapshot: snap }),
      ],
    });
    expect(m.summary.postseasonArchivePresent).toBe(true);
    expect(m.summary.playoffAppearances).toBeGreaterThanOrEqual(1);
  });

  it('labels postseason absent: playoff-caliber only, no documented appearances without champ/runner/bracket', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [
        {
          year: 2020,
          standings: [{ id: 7, abbr: 'SEA', wins: 11, losses: 6, ties: 0, pf: 400, pa: 350 }],
          playoffBracketSnapshot: { mode: 'empty', rounds: [] },
        },
      ],
    });
    expect(m.summary.postseasonArchivePresent).toBe(false);
    expect(m.summary.playoffAppearances).toBe(0);
    expect(m.summary.playoffCaliberYears).toBe(1);
  });

  it('computes franchise team season records from standings', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [
        { year: 2030, standings: [{ id: 7, abbr: 'SEA', wins: 14, losses: 3, ties: 0, pf: 500, pa: 280 }] },
        { year: 2031, standings: [{ id: 7, abbr: 'SEA', wins: 8, losses: 9, ties: 0, pf: 300, pa: 310 }] },
      ],
    });
    expect(m.franchiseRecords.teamSeason.wins.value).toBe(14);
    expect(m.franchiseRecords.teamSeason.pointsFor.value).toBe(500);
  });

  it('only attributes player stat leaders to matching franchise', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [baseSeason(2030)],
    });
    expect(m.franchiseRecords.playerSingleSeason[RECORD_KEYS.passingYards] == null).toBe(true);
    expect(m.franchiseRecords.playerSingleSeason[RECORD_KEYS.passingTD]?.playerId).toBe('qb2');
  });

  it('does not use QB thrown INT for defensive interceptions leader', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [{
        year: 2040,
        standings: [{ id: 7, abbr: 'SEA', wins: 9, losses: 8, ties: 0, pf: 300, pa: 300 }],
        seasonStats: [{
          playerId: 'qb9',
          name: 'Pick Six',
          pos: 'QB',
          teamId: 7,
          teamAbbr: 'SEA',
          totals: { interceptions: 18 },
        }, {
          playerId: 'lb1',
          name: 'Ball Hawk',
          pos: 'LB',
          teamId: 7,
          teamAbbr: 'SEA',
          totals: { interceptions: 4 },
        }],
      }],
    });
    const row = m.franchiseRecords.playerSingleSeason[RECORD_KEYS.interceptions];
    expect(row?.playerId).toBe('lb1');
    expect(row?.value).toBe(4);
  });

  it('includes matching Hall of Fame inductee in legends', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [],
      hallOfFameClasses: [{
        year: 2045,
        inductees: [{ playerId: 'hof1', name: 'Legend', pos: 'QB', primaryTeamAbbr: 'SEA', legacyScore: 91 }],
      }],
    });
    expect(m.franchiseLegends.some((l) => l.playerId === 'hof1')).toBe(true);
  });

  it('returns safe empty model for no seasons', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 1,
      teamAbbr: 'X',
      archivedSeasons: [],
    });
    expect(m.summary.seasonsArchived).toBe(0);
    expect(m.franchiseLegends).toEqual([]);
    expect(m.bestGames).toEqual([]);
  });

  it('builds best games when gameIndex has scores', () => {
    const m = buildFranchiseHistoryModel({
      teamId: 7,
      teamAbbr: 'SEA',
      archivedSeasons: [{
        year: 2050,
        standings: [
          { id: 7, abbr: 'SEA', wins: 10, losses: 7, ties: 0, pf: 400, pa: 300 },
          { id: 3, abbr: 'RIV', wins: 7, losses: 10, ties: 0, pf: 280, pa: 320 },
        ],
        gameIndex: [
          { id: 'g2050_w14_7_3', week: 14, homeId: 7, awayId: 3, homeScore: 45, awayScore: 10 },
        ],
      }],
    });
    expect(m.bestGames.length).toBeGreaterThanOrEqual(1);
    expect(m.bestGames[0].gameId).toBeTruthy();
  });
});
