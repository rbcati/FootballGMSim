import { describe, it, expect } from 'vitest';
import {
  buildLeagueLeadersRows,
  normalizeCurrentSeasonRow,
  normalizeArchivedLeaderRow,
  filterLeaderRows,
  getTopLeader,
  LEADER_CATEGORIES,
  LEADER_STAT_DEFS,
} from './leagueLeadersViewModel.js';

function makeNormalized(overrides = {}) {
  return {
    playerId: 1,
    playerName: 'Test Player',
    pos: 'QB',
    teamId: 10,
    teamAbbr: 'TST',
    gamesPlayed: 10,
    passYds: 3000,
    passTDs: 25,
    passInts: 8,
    rushYds: 0,
    rushTDs: 0,
    recYds: 0,
    recTDs: 0,
    receptions: 0,
    tackles: 0,
    sacks: 0,
    defInts: 0,
    fgMade: 0,
    xpMade: 0,
    ...overrides,
  };
}

describe('leagueLeadersViewModel', () => {
  describe('buildLeagueLeadersRows', () => {
    it('builds passing leaders from normalized rows', () => {
      const rows = [makeNormalized({ passYds: 3000, passTDs: 25 })];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Passing.passYds).toHaveLength(1);
      expect(result.Passing.passYds[0].value).toBe(3000);
      expect(result.Passing.passYds[0].rank).toBe(1);
      expect(result.Passing.passYds[0].statLabel).toBe('Pass Yds');
    });

    it('skips zero values', () => {
      const rows = [makeNormalized({ passYds: 0, passTDs: 0 })];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Passing.passYds).toHaveLength(0);
    });

    it('handles null/undefined/empty rows without crashing', () => {
      expect(() => buildLeagueLeadersRows([null, undefined, {}, { playerId: 1 }])).not.toThrow();
    });

    it('builds rushing leaders', () => {
      const rows = [makeNormalized({ playerId: 2, rushYds: 1200, rushTDs: 10, pos: 'RB' })];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Rushing.rushYds).toHaveLength(1);
      expect(result.Rushing.rushYds[0].value).toBe(1200);
      expect(result.Rushing.rushTDs[0].value).toBe(10);
    });

    it('builds receiving leaders', () => {
      const rows = [makeNormalized({ playerId: 3, recYds: 900, recTDs: 7, receptions: 80, pos: 'WR' })];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Receiving.recYds[0].value).toBe(900);
      expect(result.Receiving.recTDs[0].value).toBe(7);
      expect(result.Receiving.receptions[0].value).toBe(80);
    });

    it('builds defense leaders', () => {
      const rows = [makeNormalized({ playerId: 4, tackles: 90, sacks: 12, defInts: 5, pos: 'LB' })];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Defense.tackles[0].value).toBe(90);
      expect(result.Defense.sacks[0].value).toBe(12);
      expect(result.Defense.defInts[0].value).toBe(5);
    });

    it('builds kicking leaders', () => {
      const rows = [makeNormalized({ playerId: 5, fgMade: 25, xpMade: 30, pos: 'K' })];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Kicking.fgMade[0].value).toBe(25);
      expect(result.Kicking.xpMade[0].value).toBe(30);
    });

    it('sorts deterministically: desc by value then alpha by name', () => {
      const rows = [
        makeNormalized({ playerId: 2, playerName: 'B Player', passYds: 2000 }),
        makeNormalized({ playerId: 1, playerName: 'A Player', passYds: 3000 }),
      ];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Passing.passYds[0].playerName).toBe('A Player');
      expect(result.Passing.passYds[1].playerName).toBe('B Player');
    });

    it('tie-breaks alphabetically by player name', () => {
      const rows = [
        makeNormalized({ playerId: 2, playerName: 'Zara', passYds: 1000 }),
        makeNormalized({ playerId: 1, playerName: 'Aaron', passYds: 1000 }),
      ];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Passing.passYds[0].playerName).toBe('Aaron');
    });

    it('respects topN limit', () => {
      const rows = Array.from({ length: 30 }, (_, i) =>
        makeNormalized({ playerId: i, passYds: 1000 + i }),
      );
      const result = buildLeagueLeadersRows(rows, { topN: 5 });
      expect(result.Passing.passYds).toHaveLength(5);
    });

    it('produces all expected categories', () => {
      const result = buildLeagueLeadersRows([]);
      for (const cat of LEADER_CATEGORIES) {
        expect(result[cat]).toBeDefined();
      }
    });

    it('assigns sequential ranks starting at 1', () => {
      const rows = [
        makeNormalized({ playerId: 1, passYds: 3000 }),
        makeNormalized({ playerId: 2, passYds: 2000 }),
      ];
      const result = buildLeagueLeadersRows(rows);
      expect(result.Passing.passYds[0].rank).toBe(1);
      expect(result.Passing.passYds[1].rank).toBe(2);
    });
  });

  describe('normalizeCurrentSeasonRow', () => {
    it('normalizes player with totals (passYd alias)', () => {
      const player = {
        id: 1,
        name: 'Test QB',
        pos: 'QB',
        teamId: 10,
        teamAbbr: 'TST',
        totals: { passYd: 4000, passTD: 30, interceptions: 10 },
      };
      const row = normalizeCurrentSeasonRow(player);
      expect(row.passYds).toBe(4000);
      expect(row.passTDs).toBe(30);
      expect(row.passInts).toBe(10);
    });

    it('returns null for player without id', () => {
      expect(normalizeCurrentSeasonRow({})).toBeNull();
      expect(normalizeCurrentSeasonRow(null)).toBeNull();
      expect(normalizeCurrentSeasonRow(undefined)).toBeNull();
    });

    it('handles missing totals gracefully with zero stats', () => {
      const row = normalizeCurrentSeasonRow({ id: 1, name: 'X', pos: 'QB' });
      expect(row).not.toBeNull();
      expect(row.passYds).toBe(0);
      expect(row.rushYds).toBe(0);
    });

    it('non-QB position does not use interceptions as passInts', () => {
      const player = {
        id: 2,
        name: 'LB',
        pos: 'LB',
        teamId: 1,
        teamAbbr: 'X',
        totals: { interceptions: 5 },
      };
      const row = normalizeCurrentSeasonRow(player);
      expect(row.passInts).toBe(0);
      expect(row.defInts).toBe(5);
    });

    it('reads playerId alias fields (playerId vs id)', () => {
      const row = normalizeCurrentSeasonRow({ playerId: 99, name: 'Y', pos: 'RB', totals: {} });
      expect(row.playerId).toBe(99);
    });
  });

  describe('normalizeArchivedLeaderRow', () => {
    it('normalizes archived row fields', () => {
      const row = {
        playerId: 1,
        playerName: 'Old Player',
        pos: 'RB',
        teamAbbr: 'OAK',
        passYds: 0,
        rushYds: 1100,
        rushTDs: 8,
        tackles: 0,
        defInts: 0,
        fgMade: 0,
        xpMade: 0,
      };
      const normalized = normalizeArchivedLeaderRow(row);
      expect(normalized.rushYds).toBe(1100);
      expect(normalized.rushTDs).toBe(8);
      expect(normalized.receptions).toBe(0);
      expect(normalized.teamAbbr).toBe('OAK');
    });

    it('returns null for row without playerId', () => {
      expect(normalizeArchivedLeaderRow({ playerName: 'X' })).toBeNull();
    });

    it('handles null/undefined without crashing', () => {
      expect(normalizeArchivedLeaderRow(null)).toBeNull();
      expect(normalizeArchivedLeaderRow(undefined)).toBeNull();
    });

    it('coerces NaN/non-numeric values to 0', () => {
      const row = { playerId: 1, rushYds: 'bad', tackles: NaN, fgMade: null };
      const normalized = normalizeArchivedLeaderRow(row);
      expect(normalized.rushYds).toBe(0);
      expect(normalized.tackles).toBe(0);
      expect(normalized.fgMade).toBe(0);
    });
  });

  describe('filterLeaderRows', () => {
    const rows = [
      { id: '1', playerName: 'Tom Brady', pos: 'QB', teamAbbr: 'NE', value: 5000, rank: 1 },
      { id: '2', playerName: 'Adrian Peterson', pos: 'RB', teamAbbr: 'MIN', value: 2000, rank: 2 },
    ];

    it('returns all rows when search is empty', () => {
      expect(filterLeaderRows(rows, '')).toHaveLength(2);
      expect(filterLeaderRows(rows)).toHaveLength(2);
    });

    it('filters by player name (case-insensitive)', () => {
      expect(filterLeaderRows(rows, 'brady')).toHaveLength(1);
      expect(filterLeaderRows(rows, 'BRADY')).toHaveLength(1);
    });

    it('filters by team abbr', () => {
      expect(filterLeaderRows(rows, 'MIN')).toHaveLength(1);
    });

    it('filters by position', () => {
      expect(filterLeaderRows(rows, 'RB')).toHaveLength(1);
    });

    it('returns empty array when no match', () => {
      expect(filterLeaderRows(rows, 'zzz')).toHaveLength(0);
    });

    it('handles null/undefined rows gracefully', () => {
      expect(() => filterLeaderRows(null, 'x')).not.toThrow();
      expect(filterLeaderRows(null, 'x')).toEqual([]);
    });
  });

  describe('getTopLeader', () => {
    it('returns the top leader for a stat key', () => {
      const rows = [
        makeNormalized({ playerId: 1, playerName: 'A', passYds: 3000 }),
        makeNormalized({ playerId: 2, playerName: 'B', passYds: 4000 }),
      ];
      const leader = getTopLeader(rows, 'passYds');
      expect(leader.value).toBe(4000);
      expect(leader.playerName).toBe('B');
      expect(leader.statLabel).toBe('Pass Yds');
    });

    it('returns null when no rows have non-zero values', () => {
      expect(getTopLeader([makeNormalized({ passYds: 0 })], 'passYds')).toBeNull();
    });

    it('returns null for empty rows array', () => {
      expect(getTopLeader([], 'passYds')).toBeNull();
    });

    it('returns null for unknown stat key', () => {
      expect(getTopLeader([makeNormalized()], 'unknownKey')).toBeNull();
    });

    it('includes displayValue in result', () => {
      const rows = [makeNormalized({ passYds: 3500 })];
      const leader = getTopLeader(rows, 'passYds');
      expect(leader.displayValue).toBe('3,500');
    });
  });

  describe('LEADER_STAT_DEFS coverage', () => {
    it('covers all expected categories', () => {
      const cats = new Set(LEADER_STAT_DEFS.map((d) => d.category));
      for (const expected of ['Passing', 'Rushing', 'Receiving', 'Defense', 'Kicking']) {
        expect(cats.has(expected)).toBe(true);
      }
    });

    it('every def has statKey, statLabel, and pick function', () => {
      for (const def of LEADER_STAT_DEFS) {
        expect(typeof def.statKey).toBe('string');
        expect(typeof def.statLabel).toBe('string');
        expect(typeof def.pick).toBe('function');
      }
    });
  });
});
